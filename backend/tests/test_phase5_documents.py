import base64
import io
import os
import uuid
import zipfile
import pytest
from httpx import AsyncClient, ASGITransport
from backend.app.main import app
from backend.app.core.config import settings
from backend.app.db.init_db import init_db

def create_valid_docx(salt: str = "") -> bytes:
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("[Content_Types].xml", '<?xml version="1.0" encoding="UTF-8"?><Types></Types>')
        zf.writestr("word/document.xml", f'<?xml version="1.0" encoding="UTF-8"?><w:document><w:body><w:p><w:r><w:t>Sovereign Enterprise Protocol Alpha Section 1 {salt}</w:t></w:r></w:p></w:body></w:document>')
    return buffer.getvalue()

def create_valid_xlsx(salt: str = "") -> bytes:
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("[Content_Types].xml", '<?xml version="1.0" encoding="UTF-8"?><Types></Types>')
        zf.writestr("xl/sharedStrings.xml", f'<?xml version="1.0" encoding="UTF-8"?><sst><si><t>Q3 Sovereign Hardware Telemetry {salt}</t></si></sst>')
    return buffer.getvalue()

def create_valid_pdf(salt: str = "") -> bytes:
    return f"%PDF-1.4\n% Salt: {salt}\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R >>\nendobj\nxref\n0 4\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n".encode()

def create_valid_png(salt: str = "") -> bytes:
    return b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15c4\x00\x00\x00\nIDATx\x9cc\x00\x01\x00\x00\x05\x00\x01\r\n-\xb4\x00\x00\x00\x00IEND\xaeB`\x82" + salt.encode()

def create_valid_jpg(salt: str = "") -> bytes:
    return b"\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x01\x00`\x00`\x00\x00\xff\xdb\x00C\x00\xff\xc0\x00\x11\x08\x00\x01\x00\x01\x01\x01\x11\x00\xff\xc4\x00\x1f\x00\x00\x01\x05\x01\x01\x01\x01\x01\x01\x00\x00\x00\x00\x00\x00\x00\x00\x01\x02\x03\x04\x05\x06\x07\x08\t\n\x0b\xff\xda\x00\x08\x01\x01\x00\x00?\x00\xbf\x00\xff\xd9" + salt.encode()

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
async def test_document_upload_all_supported_formats():
    """Verify secure multipart upload for all 6 formats: PDF, DOCX, XLSX, TXT, PNG, JPG."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        token = await get_auth_token(client, "s.alexander@sovereign.defense.internal", "Super Admin")
        headers = {"Authorization": f"Bearer {token}"}
        s = uuid.uuid4().hex[:8]

        formats = [
            (f"protocol_{s}.pdf", create_valid_pdf(s), "application/pdf", "CONFIDENTIAL"),
            (f"charter_{s}.docx", create_valid_docx(s), "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "RESTRICTED"),
            (f"metrics_{s}.xlsx", create_valid_xlsx(s), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "SECRET"),
            (f"notes_{s}.txt", f"Sovereign node instructions {s}\nAll ingress isolated.".encode(), "text/plain", "INTERNAL"),
            (f"architecture_{s}.png", create_valid_png(s), "image/png", "INTERNAL"),
            (f"evidence_{s}.jpg", create_valid_jpg(s), "image/jpeg", "RESTRICTED")
        ]

        uploaded_ids = []
        for filename, content, mime, classification in formats:
            files = {"file": (filename, content, mime)}
            data = {"title": f"Test {filename}", "classification": classification}

            resp = await client.post("/api/v1/documents/upload", headers=headers, files=files, data=data)
            assert resp.status_code == 201, f"Failed uploading {filename}: {resp.text}"
            res = resp.json()
            assert res["id"] is not None
            assert res["filename"] == filename
            assert res["classification"] == classification
            assert res["status"] in ["READY", "PROCESSING"]
            # Verify no raw storage file path exposed
            assert "file_path" not in res
            uploaded_ids.append(res["id"])

        assert len(uploaded_ids) == 6

@pytest.mark.asyncio
async def test_spoofed_and_invalid_files_rejection():
    """Verify spoofed magic bytes, illegal extensions, and empty files are strictly rejected."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        token = await get_auth_token(client, "s.alexander@sovereign.defense.internal", "Super Admin")
        headers = {"Authorization": f"Bearer {token}"}

        # 1. Spoofed PDF (extension is .pdf, but content is arbitrary shell script)
        spoofed_pdf = {"file": ("exploit.pdf", b"#!/bin/bash\nrm -rf /", "application/pdf")}
        resp = await client.post("/api/v1/documents/upload", headers=headers, files=spoofed_pdf)
        assert resp.status_code == 400
        assert "spoofing" in resp.json()["detail"].lower()

        # 2. Illegal extension (.exe)
        illegal_ext = {"file": ("malware.exe", b"MZ\x90\x00\x03\x00\x00\x00", "application/octet-stream")}
        resp = await client.post("/api/v1/documents/upload", headers=headers, files=illegal_ext)
        assert resp.status_code == 400
        assert "unsupported" in resp.json()["detail"].lower()

        # 3. Empty file
        empty_file = {"file": ("empty.txt", b"", "text/plain")}
        resp = await client.post("/api/v1/documents/upload", headers=headers, files=empty_file)
        assert resp.status_code == 400

@pytest.mark.asyncio
async def test_path_traversal_sanitization():
    """Verify path traversal characters in filenames are completely sanitized."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        token = await get_auth_token(client, "s.alexander@sovereign.defense.internal", "Super Admin")
        headers = {"Authorization": f"Bearer {token}"}
        s = uuid.uuid4().hex[:8]

        traversal_file = {"file": (f"../../../../etc/passwd_{s}.txt", f"Root directory payload {s}".encode(), "text/plain")}
        resp = await client.post("/api/v1/documents/upload", headers=headers, files=traversal_file)
        assert resp.status_code == 201
        res = resp.json()
        assert "../" not in res["filename"]
        assert "/" not in res["filename"]
        assert "\\" not in res["filename"]
        assert res["filename"] == f"passwd_{s}.txt"

@pytest.mark.asyncio
async def test_sha256_duplicate_prevention():
    """Verify identical SHA-256 upload raises 409 Conflict."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        token = await get_auth_token(client, "s.alexander@sovereign.defense.internal", "Super Admin")
        headers = {"Authorization": f"Bearer {token}"}

        s = uuid.uuid4().hex
        unique_content = f"Unique enterprise data stream block {s}".encode()
        files1 = {"file": (f"unique_{s}_1.txt", unique_content, "text/plain")}
        resp1 = await client.post("/api/v1/documents/upload", headers=headers, files=files1)
        assert resp1.status_code == 201

        # Attempt to upload identical content with different filename
        files2 = {"file": (f"unique_{s}_2.txt", unique_content, "text/plain")}
        resp2 = await client.post("/api/v1/documents/upload", headers=headers, files=files2)
        assert resp2.status_code == 409
        assert "already exists" in resp2.json()["detail"].lower()

@pytest.mark.asyncio
async def test_document_listing_search_and_filters():
    """Verify listing documents with search and classification/status/file_type filters."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        token = await get_auth_token(client, "s.alexander@sovereign.defense.internal", "Super Admin")
        headers = {"Authorization": f"Bearer {token}"}

        s = uuid.uuid4().hex[:8]
        # Upload a searchable document
        files = {"file": (f"telemetry_orion_{s}.txt", f"Telemetry for project Orion Alpha Station {s}".encode(), "text/plain")}
        data = {"title": f"Orion Satellite Telemetry {s}", "classification": "TOP_SECRET"}
        upload_resp = await client.post("/api/v1/documents/upload", headers=headers, files=files, data=data)
        assert upload_resp.status_code == 201

        # Search by term 'Orion'
        resp_search = await client.get("/api/v1/documents?q=Orion", headers=headers)
        assert resp_search.status_code == 200
        search_items = resp_search.json()["items"]
        assert any("Orion" in d["title"] or "orion" in d["filename"].lower() for d in search_items)

        # Filter by classification 'TOP_SECRET'
        resp_class = await client.get("/api/v1/documents?classification=TOP_SECRET", headers=headers)
        assert resp_class.status_code == 200
        assert all(d["classification"] == "TOP_SECRET" for d in resp_class.json()["items"])

        # Filter by file_type 'txt'
        resp_ft = await client.get("/api/v1/documents?file_type=txt", headers=headers)
        assert resp_ft.status_code == 200
        assert all(".txt" in d["filename"].lower() for d in resp_ft.json()["items"])

@pytest.mark.asyncio
async def test_document_details_preview_download_and_deletion():
    """Verify document details, preview, streaming download, and deletion lifecycle."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        token = await get_auth_token(client, "s.alexander@sovereign.defense.internal", "Super Admin")
        headers = {"Authorization": f"Bearer {token}"}

        s = uuid.uuid4().hex[:8]
        payload_bytes = f"Sovereign Defense Enclave Operation Plan {s}.\nStrictly air-gapped clearance required.".encode()
        files = {"file": (f"defense_enclave_{s}.txt", payload_bytes, "text/plain")}
        data = {"title": f"Defense Enclave Plan {s}", "classification": "RESTRICTED"}
        upload_resp = await client.post("/api/v1/documents/upload", headers=headers, files=files, data=data)
        assert upload_resp.status_code == 201
        doc_id = upload_resp.json()["id"]

        # 2. Get details
        detail_resp = await client.get(f"/api/v1/documents/{doc_id}", headers=headers)
        assert detail_resp.status_code == 200
        det = detail_resp.json()
        assert det["id"] == doc_id
        assert det["title"] == f"Defense Enclave Plan {s}"
        assert "DELETE" in det["permissions"]
        assert len(det["activity"]) > 0  # DOC_UPLOAD audit logged

        # 3. Preview
        prev_resp = await client.get(f"/api/v1/documents/{doc_id}/preview", headers=headers)
        assert prev_resp.status_code == 200
        prev = prev_resp.json()
        assert "Sovereign Defense Enclave" in prev["content_preview"]
        assert prev["total_pages"] >= 1

        # 4. Download
        down_resp = await client.get(f"/api/v1/documents/{doc_id}/download", headers=headers)
        assert down_resp.status_code == 200
        assert down_resp.content == payload_bytes

        # 5. Delete document
        del_resp = await client.delete(f"/api/v1/documents/{doc_id}", headers=headers)
        assert del_resp.status_code == 204

        # 6. Verify 404 after deletion
        get_after = await client.get(f"/api/v1/documents/{doc_id}", headers=headers)
        assert get_after.status_code == 404

@pytest.mark.asyncio
async def test_document_rbac_boundaries():
    """
    Verify RBAC permission boundaries:
    - EMPLOYEE can upload and download, but cannot delete documents.
    - AUDITOR cannot upload or delete documents.
    """
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        # 1. Employee login
        emp_token = await get_auth_token(client, "j.doe@sovereign.defense.internal", "Employee")
        emp_headers = {"Authorization": f"Bearer {emp_token}"}

        # 2. Auditor login
        audit_token = await get_auth_token(client, "g.reid@sovereign.defense.internal", "Viewer / Auditor")
        audit_headers = {"Authorization": f"Bearer {audit_token}"}

        s = uuid.uuid4().hex[:8]

        # Auditor cannot upload
        audit_upload = {"file": (f"audit_leak_{s}.txt", f"attempt {s}".encode(), "text/plain")}
        resp_audit_up = await client.post("/api/v1/documents/upload", headers=audit_headers, files=audit_upload)
        assert resp_audit_up.status_code == 403

        # Employee can upload
        emp_file = {"file": (f"employee_daily_report_{s}.txt", f"Employee daily log {s}".encode(), "text/plain")}
        resp_emp_up = await client.post("/api/v1/documents/upload", headers=emp_headers, files=emp_file)
        assert resp_emp_up.status_code == 201
        doc_id = resp_emp_up.json()["id"]

        # Employee can read details and download
        resp_emp_get = await client.get(f"/api/v1/documents/{doc_id}", headers=emp_headers)
        assert resp_emp_get.status_code == 200
        resp_emp_down = await client.get(f"/api/v1/documents/{doc_id}/download", headers=emp_headers)
        assert resp_emp_down.status_code == 200

        # Employee cannot delete (requires documents.delete permission)
        resp_emp_del = await client.delete(f"/api/v1/documents/{doc_id}", headers=emp_headers)
        assert resp_emp_del.status_code == 403

        # Auditor cannot delete
        resp_audit_del = await client.delete(f"/api/v1/documents/{doc_id}", headers=audit_headers)
        assert resp_audit_del.status_code == 403

@pytest.mark.asyncio
async def test_programmatic_document_validation():
    """
    Verify programmatic document creation endpoint (POST /api/v1/documents) enforces:
    1. Size limits (size <= 0 and size > max)
    2. Whitelisted extensions (rejection of .exe, .sh, etc.)
    3. Declared MIME type matching expected extension
    4. Real magic byte signature validation (rejection of spoofed files)
    5. Rejection when neither content_base64 nor existing vault file is provided
    6. Successful creation when valid content_base64 is provided
    """
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        token = await get_auth_token(client, "s.alexander@sovereign.defense.internal", "Super Admin")
        headers = {"Authorization": f"Bearer {token}"}
        s = uuid.uuid4().hex[:8]

        # 1. Reject empty size
        resp_empty = await client.post("/api/v1/documents", headers=headers, json={
            "title": f"Empty Doc {s}",
            "filename": f"empty_{s}.pdf",
            "file_size_bytes": 0,
            "mime_type": "application/pdf"
        })
        assert resp_empty.status_code == 400

        # 2. Reject size exceeding MAX_UPLOAD_SIZE_BYTES
        resp_huge = await client.post("/api/v1/documents", headers=headers, json={
            "title": f"Huge Doc {s}",
            "filename": f"huge_{s}.pdf",
            "file_size_bytes": settings.MAX_UPLOAD_SIZE_BYTES + 1024,
            "mime_type": "application/pdf"
        })
        assert resp_huge.status_code == 413

        # 3. Reject disallowed extension (.exe)
        resp_exe = await client.post("/api/v1/documents", headers=headers, json={
            "title": f"Malware Doc {s}",
            "filename": f"malware_{s}.exe",
            "file_size_bytes": 1024,
            "mime_type": "application/octet-stream"
        })
        assert resp_exe.status_code == 400
        assert "unsupported" in resp_exe.json()["detail"].lower()

        # 4. Reject MIME type mismatch (declared text/plain for .pdf)
        resp_mime = await client.post("/api/v1/documents", headers=headers, json={
            "title": f"Mismatched MIME {s}",
            "filename": f"doc_{s}.pdf",
            "file_size_bytes": 1024,
            "mime_type": "text/plain"
        })
        assert resp_mime.status_code == 400
        assert "mime type mismatch" in resp_mime.json()["detail"].lower()

        # 5. Reject spoofed magic bytes (declared .pdf with shell script content)
        spoofed_payload = base64.b64encode(b"#!/bin/bash\nrm -rf /").decode()
        resp_spoof = await client.post("/api/v1/documents", headers=headers, json={
            "title": f"Spoofed Doc {s}",
            "filename": f"spoofed_{s}.pdf",
            "file_size_bytes": len(b"#!/bin/bash\nrm -rf /"),
            "mime_type": "application/pdf",
            "content_base64": spoofed_payload
        })
        assert resp_spoof.status_code == 400
        assert "spoofing" in resp_spoof.json()["detail"].lower()

        # 6. Reject when neither content_base64 nor existing vault file is provided
        resp_nofile = await client.post("/api/v1/documents", headers=headers, json={
            "title": f"No File Doc {s}",
            "filename": f"nofile_{s}.pdf",
            "file_path": f"/vault/nonexistent_{s}.pdf",
            "file_size_bytes": 1024,
            "mime_type": "application/pdf"
        })
        assert resp_nofile.status_code == 400

        # 7. Accept valid document with matching magic bytes
        valid_pdf_bytes = f"%PDF-1.5 Valid Content {s}".encode()
        resp_valid = await client.post("/api/v1/documents", headers=headers, json={
            "title": f"Valid Programmatic Doc {s}",
            "filename": f"valid_{s}.pdf",
            "file_size_bytes": len(valid_pdf_bytes),
            "mime_type": "application/pdf",
            "classification": "SECRET",
            "content_base64": base64.b64encode(valid_pdf_bytes).decode()
        })
        assert resp_valid.status_code == 201
        res_data = resp_valid.json()
        assert res_data["title"] == f"Valid Programmatic Doc {s}"
        assert res_data["filename"] == f"valid_{s}.pdf"
        assert res_data["classification"] == "SECRET"

        # 8. Reject empty content_base64
        resp_empty = await client.post("/api/v1/documents", headers=headers, json={
            "title": f"Empty Doc {s}",
            "filename": f"empty_{s}.pdf",
            "file_size_bytes": 0,
            "mime_type": "application/pdf",
            "content_base64": base64.b64encode(b"").decode()
        })
        assert resp_empty.status_code == 400
        assert "empty" in resp_empty.json()["detail"].lower()

        # 9. Reject invalid classification
        resp_bad_class = await client.post("/api/v1/documents", headers=headers, json={
            "title": f"Bad Class {s}",
            "filename": f"bad_class_{s}.pdf",
            "file_size_bytes": len(valid_pdf_bytes),
            "mime_type": "application/pdf",
            "classification": "TOP_SECRET_INVALID_NAME",
            "content_base64": base64.b64encode(valid_pdf_bytes).decode()
        })
        assert resp_bad_class.status_code == 400
        assert "classification" in resp_bad_class.json()["detail"].lower()

        # 10. Reject duplicate document (identical sha256)
        resp_dup = await client.post("/api/v1/documents", headers=headers, json={
            "title": f"Duplicate Doc {s}",
            "filename": f"dup_{s}.pdf",
            "file_size_bytes": len(valid_pdf_bytes),
            "mime_type": "application/pdf",
            "content_base64": base64.b64encode(valid_pdf_bytes).decode()
        })
        assert resp_dup.status_code == 409
        assert "already exists" in resp_dup.json()["detail"].lower()

