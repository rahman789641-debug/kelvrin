import os
import pytest
from sqlalchemy import select
from backend.app.db.session import AsyncSessionLocal
from backend.app.models.user import User
from backend.app.models.deliverable import Deliverable
from backend.app.services.deliverables.deliverable_service import deliverable_service

from backend.app.db.init_db import init_db

@pytest.fixture(autouse=True, scope="module")
def setup_test_db():
    import asyncio
    asyncio.run(init_db())

async def get_test_user() -> User:
    async with AsyncSessionLocal() as db:
        stmt = select(User).limit(1)
        user = (await db.execute(stmt)).scalars().first()
        if not user:
            user = User(
                email="admin.deliverables@kelvrin.internal",
                full_name="Admin Deliverables",
                password_hash="pw",
                role="Super Admin",
                status="ACTIVE"
            )
            db.add(user)
            await db.commit()
            await db.refresh(user)
        return user

@pytest.mark.asyncio
async def test_deliverable_generation_docx():
    """Verify DOCX generation, local file persistence, SHA-256 calculation, and database registration."""
    async with AsyncSessionLocal() as db:
        user = await get_test_user()

        d = await deliverable_service.generate_docx(
            title="Sovereign Industrial Audit",
            sections=[
                {"heading": "Executive Summary", "body": "Audit completed under air-gap conditions."},
                {"heading": "Findings", "body": "All critical controls verified."}
            ],
            filename="Test_Audit.docx",
            user=user,
            db=db
        )

        assert d.id is not None
        assert d.filename == "Test_Audit.docx"
        assert d.file_type == "DOCX"
        assert os.path.exists(d.file_path)
        assert d.file_size_bytes > 0
        assert len(d.sha256_hash) == 64
        assert d.status == "READY"

@pytest.mark.asyncio
async def test_deliverable_generation_xlsx():
    """Verify XLSX generation, columns, and data persistence."""
    async with AsyncSessionLocal() as db:
        user = await get_test_user()

        d = await deliverable_service.generate_xlsx(
            title="Inspection Analysis",
            sheet_name="Vessel Metrics",
            headers=["Asset ID", "Wall Thickness (mm)", "Status"],
            rows=[["PS-26117", 14.2, "COMPLIANT"], ["PS-26118", 13.8, "COMPLIANT"]],
            filename="Inspection_Analysis.xlsx",
            user=user,
            db=db
        )

        assert d.filename == "Inspection_Analysis.xlsx"
        assert d.file_type == "XLSX"
        assert os.path.exists(d.file_path)
        assert d.file_size_bytes > 0

@pytest.mark.asyncio
async def test_deliverable_generation_pptx():
    """Verify PPTX generation with title and content slides."""
    async with AsyncSessionLocal() as db:
        user = await get_test_user()

        d = await deliverable_service.generate_pptx(
            title="Board Review: Sovereign Governance",
            slides=[
                {"title": "Mission Status", "bullet_points": ["Air-gap secured", "Local LLM inference online"]},
                {"title": "Regulatory Compliance", "bullet_points": ["100% On-premises", "Audit logs immutable"]}
            ],
            filename="Board_Review.pptx",
            user=user,
            db=db
        )

        assert d.filename == "Board_Review.pptx"
        assert d.file_type == "PPTX"
        assert os.path.exists(d.file_path)

@pytest.mark.asyncio
async def test_deliverable_generation_pdf_and_txt():
    """Verify native PDF and TXT deliverable generation."""
    async with AsyncSessionLocal() as db:
        user = await get_test_user()

        d_pdf = await deliverable_service.generate_pdf(
            title="Sovereign Compliance Certificate",
            paragraphs=["This certifies equipment PS-26117 complies with statutory standards."],
            filename="Certificate.pdf",
            user=user,
            db=db
        )
        assert d_pdf.file_type == "PDF"
        assert os.path.exists(d_pdf.file_path)

        d_txt = await deliverable_service.generate_txt(
            title="Audit Hash Summary",
            content="SHA-256 Digest verification: 0000-abcd-1234",
            filename="Summary.txt",
            user=user,
            db=db
        )
        assert d_txt.file_type == "TXT"
        assert os.path.exists(d_txt.file_path)

def test_deliverable_filename_sanitization():
    """Verify dangerous traversal paths are neutralized to safe local filenames."""
    sanitized = deliverable_service.sanitize_filename("../../../etc/shadow", "docx")
    assert ".." not in sanitized
    assert "/" not in sanitized
    assert sanitized.endswith(".docx")
