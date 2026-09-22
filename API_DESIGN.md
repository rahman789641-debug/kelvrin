# KELVRIN: Comprehensive API Design & OpenAPI Contract

---

## 1. Architectural Standards & Conventions

All endpoints adhere to **RESTful conventions** with consistent request envelopes, response envelopes, error structures, and streaming protocols.

- **Base URL**: `/api/v1`
- **Protocol**: HTTPS (TLS 1.3 in production)
- **Data Serialization**: `application/json` (UTF-8) or `text/event-stream` for real-time events.
- **Authentication**: `Authorization: Bearer <sovereign_session_token>` header.
- **Correlation**: `X-Request-ID: <uuid4>` header echoed on all requests and responses.
- **Pagination Standard**:
  - Query parameters: `?page=1&page_size=25&sort_by=created_at&order=desc`
  - Response metadata includes `page`, `page_size`, `total_records`, `total_pages`.

---

## 2. Health & Orchestration Probes

### 2.1 Liveness Probe
```http
GET /api/v1/health
```
- **Description**: Lightweight check verifying the FastAPI ASGI process is responsive.
- **Response `200 OK`**:
```json
{
  "status": "healthy",
  "version": "1.0.0",
  "timestamp": "2026-09-13T19:14:00Z"
}
```

### 2.2 Readiness Probe
```http
GET /api/v1/ready
```
- **Description**: Verifies external dependencies (PostgreSQL connection, local model gateway reachability, sandbox volume availability).
- **Response `200 OK`**:
```json
{
  "status": "ready",
  "dependencies": {
    "database": "connected",
    "pgvector": "installed",
    "local_llm_gateway": "reachable",
    "sandbox_runtime": "ready"
  },
  "sovereign_mode": "hybrid_google",
  "timestamp": "2026-09-13T19:14:00Z"
}
```

---

## 3. Module API Specifications

### 3.1 Authentication (`/api/v1/auth`)

#### `POST /api/v1/auth/google-login`
- **Headers**: `Authorization: Bearer <firebase_google_id_token>`
- **Description**: Verifies Google ID token signature, creates or updates the local user in PostgreSQL, and issues a sovereign session token.
- **Response `200 OK`**:
```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "expires_in": 28800,
    "user": {
      "id": "usr_9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
      "email": "analyst@enterprise.internal",
      "full_name": "Elena Rostova",
      "avatar_url": "https://lh3.googleusercontent.com/...",
      "role": "Analyst",
      "permissions": ["documents:read", "documents:upload", "agents:run", "code:execute"]
    }
  }
}
```
- **Errors**: `401 Unauthorized` (Invalid/expired token), `403 Forbidden` (User account suspended).

#### `POST /api/v1/auth/local-login`
- **Body**: `{"username": "admin", "password": "..."}`
- **Description**: Authenticates against local credentials when running in disconnected `airgap_local` mode.

#### `POST /api/v1/auth/refresh`
- **Description**: Refreshes an active session token before expiration.
- **Response `200 OK`**: Updated token and expiration timestamp.

#### `POST /api/v1/auth/logout`
- **Description**: Invalidates the active session token and records an audit log event.
- **Response `200 OK`**: `{"success": true, "message": "Session terminated"}`

#### `GET /api/v1/auth/me`
- **Description**: Retrieves current authenticated user context and granular permission scopes.

---

### 3.2 User Management (`/api/v1/users`)

- `GET /api/v1/users`: List users with pagination and role/status filtering.
- `POST /api/v1/users`: Provision a new user manually (Super Admin only).
- `GET /api/v1/users/{id}`: Fetch single user profile and activity summary.
- `PATCH /api/v1/users/{id}`: Update user metadata or active status (`active`, `suspended`).
- `PATCH /api/v1/users/{id}/role`: Assign a role (`Super Admin`, `AI Admin`, `Employee`, `Analyst`, `Approver / Manager`, `Viewer / Auditor`).
- `DELETE /api/v1/users/{id}`: Soft-delete user and revoke all active sessions.

---

### 3.3 Document Ingestion & Management (`/api/v1/documents`)

#### `POST /api/v1/documents/upload`
- **Content-Type**: `multipart/form-data`
- **Form Data**:
  - `file`: Binary file payload (`.pdf`, `.docx`, `.png`, `.jpg`, `.txt`, `.xlsx`)
  - `classification`: `"UNCLASSIFIED"` | `"INTERNAL"` | `"CONFIDENTIAL"` | `"RESTRICTED"`
  - `collection_id`: Target knowledge collection UUID
- **Response `202 Accepted`**:
```json
{
  "success": true,
  "data": {
    "document_id": "doc_3f4a5b6c-7d8e-9f0a-1b2c-3d4e5f6a7b8c",
    "filename": "Q3_Financial_Review.pdf",
    "sha256": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    "byte_size": 4194304,
    "status": "PROCESSING",
    "ocr_required": true
  }
}
```

- `GET /api/v1/documents`: List documents with filters (status, search query, date, classification).
- `GET /api/v1/documents/{id}`: Retrieve document details, extraction stats, and chunk count.
- `DELETE /api/v1/documents/{id}`: Remove document, files, and associated embeddings.
- `GET /api/v1/documents/{id}/chunks`: Inspect extracted chunks, page numbers, and dense embedding vectors.
- `POST /api/v1/documents/search`: Perform hybrid semantic + keyword search over accessible document chunks.

---

### 3.4 AI Assistant & Document Chat (`/api/v1/chat`)

#### `POST /api/v1/chat/completions` (Server-Sent Events)
- **Request Body**:
```json
{
  "conversation_id": "conv_12345",
  "message": "Summarize the primary risk factors in the Q3 report.",
  "model": "deepseek-ai/DeepSeek-R1-Distill-Qwen-14B",
  "temperature": 0.2,
  "document_ids": ["doc_3f4a5b6c-7d8e-9f0a-1b2c-3d4e5f6a7b8c"],
  "enable_citations": true
}
```
- **SSE Stream Response**:
```text
event: citation
data: {"chunk_id": "chk_881", "doc_name": "Q3_Financial_Review.pdf", "page": 14, "snippet": "Market risk increased by 12% due to..."}

event: token
data: {"delta": "Based on the Q3 Financial Review [1], the primary risks include..."}

event: done
data: {"conversation_id": "conv_12345", "tokens_generated": 145, "duration_ms": 1120}
```

- `GET /api/v1/chat/conversations`: List historical conversation threads for active user.
- `GET /api/v1/chat/conversations/{id}`: Retrieve conversation message history with citations.
- `DELETE /api/v1/chat/conversations/{id}`: Delete conversation thread.

---

### 3.5 Autonomous Agents (`/api/v1/agents`)

- `GET /api/v1/agents`: List configured agents (e.g., *Data Analyst Agent*, *Security Auditor Agent*, *Research Synthesizer*).
- `POST /api/v1/agents`: Create or update an agent configuration (system prompt, tools, max steps).
- `POST /api/v1/agents/{id}/execute`: Dispatch an agent goal (returns `run_id` and opens SSE step stream).
- `GET /api/v1/agents/runs/{run_id}`: Fetch detailed step-by-step trace of actions, observations, and tool calls.
- `POST /api/v1/agents/runs/{run_id}/approve`: Approver sign-off for Human-in-the-Loop pending steps.

---

### 3.6 Workflows & Pipelines (`/api/v1/workflows`)

- `GET /api/v1/workflows`: List DAG-based automated workflows.
- `POST /api/v1/workflows`: Save a workflow pipeline definition (nodes: Ingestion, Extraction, Summarization, Approval, Export).
- `POST /api/v1/workflows/{id}/run`: Trigger a workflow execution.
- `GET /api/v1/workflows/runs/{run_id}`: Retrieve workflow run status and step outputs.

---

### 3.7 Knowledge Base (`/api/v1/knowledge`)

- `GET /api/v1/knowledge/collections`: List knowledge collections and vector index sizes.
- `POST /api/v1/knowledge/collections`: Create a new knowledge collection with classification bounds.
- `POST /api/v1/knowledge/reindex`: Trigger a background re-embedding and HNSW index rebuild.
- `GET /api/v1/knowledge/stats`: High-level vector database telemetry (total vectors, memory, dimensions).

---

### 3.8 Model Center & Model Routing (`/api/v1/models`)

- `GET /api/v1/models`: List registered local open-weight models, current VRAM consumption, and status.
- `POST /api/v1/models/register`: Register an on-premises model endpoint and context window specifications.
- `PATCH /api/v1/models/{id}/status`: Activate, drain, or offload a model.
- `GET /api/v1/models/routing-rules`: Retrieve active routing heuristics.
- `PUT /api/v1/models/routing-rules`: Update routing rules (e.g., route math queries to Coder models, vision to VLMs).

---

### 3.9 Code Lab & Sandbox Execution (`/api/v1/code-lab`)

#### `POST /api/v1/code-lab/execute`
- **Request Body**:
```json
{
  "language": "python",
  "code": "import numpy as np\nprint('Vector dot product:', np.dot([1, 2], [3, 4]))",
  "timeout_seconds": 30
}
```
- **Response `200 OK`**:
```json
{
  "success": true,
  "data": {
    "run_id": "run_a1b2c3d4",
    "exit_code": 0,
    "stdout": "Vector dot product: 11\n",
    "stderr": "",
    "execution_time_ms": 248,
    "memory_used_mb": 42.1,
    "network_egress_detected": false
  }
}
```

- `GET /api/v1/code-lab/runs`: List historical sandbox runs executed by the user.

---

### 3.10 Tool & Connector Registry (`/api/v1/tools`)

- `GET /api/v1/tools`: List all tools, execution boundaries, and enabled status.
- `PATCH /api/v1/tools/{id}/toggle`: Enable or disable a tool (AI Admin / Super Admin only).
- `POST /api/v1/tools/{id}/execute`: Execute a test invocation of a tool in dry-run mode.

---

### 3.11 Audit Logs & Compliance (`/api/v1/audit`)

- `GET /api/v1/audit/logs`: Query tamper-evident audit logs with filters (`actor_id`, `action`, `resource_type`, `date_from`, `date_to`).
- `GET /api/v1/audit/export`: Export signed audit trail in JSON or CSV format for SIEM ingestion.

---

### 3.12 System & Resource Telemetry (`/api/v1/system`)

- `GET /api/v1/system/telemetry`: Real-time hardware telemetry:
```json
{
  "gpu": [
    { "index": 0, "name": "NVIDIA RTX 4090", "vram_used_mb": 14200, "vram_total_mb": 24576, "temp_c": 58, "utilization_pct": 74 }
  ],
  "cpu_utilization_pct": 28.4,
  "memory_used_gb": 34.2,
  "memory_total_gb": 128.0,
  "disk_used_gb": 412.0,
  "disk_total_gb": 2048.0,
  "inference_queue_depth": 2
}
```

---

### 3.13 Security & Network Integrity (`/api/v1/security`)

- `GET /api/v1/security/status`: Returns sovereign integrity posture, air-gap status, external connector gates, and egress alert counters.
- `GET /api/v1/security/egress-logs`: Detailed logs of any rejected egress attempts from sandboxed processes.
