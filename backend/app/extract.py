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
import zipfile

# Mirror of app.main.MAX_TEXT_CHARS. Duplicated here (not imported) to keep this
# module free of any FastAPI import cycle; the two are asserted equal by a test.
MAX_TEXT_CHARS = 20_000

# Upper bound on the raw upload size, enforced by the caller before parsing. A
# few MB comfortably holds any real resume while capping the parse cost.
MAX_UPLOAD_BYTES = 5 * 1024 * 1024

# Parser abuse guards: a resume never legitimately needs more than this.
MAX_PDF_PAGES = 30
# DOCX is a ZIP archive; bound both entry count and total decompressed size so
# a crafted archive (zip bomb) can't exhaust memory/CPU during parsing.
MAX_DOCX_ENTRIES = 200
MAX_DOCX_UNCOMPRESSED_BYTES = 50 * 1024 * 1024

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

    # Magic-byte check: a real PDF starts with "%PDF-" (the spec allows a small
    # preamble, so scan the first KB). Extension alone is never trusted.
    if b"%PDF-" not in data[:1024]:
        raise ExtractionError("File does not look like a valid PDF.")

    try:
        reader = PdfReader(io.BytesIO(data))
        if len(reader.pages) > MAX_PDF_PAGES:
            raise ExtractionError(f"PDF has too many pages (max {MAX_PDF_PAGES}).")
        pages = [page.extract_text() or "" for page in reader.pages]
    except ExtractionError:
        raise
    except (PyPdfError, ValueError, OSError) as exc:  # corrupt / encrypted / not a PDF
        raise ExtractionError(f"Could not read PDF: {exc}") from exc
    return "\n".join(pages)


def _guard_docx_zip(data: bytes) -> None:
    """Zip-bomb guard: bound entry count and total decompressed size."""
    try:
        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            infos = archive.infolist()
    except zipfile.BadZipFile as exc:
        raise ExtractionError("File does not look like a valid DOCX.") from exc
    if len(infos) > MAX_DOCX_ENTRIES:
        raise ExtractionError(
            f"DOCX archive has too many entries (max {MAX_DOCX_ENTRIES})."
        )
    total = sum(info.file_size for info in infos)
    if total > MAX_DOCX_UNCOMPRESSED_BYTES:
        raise ExtractionError("DOCX archive decompresses to an unreasonable size.")


def _extract_docx(data: bytes) -> str:
    import docx  # python-docx
    from docx.opc.exceptions import PackageNotFoundError

    # Magic-byte check: DOCX is a ZIP archive and must start with "PK".
    if data[:2] != b"PK":
        raise ExtractionError("File does not look like a valid DOCX.")
    _guard_docx_zip(data)

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
