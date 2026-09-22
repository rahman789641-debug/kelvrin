import uuid
import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select
from backend.app.main import app
from backend.app.db.init_db import init_db
from backend.app.db.session import AsyncSessionLocal
from backend.app.models.user import User
from backend.app.models.document import Document
from backend.app.models.deliverable import Deliverable
from backend.app.models.chat import Conversation
from backend.app.models.agent import AgentRun
from backend.app.core.security import hash_password, create_access_token
from backend.app.core.tenant import TenantContext, authorize_tenant_access
from fastapi import HTTPException

@pytest.fixture(autouse=True, scope="module")
def setup_test_db():
    import asyncio
    asyncio.run(init_db())

@pytest.mark.asyncio
async def test_cross_tenant_isolation_enforcement():
    """
    Verify strict tenant isolation:
    - User A (ACME) cannot access User B (OMEGA) resources.
    - Missing WHERE clauses cannot leak data due to ORM-level tenant loader criteria.
    - Direct access attempts return 404 Not Found.
    """
    async with AsyncSessionLocal() as session:
        # 1. Create two users belonging to distinct company_codes
        u_acme = User(
            id=f"usr_acme_{uuid.uuid4().hex[:8]}",
            email=f"alice_{uuid.uuid4().hex[:6]}@acme.defense",
            full_name="Alice Acme",
            role="Analyst",
            company_code="ACME_CORP",
            status="ACTIVE",
            password_hash=hash_password("TenantPass2026!")
        )
        u_omega = User(
            id=f"usr_omega_{uuid.uuid4().hex[:8]}",
            email=f"bob_{uuid.uuid4().hex[:6]}@omega.defense",
            full_name="Bob Omega",
            role="Analyst",
            company_code="OMEGA_INC",
            status="ACTIVE",
            password_hash=hash_password("TenantPass2026!")
        )
        session.add_all([u_acme, u_omega])
        await session.commit()

        # 2. Create resources for ACME
        doc_acme = Document(
            id=f"doc_acme_{uuid.uuid4().hex[:8]}",
            title="ACME Classified Blueprint",
            filename="blueprint.pdf",
            file_path="/tmp/blueprint.pdf",
            file_size_bytes=1024,
            mime_type="application/pdf",
            sha256_hash=uuid.uuid4().hex,
            classification="SECRET",
            status="READY",
            uploaded_by=u_acme.id,
            company_code="ACME_CORP"
        )
        deliv_acme = Deliverable(
            id=f"deliv_acme_{uuid.uuid4().hex[:8]}",
            filename="acme_brief.docx",
            file_path="/tmp/acme_brief.docx",
            file_type="DOCX",
            title="ACME Operations Brief",
            sha256_hash=uuid.uuid4().hex,
            owner_id=u_acme.id,
            company_code="ACME_CORP",
            status="READY"
        )
        conv_acme = Conversation(
            id=f"conv_acme_{uuid.uuid4().hex[:8]}",
            title="ACME Internal Discussion",
            user_id=u_acme.id,
            company_code="ACME_CORP"
        )
        run_acme = AgentRun(
            id=f"run_acme_{uuid.uuid4().hex[:8]}",
            agent_name="ACME Recon Agent",
            goal="Scan internal ACME network",
            user_id=u_acme.id,
            company_code="ACME_CORP"
        )
        session.add_all([doc_acme, deliv_acme, conv_acme, run_acme])
        await session.commit()

        doc_acme_id = doc_acme.id
        deliv_acme_id = deliv_acme.id
        conv_acme_id = conv_acme.id
        run_acme_id = run_acme.id

    # 3. Test centralized authorization guard directly
    with pytest.raises(HTTPException) as exc_info:
        authorize_tenant_access(doc_acme, u_omega)
    assert exc_info.value.status_code == 404

    with pytest.raises(HTTPException) as exc_info:
        authorize_tenant_access(deliv_acme, u_omega)
    assert exc_info.value.status_code == 404

    with pytest.raises(HTTPException) as exc_info:
        authorize_tenant_access(conv_acme, u_omega)
    assert exc_info.value.status_code == 404

    with pytest.raises(HTTPException) as exc_info:
        authorize_tenant_access(run_acme, u_omega)
    assert exc_info.value.status_code == 404

    # ACME user accessing own resources succeeds
    authorize_tenant_access(doc_acme, u_acme)
    authorize_tenant_access(deliv_acme, u_acme)
    authorize_tenant_access(conv_acme, u_acme)
    authorize_tenant_access(run_acme, u_acme)

    # 4. Test API endpoint isolation via HTTP
    token_acme = create_access_token(
        subject=u_acme.id,
        email=u_acme.email,
        role=u_acme.role,
        permissions=u_acme.permissions
    )
    token_omega = create_access_token(
        subject=u_omega.id,
        email=u_omega.email,
        role=u_omega.role,
        permissions=u_omega.permissions
    )

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # User Omega querying ACME document by ID returns 404
        resp_doc = await client.get(
            f"/api/v1/documents/{doc_acme_id}",
            headers={"Authorization": f"Bearer {token_omega}"}
        )
        assert resp_doc.status_code == 404

        # User Omega querying ACME deliverable by ID returns 404
        resp_deliv = await client.get(
            f"/api/v1/deliverables/{deliv_acme_id}",
            headers={"Authorization": f"Bearer {token_omega}"}
        )
        assert resp_deliv.status_code == 404

        # User Omega querying ACME conversation by ID returns 404
        resp_conv = await client.get(
            f"/api/v1/chat/conversations/{conv_acme_id}",
            headers={"Authorization": f"Bearer {token_omega}"}
        )
        assert resp_conv.status_code == 404

        # User Omega querying ACME agent run by ID returns 404
        resp_run = await client.get(
            f"/api/v1/agents/runs/{run_acme_id}",
            headers={"Authorization": f"Bearer {token_omega}"}
        )
        assert resp_run.status_code == 404

        # User Acme querying own document succeeds
        resp_acme = await client.get(
            f"/api/v1/documents/{doc_acme_id}",
            headers={"Authorization": f"Bearer {token_acme}"}
        )
        assert resp_acme.status_code == 200

@pytest.mark.asyncio
async def test_tenant_context_loader_criteria():
    """
    Verify ORM-level tenant loader criteria automatically filters queries
    even if application code executes a simple select without WHERE clauses.
    """
    async with AsyncSessionLocal() as session:
        # In ACME tenant context, query only sees ACME rows
        with TenantContext("ACME_CORP"):
            docs = (await session.execute(select(Document).where(Document.company_code.is_not(None)))).scalars().all()
            for d in docs:
                assert d.company_code == "ACME_CORP"

        # In OMEGA tenant context, query only sees OMEGA rows
        with TenantContext("OMEGA_INC"):
            docs = (await session.execute(select(Document).where(Document.company_code.is_not(None)))).scalars().all()
            for d in docs:
                assert d.company_code == "OMEGA_INC"

@pytest.mark.asyncio
async def test_cross_tenant_mutations_and_downloads_blocked():
    """
    Verify Tenant Omega cannot perform mutations or downloads against Tenant ACME resources:
    - DELETE /documents/{doc_acme_id} -> 404
    - GET /documents/{doc_acme_id}/download -> 404
    - DELETE /deliverables/{deliv_acme_id} -> 404
    - GET /deliverables/{deliv_acme_id}/download -> 404
    - POST /chat/conversations/{conv_acme_id}/messages -> 404
    - DELETE /chat/conversations/{conv_acme_id} -> 404
    - POST /chat/document/{doc_acme_id}/query -> 404
    - POST /agents/runs/{run_acme_id}/cancel -> 404
    """
    async with AsyncSessionLocal() as session:
        u_acme = User(
            id=f"usr_acme_{uuid.uuid4().hex[:8]}",
            email=f"alice_{uuid.uuid4().hex[:6]}@acme.corp",
            full_name="Alice Acme",
            role="Super Admin",
            company_code="ACME_TEST",
            status="ACTIVE",
            password_hash=hash_password("Pass1234!")
        )
        u_omega = User(
            id=f"usr_omega_{uuid.uuid4().hex[:8]}",
            email=f"bob_{uuid.uuid4().hex[:6]}@omega.corp",
            full_name="Bob Omega",
            role="Super Admin",
            company_code="OMEGA_TEST",
            status="ACTIVE",
            password_hash=hash_password("Pass1234!")
        )
        session.add_all([u_acme, u_omega])
        await session.commit()

        doc_acme = Document(
            id=f"doc_acme_{uuid.uuid4().hex[:8]}",
            title="ACME Secret Specs",
            filename="acme_specs.pdf",
            file_path="/tmp/acme_specs.pdf",
            file_size_bytes=100,
            mime_type="application/pdf",
            sha256_hash=uuid.uuid4().hex,
            classification="SECRET",
            status="READY",
            uploaded_by=u_acme.id,
            company_code="ACME_TEST"
        )
        deliv_acme = Deliverable(
            id=f"deliv_acme_{uuid.uuid4().hex[:8]}",
            filename="acme_plan.docx",
            file_path="/tmp/acme_plan.docx",
            file_type="DOCX",
            title="ACME Strategic Plan",
            sha256_hash=uuid.uuid4().hex,
            owner_id=u_acme.id,
            company_code="ACME_TEST",
            status="READY"
        )
        conv_acme = Conversation(
            id=f"conv_acme_{uuid.uuid4().hex[:8]}",
            title="ACME Strategic Discussion",
            user_id=u_acme.id,
            company_code="ACME_TEST"
        )
        run_acme = AgentRun(
            id=f"run_acme_{uuid.uuid4().hex[:8]}",
            agent_name="ACME Defense Agent",
            goal="Secure ACME perimeter",
            user_id=u_acme.id,
            company_code="ACME_TEST",
            status="RUNNING"
        )
        session.add_all([doc_acme, deliv_acme, conv_acme, run_acme])
        await session.commit()

        doc_acme_id = doc_acme.id
        deliv_acme_id = deliv_acme.id
        conv_acme_id = conv_acme.id
        run_acme_id = run_acme.id

    token_omega = create_access_token(
        subject=u_omega.id,
        email=u_omega.email,
        role=u_omega.role,
        permissions=u_omega.permissions
    )

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        headers_omega = {"Authorization": f"Bearer {token_omega}"}

        # 1. Omega delete ACME document -> 404
        resp = await client.delete(f"/api/v1/documents/{doc_acme_id}", headers=headers_omega)
        assert resp.status_code == 404

        # 2. Omega download ACME document -> 404
        resp = await client.get(f"/api/v1/documents/{doc_acme_id}/download", headers=headers_omega)
        assert resp.status_code == 404

        # 3. Omega delete ACME deliverable -> 404
        resp = await client.delete(f"/api/v1/deliverables/{deliv_acme_id}", headers=headers_omega)
        assert resp.status_code == 404

        # 4. Omega download ACME deliverable -> 404
        resp = await client.get(f"/api/v1/deliverables/{deliv_acme_id}/download", headers=headers_omega)
        assert resp.status_code == 404

        # 5. Omega post message to ACME conversation -> 404
        resp = await client.post(
            f"/api/v1/chat/conversations/{conv_acme_id}/messages",
            headers=headers_omega,
            json={"content": "Malicious intrusion message"}
        )
        assert resp.status_code == 404

        # 6. Omega delete ACME conversation -> 404
        resp = await client.delete(f"/api/v1/chat/conversations/{conv_acme_id}", headers=headers_omega)
        assert resp.status_code == 404

        # 7. Omega grounded query on ACME document -> 404
        resp = await client.post(
            f"/api/v1/chat/document/{doc_acme_id}/query",
            headers=headers_omega,
            json={"query": "Give me confidential ACME data"}
        )
        assert resp.status_code == 404

        # 8. Omega cancel ACME agent run -> 404
        resp = await client.post(f"/api/v1/agents/runs/{run_acme_id}/cancel", headers=headers_omega)
        assert resp.status_code == 404


@pytest.mark.asyncio
async def test_cross_tenant_collection_listing_isolation():
    """
    Verify listing endpoints strictly segregate data by company code:
    - User Acme listing /documents, /deliverables, /conversations, /agents/runs sees only ACME data.
    - User Omega listing sees only OMEGA data, with 0 cross-tenant contamination.
    """
    company_a = f"CORP_A_{uuid.uuid4().hex[:6]}"
    company_b = f"CORP_B_{uuid.uuid4().hex[:6]}"

    async with AsyncSessionLocal() as session:
        u_a = User(
            id=f"usr_a_{uuid.uuid4().hex[:8]}",
            email=f"alice_{uuid.uuid4().hex[:6]}@corpa.com",
            full_name="Alice A",
            role="Analyst",
            company_code=company_a,
            status="ACTIVE",
            password_hash=hash_password("Pass1234!")
        )
        u_b = User(
            id=f"usr_b_{uuid.uuid4().hex[:8]}",
            email=f"bob_{uuid.uuid4().hex[:6]}@corpb.com",
            full_name="Bob B",
            role="Analyst",
            company_code=company_b,
            status="ACTIVE",
            password_hash=hash_password("Pass1234!")
        )
        session.add_all([u_a, u_b])
        await session.commit()

        # Seed resources for Company A
        doc_a = Document(
            id=f"doc_a_{uuid.uuid4().hex[:8]}",
            title="Corp A Document",
            filename="a.pdf",
            file_path="/tmp/a.pdf",
            file_size_bytes=100,
            mime_type="application/pdf",
            sha256_hash=uuid.uuid4().hex,
            classification="INTERNAL",
            status="READY",
            uploaded_by=u_a.id,
            company_code=company_a
        )
        deliv_a = Deliverable(
            id=f"deliv_a_{uuid.uuid4().hex[:8]}",
            filename="a.docx",
            file_path="/tmp/a.docx",
            file_type="DOCX",
            title="Corp A Deliverable",
            sha256_hash=uuid.uuid4().hex,
            owner_id=u_a.id,
            company_code=company_a,
            status="READY"
        )
        conv_a = Conversation(
            id=f"conv_a_{uuid.uuid4().hex[:8]}",
            title="Corp A Chat",
            user_id=u_a.id,
            company_code=company_a
        )
        run_a = AgentRun(
            id=f"run_a_{uuid.uuid4().hex[:8]}",
            agent_name="Corp A Agent",
            goal="A Task",
            user_id=u_a.id,
            company_code=company_a
        )

        # Seed resources for Company B
        doc_b = Document(
            id=f"doc_b_{uuid.uuid4().hex[:8]}",
            title="Corp B Document",
            filename="b.pdf",
            file_path="/tmp/b.pdf",
            file_size_bytes=100,
            mime_type="application/pdf",
            sha256_hash=uuid.uuid4().hex,
            classification="INTERNAL",
            status="READY",
            uploaded_by=u_b.id,
            company_code=company_b
        )
        deliv_b = Deliverable(
            id=f"deliv_b_{uuid.uuid4().hex[:8]}",
            filename="b.docx",
            file_path="/tmp/b.docx",
            file_type="DOCX",
            title="Corp B Deliverable",
            sha256_hash=uuid.uuid4().hex,
            owner_id=u_b.id,
            company_code=company_b,
            status="READY"
        )
        conv_b = Conversation(
            id=f"conv_b_{uuid.uuid4().hex[:8]}",
            title="Corp B Chat",
            user_id=u_b.id,
            company_code=company_b
        )
        run_b = AgentRun(
            id=f"run_b_{uuid.uuid4().hex[:8]}",
            agent_name="Corp B Agent",
            goal="B Task",
            user_id=u_b.id,
            company_code=company_b
        )

        session.add_all([doc_a, deliv_a, conv_a, run_a, doc_b, deliv_b, conv_b, run_b])
        await session.commit()

        doc_a_id = doc_a.id
        doc_b_id = doc_b.id
        deliv_a_id = deliv_a.id
        deliv_b_id = deliv_b.id
        conv_a_id = conv_a.id
        conv_b_id = conv_b.id
        run_a_id = run_a.id
        run_b_id = run_b.id

    token_a = create_access_token(u_a.id, email=u_a.email, role=u_a.role, permissions=u_a.permissions)
    token_b = create_access_token(u_b.id, email=u_b.email, role=u_b.role, permissions=u_b.permissions)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # Check Documents Listing
        docs_resp_a = await client.get("/api/v1/documents", headers={"Authorization": f"Bearer {token_a}"})
        assert docs_resp_a.status_code == 200
        doc_ids_a = [d["id"] for d in docs_resp_a.json()["items"]]
        assert doc_a_id in doc_ids_a
        assert doc_b_id not in doc_ids_a

        docs_resp_b = await client.get("/api/v1/documents", headers={"Authorization": f"Bearer {token_b}"})
        assert docs_resp_b.status_code == 200
        doc_ids_b = [d["id"] for d in docs_resp_b.json()["items"]]
        assert doc_b_id in doc_ids_b
        assert doc_a_id not in doc_ids_b

        # Check Deliverables Listing
        deliv_resp_a = await client.get("/api/v1/deliverables", headers={"Authorization": f"Bearer {token_a}"})
        assert deliv_resp_a.status_code == 200
        deliv_ids_a = [d["id"] for d in deliv_resp_a.json()]
        assert deliv_a_id in deliv_ids_a
        assert deliv_b_id not in deliv_ids_a

        deliv_resp_b = await client.get("/api/v1/deliverables", headers={"Authorization": f"Bearer {token_b}"})
        assert deliv_resp_b.status_code == 200
        deliv_ids_b = [d["id"] for d in deliv_resp_b.json()]
        assert deliv_b_id in deliv_ids_b
        assert deliv_a_id not in deliv_ids_b

        # Check Conversations Listing
        conv_resp_a = await client.get("/api/v1/chat/conversations", headers={"Authorization": f"Bearer {token_a}"})
        assert conv_resp_a.status_code == 200
        conv_ids_a = [c["id"] for c in conv_resp_a.json()]
        assert conv_a_id in conv_ids_a
        assert conv_b_id not in conv_ids_a

        conv_resp_b = await client.get("/api/v1/chat/conversations", headers={"Authorization": f"Bearer {token_b}"})
        assert conv_resp_b.status_code == 200
        conv_ids_b = [c["id"] for c in conv_resp_b.json()]
        assert conv_b_id in conv_ids_b
        assert conv_a_id not in conv_ids_b

        # Check Agent Runs Listing
        run_resp_a = await client.get("/api/v1/agents/runs", headers={"Authorization": f"Bearer {token_a}"})
        assert run_resp_a.status_code == 200
        run_ids_a = [r["id"] for r in run_resp_a.json()]
        assert run_a_id in run_ids_a
        assert run_b_id not in run_ids_a

        run_resp_b = await client.get("/api/v1/agents/runs", headers={"Authorization": f"Bearer {token_b}"})
        assert run_resp_b.status_code == 200
        run_ids_b = [r["id"] for r in run_resp_b.json()]
        assert run_b_id in run_ids_b
        assert run_a_id not in run_ids_b

@pytest.mark.asyncio
async def test_user_a_cannot_see_user_b_data_cross_tenant():
    """
    Explicit cross-tenant data isolation test:
    - User A (TENANT_ALPHA) cannot view, download, modify, or list User B's (TENANT_BETA) data.
    - All direct resource accesses by User A for User B's resources return HTTP 404 (or 403).
    - User B has full access to their own data.
    """
    async with AsyncSessionLocal() as session:
        # Create User A and User B in distinct tenants
        id_a = f"usr_a_{uuid.uuid4().hex[:8]}"
        user_a = User(
            id=id_a,
            email=f"operator_a_{uuid.uuid4().hex[:6]}@alpha.defense.corp",
            full_name="Operator Alpha",
            role="Analyst",
            company_code="TENANT_ALPHA",
            status="ACTIVE",
            password_hash=hash_password("PassAlpha2026!")
        )

        id_b = f"usr_b_{uuid.uuid4().hex[:8]}"
        user_b = User(
            id=id_b,
            email=f"operator_b_{uuid.uuid4().hex[:6]}@beta.defense.corp",
            full_name="Operator Beta",
            role="Analyst",
            company_code="TENANT_BETA",
            status="ACTIVE",
            password_hash=hash_password("PassBeta2026!")
        )
        session.add_all([user_a, user_b])
        await session.commit()

        # Seed User B's private data
        doc_b = Document(
            id=f"doc_b_{uuid.uuid4().hex[:8]}",
            title="Tenant Beta Proprietary Blueprint",
            filename="beta_blueprint.pdf",
            file_path="/tmp/beta_blueprint.pdf",
            file_size_bytes=2048,
            mime_type="application/pdf",
            sha256_hash=uuid.uuid4().hex,
            classification="SECRET",
            status="READY",
            uploaded_by=user_b.id,
            company_code="TENANT_BETA"
        )
        deliv_b = Deliverable(
            id=f"deliv_b_{uuid.uuid4().hex[:8]}",
            filename="beta_quarterly.docx",
            file_path="/tmp/beta_quarterly.docx",
            file_type="DOCX",
            title="Beta Quarterly Intelligence",
            sha256_hash=uuid.uuid4().hex,
            owner_id=user_b.id,
            company_code="TENANT_BETA",
            status="READY"
        )
        conv_b = Conversation(
            id=f"conv_b_{uuid.uuid4().hex[:8]}",
            title="Beta Sensitive Operations",
            user_id=user_b.id,
            company_code="TENANT_BETA"
        )
        run_b = AgentRun(
            id=f"run_b_{uuid.uuid4().hex[:8]}",
            agent_name="Beta Tactical Recon Agent",
            goal="Analyze Beta perimeter defenses",
            user_id=user_b.id,
            company_code="TENANT_BETA"
        )
        session.add_all([doc_b, deliv_b, conv_b, run_b])
        await session.commit()

        doc_b_id = doc_b.id
        deliv_b_id = deliv_b.id
        conv_b_id = conv_b.id
        run_b_id = run_b.id

    token_a = create_access_token(
        subject=user_a.id,
        email=user_a.email,
        role=user_a.role,
        permissions=user_a.permissions
    )
    token_b = create_access_token(
        subject=user_b.id,
        email=user_b.email,
        role=user_b.role,
        permissions=user_b.permissions
    )

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # 1. User A cannot view User B's document
        resp = await client.get(f"/api/v1/documents/{doc_b_id}", headers={"Authorization": f"Bearer {token_a}"})
        assert resp.status_code == 404

        # 2. User A cannot download User B's document
        resp = await client.get(f"/api/v1/documents/{doc_b_id}/download", headers={"Authorization": f"Bearer {token_a}"})
        assert resp.status_code == 404

        # 3. User A cannot preview User B's document
        resp = await client.get(f"/api/v1/documents/{doc_b_id}/preview", headers={"Authorization": f"Bearer {token_a}"})
        assert resp.status_code == 404

        # 4. User A cannot delete User B's document
        resp = await client.delete(f"/api/v1/documents/{doc_b_id}", headers={"Authorization": f"Bearer {token_a}"})
        assert resp.status_code == 404

        # 5. User A cannot see User B's document in listings
        resp = await client.get("/api/v1/documents", headers={"Authorization": f"Bearer {token_a}"})
        assert resp.status_code == 200
        listed_doc_ids = [d["id"] for d in resp.json()["items"]]
        assert doc_b_id not in listed_doc_ids

        # 6. User A cannot access User B's deliverable
        resp = await client.get(f"/api/v1/deliverables/{deliv_b_id}", headers={"Authorization": f"Bearer {token_a}"})
        assert resp.status_code == 404

        # 7. User A cannot access User B's conversation
        resp = await client.get(f"/api/v1/chat/conversations/{conv_b_id}", headers={"Authorization": f"Bearer {token_a}"})
        assert resp.status_code == 404

        # 8. User A cannot access User B's agent run
        resp = await client.get(f"/api/v1/agents/runs/{run_b_id}", headers={"Authorization": f"Bearer {token_a}"})
        assert resp.status_code == 404

        # 9. Verify User B CAN access their own document and deliverable
        resp_b_doc = await client.get(f"/api/v1/documents/{doc_b_id}", headers={"Authorization": f"Bearer {token_b}"})
        assert resp_b_doc.status_code == 200
        assert resp_b_doc.json()["id"] == doc_b_id

        resp_b_deliv = await client.get(f"/api/v1/deliverables/{deliv_b_id}", headers={"Authorization": f"Bearer {token_b}"})
        assert resp_b_deliv.status_code == 200
        assert resp_b_deliv.json()["id"] == deliv_b_id

