"""Bounded text extraction and portable, reflowed PDF generation."""

from __future__ import annotations

from io import BytesIO
from pathlib import Path
import re
from xml.sax.saxutils import escape
import zipfile


MAX_UPLOAD_BYTES = 10 * 1024 * 1024
MAX_TEXT_CHARACTERS = 1_000_000
MAX_PDF_PAGES = 300


def extract_text(filename: str, data: bytes) -> str:
    """Extract supported formats. Reject scans, encryption and oversized inputs.

    Page boundaries in a text PDF are represented by a form feed, allowing the
    retrieval layer to retain page citations. No external services receive data.
    """
    extension = Path(filename or "").suffix.casefold()
    if extension not in {".pdf", ".docx", ".txt", ".md"}:
        raise ValueError("Supported file types are PDF, DOCX, TXT and Markdown (.md).")
    if not data:
        raise ValueError("This file is empty. Choose a document with readable text.")
    if len(data) > MAX_UPLOAD_BYTES:
        raise ValueError("This file is larger than 10 MB. Upload a smaller document.")
    try:
        if extension == ".pdf":
            from pypdf import PdfReader

            if not data.lstrip().startswith(b"%PDF-"):
                raise ValueError("The file does not contain a valid PDF header.")
            pdf = PdfReader(BytesIO(data))
            if pdf.is_encrypted:
                raise ValueError("This PDF is password protected. Upload an unlocked copy.")
            if len(pdf.pages) > MAX_PDF_PAGES:
                raise ValueError("PDFs are limited to 300 pages. Split this document before uploading.")
            pages = []
            total_length = 0
            for page in pdf.pages:
                content_stream = page.get_contents()
                if content_stream is not None and len(content_stream.get_data()) > 20 * 1024 * 1024:
                    raise ValueError("A PDF page is too complex to extract safely. Export a simpler copy.")
                page_text = page.extract_text() or ""
                total_length += len(page_text)
                if total_length > MAX_TEXT_CHARACTERS:
                    raise ValueError("Extracted text exceeds one million characters. Split this document.")
                pages.append(page_text.strip())
            text = "\n\f\n".join(pages)
            if not text.strip():
                raise ValueError("No readable text was found. This may be a scanned PDF; run OCR first, then upload the searchable PDF.")
        elif extension == ".docx":
            from docx import Document

            with zipfile.ZipFile(BytesIO(data)) as archive:
                entries = archive.infolist()
                if len(entries) > 3000 or sum(item.file_size for item in entries) > 40 * 1024 * 1024:
                    raise ValueError("The DOCX expands beyond the safe extraction limit. Export a smaller copy.")
                if "word/document.xml" not in archive.namelist():
                    raise ValueError("This file is not a valid DOCX document.")
            doc = Document(BytesIO(data))
            # Preserve source paragraph/table order rather than appending all tables.
            from docx.oxml.ns import qn
            from docx.table import Table
            from docx.text.paragraph import Paragraph

            blocks = []
            for child in doc.element.body.iterchildren():
                if child.tag == qn("w:p"):
                    blocks.append(Paragraph(child, doc).text)
                elif child.tag == qn("w:tbl"):
                    table = Table(child, doc)
                    blocks.extend(" | ".join(cell.text for cell in row.cells) for row in table.rows)
            text = "\n".join(blocks)
        else:
            encoding = "utf-16" if data.startswith((b"\xff\xfe", b"\xfe\xff")) else "utf-8-sig"
            try:
                text = data.decode(encoding)
            except UnicodeDecodeError as error:
                raise ValueError("Save text files as UTF-8, then upload again.") from error
            if "\x00" in text:
                raise ValueError("This appears to be a binary file. Upload a UTF-8 text document.")
    except ValueError:
        raise
    except Exception as error:
        raise ValueError("This document could not be read. It may be damaged or mislabeled; try exporting a new PDF, DOCX or UTF-8 text copy.") from error
    text = text.replace("\r\n", "\n").replace("\r", "\n").strip()
    if not text:
        raise ValueError("No readable text was found in this document.")
    if len(text) > MAX_TEXT_CHARACTERS:
        raise ValueError("Extracted text exceeds one million characters. Split this document.")
    return text


def export_pdf(title: str, content: str, metadata: dict | None = None) -> bytes:
    """Generate a new, accessible text PDF; original layout is not overwritten."""
    from reportlab.lib import colors
    from reportlab.lib.enums import TA_LEFT
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.lib.units import mm
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer

    metadata = metadata or {}
    buffer = BytesIO()
    font_name = "AtlasSans"
    if font_name not in pdfmetrics.getRegisteredFontNames():
        pdfmetrics.registerFont(TTFont(font_name, str(Path(__file__).parent / "assets" / "DejaVuSans.ttf")))
    document = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        leftMargin=22 * mm,
        rightMargin=22 * mm,
        topMargin=23 * mm,
        bottomMargin=24 * mm,
        title=title,
        author="PivotPath Atlas",
        subject="Edited document export; layout reflowed from extracted text",
    )
    body_style = ParagraphStyle("AtlasBody", fontName=font_name, fontSize=10, leading=15, spaceAfter=5, alignment=TA_LEFT, textColor=colors.HexColor("#253241"), wordWrap="CJK")
    heading_style = ParagraphStyle("AtlasTitle", parent=body_style, fontSize=21, leading=28, spaceAfter=14, textColor=colors.HexColor("#113d37"))
    sub_style = ParagraphStyle("AtlasMeta", parent=body_style, fontSize=8, leading=12, textColor=colors.HexColor("#64748b"), spaceAfter=18)
    parts = ["PIVOTPATH ATLAS", "Edited document · reflowed export"]
    if metadata.get("version") is not None:
        parts.append(f"Version {metadata['version']}")
    if metadata.get("status"):
        parts.append(str(metadata["status"]).replace("_", " ").title())
    story = [Paragraph(escape(title[:500]), heading_style), Paragraph(escape("  |  ".join(parts)), sub_style)]
    # Keep user text as text, never interpret HTML or PDF markup from a document.
    safe_content = re.sub(r"[\x00-\x08\x0b\x0e-\x1f]", "", content).replace("\f", "\n\n")
    for line in safe_content.splitlines():
        if not line.strip():
            story.append(Spacer(1, 6))
            continue
        # Bounded paragraphs avoid layout exceptions on extremely long lines.
        for start in range(0, len(line), 4000):
            story.append(Paragraph(escape(line[start:start + 4000]).replace("\t", "    "), body_style))

    def footer(canvas, doc):
        canvas.saveState()
        canvas.setStrokeColor(colors.HexColor("#dce7e3"))
        canvas.line(22 * mm, 18 * mm, A4[0] - 22 * mm, 18 * mm)
        canvas.setFont(font_name, 7)
        canvas.setFillColor(colors.HexColor("#64748b"))
        canvas.drawString(22 * mm, 13 * mm, "PivotPath Atlas  ·  Review workflow export")
        canvas.drawRightString(A4[0] - 22 * mm, 13 * mm, str(doc.page))
        canvas.restoreState()

    document.build(story, onFirstPage=footer, onLaterPages=footer)
    return buffer.getvalue()
