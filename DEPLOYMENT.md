# KELVRIN Sovereign Agentic AI Workbench — Production Deployment Guide

## 1. Overview & Architectural Principles

KELVRIN is an on-premises, air-gapped agentic AI workbench engineered for classified, defense, and high-consequence industrial deployments. The deployment architecture enforces:
- **Zero Cloud AI Dependency**: Inference runs on local GPUs or CPU inference runtimes (vLLM, Ollama, Triton).
- **Zero Data Egress**: Confidential documents, embeddings, and chat histories remain strictly confined to the local filesystem and PostgreSQL enclave.
- **Architectural Honesty**: Clear distinction between `AUTH_MODE=local` (100% disconnected air-gap) and `AUTH_MODE=google_firebase` (hybrid identity token verification).

---

## 2. System Prerequisites

| Component | Minimum Specification | Recommended Production |
|---|---|---|
| **Operating System** | Ubuntu 22.04 LTS / RHEL 9 / macOS | Ubuntu 22.04 LTS (Kernel 5.15+) |
| **CPU** | 8 Cores (x86_64 or ARM64) | 16+ Cores |
| **System Memory** | 16 GB RAM | 64 GB+ ECC RAM |
| **Disk Storage** | 50 GB Fast SSD | 500 GB+ NVMe SSD (Encrypted Volume) |
| **Container Engine** | Docker 24.0+ & Docker Compose v2 | Docker Engine with rootless runtime |
| **Optional GPU** | None (CPU Fallback operational) | NVIDIA A100 / H100 / RTX 4090 / Apple Silicon |

---

## 3. Quick Start Deployment

### 3.1 Production-Like Deployment
```bash
# 1. Clone repository into designated enclave workspace
git clone <repository_url> kelvrin
cd kelvrin

# 2. Copy and customize configuration template
cp .env.example .env

# 3. Build and launch all containerized services
docker compose up --build -d

# 4. Monitor service initialization
docker compose logs -f backend
```

Once running:
- **Frontend SPA**: `http://localhost:5173`
- **Liveness Probe**: `http://localhost:8000/health` (or `/api/v1/health`)
- **Readiness Probe**: `http://localhost:8000/ready` (or `/api/v1/ready`)
- **Backend API Docs**: `http://localhost:8000/docs` (available in development mode; disabled in production to prevent reconnaissance)

### 3.2 Development Deployment (with Live Code Hot-Reloading)
```bash
# Launch with bind-mounted volumes and live uvicorn/Vite reloader
docker compose -f docker-compose.dev.yml up --build
```

---

## 4. Environment Variables Reference

| Variable | Default Value | Description |
|---|---|---|
| `ENVIRONMENT` | `production` | Deployment profile (`production`, `staging`, or `development`). |
| `AUTH_MODE` | `local` | `local` for 100% air-gap or `google_firebase` for hybrid Google ID token checks. |
| `JWT_SECRET_KEY` | *Must be generated* | Cryptographic HMAC secret for signing sovereign session tokens (min 32 chars). |
| `DATABASE_URL` | `postgresql+asyncpg://...` | Async SQLAlchemy database connection string (PostgreSQL mandatory in production). |
| `INITIAL_ADMIN_PASSWORD` | *Must be generated* | Initial Super Admin password (min 12 chars). |
| `CORS_ORIGINS` | `["http://localhost:5173"]` | Authorized origin whitelist. Wildcard `*` strictly forbidden in production. |
| `KELVRIN_SECRETS_PROVIDER` | `env` | Pluggable secrets provider: `env`, `vault` (HashiCorp Vault KV v2), or `cloud`. |
| `DOCUMENT_STORAGE_DIR` | `/workspace/data/sovereign_vault` | Encrypted mount path for uploaded and processed documents. |
| `LOCAL_INFERENCE_URL` | `http://local-model-service:11434/v1` | OpenAI-compatible endpoint for local LLM inference. |
| `LOCAL_EMBEDDING_URL` | `http://local-model-service:11434/v1` | Endpoint for dense vector embeddings (`bge-m3`). |
| `PRIMARY_LLM_MODEL` | `deepseek-r1:14b` | Default reasoning and analytical LLM model identifier. |
| `FAST_ROUTER_MODEL` | `llama3.1:8b` | Low-latency model for task classification and intent routing. |
| `VISION_MODEL` | `qwen2-vl:7b` | Multimodal model for engineering drawings and document vision. |
| `SANDBOX_TIMEOUT_SECONDS`| `5.0` | Execution time limit enforced by code sandbox via OS `RLIMIT_CPU`. |
| `SANDBOX_MAX_MEMORY_MB` | `512` | Address space ceiling for sandboxed scripts via `RLIMIT_AS`. |

---

## 5. Database Migration & Schema Management (Alembic)

In compliance with enterprise and defense security standards, **`create_all()` is strictly prohibited in production and testing environments**. All database tables, indexes, constraints, and tenant columns are provisioned deterministically via **Alembic migrations**.

### 5.1 Architecture & Migration Chain
- **Migration Location**: `backend/alembic/versions/`
  1. `93f1d02cce3c`: Initial 18 sovereign database tables and core schemas.
  2. `acb214682119`: Additional sovereign models, deliverables, and tenant columns.
  3. `c7e1f4a9b2d3`: PostgreSQL Row-Level Security (RLS) policies for tenant isolation.
  4. `d8f2b5a1e4c7`: Composite performance indexes on foreign keys and tenant lookups.
- **Configuration**: `alembic.ini` and `backend/alembic/env.py`
- **Metadata Source**: `backend.app.models.Base.metadata`
- **Naming Conventions**: Enforces uniform naming conventions for all primary keys (`pk_`), foreign keys (`fk_`), unique constraints (`uq_`), check constraints (`ck_`), and indexes (`ix_`), enabling safe online batch migrations across both PostgreSQL and SQLite.
- **Tenant Isolation Policies**: PostgreSQL Row-Level Security (RLS) policies are automatically enforced on top of migrated tables during bootstrap.

### 5.2 Running Migrations in Production

Before launching or upgrading the backend service in production:

```bash
# Apply all pending migrations to the latest revision (head)
docker compose exec backend alembic upgrade head

# If running directly on a bare-metal host with Python venv:
alembic upgrade head
```

### 5.3 Initializing Reference Data & Administrative Account
After migrations are applied, run the idempotent data seeder to initialize sovereign permissions, default roles, system models, and the initial Super Admin:

```bash
# Seed initial roles, permissions, and administrative accounts
docker compose exec backend python -c "import asyncio; from backend.app.db.init_db import init_db; asyncio.run(init_db())"
```

### 5.4 Common Migration Operations

| Action | Command |
|---|---|
| **Check Current Revision** | `alembic current` |
| **Inspect Migration History** | `alembic history --verbose` |
| **Upgrade to Latest Schema** | `alembic upgrade head` |
| **Rollback Previous Migration** | `alembic downgrade -1` |
| **Generate New Migration** | `alembic revision --autogenerate -m "describe_change"` |
| **Verify Schema Drift / Sync** | `alembic check` |

### 5.5 Test Suite Migration Assurance
The automated test suite (`npm run test:backend`) does not call `create_all()`. Instead, `backend/tests/conftest.py` executes `alembic.command.upgrade(..., "head")` against an isolated test database (`kelvrin_test.db`), guaranteeing that all tests run against schemas created purely through migrations.


---

## 6. Model Service Configuration

KELVRIN never dials cloud AI APIs. Connect to your local inference engine using one of two methods:

### Option A: Integrated Ollama Service Profile
To run a bundled local model container within the Compose network:
```bash
docker compose --profile local-models up -d
```
Then pull required models into the volume:
```bash
docker compose exec local-model-service ollama pull llama3.1:8b
docker compose exec local-model-service ollama pull deepseek-r1:14b
docker compose exec local-model-service ollama pull bge-m3
```

### Option B: External Host or Enterprise Inference Cluster (vLLM / Triton)
If your enclave already hosts a high-throughput vLLM or Triton cluster on the corporate network:
1. Set `LOCAL_INFERENCE_URL=http://<cluster_ip>:8000/v1` in `.env`.
2. Set `LOCAL_EMBEDDING_URL=http://<cluster_ip>:8001/v1` in `.env`.
3. Restart backend: `docker compose restart backend`.

---

## 7. Authentication & Sovereignty Modes

### 7.1 True Air-Gapped Mode (`AUTH_MODE=local`) [Default & Recommended]
- Operates 100% disconnected from external internet.
- Operators authenticate using local cryptographic PBKDF2/argon2 hashes stored in PostgreSQL.
- Pre-seeded local Super Admin account:
  - Email: `s.alexander@sovereign.defense.internal`
  - Access Tier: **Super Admin** (Tier 6)

### 7.2 Hybrid Google/Firebase Mode (`AUTH_MODE=google_firebase`)
- Uses Google / Firebase Identity SDK solely to verify Google ID Tokens at the web boundary.
- **Zero Document or Chat Data Egress**: 100% of documents, embeddings, and inference remain on-premises.
- To configure:
  1. Set `AUTH_MODE=google_firebase` in `.env`.
  2. Provide `FIREBASE_PROJECT_ID` and frontend `VITE_FIREBASE_API_KEY`.
  3. Provide `FIREBASE_SERVICE_ACCOUNT_PATH` if using service account credential verification.

---

## 8. Security Hardening Configuration

1. **Non-Root Execution**: Both `Dockerfile.backend` and `Dockerfile.frontend` execute as unprivileged users (`kelvrin` and `nginx`).
2. **Kernel Sandboxing**: Python Code Lab executes with OS resource limits (`rlimit_cpu=5s`, `rlimit_as=512MB`), AST import blocking, and patched network sockets.
3. **SSRF Blocking**: External connectors prohibit loopback/private ranges unless explicitly granted by Super Admin.
4. **Data Masking**: Passwords, bearer tokens, and credentials in audit trails are automatically redacted to `[REDACTED_SECRET]`.

---

## 9. Backup & Disaster Recovery

### 9.1 Database Backup
```bash
# Perform compressed PostgreSQL dump
docker compose exec -t postgres pg_dump -U postgres -d kelvrin_db -F c -b -v -f /var/lib/postgresql/data/kelvrin_backup_$(date +%Y%m%d).dump

# Copy backup archive to external air-gap backup media
docker cp kelvrin_postgres:/var/lib/postgresql/data/kelvrin_backup_$(date +%Y%m%d).dump ./backups/
```

### 9.2 Sovereign Vault & Deliverables Snapshot
```bash
# Archive encrypted documents and deliverables
tar -czvf sovereign_vault_backup_$(date +%Y%m%d).tar.gz ./data/sovereign_vault ./scratch
```

---

## 10. Restoration Procedure

### 10.1 Database Restore
```bash
# Copy backup file into container
docker cp ./backups/kelvrin_backup.dump kelvrin_postgres:/tmp/kelvrin_backup.dump

# Restore into clean database
docker compose exec -t postgres pg_restore -U postgres -d kelvrin_db -v -c /tmp/kelvrin_backup.dump
```

### 10.2 Vault Restore
```bash
# Extract document archive to data directory
tar -xzvf sovereign_vault_backup.tar.gz -C ./
```

---

## 11. Operational Troubleshooting

| Symptom | Probable Cause | Corrective Action |
|---|---|---|
| `GPU metrics unavailable` in UI | Host has no physical NVIDIA/AMD GPU or driver | **Expected behavior**: KELVRIN will automatically run on CPU without crashing or fabricating metrics. |
| `Authentication token required` (401) | Header missing or expired token | Log in via `/login` or use `s.alexander@sovereign.defense.internal` offline credentials. |
| Database connection refused (500) | PostgreSQL container initializing | Ensure `postgres` service is healthy: `docker compose ps`. |
| Connector blocked by policy | SSRF boundary tripped | Ensure target URL is registered in Admin Connectors console and authorized. |

---

## 12. Vercel & GitHub Cloud Hosting Guide

### 12.1 Deploying to Vercel (Frontend SPA)
KELVRIN frontend includes zero-config Vercel support with client-side SPA routing (`vercel.json`) and graceful air-gap simulation fallback if no backend is attached.

1. **Push your code to GitHub** (see Section 12.2).
2. **Import repository in Vercel**:
   - Framework Preset: `Vite`
   - Root Directory: `./` (or `frontend` if deploying frontend alone)
   - Build Command: `npm run build`
   - Output Directory: `frontend/dist` (or `dist` if root directory is set to `frontend`)
3. **Environment Variables (Optional)**:
   - `VITE_API_URL`: Set to your deployed backend URL (e.g. `https://api.yourdomain.com`).
   - If `VITE_API_URL` is omitted, the frontend operates in **Full Air-Gap Simulation Mode** using browser indexed storage, delivering all features (AI Assistant, deliverables generation, RBAC, company management) with zero runtime errors.

### 12.2 Pushing to GitHub
```bash
# 1. Initialize git (if not already done)
git init -b main

# 2. Stage all project files (safe .gitignore prevents secret/node_modules leakage)
git add .

# 3. Commit
git commit -m "feat: Sovereign AI Assistant, enlarged chat UI, deliverable generator, and Vercel/GitHub ready"

# 4. Link your remote GitHub repository
git remote add origin https://github.com/<your-username>/<your-repo-name>.git

# 5. Push to GitHub
git branch -M main
git push -u origin main
```

