"""Local retrieval-augmented answers with verifiable quotes, no external API.

This is lexical BM25 retrieval followed by extractive synthesis. It intentionally
does not pretend to be a trained model or semantic/vector search. The API layer
must apply document permissions and requested approval scope BEFORE calling it.
"""

from __future__ import annotations

from collections import Counter
import math
import re
import unicodedata


STOPWORDS = frozenset("a an and are as at be been being by can could did do does for from had has have how i in into is it its may me my of on or our please should that the their them there these they this to us was we were what when where which who why will with would you your tell about according document documents information find show give explain".split())


def _tokens(value: str) -> list[str]:
    normalized = unicodedata.normalize("NFKC", value).casefold()
    return [token for token in re.findall(r"\b[\w]+(?:[\-'][\w]+)*\b", normalized) if token not in STOPWORDS and len(token) > 1]


def _chunks(document: dict, target_words: int = 180) -> list[dict]:
    content = str(document.get("content", ""))
    chunks = []
    pages = content.split("\f")
    for page_number, page in enumerate(pages, 1):
        words = page.split()
        step = target_words - 35
        for start in range(0, len(words), step):
            excerpt = " ".join(words[start:start + target_words])
            if not excerpt:
                continue
            chunk = {"document_id": str(document.get("id", "")), "title": document.get("title", "Untitled document"), "version": int(document.get("version", 1)), "excerpt": excerpt}
            if len(pages) > 1 or str(document.get("filename", "")).casefold().endswith(".pdf"):
                chunk["page"] = page_number
            chunk["_terms"] = Counter(_tokens(excerpt))
            chunks.append(chunk)
            if start + target_words >= len(words):
                break
    return chunks


def answer_question(question: str, documents: list[dict], limit: int = 5) -> dict:
    """Return only relevant literal evidence from already-authorized documents.

    Scores measure lexical relevance, not answer confidence. A citation always
    identifies the exact content version searched. Document text is never used
    as an instruction and no unsupported factual answer is generated.
    """
    question = question.strip()
    if not question:
        raise ValueError("Enter a question to search your accessible documents.")
    if len(question) > 2000:
        raise ValueError("Keep your question under 2,000 characters.")
    limit = max(1, min(int(limit), 10))
    query_terms = set(_tokens(question))
    no_match = {
        "answer": "I could not find supporting evidence in the documents available in this scope. Try specific terms from the document, or change the search scope.",
        "mode": "extractive",
        "sources": [],
        "message": "Local lexical retrieval · no external AI service · no unsupported answer generated",
    }
    if not query_terms:
        return no_match
    chunks = [chunk for document in documents for chunk in _chunks(document)]
    if not chunks:
        return no_match
    term_docs = Counter(term for chunk in chunks for term in chunk["_terms"])
    average_length = sum(sum(chunk["_terms"].values()) for chunk in chunks) / len(chunks) or 1
    ranked = []
    for chunk in chunks:
        counts = chunk["_terms"]
        length = sum(counts.values())
        matches = query_terms.intersection(counts)
        if not matches:
            continue
        score = 0.0
        for term in matches:
            idf = math.log(1 + (len(chunks) - term_docs[term] + 0.5) / (term_docs[term] + 0.5))
            frequency = counts[term]
            score += idf * frequency * 2.5 / (frequency + 1.5 * (0.25 + 0.75 * length / average_length))
        # Query coverage reduces noisy evidence for multi-part questions.
        score *= 0.5 + 0.5 * len(matches) / len(query_terms)
        ranked.append((score, chunk))
    if not ranked:
        return no_match
    ranked.sort(key=lambda pair: pair[0], reverse=True)
    sources = []
    seen = set()
    for score, chunk in ranked:
        key = (chunk["document_id"], chunk["excerpt"])
        if key in seen:
            continue
        seen.add(key)
        sources.append({key: value for key, value in chunk.items() if not key.startswith("_")} | {"score": round(score, 3)})
        if len(sources) >= limit:
            break
    evidence = []
    for index, source in enumerate(sources[:3], 1):
        sentences = re.split(r"(?<=[.!?])\s+", source["excerpt"])
        ranked_sentences = sorted(enumerate(sentences), key=lambda pair: len(query_terms.intersection(_tokens(pair[1]))), reverse=True)
        chosen = [pair for pair in ranked_sentences[:2] if query_terms.intersection(_tokens(pair[1]))]
        chosen.sort(key=lambda pair: pair[0])
        quote = " ".join(sentence for _, sentence in chosen)
        if len(quote) > 700:
            quote = quote[:697].rsplit(" ", 1)[0] + "…"
        evidence.append(f'[{index}] “{quote}”')
    return {
        "answer": "Relevant passages from your accessible documents:\n\n" + "\n\n".join(evidence),
        "mode": "extractive",
        "sources": sources,
        "message": "Quoted evidence, not a generated conclusion. Source numbers match the citations below; relevance scores are not confidence percentages.",
    }
