"""Tests for resume file → text extraction and the /extract endpoint."""
import io

import pytest
from fastapi.testclient import TestClient

from app import extract
from app.extract import ExtractionError, UnsupportedFileType, extract_text
from app.main import app

client = TestClient(app)


def _make_pdf(text: str) -> bytes:
    """Build a minimal one-page PDF whose text layer is ``text``.

    Hand-rolled (with a correct xref table) so the test needs no PDF-authoring
    dependency; pypdf extracts the ``Tj`` string from the content stream.
    """
    esc = text.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
    stream = f"BT /F1 12 Tf 72 720 Td ({esc}) Tj ET".encode("latin-1")
    objs = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] "
        b"/Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
        b"<< /Length " + str(len(stream)).encode() + b" >>\nstream\n" + stream + b"\nendstream",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ]
    out = bytearray(b"%PDF-1.4\n")
    offsets = []
    for i, body in enumerate(objs, start=1):
        offsets.append(len(out))
        out += str(i).encode() + b" 0 obj\n" + body + b"\nendobj\n"
    xref_pos = len(out)
    n = len(objs) + 1
    out += b"xref\n0 " + str(n).encode() + b"\n0000000000 65535 f \n"
    for off in offsets:
        out += ("%010d 00000 n \n" % off).encode()
    out += b"trailer\n<< /Size " + str(n).encode() + b" /Root 1 0 R >>\n"
    out += b"startxref\n" + str(xref_pos).encode() + b"\n%%EOF"
    return bytes(out)


def _make_docx(text: str) -> bytes:
    import docx

    document = docx.Document()
    for line in text.split("\n"):
        document.add_paragraph(line)
    buf = io.BytesIO()
    document.save(buf)
    return buf.getvalue()


# --- extract_text() unit tests -------------------------------------------------

def test_extract_txt():
    text = extract_text("resume.txt", b"Python and FastAPI developer.")
    assert "Python and FastAPI developer." in text


def test_extract_pdf():
    data = _make_pdf("React TypeScript Kubernetes")
    text = extract_text("resume.pdf", data)
    assert "React" in text and "Kubernetes" in text


def test_extract_docx():
    data = _make_docx("Senior engineer\nPython, Docker, Terraform")
    text = extract_text("resume.docx", data)
    assert "Python, Docker, Terraform" in text


def test_extract_unknown_extension_uses_text_fallback():
    # No extension -> treated as plain text (resumes exported without one).
    text = extract_text("resume", b"plain text resume")
    assert "plain text resume" in text


def test_unsupported_type_raises():
    with pytest.raises(UnsupportedFileType):
        extract_text("photo.png", b"\x89PNG\r\n\x1a\n")


def test_corrupt_pdf_raises_extraction_error():
    with pytest.raises(ExtractionError):
        extract_text("broken.pdf", b"%PDF-1.4 not really a pdf")


def test_empty_text_raises_extraction_error():
    with pytest.raises(ExtractionError):
        extract_text("blank.txt", b"   \n\t  \n")


def test_extracted_text_capped_at_limit():
    huge = ("skill " * 10_000).encode()
    text = extract_text("big.txt", huge)
    assert len(text) <= extract.MAX_TEXT_CHARS


def test_max_text_chars_matches_api():
    from app.main import MAX_TEXT_CHARS

    assert extract.MAX_TEXT_CHARS == MAX_TEXT_CHARS


# --- /extract endpoint tests ---------------------------------------------------

def test_extract_endpoint_txt():
    resp = client.post(
        "/extract",
        files={"file": ("resume.txt", b"React and TypeScript", "text/plain")},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["filename"] == "resume.txt"
    assert "React and TypeScript" in body["text"]
    assert body["chars"] == len(body["text"])


def test_extract_endpoint_pdf_then_analyze():
    data = _make_pdf("Python FastAPI Docker")
    resp = client.post(
        "/extract",
        files={"file": ("resume.pdf", data, "application/pdf")},
    )
    assert resp.status_code == 200
    text = resp.json()["text"]
    # The extracted text feeds the matcher end-to-end.
    analyzed = client.post(
        "/analyze", json={"resume": text, "job_description": "Need Python and Docker."}
    )
    assert analyzed.status_code == 200
    assert "python" in analyzed.json()["matched_skills"]


def test_extract_endpoint_rejects_unsupported_type():
    resp = client.post(
        "/extract",
        files={"file": ("photo.png", b"\x89PNG\r\n", "image/png")},
    )
    assert resp.status_code == 415


def test_extract_endpoint_rejects_oversized_upload():
    huge = b"x" * (extract.MAX_UPLOAD_BYTES + 1)
    resp = client.post(
        "/extract",
        files={"file": ("big.txt", huge, "text/plain")},
    )
    assert resp.status_code == 413


def test_extract_endpoint_rejects_corrupt_pdf():
    resp = client.post(
        "/extract",
        files={"file": ("broken.pdf", b"%PDF-1.4 nonsense", "application/pdf")},
    )
    assert resp.status_code == 422
