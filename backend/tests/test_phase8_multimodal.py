import io
import os
import uuid
import pytest
from httpx import AsyncClient, ASGITransport
from backend.app.main import app
from backend.app.core.config import settings
from backend.app.db.init_db import init_db
from backend.app.services.multimodal.ocr_providers import OcrProviderFactory, DeterministicLocalOcrProvider
from backend.app.services.multimodal.vision_providers import VisionProviderFactory, DeterministicLocalVisionProvider
from backend.app.services.multimodal.pdf_renderer import PurePythonPdfRenderer, CorruptedPdfError
from backend.app.services.multimodal.multimodal_pipeline import multimodal_pipeline

def create_safe_text_pdf(salt: str = "") -> bytes:
    """PDF with extractable text stream."""
    return (
        b"%PDF-1.4\n"
        b"1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n"
        b"2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n"
        b"3 0 obj << /Type /Page /Parent 2 0 R /Contents 4 0 R >> endobj\n"
        b"4 0 obj << /Length 75 >>\n"
        b"stream\n"
        b"BT /F1 12 Tf 72 712 Td (Sovereign Enclave Protocol 2026 " + salt.encode() + b") Tj ET\n"
        b"endstream\nendobj\n"
        b"xref\n0 5\n0000000000 65535 f \n"
        b"trailer << /Root 1 0 R >>\n%%EOF\n"
    )

def create_safe_scanned_pdf(salt: str = "") -> bytes:
    """Scanned PDF with an embedded image object and zero extractable text stream (triggers OCR)."""
    return (
        b"%PDF-1.4\n"
        b"1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n"
        b"2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n"
        b"3 0 obj << /Type /Page /Parent 2 0 R /Resources << /XObject << /Im1 4 0 R >> >> >> endobj\n"
        b"4 0 obj << /Type /XObject /Subtype /Image /Width 100 /Height 100 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Length 12 >>\n"
        b"stream\n"
        b"\x89PNG\r\n\x1a\n" + salt.encode()[:4] + b"\nendstream\nendobj\n"
        b"xref\n0 5\n0000000000 65535 f \n"
        b"trailer << /Root 1 0 R >>\n%%EOF\n"
    )

def create_safe_diagram_png(salt: str = "") -> bytes:
    """Valid PNG with diagram metadata."""
    return (
        b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15c4"
        b"\x00\x00\x00\x14tEXtTitle\x00Architecture Diagram " + salt.encode() +
        b"\x00\x00\x00\nIDATx\x9cc\x00\x01\x00\x00\x05\x00\x01\r\n-\xb4\x00\x00\x00\x00IEND\xaeB`\x82"
    )

def create_safe_schematic_png(salt: str = "") -> bytes:
    """Valid PNG with engineering drawing/schematic markers."""
    return (
        b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15c4"
        b"\x00\x00\x00\x1atEXtTitle\x00Engineering Blueprint Schematic " + salt.encode() +
        b"\x00\x00\x00\nIDATx\x9cc\x00\x01\x00\x00\x05\x00\x01\r\n-\xb4\x00\x00\x00\x00IEND\xaeB`\x82"
    )

def create_safe_photo_jpg(salt: str = "") -> bytes:
    """Valid JPEG representing a photographed document."""
    return (
        b"\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x01\x00`\x00`\x00\x00\xff\xdb\x00C\x00"
        b"\xff\xc0\x00\x11\x08\x00\x01\x00\x01\x01\x01\x11\x00\xff\xda\x00\x08\x01\x01\x00\x00?\x00\xbf\x00\xff\xd9"
        + b" Photographed Document Mobile Lens " + salt.encode()
    )

@pytest.fixture(autouse=True, scope="module")
def setup_test_db():
    import asyncio
    asyncio.run(init_db())

async def get_auth_token(client: AsyncClient, email: str, name: str = "Test Operator") -> str:
    from backend.app.core.config import settings
    resp = await client.post(
        "/api/v1/auth/local-login",
        json={"username": email, "password": settings.INITIAL_ADMIN_PASSWORD or "SovereignEnclave2026!"}
    )
    assert resp.status_code == 200, f"Login failed for {email}: {resp.text}"
    return resp.json()["token"]

@pytest.mark.asyncio
async def test_ocr_provider_abstraction():
    """Verify OCR provider abstraction: text extraction, confidence, and words count."""
    provider = DeterministicLocalOcrProvider()
    res = await provider.extract_text(b"\x89PNG\r\n\x1a\n Test Document Scan Sovereign Line 1 Line 2", mime_type="image/png")
    assert res.text != ""
    assert res.words_detected > 0
    assert res.confidence > 0.8
    assert res.provider_used == "deterministic_local_ocr"

@pytest.mark.asyncio
async def test_vision_provider_abstraction_categories():
    """Verify Vision provider classifies engineering drawings, diagrams, and photographed documents."""
    provider = DeterministicLocalVisionProvider()

    # 1. Engineering Drawing
    res_eng = await provider.analyze_image(
        b"\x89PNG\r\n\x1a\n",
        mime_type="image/png",
        prompt="Inspect this technical CAD blueprint schematic"
    )
    assert res_eng.category == "ENGINEERING_DRAWING"
    assert "schematic" in res_eng.detected_labels
    assert len(res_eng.bounding_boxes) > 0

    # 2. System Architecture Diagram
    res_diag = await provider.analyze_image(
        b"\x89PNG\r\n\x1a\n",
        mime_type="image/png",
        prompt="Inspect this network topology system architecture flowchart diagram"
    )
    assert res_diag.category == "DIAGRAM"
    assert "system_diagram" in res_diag.detected_labels

    # 3. Photographed Document
    res_photo = await provider.analyze_image(
        b"\xff\xd8\xff\xe0",
        mime_type="image/jpeg",
        prompt="Inspect this photographed document captured via camera lens"
    )
    assert res_photo.category == "PHOTOGRAPHED_DOCUMENT"

@pytest.mark.asyncio
async def test_pdf_renderer_valid_and_scanned():
    """Verify PDF renderer correctly distinguishes text pages vs scanned/image pages."""
    renderer = PurePythonPdfRenderer()
    import tempfile

    # 1. Text PDF
    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tf:
        tf.write(create_safe_text_pdf("alpha_stream"))
        txt_pdf_path = tf.name

    try:
        pages = await renderer.extract_pages_and_text(txt_pdf_path)
        assert len(pages) >= 1
        assert "Sovereign Enclave Protocol" in pages[0].text
        assert pages[0].is_scanned is False
    finally:
        if os.path.exists(txt_pdf_path):
            os.remove(txt_pdf_path)

    # 2. Scanned PDF (image stream, no font text)
    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tf:
        tf.write(create_safe_scanned_pdf("scanned_sample"))
        scan_pdf_path = tf.name

    try:
        pages_scan = await renderer.extract_pages_and_text(scan_pdf_path)
        assert len(pages_scan) >= 1
        assert pages_scan[0].is_scanned is True
        assert pages_scan[0].has_images is True
    finally:
        if os.path.exists(scan_pdf_path):
            os.remove(scan_pdf_path)

@pytest.mark.asyncio
async def test_multimodal_pipeline_lifecycle_statuses_and_logs():
    """
    Verify complete 7-stage status lifecycle & chronological logging:
    QUEUED -> PROCESSING -> OCR -> VISION -> INDEXING -> READY.
    """
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        token = await get_auth_token(client, "s.alexander@sovereign.defense.internal", "Super Admin")
        headers = {"Authorization": f"Bearer {token}"}
        s = uuid.uuid4().hex[:8]

        # Upload a schematic diagram PNG
        files = {"file": (f"blueprint_{s}.png", create_safe_schematic_png(s), "image/png")}
        data = {"title": f"Tactical Blueprint {s}", "classification": "RESTRICTED"}

        resp = await client.post("/api/v1/documents/upload", headers=headers, files=files, data=data)
        assert resp.status_code == 201, resp.text
        doc_data = resp.json()
        doc_id = doc_data["id"]

        assert doc_data["status"] == "READY"
        assert doc_data["ocr_applied"] is True
        assert doc_data["vision_applied"] is True
        assert doc_data["asset_category"] == "ENGINEERING_DRAWING"

        # Fetch chronological processing logs via API
        logs_resp = await client.get(f"/api/v1/documents/{doc_id}/logs", headers=headers)
        assert logs_resp.status_code == 200
        logs = logs_resp.json()
        assert len(logs) >= 4

        stages_recorded = [l["stage"] for l in logs]
        assert "QUEUED" in stages_recorded
        assert "PROCESSING" in stages_recorded
        assert "OCR" in stages_recorded
        assert "VISION" in stages_recorded
        assert "INDEXING" in stages_recorded
        assert "READY" in stages_recorded

@pytest.mark.asyncio
async def test_error_resilience_corrupted_pdf():
    """Verify corrupted PDF does not crash the server and transitions cleanly to FAILED."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        token = await get_auth_token(client, "s.alexander@sovereign.defense.internal", "Super Admin")
        headers = {"Authorization": f"Bearer {token}"}
        s = uuid.uuid4().hex[:8]

        # Truncated broken PDF content with unique salt
        corrupted_bytes = f"%PDF-1.4\n% Truncated broken stream with bad xref {s}\ntrailer garbage".encode()
        files = {"file": (f"corrupted_{s}.pdf", corrupted_bytes, "application/pdf")}
        data = {"title": f"Corrupted PDF {s}"}

        resp = await client.post("/api/v1/documents/upload", headers=headers, files=files, data=data)
        # Upload should succeed (201) while document internal state transitions to FAILED
        assert resp.status_code == 201
        doc_id = resp.json()["id"]

        # Fetch detail
        detail_resp = await client.get(f"/api/v1/documents/{doc_id}", headers=headers)
        assert detail_resp.status_code == 200
        detail = detail_resp.json()
        assert detail["status"] == "FAILED"
        assert detail["processing_error"] is not None
        assert "corrupted" in detail["processing_error"].lower() or "truncated" in detail["processing_error"].lower()

@pytest.mark.asyncio
async def test_error_resilience_ocr_failure_and_retry():
    """Verify OCR failure is handled gracefully and retry endpoint re-triggers processing."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        token = await get_auth_token(client, "s.alexander@sovereign.defense.internal", "Super Admin")
        headers = {"Authorization": f"Bearer {token}"}
        s = uuid.uuid4().hex[:8]

        mock_ocr = DeterministicLocalOcrProvider()
        OcrProviderFactory.set_mock_provider(mock_ocr)

        # Force OCR failure
        mock_ocr.set_force_fail(True, "Simulated GPU OCR Out-Of-Memory fault")

        try:
            files = {"file": (f"photo_doc_{s}.jpg", create_safe_photo_jpg(s), "image/jpeg")}
            data = {"title": f"Field Photo {s}"}

            up_resp = await client.post("/api/v1/documents/upload", headers=headers, files=files, data=data)
            assert up_resp.status_code == 201
            doc_id = up_resp.json()["id"]

            # Check logs note OCR warning/degraded or failed
            logs_resp = await client.get(f"/api/v1/documents/{doc_id}/logs", headers=headers)
            assert logs_resp.status_code == 200
            assert any("OCR" in l["stage"] for l in logs_resp.json())

            # Now clear OCR failure and trigger retry endpoint
            mock_ocr.set_force_fail(False)
            retry_resp = await client.post(f"/api/v1/documents/{doc_id}/retry", headers=headers)
            assert retry_resp.status_code == 200
            retry_data = retry_resp.json()
            assert retry_data["success"] is True
            assert retry_data["status"] == "READY"

            # Verify document reaches READY
            detail = (await client.get(f"/api/v1/documents/{doc_id}", headers=headers)).json()
            assert detail["status"] == "READY"
            assert detail["processing_error"] is None

        finally:
            OcrProviderFactory.set_mock_provider(None)

@pytest.mark.asyncio
async def test_error_resilience_empty_and_unsupported_files():
    """Verify empty and unsupported files are rejected with clean actionable HTTP errors."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        token = await get_auth_token(client, "s.alexander@sovereign.defense.internal", "Super Admin")
        headers = {"Authorization": f"Bearer {token}"}

        # 1. Empty file (0 bytes)
        empty_resp = await client.post(
            "/api/v1/documents/upload",
            headers=headers,
            files={"file": ("empty.txt", b"", "text/plain")}
        )
        assert empty_resp.status_code == 400
        assert "empty" in empty_resp.json()["detail"].lower()

        # 2. Unsupported file extension (.bin)
        unsupported_resp = await client.post(
            "/api/v1/documents/upload",
            headers=headers,
            files={"file": ("payload.bin", b"\x00\x01\x02\x03\x04", "application/octet-stream")}
        )
        assert unsupported_resp.status_code == 400
        assert "unsupported" in unsupported_resp.json()["detail"].lower()
