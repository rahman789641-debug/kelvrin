import pytest
from backend.app.db.session import AsyncSessionLocal
from backend.app.services.analytics.analytics_service import analytics_service

from backend.app.db.init_db import init_db

@pytest.fixture(autouse=True, scope="module")
def setup_test_db():
    import asyncio
    asyncio.run(init_db())

@pytest.mark.asyncio
async def test_analytics_summary_metrics():
    """Verify analytics service aggregates dynamic platform KPIs."""
    async with AsyncSessionLocal() as db:
        summary = await analytics_service.get_summary_metrics(db)

        assert "total_queries" in summary
        assert summary["total_queries"] >= 0
        assert "documents_processed" in summary
        assert "average_response_time_ms" in summary
        assert "successful_agent_runs" in summary
        assert "failed_agent_runs" in summary
        assert "generated_deliverables" in summary
        assert "zero_cloud_cost" in summary
        assert "$0.00" in summary["zero_cloud_cost"]

@pytest.mark.asyncio
async def test_analytics_timeseries():
    """Verify daily query timeseries generation."""
    async with AsyncSessionLocal() as db:
        trends = await analytics_service.get_timeseries_queries(db, days=7)
        assert len(trends) == 7
        for pt in trends:
            assert "date" in pt
            assert "queries" in pt
            assert "tokens" in pt
            assert pt["queries"] >= 0

@pytest.mark.asyncio
async def test_analytics_zero_confidential_leakage():
    """Verify zero raw or confidential document text is exposed in analytics metrics."""
    async with AsyncSessionLocal() as db:
        summary = await analytics_service.get_summary_metrics(db)
        # Convert entire summary to string and verify no confidential contents
        summary_str = str(summary).lower()
        assert "password" not in summary_str
        assert "secret" not in summary_str
        assert "content_preview" not in summary_str

@pytest.mark.asyncio
async def test_analytics_category_distribution():
    """Verify task category distribution metrics."""
    async with AsyncSessionLocal() as db:
        cats = await analytics_service.get_category_distribution(db)
        assert len(cats) >= 4
        names = [c["name"] for c in cats]
        assert "Compliance & Audit" in names
        assert "Document Analysis" in names
