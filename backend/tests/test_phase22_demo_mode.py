import os
import pytest
from httpx import AsyncClient, ASGITransport
from backend.app.main import app
from backend.app.core.security import create_access_token

WORKSPACE_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))

def test_phase22_synthetic_assets_exist():
    """Verify all 5 synthetic sample assets are in demo_data/."""
    demo_dir = os.path.join(WORKSPACE_ROOT, "demo_data")
    assert os.path.exists(demo_dir), "demo_data directory must exist"
    
    expected_files = [
        "ps26117_inspection_report.pdf",
        "sop704_standard.pdf",
        "pressure_vessel_schematic.png",
        "ultrasonic_thickness_log.xlsx",
        "stress_analysis_calc.py"
    ]
    for fname in expected_files:
        fpath = os.path.join(demo_dir, fname)
        assert os.path.exists(fpath), f"Synthetic asset {fname} must exist"
        assert os.path.getsize(fpath) > 50, f"Synthetic asset {fname} must not be empty"

@pytest.mark.asyncio
async def test_phase22_demo_scenarios_endpoint():
    """Verify GET /api/v1/demo/scenarios returns ready status and synthetic asset manifests."""
    token = create_access_token(
        subject="test_user",
        email="s.alexander@sovereign.defense.internal",
        role="Super Admin",
        permissions=["*"]
    )
    headers = {"Authorization": f"Bearer {token}"}
    
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.get("/api/v1/demo/scenarios", headers=headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "READY"
        assert data["demo_mode"] == "SYNTHETIC_AIR_GAP"
        assert len(data["assets"]) >= 5
        ids = [a["id"] for a in data["assets"]]
        assert "ps26117_inspection" in ids
        assert "sop704_standard" in ids
        assert "schematic_png" in ids
        assert "thickness_xlsx" in ids
        assert "stress_calc_py" in ids

@pytest.mark.asyncio
async def test_phase22_demo_model_routing_endpoint():
    """Verify GET /api/v1/demo/model-routing returns live mapping of workloads to specialized local models."""
    token = create_access_token(
        subject="test_user",
        email="s.alexander@sovereign.defense.internal",
        role="Super Admin",
        permissions=["*"]
    )
    headers = {"Authorization": f"Bearer {token}"}
    
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.get("/api/v1/demo/model-routing", headers=headers)
        assert resp.status_code == 200
        data = resp.json()
        assert "router_model" in data
        assert "routes" in data
        assert len(data["routes"]) == 4
        # Verify specific model assignments
        models_assigned = [r["selected_model"] for r in data["routes"]]
        assert any("deepseek" in m for m in models_assigned)
        assert any("qwen-coder" in m for m in models_assigned)
        assert any("qwen2-vl" in m for m in models_assigned)
        assert any("bge-m3" in m for m in models_assigned)

@pytest.mark.asyncio
async def test_phase22_golden_demo_flow():
    """Verify POST /api/v1/demo/run-golden-flow completes full 11-step tour and generates DOCX without fact fabrication."""
    token = create_access_token(
        subject="test_user",
        email="s.alexander@sovereign.defense.internal",
        role="Super Admin",
        permissions=["*"]
    )
    headers = {"Authorization": f"Bearer {token}"}
    
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.post("/api/v1/demo/run-golden-flow", headers=headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "COMPLETED"
        assert "corr-demo-" in data["correlation_id"]
        
        # Verify deliverable details
        deliv = data["deliverable"]
        assert "ps-26117" in deliv["filename"].lower()
        assert deliv["decision"] == "CONDITIONAL_APPROVAL"
        assert deliv["file_size_bytes"] > 0
        assert len(deliv["sha256"]) == 64
        
        # Verify steps count and non-fabrication
        assert len(data["steps"]) == 11
        findings = data["findings"]
        assert findings["equipment_id"] == "PS-26117"
        assert findings["measured_min_thickness_mm"] == 14.2
        assert findings["secondary_qa_stamp_present"] is False

@pytest.mark.asyncio
async def test_phase22_coding_task_showcase():
    """Verify POST /api/v1/demo/run-coding-task executes calculation script in micro-sandbox."""
    token = create_access_token(
        subject="test_user",
        email="s.alexander@sovereign.defense.internal",
        role="Super Admin",
        permissions=["*"]
    )
    headers = {"Authorization": f"Bearer {token}"}
    
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.post("/api/v1/demo/run-coding-task", headers=headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["task_classification"] in ["CODING", "CODE_GENERATION", "CODE_EXECUTION", "CALCULATION", "ANALYSIS"]
        sandbox = data["sandbox_status"]
        assert sandbox["success"] is True
        assert "Operating Hoop Stress" in sandbox["stdout"]
        assert "ALL MECHANICAL STRESS SAFETY CHECKS PASSED" in sandbox["stdout"]
        assert sandbox["network_disabled"] is True
        assert sandbox["sandbox_isolated"] is True

@pytest.mark.asyncio
async def test_phase22_multimodal_task_showcase():
    """Verify POST /api/v1/demo/run-multimodal-task analyzes engineering diagram."""
    token = create_access_token(
        subject="test_user",
        email="s.alexander@sovereign.defense.internal",
        role="Super Admin",
        permissions=["*"]
    )
    headers = {"Authorization": f"Bearer {token}"}
    
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.post("/api/v1/demo/run-multimodal-task", headers=headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["asset_exists"] is True
        assert "qwen2-vl" in data["vision_model"]
        assert len(data["extracted_components"]) >= 4
        labels = [c["label"] for c in data["extracted_components"]]
        assert "Cylindrical Shell" in labels
        assert "Relief Valve PRV-261" in labels
