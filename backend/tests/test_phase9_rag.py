import uuid
import pytest
from httpx import AsyncClient, ASGITransport
from backend.app.main import app
from backend.app.db.init_db import init_db
from backend.app.services.rag.embedding_provider import EmbeddingProviderFactory, DeterministicLocalEmbeddingProvider
from backend.app.services.rag.rag_pipeline import rag_pipeline

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
async def test_rag_pipeline_indexing_and_chunk_inspection():
    """
    Verify complete local RAG indexing:
    Document -> extraction -> cleaning -> chunking -> local embedding -> vector database.
    Verify chunks are queryable via /api/v1/documents/{id}/chunks and /api/v1/knowledge/chunks.
    """
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        token = await get_auth_token(client, "s.alexander@sovereign.defense.internal", "Super Admin")
        headers = {"Authorization": f"Bearer {token}"}
        s = uuid.uuid4().hex[:8]

        # Ingest multi-paragraph sovereign document
        content = (
            f"Tactical Network Directives Alpha {s}.\n\n"
            f"Section 1: Air-Gap Cryptographic Gateway Architecture.\n"
            f"All outbound internet egress is physically severed via optical diodes.\n"
            f"Cryptographic key rotation occurs every 240 minutes using hardware TRNG.\n\n"
            f"Section 2: Sovereign Vector Store Policy.\n"
            f"Dense semantic vectors must be indexed strictly on-premises in pgvector or local SQLite.\n"
            f"No external third-party embedding APIs may ever be contacted.\n\n"
            f"Section 3: Incident Response.\n"
            f"If an unauthorized interface connection is detected, the enclave initiates lockstep partition mode."
        )
        files = {"file": (f"network_directives_{s}.txt", content.encode("utf-8"), "text/plain")}
        data = {"title": f"Network Directives {s}", "classification": "INTERNAL"}

        up_resp = await client.post("/api/v1/documents/upload", headers=headers, files=files, data=data)
        assert up_resp.status_code == 201, up_resp.text
        doc = up_resp.json()
        doc_id = doc["id"]

        assert doc["status"] == "READY"
        assert doc["total_chunks"] >= 1

        # 1. Inspect chunks via document chunk endpoint
        doc_chunks_resp = await client.get(f"/api/v1/documents/{doc_id}/chunks", headers=headers)
        assert doc_chunks_resp.status_code == 200
        doc_chunks = doc_chunks_resp.json()
        assert len(doc_chunks) >= 1
        assert doc_chunks[0]["document_id"] == doc_id
        assert doc_chunks[0]["page_number"] == 1
        assert doc_chunks[0]["token_count"] > 0
        assert "Air-Gap Cryptographic Gateway" in doc_chunks[0]["content"]

        # 2. Inspect chunks via knowledge base chunks endpoint
        kb_chunks_resp = await client.get(f"/api/v1/knowledge/chunks?document_id={doc_id}", headers=headers)
        assert kb_chunks_resp.status_code == 200
        kb_chunks_data = kb_chunks_resp.json()
        assert kb_chunks_data["total_records"] >= 1
        assert any(c["document_id"] == doc_id for c in kb_chunks_data["items"])

@pytest.mark.asyncio
async def test_rag_grounded_search_evidence_found_and_citations():
    """
    Verify Grounded RAG Search:
    User Question -> Retrieve Chunks -> Context to Local Model -> Answer with Verifiable Citations.
    Distinguishes: retrieved evidence vs model-generated answer.
    """
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        token = await get_auth_token(client, "s.alexander@sovereign.defense.internal", "Super Admin")
        headers = {"Authorization": f"Bearer {token}"}
        s = uuid.uuid4().hex[:8]

        # Ingest document with specific technical facts
        content = (
            f"Sovereign Defense Perimeter Directive {s}.\n"
            f"The emergency perimeter override code is PHANTOM-992-SECURE.\n"
            f"In the event of an automated alert, defensive barrier shields activate within 450 milliseconds.\n"
            f"Authorized command operator is General Vance."
        )
        files = {"file": (f"perimeter_{s}.txt", content.encode("utf-8"), "text/plain")}
        data = {"title": f"Perimeter Directive {s}", "classification": "INTERNAL"}

        up_resp = await client.post("/api/v1/documents/upload", headers=headers, files=files, data=data)
        assert up_resp.status_code == 201
        doc_id = up_resp.json()["id"]

        # Search Knowledge Base
        search_resp = await client.post("/api/v1/knowledge/search", headers=headers, json={
            "query": "What is the emergency perimeter override code and response time?",
            "document_ids": [doc_id],
            "top_k": 3,
            "similarity_threshold": 0.2,
            "hybrid_search": True
        })
        assert search_resp.status_code == 200, search_resp.text
        res = search_resp.json()

        assert res["status"] == "EVIDENCE_FOUND"
        assert res["answer"] != ""
        assert len(res["evidence"]) >= 1

        # Verify evidence metadata
        top_ev = res["evidence"][0]
        assert top_ev["document_id"] == doc_id
        assert top_ev["document_title"] == f"Perimeter Directive {s}"
        assert top_ev["page_number"] == 1
        assert "PHANTOM-992-SECURE" in top_ev["content"]
        assert top_ev["similarity_score"] > 0.0

        # Verify Citations (Never Fabricated)
        assert len(res["citations"]) >= 1
        top_cite = res["citations"][0]
        assert top_cite["document_id"] == doc_id
        assert top_cite["document_title"] == f"Perimeter Directive {s}"
        assert top_cite["page_number"] == 1
        assert top_cite["excerpt"] != ""

@pytest.mark.asyncio
async def test_rag_insufficient_evidence_refusal():
    """
    Verify Insufficient Evidence handling:
    When no relevant chunks meet threshold or topic is completely absent,
    the system must explicitly return INSUFFICIENT_EVIDENCE and NEVER fabricate citations.
    """
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        token = await get_auth_token(client, "s.alexander@sovereign.defense.internal", "Super Admin")
        headers = {"Authorization": f"Bearer {token}"}
        s = uuid.uuid4().hex[:8]

        # Upload document about server cooling
        content = f"HVAC Maintenance Protocol {s}. Air handling chiller setpoint is 18.5 Celsius."
        files = {"file": (f"hvac_{s}.txt", content.encode("utf-8"), "text/plain")}
        data = {"title": f"HVAC Protocol {s}", "classification": "INTERNAL"}

        up_resp = await client.post("/api/v1/documents/upload", headers=headers, files=files, data=data)
        assert up_resp.status_code == 201
        doc_id = up_resp.json()["id"]

        # Query about completely unrelated interstellar physics with high similarity threshold
        search_resp = await client.post("/api/v1/knowledge/search", headers=headers, json={
            "query": "What is the warp drive tachyon particle acceleration coefficient on Jupiter?",
            "document_ids": [doc_id],
            "top_k": 3,
            "similarity_threshold": 0.85,
            "hybrid_search": False
        })
        assert search_resp.status_code == 200
        res = search_resp.json()

        assert res["status"] == "INSUFFICIENT_EVIDENCE"
        assert "not contain sufficient evidence" in res["answer"].lower()
        assert len(res["evidence"]) == 0
        assert len(res["citations"]) == 0

@pytest.mark.asyncio
async def test_rag_rbac_and_document_permissions():
    """
    Verify RBAC permission enforcement in RAG:
    Operator cannot retrieve chunks from documents with restricted classification
    if they lack required clearance.
    """
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        admin_token = await get_auth_token(client, "s.alexander@sovereign.defense.internal", "Super Admin")
        auditor_token = await get_auth_token(client, "g.reid@sovereign.defense.internal", "Viewer / Auditor")
        s = uuid.uuid4().hex[:8]

        # Admin uploads a RESTRICTED document
        content = f"Restricted Compartmented Intelligence Protocol {s}. Nuclear missile silo coords: 48.8566N."
        files = {"file": (f"restricted_silo_{s}.txt", content.encode("utf-8"), "text/plain")}
        data = {"title": f"Restricted Protocol {s}", "classification": "RESTRICTED"}

        up_resp = await client.post("/api/v1/documents/upload", headers={"Authorization": f"Bearer {admin_token}"}, files=files, data=data)
        assert up_resp.status_code == 201
        doc_id = up_resp.json()["id"]

        # 1. Admin searches -> Can access restricted chunks
        admin_search = await client.post("/api/v1/knowledge/search", headers={"Authorization": f"Bearer {admin_token}"}, json={
            "query": "What are the silo coords in restricted protocol?",
            "document_ids": [doc_id],
            "similarity_threshold": 0.2
        })
        assert admin_search.status_code == 200
        assert admin_search.json()["status"] == "EVIDENCE_FOUND"

        # 2. Auditor searches for restricted document -> Cleared out by RBAC gate
        auditor_search = await client.post("/api/v1/knowledge/search", headers={"Authorization": f"Bearer {auditor_token}"}, json={
            "query": "What are the silo coords in restricted protocol?",
            "document_ids": [doc_id],
            "similarity_threshold": 0.2
        })
        assert auditor_search.status_code == 200
        # Should return INSUFFICIENT_EVIDENCE because document chunks are filtered by RBAC
        assert auditor_search.json()["status"] == "INSUFFICIENT_EVIDENCE"

@pytest.mark.asyncio
async def test_rag_reindex_and_summary_telemetry():
    """
    Verify Knowledge Base UI summary telemetry and re-indexing workflow.
    """
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        token = await get_auth_token(client, "s.alexander@sovereign.defense.internal", "Super Admin")
        headers = {"Authorization": f"Bearer {token}"}
        s = uuid.uuid4().hex[:8]

        # 1. Upload document
        content = f"Sovereign Cloudless Telemetry Guidelines {s}."
        files = {"file": (f"cloudless_{s}.txt", content.encode("utf-8"), "text/plain")}
        data = {"title": f"Cloudless {s}", "classification": "INTERNAL"}
        up_resp = await client.post("/api/v1/documents/upload", headers=headers, files=files, data=data)
        assert up_resp.status_code == 201
        doc_id = up_resp.json()["id"]

        # 2. Check summary telemetry
        summary_resp = await client.get("/api/v1/knowledge/summary", headers=headers)
        assert summary_resp.status_code == 200
        summary = summary_resp.json()
        assert summary["total_documents"] >= 1
        assert summary["total_vectors"] >= 1
        assert summary["embedding_model"] != ""
        assert summary["vector_dimensions"] > 0
        assert summary["status"] in ["HEALTHY_OPTIMIZED", "READY_AWAITING_DOCS"]

        # 3. Trigger targeted re-indexing
        reindex_resp = await client.post("/api/v1/knowledge/reindex", headers=headers, json={
            "document_ids": [doc_id]
        })
        assert reindex_resp.status_code == 200
        reindex_res = reindex_resp.json()
        assert reindex_res["success"] is True
        assert reindex_res["reindexed_documents"] >= 1

        # 4. Delete document vectors from knowledge base
        del_resp = await client.delete(f"/api/v1/knowledge/documents/{doc_id}", headers=headers)
        assert del_resp.status_code == 204

@pytest.mark.asyncio
async def test_rag_document_chat_grounded_response_with_citations_and_evidence():
    """
    Verify /api/v1/chat/document/{id}/query returns structured citations and evidence
    alongside the synthesized answer and citation snippet.
    """
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        token = await get_auth_token(client, "s.alexander@sovereign.defense.internal", "Super Admin")
        headers = {"Authorization": f"Bearer {token}"}
        s = uuid.uuid4().hex[:8]

        # 1. Ingest document
        content = (
            f"Sovereign Cryptographic Enclave Directive {s}.\n"
            f"The primary encryption algorithm is AES-256-GCM with Ephemeral Diffie-Hellman.\n"
            f"All keys are derived using PBKDF2 with 600,000 iterations."
        )
        files = {"file": (f"crypto_{s}.txt", content.encode("utf-8"), "text/plain")}
        data = {"title": f"Crypto Protocol {s}", "classification": "INTERNAL"}
        up_resp = await client.post("/api/v1/documents/upload", headers=headers, files=files, data=data)
        assert up_resp.status_code == 201
        doc_id = up_resp.json()["id"]

        # 2. Query document grounded endpoint
        q_resp = await client.post(f"/api/v1/chat/document/{doc_id}/query", headers=headers, json={
            "query": "What is the primary encryption algorithm?",
            "model_id": "auto"
        })
        assert q_resp.status_code == 200
        q_data = q_resp.json()
        assert q_data["document_id"] == doc_id
        assert "AES-256-GCM" in q_data["answer"] or "encryption" in q_data["answer"].lower()
        assert q_data["citation_snippet"] is not None
        assert len(q_data["citations"]) >= 1
        assert q_data["citations"][0]["document_id"] == doc_id
        assert q_data["citations"][0]["page_number"] == 1
        assert q_data["citations"][0]["chunk_index"] == 0
        assert q_data["citations"][0]["similarity_score"] > 0
        assert len(q_data["evidence"]) >= 1

