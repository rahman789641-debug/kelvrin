# KELVRIN: Project Folder Structure & Module Organization

---

## 1. Full-Stack Repository Structure

```
kelvrin/
├── .gitignore
├── README.md
├── ARCHITECTURE.md
├── PROJECT_CONTRACT.md
├── SECURITY_MODEL.md
├── DEVELOPMENT_PHASES.md
├── API_DESIGN.md
├── DATABASE_DESIGN.md
├── FOLDER_STRUCTURE.md
├── docker-compose.yml
├── docker-compose.override.yml.example
├── .env.example
│
├── frontend/                     # React 18 + TypeScript + Vite Single-Page App
│   ├── index.html
│   ├── package.json
│   ├── postcss.config.js
│   ├── tailwind.config.js
│   ├── tsconfig.json
│   ├── tsconfig.node.json
│   ├── vite.config.ts
│   ├── public/
│   │   ├── favicon.svg
│   │   └── kelvrin-logo.svg
│   └── src/
│       ├── main.tsx
│       ├── App.tsx
│       ├── index.css
│       ├── assets/               # Static images, SVG badges, logos
│       ├── components/           # Reusable enterprise UI primitives
│       │   ├── ui/
│       │   │   ├── Button.tsx
│       │   │   ├── Card.tsx
│       │   │   ├── Badge.tsx
│       │   │   ├── Input.tsx
│       │   │   ├── Select.tsx
│       │   │   ├── Modal.tsx
│       │   │   ├── Drawer.tsx
│       │   │   ├── DataTable.tsx
│       │   │   ├── Tabs.tsx
│       │   │   ├── Toast.tsx
│       │   │   ├── LoadingSpinner.tsx
│       │   │   └── EmptyState.tsx
│       │   ├── layout/
│       │   │   ├── AppShell.tsx
│       │   │   ├── Sidebar.tsx
│       │   │   ├── Topbar.tsx
│       │   │   ├── Breadcrumbs.tsx
│       │   │   ├── UserMenu.tsx
│       │   │   └── StatusIndicator.tsx
│       │   └── feedback/
│       │       ├── ErrorBoundary.tsx
│       │       └── ToastContainer.tsx
│       ├── features/             # Feature-sliced modules (17 core modules)
│       │   ├── auth/             # Google Sign-In, Session Hook, ProtectedRoute
│       │   ├── dashboard/        # Sovereign metrics, Query charts, System cards
│       │   ├── assistant/        # Conversational AI assistant & prompt templates
│       │   ├── agents/           # Autonomous agent execution & step traces
│       │   ├── documents/        # Document upload, processing status, table
│       │   ├── document-chat/    # Split-pane document viewer & cited Q&A
│       │   ├── knowledge/        # Vector index statistics & collection viewer
│       │   ├── workflows/        # Visual DAG workflow orchestrator
│       │   ├── analytics/        # Token usage, model latency, cost telemetry
│       │   ├── codelab/          # Sandboxed Python/Bash editor & execution output
│       │   ├── models/           # Local model registry & routing rules
│       │   ├── system/           # GPU VRAM, CPU, RAM, and inference queue
│       │   ├── security/         # Egress monitoring & air-gap integrity checks
│       │   ├── audit/            # Immutable audit logs & SIEM exporter
│       │   ├── users/            # RBAC user provisioning & status management
│       │   ├── settings/         # System preferences & local inference endpoints
│       │   └── tools/            # Tool & connector registry with approval gates
│       ├── routes/
│       │   ├── AppRoutes.tsx
│       │   └── ProtectedRoute.tsx
│       ├── services/
│       │   ├── api.ts            # Axios / Fetch client with auth interceptors
│       │   ├── firebase.ts       # Firebase Identity SDK initialization
│       │   ├── sse.ts            # Server-Sent Events streaming client
│       │   └── mockData.ts       # Type-safe mock payloads for Phase 1
│       ├── types/
│       │   ├── auth.ts
│       │   ├── user.ts
│       │   ├── document.ts
│       │   ├── chat.ts
│       │   ├── agent.ts
│       │   ├── workflow.ts
│       │   ├── model.ts
│       │   ├── telemetry.ts
│       │   └── audit.ts
│       └── utils/
│           ├── cn.ts             # Tailwind class merging utility
│           ├── formatters.ts     # Dates, bytes, token formatting
│           └── storage.ts        # Secure in-memory token accessors
│
├── backend/                      # Python FastAPI Enterprise Backend
│   ├── Dockerfile
│   ├── pyproject.toml
│   ├── requirements.txt
│   ├── requirements-dev.txt
│   ├── alembic.ini
│   ├── alembic/
│   │   ├── env.py
│   │   ├── script.py.mako
│   │   └── versions/             # Migration scripts
│   ├── tests/
│   │   ├── conftest.py
│   │   ├── test_auth.py
│   │   ├── test_rbac.py
│   │   ├── test_documents.py
│   │   ├── test_agents.py
│   │   ├── test_code_sandbox.py
│   │   └── test_health.py
│   └── app/
│       ├── main.py               # ASGI application entrypoint
│       ├── core/                 # Framework core & infrastructure
│       │   ├── config.py         # Pydantic Settings & 12-factor env parser
│       │   ├── database.py       # SQLAlchemy 2.0 Async Session engine
│       │   ├── security.py       # JWT creation, token decoding, bcrypt
│       │   ├── auth.py           # Google JWKS signature validator & dependency
│       │   ├── rbac.py           # require_permission & role evaluation guards
│       │   ├── audit.py          # Automatic audit event interceptor
│       │   └── exceptions.py     # RFC 7807 structured HTTP error handlers
│       ├── models/               # SQLAlchemy 2.0 ORM Declarative Models
│       │   ├── user.py
│       │   ├── role.py
│       │   ├── document.py
│       │   ├── chat.py
│       │   ├── agent.py
│       │   ├── workflow.py
│       │   ├── model_center.py
│       │   ├── tool.py
│       │   ├── audit.py
│       │   └── telemetry.py
│       ├── schemas/              # Pydantic v2 Request/Response Models
│       │   ├── auth.py
│       │   ├── user.py
│       │   ├── document.py
│       │   ├── chat.py
│       │   ├── agent.py
│       │   ├── workflow.py
│       │   ├── model.py
│       │   ├── tool.py
│       │   ├── code_lab.py
│       │   ├── audit.py
│       │   └── system.py
│       ├── api/
│       │   ├── v1/
│       │   │   ├── api.py        # Master v1 router aggregator
│       │   │   ├── auth.py
│       │   │   ├── users.py
│       │   │   ├── documents.py
│       │   │   ├── chat.py
│       │   │   ├── agents.py
│       │   │   ├── workflows.py
│       │   │   ├── knowledge.py
│       │   │   ├── models.py
│       │   │   ├── tools.py
│       │   │   ├── code_lab.py
│       │   │   ├── audit.py
│       │   │   ├── system.py
│       │   │   ├── security.py
│       │   │   └── health.py
│       ├── services/             # Core business & orchestration services
│       │   ├── auth_service.py
│       │   ├── user_service.py
│       │   ├── document_service.py
│       │   ├── rag_service.py
│       │   ├── agent_service.py
│       │   ├── model_router.py
│       │   ├── workflow_engine.py
│       │   ├── sandbox_manager.py
│       │   ├── audit_service.py
│       │   └── telemetry_service.py
│       ├── rag/                  # Sovereign RAG engine
│       │   ├── ocr_extractor.py  # Local OCR runner (Tesseract / PaddleOCR)
│       │   ├── chunker.py        # Token-aware sliding chunker
│       │   ├── embeddings.py     # Local embedding client
│       │   └── retriever.py      # Hybrid BM25 + pgvector similarity
│       └── sandbox/              # Isolated Code Lab execution environment
│           ├── runner.py         # Docker / gVisor container executor
│           ├── policies.py       # cgroups, timeouts, seccomp filters
│           └── sanitizer.py      # Output truncation & secret redaction
│
├── docker/                       # Containerization & Deployment
│   ├── frontend.Dockerfile
│   ├── backend.Dockerfile
│   ├── sandbox.Dockerfile
│   └── nginx.conf
│
├── scripts/                      # Operations & Maintenance Scripts
│   ├── seed_database.py          # Seeds default roles, admin, and models
│   ├── verify_airgap.sh          # Audits network sockets & egress integrity
│   └── dev_init.sh               # Local developer bootstrap script
│
└── docs/                         # Additional architecture diagrams & specs
    └── assets/
```

---

## 2. Layered Responsibilities & Dependency Rules

1. **Unidirectional Dependency Flow**:
   - `api/` &rarr; depends on &rarr; `services/` & `schemas/`
   - `services/` &rarr; depends on &rarr; `models/` & `core/`
   - `models/` &rarr; depends on &rarr; `core/database.py` (No reverse imports)
2. **Feature Encapsulation (Frontend)**:
   - Components under `features/<module>/` encapsulate views, specific hooks, and sub-components for that module.
   - Shared primitives remain under `components/ui/` and `components/layout/`.
3. **No Direct External Imports in Business Logic**:
   - Business services interface with AI models exclusively via `model_router.py`.
   - Business services interface with file storage exclusively via `document_service.py`.
   - Business services interface with code execution exclusively via `sandbox_manager.py`.
