"""Resume file → plain text extraction.

Turns an uploaded PDF / DOCX / plain-text file into the text the matcher
consumes. Kept deliberately small and dependency-light (``pypdf`` and
``python-docx`` are both pure-Python wheels with no system libraries), so it
builds identically in CI and the slim Docker image.

The extractor never trusts the upload: it is size-guarded by the caller and
returns text capped at ``MAX_TEXT_CHARS`` so a parsed document can't exceed the
same limit the JSON ``/analyze`` path enforces.
"""
from __future__ import annotations

import io
import re

# Mirror of app.main.MAX_TEXT_CHARS. Duplicated here (not imported) to keep this
# module free of any FastAPI import cycle; the two are asserted equal by a test.
MAX_TEXT_CHARS = 20_000

# Upper bound on the raw upload size, enforced by the caller before parsing. A
# few MB comfortably holds any real resume while capping the parse cost.
MAX_UPLOAD_BYTES = 5 * 1024 * 1024

_PDF_EXTS = {".pdf"}
_DOCX_EXTS = {".docx"}
_TEXT_EXTS = {".txt", ".md", ".markdown", ".text", ""}

SUPPORTED_EXTS = sorted(_PDF_EXTS | _DOCX_EXTS | (_TEXT_EXTS - {""}))


class UnsupportedFileType(ValueError):
    """Raised when the upload's extension is not a resume format we parse."""


class ExtractionError(ValueError):
    """Raised when a supported file is corrupt or yields no readable text."""


def _ext(filename: str) -> str:
    name = (filename or "").lower().strip()
    dot = name.rfind(".")
    return name[dot:] if dot != -1 else ""


def _normalise(text: str) -> str:
    """Trim trailing whitespace per line, collapse >2 blank lines, cap length."""
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    lines = [line.rstrip() for line in text.split("\n")]
    text = "\n".join(lines)
    text = re.sub(r"\n{3,}", "\n\n", text).strip()
    if len(text) > MAX_TEXT_CHARS:
        text = text[:MAX_TEXT_CHARS].rstrip()
    return text


def _extract_pdf(data: bytes) -> str:
    from pypdf import PdfReader
    from pypdf.errors import PyPdfError

    try:
        reader = PdfReader(io.BytesIO(data))
        pages = [page.extract_text() or "" for page in reader.pages]
    except (PyPdfError, ValueError, OSError) as exc:  # corrupt / encrypted / not a PDF
        raise ExtractionError(f"Could not read PDF: {exc}") from exc
    return "\n".join(pages)


def _extract_docx(data: bytes) -> str:
    import docx  # python-docx
    from docx.opc.exceptions import PackageNotFoundError

    try:
        document = docx.Document(io.BytesIO(data))
    except (PackageNotFoundError, KeyError, ValueError, OSError) as exc:
        raise ExtractionError(f"Could not read DOCX: {exc}") from exc
    return "\n".join(p.text for p in document.paragraphs)


def _extract_text(data: bytes) -> str:
    # Resumes are effectively always UTF-8/Latin-1; replace undecodable bytes
    # rather than failing so a stray byte never rejects an otherwise fine file.
    return data.decode("utf-8", errors="replace")


def extract_text(filename: str, data: bytes) -> str:
    """Extract plain text from an uploaded resume file.

    Raises :class:`UnsupportedFileType` for unknown extensions and
    :class:`ExtractionError` for corrupt files or ones with no readable text.
    """
    ext = _ext(filename)
    if ext in _PDF_EXTS:
        raw = _extract_pdf(data)
    elif ext in _DOCX_EXTS:
        raw = _extract_docx(data)
    elif ext in _TEXT_EXTS:
        raw = _extract_text(data)
    else:
        raise UnsupportedFileType(
            f"Unsupported file type '{ext or filename}'. "
            f"Supported: {', '.join(SUPPORTED_EXTS)}."
        )

    text = _normalise(raw)
    if not text:
        raise ExtractionError(
            "No readable text found. If this is a scanned/image-only PDF, "
            "paste the text instead."
        )
    return text
