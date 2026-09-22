from typing import List
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.core.auth import get_current_user
from backend.app.core.rbac import require_permission
from backend.app.db.session import get_db
from backend.app.models.user import User
from backend.app.schemas.analytics import (
    AnalyticsSummaryOut,
    TimeSeriesPointOut,
    ModelUsageOut,
    CategoryDistributionOut
)
from backend.app.services.analytics.analytics_service import analytics_service

router = APIRouter(prefix="/analytics", tags=["Sovereign Telemetry & Analytics"])

@router.get("/summary", response_model=AnalyticsSummaryOut)
async def get_analytics_summary(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Returns dynamic KPI metrics aggregated across sovereign database tables."""
    effective_code = getattr(user, "company_code", None)
    return await analytics_service.get_summary_metrics(db, company_code=effective_code)

@router.get("/timeseries", response_model=List[TimeSeriesPointOut])
async def get_query_timeseries(
    days: int = Query(7, ge=1, le=30),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Returns non-sensitive daily query & token consumption trends."""
    return await analytics_service.get_timeseries_queries(db, days=days)

@router.get("/models", response_model=List[ModelUsageOut])
async def get_model_usage(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Returns telemetry for local model resource utilization."""
    return await analytics_service.get_model_usage_breakdown(db)

@router.get("/categories", response_model=List[CategoryDistributionOut])
async def get_category_distribution(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Returns task category distribution across sovereign workloads."""
    return await analytics_service.get_category_distribution(db)
