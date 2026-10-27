"""Deterministic, explainable document checks; never a regulatory certification."""

from __future__ import annotations

from datetime import datetime, timezone
import math
import re
import unicodedata


def _normalize(value: str) -> str:
    return " ".join(unicodedata.normalize("NFKC", value).casefold().split())


def _heading(value: str) -> str:
    """Strip conventional markdown/list numbering, without executing a user regex."""
    value = unicodedata.normalize("NFKC", value).strip().lstrip("# ")
    value = re.sub(r"^(?:\d+(?:\.\d+)*[.)]?|[IVXLCDM]+[.)])\s+", "", value)
    return _normalize(value.strip(" \t:*_#"))


def _excerpt(content: str, phrase: str, window: int = 90) -> str:
    match = content.casefold().find(phrase.casefold())
    if match < 0:
        return f'Found the required phrase “{phrase}” (ignoring case and spacing).'
    start = max(0, match - window)
    end = min(len(content), match + len(phrase) + window)
    return ("…" if start else "") + content[start:end].replace("\n", " ") + ("…" if end < len(content) else "")


def analyze_document(
    content: str,
    rules: list[dict],
    settings: dict,
    category: str = "General",
    approved_feedback: list[dict] | None = None,
) -> dict:
    """Score enabled applicable rules, preserving critical-rule vetoes.

    An approved feedback item only changes the suggested correction. It cannot
    change the rule, its weight, the pass result, or the approval threshold.
    Scores are weighted pass percentages. An empty rulebook is never eligible.
    """
    normalized = _normalize(content)
    headings = {_heading(line) for line in content.splitlines() if line.strip()}
    words = re.findall(r"\b\w+(?:['’\-]\w+)*\b", content, flags=re.UNICODE)
    corrections: dict[str, str] = {}
    if settings.get("learning_enabled", True):
        for feedback in sorted(approved_feedback or [], key=lambda item: item.get("created_at", "")):
            if feedback.get("status") == "approved" and feedback.get("correction", "").strip():
                corrections[str(feedback.get("rule_id", ""))] = feedback["correction"].strip()

    findings = []
    for rule in rules:
        if not rule.get("enabled", True) or rule.get("category", "All") not in ("All", category):
            continue
        kind = rule.get("type", "")
        value = str(rule.get("value", "")).strip()
        passed = False
        evidence = "Rule configuration is invalid. Ask a manager to edit this rule."
        try:
            weight = float(rule.get("weight", 1))
            if not math.isfinite(weight) or weight <= 0 or weight > 100:
                raise ValueError("Invalid weight")
            if kind == "required_text" and value:
                passed = _normalize(value) in normalized
                evidence = _excerpt(content, value) if passed else f'Required phrase “{value}” was not found.'
            elif kind == "prohibited_text" and value:
                passed = _normalize(value) not in normalized
                evidence = f'Prohibited phrase “{value}” was not found.' if passed else _excerpt(content, value)
            elif kind == "min_words":
                minimum = int(value)
                if minimum < 1 or minimum > 1000000:
                    raise ValueError("Invalid minimum")
                passed = len(words) >= minimum
                evidence = f"{len(words):,} words found; at least {minimum:,} required."
            elif kind == "required_sections" and value:
                sections = [part.strip() for part in value.split(",") if part.strip()]
                missing = [section for section in sections if _heading(section) not in headings]
                passed = bool(sections) and not missing
                evidence = "All required section headings are present." if passed else "Missing section headings: " + ", ".join(missing) + "."
        except (TypeError, ValueError, OverflowError):
            weight = 1.0
            passed = False
        suggestion = corrections.get(str(rule.get("id", "")), str(rule.get("suggestion", "")))
        if not suggestion and not passed:
            if kind == "required_text":
                suggestion = f"Add the required phrase where it is accurate: {value}"
            elif kind == "prohibited_text":
                suggestion = f"Review and remove or replace this prohibited wording: {value}"
            elif kind == "required_sections":
                suggestion = f"Add descriptive content under the required headings: {value}"
            elif kind == "min_words":
                suggestion = "Expand the document with relevant, verified information."
            else:
                suggestion = "Ask your manager to correct this rule configuration."
        findings.append({
            "rule_id": str(rule.get("id", "")),
            "name": rule.get("name", "Untitled rule"),
            "severity": rule.get("severity", "major"),
            "passed": passed,
            "weight": weight,
            "evidence": evidence,
            "suggestion": suggestion,
            "type": kind,
            "value": value,
        })

    total_weight = sum(finding["weight"] for finding in findings)
    passed_weight = sum(finding["weight"] for finding in findings if finding["passed"])
    raw_score = 100.0 * passed_weight / total_weight if total_weight else 0.0
    score = round(raw_score, 1)
    threshold = float(settings.get("threshold", 85))
    critical_failed = any(not finding["passed"] and finding["severity"] == "critical" for finding in findings)
    passed_count = sum(finding["passed"] for finding in findings)
    return {
        "score": score,
        "passed": passed_count,
        "failed": len(findings) - passed_count,
        "total": len(findings),
        "eligible": bool(findings) and raw_score >= threshold and not critical_failed,
        "threshold": threshold,
        "policy_version": int(settings.get("policy_version", 1)),
        "checked_at": datetime.now(timezone.utc).isoformat(),
        "findings": findings,
    }
