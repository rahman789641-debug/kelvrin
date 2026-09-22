"""
Sovereign Seed Data Definitions & Provisioning.
Contains initial system roles, granular permissions, default operators,
model configurations, sandbox tools, agent templates, and synthetic compliance docs.
Separated from migration mechanics for architectural clarity and testability.
"""
import logging
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from backend.app.core.config import settings
from backend.app.core.security import hash_password
from backend.app.models import (
    User, Role, Permission, UserRole, RolePermission,
    Document, DocumentChunk,
    ModelRegistry, ToolRegistry, SystemEvent,
    AgentTemplate, Connector, ConnectorConfig, ConnectorHealth
)

logger = logging.getLogger("kelvrin.seed_data")

DEFAULT_ROLES = [
    ("Super Admin", "Full sovereign platform administration, user provisioning, security overrides"),
    ("SUPER_ADMIN", "Full sovereign platform administration, user provisioning, security overrides"),
    ("AI Admin", "Local model lifecycle, VRAM allocation, tool configuration, pipeline tuning"),
    ("AI_ADMIN", "Local model lifecycle, VRAM allocation, tool configuration, pipeline tuning"),
    ("AI Operator", "Agent dispatch, model fine-tuning, inference control, and Code Lab"),
    ("AI_OPERATOR", "Agent dispatch, model fine-tuning, inference control, and Code Lab"),
    ("Approver / Manager", "Agent action authorization, HITL workflow sign-off, audit review"),
    ("APPROVER", "Agent action authorization, HITL workflow sign-off, audit review"),
    ("Analyst", "Document ingestion, deep conversational analysis, sovereign sandbox execution"),
    ("ANALYST", "Document ingestion, deep conversational analysis, sovereign sandbox execution"),
    ("Employee", "Grounded document search, assistant queries, standard workspace tasks"),
    ("EMPLOYEE", "Grounded document search, assistant queries, standard workspace tasks"),
    ("Viewer / Auditor", "Read-only access to immutable audit logs, reports, and compliance proofs"),
    ("AUDITOR", "Read-only access to immutable audit logs, reports, and compliance proofs")
]

DEFAULT_PERMISSIONS = [
    ("*", "system", "Master wildcard access"),
    ("users:manage", "users", "Create, update, suspend, and delete users"),
    ("users:read", "users", "View user directories and roles"),
    ("users.read", "users", "View user directories and roles"),
    ("users.create", "users", "Create new operators"),
    ("users.update", "users", "Update user attributes and roles"),
    ("users.disable", "users", "Suspend or deactivate user accounts"),
    ("documents:read", "documents", "Read and query ingested documents"),
    ("documents.read", "documents", "Read and query ingested documents"),
    ("documents:write", "documents", "Upload, classify, and delete documents"),
    ("documents.upload", "documents", "Upload and parse documents"),
    ("documents.delete", "documents", "Purge documents from storage"),
    ("chat:use", "chat", "Initiate conversational sessions"),
    ("ai.chat", "chat", "Initiate conversational sessions"),
    ("ai.execute", "code_lab", "Run code in sovereign sandbox"),
    ("agents:run", "agents", "Dispatch autonomous agent runs"),
    ("agents.execute", "agents", "Dispatch autonomous agent runs"),
    ("agents:manage", "agents", "Configure agent instructions and loop limits"),
    ("agents.manage", "agents", "Configure agent instructions and approve steps"),
    ("agents.create", "agents", "Author new autonomous agents"),
    ("workflows:approve", "workflows", "Authorize human-in-the-loop workflow steps"),
    ("workflows:manage", "workflows", "Design and edit DAG workflows"),
    ("workflow.create", "workflows", "Design and edit DAG workflows"),
    ("workflow.execute", "workflows", "Execute workflows and steps"),
    ("workflow.manage", "workflows", "Manage workflow DAGs"),
    ("models:read", "models", "View model registry and telemetry"),
    ("models.read", "models", "View model registry and telemetry"),
    ("models:manage", "models", "Register and deploy local models"),
    ("models.manage", "models", "Register and deploy local models"),
    ("knowledge:read", "knowledge", "Read knowledge collections"),
    ("knowledge.read", "knowledge", "Read knowledge collections"),
    ("knowledge.manage", "knowledge", "Trigger knowledge re-indexing"),
    ("code:execute", "code_lab", "Run code in sovereign sandbox"),
    ("audit:read", "audit", "Inspect immutable audit log records"),
    ("audit.read", "audit", "Inspect immutable audit log records"),
    ("security:manage", "security", "Configure air-gap network gates and egress policy"),
    ("security.read", "security", "Inspect security and egress posture")
]

DEFAULT_ROLE_PERMS = {
    "Super Admin": ["*", "users:manage", "models:manage", "audit:read", "documents:read", "documents:write", "agents:run", "code:execute", "security:manage"],
    "SUPER_ADMIN": ["*", "users:manage", "models:manage", "audit:read", "documents:read", "documents:write", "agents:run", "code:execute", "security:manage"],
    "AI Admin": ["models:manage", "models:read", "agents:manage", "agents:run", "audit:read", "documents:read", "documents:write", "code:execute"],
    "AI_ADMIN": ["models:manage", "models:read", "agents:manage", "agents:run", "audit:read", "documents:read", "documents:write", "code:execute"],
    "AI Operator": ["agents:run", "agents:manage", "models:read", "models:manage", "code:execute", "chat:use", "documents:read"],
    "AI_OPERATOR": ["agents:run", "agents:manage", "models:read", "models:manage", "code:execute", "chat:use", "documents:read"],
    "Approver / Manager": ["workflows:approve", "agents:run", "documents:read", "documents:write", "audit:read", "users:read"],
    "APPROVER": ["workflows:approve", "agents:run", "documents:read", "documents:write", "audit:read", "users:read"],
    "Analyst": ["documents:read", "documents:write", "agents:run", "code:execute", "chat:use"],
    "ANALYST": ["documents:read", "documents:write", "agents:run", "code:execute", "chat:use"],
    "Employee": ["documents:read", "chat:use", "documents.upload"],
    "EMPLOYEE": ["documents:read", "chat:use", "documents.upload"],
    "Viewer / Auditor": ["documents:read", "audit:read", "security.read"],
    "AUDITOR": ["documents:read", "audit:read", "security.read"]
}

DEFAULT_USERS = [
    ("usr_admin_01", "s.alexander@sovereign.defense.internal", "Col. Sterling Alexander", "Super Admin", "ACTIVE", None),
    ("usr_ai_admin_02", "m.chen@sovereign.defense.internal", "Dr. Marcus Chen", "AI Admin", "ACTIVE", None),
    ("usr_analyst_03", "e.rostova@sovereign.defense.internal", "Elena Rostova", "Analyst", "ACTIVE", None),
    ("usr_analyst_04", "analyst@sovereign.defense.internal", "Elena Rostova", "Analyst", "ACTIVE", None),
    ("usr_approver_05", "j.vance@sovereign.defense.internal", "Major Jonathan Vance", "Approver / Manager", "ACTIVE", None),
    ("usr_auditor_06", "d.reid@sovereign.defense.internal", "Inspector Daniel Reid", "Viewer / Auditor", "ACTIVE", None),
    ("usr_employee_07", "j.doe@sovereign.defense.internal", "Jane Doe", "Employee", "ACTIVE", None),
    ("usr_suspended_08", "suspended.user@sovereign.defense.internal", "Alex Mercer", "Analyst", "SUSPENDED", None),
    ("usr_auditor_09", "g.reid@sovereign.defense.internal", "Gen. Thomas Reid", "Viewer / Auditor", "ACTIVE", None),
    ("usr_approver_10", "a.vance@sovereign.defense.internal", "Audrey Vance", "Approver / Manager", "ACTIVE", None),
]

DEFAULT_MODELS = [
    ("local-reasoning", "Local Reasoning Model (DeepSeek-R1 14B)", "vllm", "http://127.0.0.1:8001/v1", "text", ["TEXT", "REASONING", "CODING"], 32768, 9800, True, "HEALTHY", 42.5, True),
    ("local-general", "Local General Assistant (Meta Llama-3.1 8B)", "vllm", "http://127.0.0.1:8002/v1", "text", ["TEXT", "REASONING"], 16384, 5400, True, "HEALTHY", 18.2, False),
    ("local-coding", "Local Coding Specialist (Qwen-Coder 32B)", "ollama", "http://127.0.0.1:11434", "text", ["TEXT", "CODING"], 16384, 7600, True, "HEALTHY", 31.0, False),
    ("local-vision", "Local Vision & OCR Engine (Qwen2-VL 7B)", "ollama", "http://127.0.0.1:11434", "vision", ["TEXT", "VISION", "OCR"], 32768, 8192, True, "HEALTHY", 58.0, False),
    ("local-embeddings", "Local Dense Embedding (BGE-M3)", "tgi", "http://127.0.0.1:8003/v1", "embedding", ["EMBEDDING"], 8192, 2200, True, "HEALTHY", 8.4, False)
]

DEFAULT_TOOLS = [
    ("read_document", "Read Sovereign Document", "Reads text content and metadata of a sovereign document in the enclave", {"type": "object", "properties": {"document_id": {"type": "string"}}, "required": ["document_id"]}, {"type": "object"}, "documents.read", True, False, 30, False),
    ("search_knowledge_base", "Search Sovereign Knowledge Base", "Performs grounded semantic retrieval on indexed vector embeddings", {"type": "object", "properties": {"query": {"type": "string"}}, "required": ["query"]}, {"type": "object"}, "knowledge.read", True, False, 30, False),
    ("extract_text", "Sanitized Text Extractor", "Sanitizes and extracts text from provided document content or raw base64", {"type": "object", "properties": {"content": {"type": "string"}}, "required": ["content"]}, {"type": "object"}, "documents.read", True, False, 30, False),
    ("OCR_document", "Local OCR Provider", "Applies local optical character recognition to extract text from images or scanned pages", {"type": "object", "properties": {"image_data": {"type": "string"}}, "required": ["image_data"]}, {"type": "object"}, "documents.read", True, False, 60, False),
    ("analyze_image", "Multimodal Vision Analysis", "Performs local multimodal vision analysis on diagrams, drawings, or photographed pages", {"type": "object", "properties": {"image_data": {"type": "string"}}, "required": ["image_data"]}, {"type": "object"}, "documents.read", True, False, 60, False),
    ("calculate", "Safe Mathematical Calculator", "Evaluates mathematical expressions safely using an AST-based parser", {"type": "object", "properties": {"expression": {"type": "string"}}, "required": ["expression"]}, {"type": "object"}, "agents.execute", True, False, 15, False),
    ("execute_python_sandbox", "Air-Gapped Python Sandbox", "Executes Python code in a secure air-gapped sandbox without network or arbitrary fs access", {"type": "object", "properties": {"code": {"type": "string"}}, "required": ["code"]}, {"type": "object"}, "ai.execute", True, True, 10, False),
    ("generate_docx", "Generate Word (.docx) Document", "Generates a structured Word (.docx) document locally in the sovereign scratch workspace", {"type": "object", "properties": {"title": {"type": "string"}}, "required": ["title"]}, {"type": "object"}, "documents.upload", True, False, 30, False),
    ("generate_xlsx", "Generate Excel (.xlsx) Spreadsheet", "Generates a structured Excel (.xlsx) workbook with data sheets and columns", {"type": "object", "properties": {"headers": {"type": "array"}}, "required": ["headers"]}, {"type": "object"}, "documents.upload", True, False, 30, False),
    ("generate_pptx", "Generate Presentation (.pptx) Deck", "Generates a PowerPoint (.pptx) presentation deck with styled slides", {"type": "object", "properties": {"title": {"type": "string"}}, "required": ["title"]}, {"type": "object"}, "documents.upload", True, False, 30, False),
    ("write_local_file", "Write Sandboxed Local File", "Writes safe text/markdown/json files strictly within sovereign scratch directory", {"type": "object", "properties": {"filename": {"type": "string"}, "content": {"type": "string"}}, "required": ["filename", "content"]}, {"type": "object"}, "documents.upload", True, True, 20, False),
    ("vector_search", "Sovereign Vector Search", "Searches local pgvector index for grounded document passages", {"type": "object"}, {"type": "object"}, "knowledge.read", True, False, 30, False),
    ("sql_query", "Read-Only Database Query", "Executes safe SQL analytical queries on approved schemas", {"type": "object"}, {"type": "object"}, "agents.execute", True, True, 30, False),
    ("python_sandbox", "Sovereign Code Sandbox", "Runs isolated scripts in locked micro-containers", {"type": "object"}, {"type": "object"}, "ai.execute", True, False, 15, False),
    ("network_egress_probe", "External Web Connector", "Simulates controlled outbound internet lookup", {"type": "object"}, {"type": "object"}, "security.manage", False, True, 30, True)
]

DEFAULT_TEMPLATES = [
    (
        "document-analyst",
        "Document Intelligence Analyst",
        "Performs deep textual, structural, and semantic analysis across enclave documents",
        "Intelligence",
        "You are an expert Document Intelligence Analyst. Read, search, and extract key facts from enclave documents to fulfill the operator's goal with strict grounding.",
        ["read_document", "extract_text", "OCR_document", "search_knowledge_base"],
        "deepseek-r1-14b",
        "FileSearch",
        10
    ),
    (
        "compliance-auditor",
        "Compliance & Audit Inspector",
        "Audits sovereign security policies, validates directives, and drafts formal compliance reports",
        "Compliance",
        "You are a Sovereign Compliance and Audit Inspector. Retrieve regulatory directives, calculate compliance metrics, and generate formal audit documentation.",
        ["read_document", "search_knowledge_base", "calculate", "generate_docx"],
        "deepseek-r1-14b",
        "ShieldCheck",
        10
    ),
    (
        "technical-vision",
        "Technical Drawing & Vision Specialist",
        "Analyzes CAD blueprints, schematics, engineering diagrams, and photographed documents",
        "Engineering",
        "You are an Engineering Vision Specialist. Inspect technical drawings, extract embedded annotations, and produce presentation summaries.",
        ["analyze_image", "OCR_document", "read_document", "generate_pptx"],
        "qwen2-vl-7b",
        "Layers",
        10
    ),
    (
        "data-calculator",
        "Data Science & Sandbox Calculator",
        "Executes mathematical calculations, statistical models, and sandboxed Python algorithms",
        "Data",
        "You are a Sovereign Data Scientist. Perform precise calculations and run safe sandbox algorithms to analyze structured data without external network egress.",
        ["calculate", "execute_python_sandbox", "generate_xlsx"],
        "codellama-13b",
        "Calculator",
        10
    ),
    (
        "report-builder",
        "Autonomous Sovereign Report Builder",
        "Conducts cross-document research and compiles executive docx/xlsx/pptx reports",
        "Reporting",
        "You are an Autonomous Sovereign Report Builder. Retrieve verified evidence, calculate metrics, and compile complete reports in docx, xlsx, or pptx formats.",
        ["search_knowledge_base", "calculate", "generate_docx", "generate_xlsx", "write_local_file"],
        "deepseek-r1-14b",
        "FileText",
        12
    ),
    (
        "inspection-approval-agent",
        "Inspection Approval Agent",
        "Processes industrial pressure vessel equipment inspection reports, verifies wall thickness & welds against local SOP-704, and drafts formal Approval_Note.docx",
        "Inspection",
        "You are the Sovereign Inspection Approval Agent. Perform comprehensive ReAct validation of equipment inspection reports against sovereign SOP directives. Compare observations against minimum statutory safety thresholds, declare any missing inspection data explicitly, and generate a validated Word deliverable Approval_Note.docx.",
        ["read_document", "extract_text", "OCR_document", "analyze_image", "search_knowledge_base", "calculate", "generate_docx", "write_local_file"],
        "local-reasoning",
        "ClipboardCheck",
        15
    )
]

async def seed_database(session: AsyncSession) -> None:
    """Seeds all default roles, permissions, users, models, tools, and templates."""
    # 1. Seed Permissions
    perm_map = {}
    for code, mod, desc in DEFAULT_PERMISSIONS:
        stmt = select(Permission).where(Permission.code == code)
        result = await session.execute(stmt)
        perm = result.scalar_one_or_none()
        if not perm:
            perm = Permission(code=code, module=mod, description=desc)
            session.add(perm)
            await session.flush()
        perm_map[code] = perm

    # 2. Seed Roles & Role Permissions
    role_map = {}
    for name, desc in DEFAULT_ROLES:
        stmt = select(Role).where(Role.name == name)
        result = await session.execute(stmt)
        role = result.scalar_one_or_none()
        if not role:
            role = Role(name=name, description=desc, is_system_role=True)
            session.add(role)
            await session.flush()
        role_map[name] = role

        target_perms = DEFAULT_ROLE_PERMS.get(name, [])
        for p_code in target_perms:
            p_obj = perm_map.get(p_code)
            if p_obj:
                stmt = select(RolePermission).where(
                    RolePermission.role_id == role.id,
                    RolePermission.permission_id == p_obj.id
                )
                exists = (await session.execute(stmt)).scalar_one_or_none()
                if not exists:
                    session.add(RolePermission(role_id=role.id, permission_id=p_obj.id))

    # 3. Seed Default Operators
    for uid, email, name, role_name, status, avatar in DEFAULT_USERS:
        stmt = select(User).where(User.email == email)
        result = await session.execute(stmt)
        user = result.scalar_one_or_none()
        if not user:
            admin_pw = settings.INITIAL_ADMIN_PASSWORD
            if not admin_pw:
                raise ValueError("CRITICAL SECURITY ERROR: INITIAL_ADMIN_PASSWORD must be configured in environment variables (.env)")
            user = User(
                id=uid,
                email=email,
                full_name=name,
                role=role_name,
                status=status,
                avatar_url=avatar,
                password_hash=hash_password(admin_pw)
            )
            session.add(user)
            await session.flush()

            r_obj = role_map.get(role_name)
            if r_obj:
                session.add(UserRole(user_id=user.id, role_id=r_obj.id))

    # 4. Seed Local Model Registry
    for mid, name, ptype, eurl, mod, caps, ctx, vram, active, hstat, lat, is_def in DEFAULT_MODELS:
        stmt = select(ModelRegistry).where(ModelRegistry.id == mid)
        model_row = (await session.execute(stmt)).scalar_one_or_none()
        if not model_row:
            session.add(ModelRegistry(
                id=mid, name=name, provider_type=ptype, endpoint_url=eurl,
                modality=mod, capabilities=caps, context_window=ctx,
                vram_allocated_mb=vram, is_active=active, health_status=hstat,
                latency_ms=lat, is_default=is_def
            ))
        else:
            if not model_row.capabilities or model_row.capabilities == []:
                model_row.capabilities = caps
                model_row.health_status = hstat
                model_row.latency_ms = lat
                model_row.is_default = is_def

    # 5. Seed Tool Registry
    for tid, tname, tdesc, pschema, rschema, perm, enabled, req_app, tout, is_ext in DEFAULT_TOOLS:
        stmt = select(ToolRegistry).where(ToolRegistry.id == tid)
        tool_row = (await session.execute(stmt)).scalar_one_or_none()
        if not tool_row:
            session.add(ToolRegistry(
                id=tid, name=tname, description=tdesc, parameters_schema=pschema,
                returns_schema=rschema, permission_required=perm,
                is_enabled=enabled, requires_approval=req_app, timeout_seconds=tout, is_external=is_ext
            ))
        else:
            tool_row.name = tname
            tool_row.description = tdesc
            tool_row.parameters_schema = pschema
            tool_row.returns_schema = rschema
            tool_row.permission_required = perm
            tool_row.timeout_seconds = tout

    # 6. Seed Agent Templates
    for t_id, t_name, t_desc, t_cat, t_prompt, t_tools, t_model, t_icon, t_max in DEFAULT_TEMPLATES:
        stmt = select(AgentTemplate).where(AgentTemplate.id == t_id)
        tpl = (await session.execute(stmt)).scalar_one_or_none()
        if not tpl:
            session.add(AgentTemplate(
                id=t_id,
                name=t_name,
                description=t_desc,
                category=t_cat,
                system_prompt=t_prompt,
                default_tools=t_tools,
                default_model_id=t_model,
                icon=t_icon,
                max_steps=t_max,
                is_system=True
            ))

    # 7. Seed Pressure Vessel PV-201 & SOP-704 Documents
    stmt_insp = select(Document).where(Document.id == "doc_pv201_inspection")
    doc_insp = (await session.execute(stmt_insp)).scalar_one_or_none()
    if not doc_insp:
        doc_insp = Document(
            id="doc_pv201_inspection",
            title="PV-201 Pressure Vessel Inspection Report",
            filename="PV_201_Inspection_Report.pdf",
            file_path="/Users/software file/Kelvrin/scratch/synthetic/PV_201_Inspection_Report.pdf",
            file_size_bytes=10240,
            mime_type="application/pdf",
            sha256_hash="e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
            classification="RESTRICTED",
            status="READY",
            ocr_applied=False,
            vision_applied=True,
            total_pages=2,
            total_chunks=1,
            uploaded_by="usr_admin_01",
            content_preview="Equipment ID: PV-201. High Pressure Degasser Vessel. Ultrasonic Thickness (UT): 14.2mm. Radiographic Weld Integrity: Grade 1. PRV-401 tested at 150 PSI. Note: Secondary QA Supervisor Verification Stamp is PENDING field sign-off.",
            visual_summary="Engineering blueprint and radiographic weld seam scan of Degasser Vessel PV-201.",
            asset_category="ENGINEERING_DRAWING"
        )
        session.add(doc_insp)
        session.add(DocumentChunk(
            id="chunk_pv201_01",
            document_id="doc_pv201_inspection",
            chunk_index=0,
            page_number=1,
            content=(
                "EQUIPMENT INSPECTION REPORT — PV-201\n"
                "Asset Tag: PV-201 Primary High-Pressure Degasser Vessel\n"
                "Inspection Date: 2026-08-20\n"
                "Inspector: Col. Sterling Alexander (Cert #NDT-9921)\n"
                "Visual Surface Inspection: Skirt has minor surface oxidation; no structural pitting or crevice corrosion.\n"
                "Ultrasonic Thickness Measurement (UT): Minimum measured shell wall thickness is 14.2 mm (Nominal specification: 15.0 mm; Absolute allowable minimum: 12.0 mm).\n"
                "Radiographic Weld Examination: Grade 1 full-penetration girth weld. No planar cracks, lack of fusion, or rejectable slag inclusion.\n"
                "Pressure Relief Valve Test: PRV-401 actuated at 150.0 PSI; pop action verified and re-seated hermetically.\n"
                "Deficiencies / Missing Information: Secondary QA Supervisor Verification Stamp is PENDING field sign-off."
            ),
            token_count=180,
            embedding=[0.05] * 384,
            chunk_metadata={"equipment_id": "PV-201", "section": "Inspection Summary"}
        ))

    stmt_sop = select(Document).where(Document.id == "doc_sop704_standard")
    doc_sop = (await session.execute(stmt_sop)).scalar_one_or_none()
    if not doc_sop:
        doc_sop = Document(
            id="doc_sop704_standard",
            title="SOP-704 High-Pressure Vessel Recertification Standard",
            filename="SOP_704_Vessel_Recertification.pdf",
            file_path="/Users/software file/Kelvrin/scratch/synthetic/SOP_704_Vessel_Recertification.pdf",
            file_size_bytes=8192,
            mime_type="application/pdf",
            sha256_hash="f4c8996fb92427ae41e4649b934ca495991b7852b855e3b0c44298fc1c149afb",
            classification="RESTRICTED",
            status="READY",
            total_pages=3,
            total_chunks=1,
            uploaded_by="usr_admin_01",
            content_preview="SOP-704 Revision 4.2. Minimum allowable shell wall thickness is 12.0mm. Weld seams must be Grade 1 or 2. PRVs must reset within +/-3% of 150 PSI. Missing approvals must be explicitly declared.",
            asset_category="TECHNICAL_STANDARD"
        )
        session.add(doc_sop)
        session.add(DocumentChunk(
            id="chunk_sop704_01",
            document_id="doc_sop704_standard",
            chunk_index=0,
            page_number=1,
            content=(
                "STANDARD OPERATING PROCEDURE — SOP-704 (Rev 4.2)\n"
                "Title: High-Pressure Degasser and Pressure Vessel Recertification Requirements\n"
                "Section 1.1 — Wall Thickness Criteria: Minimum allowable shell wall thickness is 12.0 mm. Any reading below 12.0 mm mandates immediate vessel decommissioning.\n"
                "Section 1.2 — Weld Integrity: Weld seams must meet radiographic Grade 1 or Grade 2 criteria with zero crack indications.\n"
                "Section 1.3 — Pressure Relief Safety: PRV pop action must trigger at 150 PSI (+/- 3% margin) and seal without continuous leakage.\n"
                "Section 2.0 — Approval Note Governance: The approving agent must generate a formal Approval_Note.docx containing: "
                "Equipment ID, Applicable Standards, Inspection Observations, Compliance Assessment, Mandatory Conditions, and must explicitly list any missing field data.\n"
                "Section 2.1 — Prohibited Action: Never fabricate or extrapolate missing verification stamps. All unverified fields must be marked PENDING."
            ),
            token_count=195,
            embedding=[0.05] * 384,
            chunk_metadata={"sop": "SOP-704", "section": "Recertification Requirements"}
        ))

    # 8. Seed Default Connectors
    stmt_conn = select(Connector).where(Connector.name == "Sovereign Mock ERP Connector")
    mock_conn = (await session.execute(stmt_conn)).scalar_one_or_none()
    if not mock_conn:
        mock_conn = Connector(
            id="conn_mock_erp_01",
            name="Sovereign Mock ERP Connector",
            type="REST_API",
            description="Local on-premises ERP connector for fetching equipment registry and maintenance history",
            is_enabled=False,
            auth_type="API_KEY"
        )
        session.add(mock_conn)
        session.add(ConnectorConfig(
            connector_id="conn_mock_erp_01",
            base_url="https://api.erp.sovereign-mesh.net/api/v1/connectors/mock-erp",
            allowed_endpoints=["/inspections/*", "/equipment/*"],
            timeout_seconds=10,
            network_policy="ISOLATED_ON_PREM",
            headers_masked={"X-ERP-ApiKey": "********"}
        ))
        session.add(ConnectorHealth(
            connector_id="conn_mock_erp_01",
            status="ONLINE",
            latency_ms=1.2
        ))

    # 9. Seed System Event
    stmt = select(SystemEvent)
    if not (await session.execute(stmt)).scalars().first():
        session.add(SystemEvent(
            event_type="ENGINE_STARTUP",
            severity="INFO",
            message="KELVRIN Sovereign Agentic AI Workbench initialized.",
            source_component="gateway",
            metadata_json={"auth_mode": "HYBRID_GOOGLE", "airgap_enclave": True}
        ))

    await session.commit()
    logger.info("[KELVRIN_DB] Seed records successfully verified and committed.")
