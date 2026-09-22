# KELVRIN: Project Contract & Architectural Invariants

---

## 1. Executive Purpose & Invariants

This document defines the **binding architectural contracts and non-negotiable engineering rules** for the KELVRIN Sovereign Agentic AI Workbench. Every pull request, module implementation, and deployment configuration must strictly adhere to these invariants.

### 1.1 The Core Invariants
1. **The Sovereignty Invariant**: No document content, prompt text, AI embedding, agent plan, or code output shall ever be transmitted across an untrusted network boundary or to any third-party commercial AI API (e.g., OpenAI, Anthropic, Google Gemini API).
2. **The Identity Decoupling Invariant**: External authentication (Firebase / Google) is strictly isolated to identity token verification. Identity services shall never have access to application databases, document storage, or inference streams.
3. **The Sandbox Invariant**: No agent or user-submitted code shall execute directly on the host operating system with ambient privileges or network access.
4. **The Authoritative Backend Invariant**: Frontend UI state, role-based button hiding, and client-side guards are strictly cosmetic. Every business action, data query, and system mutation must be authoritatively verified by the FastAPI backend.
5. **The Tamper-Evident Audit Invariant**: Every security-sensitive action (authentication, privilege escalation, document upload, model query, code execution, configuration change) must produce an immutable audit log record before completion.

---

## 2. Firebase & Identity Provider Contract

### 2.1 Allowed Usage
- **Allowed**: Invoking `signInWithPopup(auth, googleProvider)` in the React client to retrieve a Google ID Token (JWT).
- **Allowed**: Passing the ID Token via `Authorization: Bearer <id_token>` to `POST /api/v1/auth/google-login`.
- **Allowed**: Backend verification of the JWT signature using `firebase-admin` or Google public JWKS keys (`https://www.googleapis.com/oauth2/v3/certs`).
- **Allowed**: Extracting standard claims: `sub`, `email`, `name`, `picture`, and `email_verified`.

### 2.2 Prohibited Usage (Strict Anti-Patterns)
- **STRICTLY FORBIDDEN**: Using Cloud Firestore for any user data, chat messages, or metadata.
- **STRICTLY FORBIDDEN**: Using Firebase Storage (Google Cloud Storage buckets) for document or asset persistence.
- **STRICTLY FORBIDDEN**: Using Firebase Cloud Functions or Firebase Hosting as a mandatory runtime dependency.
- **STRICTLY FORBIDDEN**: Using Firebase Realtime Database.
- **STRICTLY FORBIDDEN**: Storing service account JSON credentials inside the Git repository.
- **STRICTLY FORBIDDEN**: Calling Firebase client SDKs from within backend business logic or worker queues.

### 2.3 Air-Gapped Fallback Contract
The system must support an environment switch:
```env
KELVRIN_AUTH_MODE=google_firebase   # Options: google_firebase | airgap_local | mock_dev
```
When `KELVRIN_AUTH_MODE=airgap_local` or `mock_dev`:
- The client bypasses external Firebase SDK initialization.
- The backend authenticates users via local cryptographic credentials or local OIDC/LDAP.
- The system never attempts outbound connections to `accounts.google.com` or `firebaseio.com`.

---

## 3. Data Flow & Zero-Leakage Contract

```
+-----------------------------------------------------------------------------------+
|                            SOVEREIGN BOUNDARY                                     |
|                                                                                   |
|   +-------------------+      HTTPS (TLS 1.3)      +---------------------------+   |
|   |   React SPA       | <=======================> |   FastAPI Gateway         |   |
|   |   (Local Browser) |                           |   (Local / Private VPC)   |   |
|   +-------------------+                           +---------------------------+   |
|                                                                 ||                |
|                                                 +---------------+---------------+ |
|                                                 |                               | |
|                                                 v                               v |
|                                       +-------------------+           +-------+ | |
|                                       | PostgreSQL +      |           | Local | | |
|                                       | pgvector Engine   |           | vLLM/ | | |
|                                       +-------------------+           | Ollama| | |
|                                                                       +-------+ | |
+-----------------------------------------------------------------------------------+
                                          X  (NO EGRESS TRAFFIC)
                                          X  (NO THIRD-PARTY LLM APIS)
```

### Data Categorization & Storage Matrix
| Data Category | Permitted Storage | Network Egress Permitted? |
|---|---|---|
| User Identity (Email, Name) | PostgreSQL `users` table | No (only received from IdP) |
| Confidential Documents | Local Encrypted Storage / MinIO | **STRICTLY FORBIDDEN** |
| Document Chunks & Embeddings | PostgreSQL `document_chunks` (pgvector) | **STRICTLY FORBIDDEN** |
| Prompts & Chat Conversations | PostgreSQL `conversations`, `messages` | **STRICTLY FORBIDDEN** |
| Model Weights | Local NVMe storage (`/models`) | **STRICTLY FORBIDDEN** |
| Agent Execution Traces | PostgreSQL `agent_runs`, `agent_steps` | **STRICTLY FORBIDDEN** |
| Generated Code & Sandbox Data | Isolated Sandbox Volume (`/sandbox/tmp`) | **STRICTLY FORBIDDEN** |
| Audit Logs | PostgreSQL `audit_logs` (immutable append) | SIEM Syslog Export Only |

---

## 4. Frontend & Backend API Contract

### 4.1 Standard Headers
All requests from client to backend must include:
- `Content-Type: application/json` (or `multipart/form-data` for uploads)
- `Authorization: Bearer <session_jwt>` (or secure HTTP-only session cookie)
- `X-Request-ID: <uuid4>` (for distributed tracing and audit correlation)

All responses from backend must include:
- `X-Request-ID: <uuid4>` (echoed back for correlation)
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Content-Security-Policy: default-src 'self'`

### 4.2 Standard Success Response Envelope
```json
{
  "success": true,
  "data": {},
  "meta": {
    "page": 1,
    "page_size": 25,
    "total_records": 142,
    "total_pages": 6,
    "timestamp": "2026-09-13T19:13:00Z",
    "request_id": "c7a8b9f1-3d2e-4b5a-9f1c-8e7d6a5b4c3d"
  }
}
```

### 4.3 Standard Error Response (RFC 7807 Problem Details)
```json
{
  "success": false,
  "error": {
    "code": "PERMISSION_DENIED",
    "message": "The active role lacks the 'documents:delete' permission scope.",
    "status": 403,
    "details": {
      "resource": "doc_98f12a",
      "required_permission": "documents:delete",
      "user_role": "Analyst"
    },
    "timestamp": "2026-09-13T19:13:00Z",
    "request_id": "c7a8b9f1-3d2e-4b5a-9f1c-8e7d6a5b4c3d"
  }
}
```

### 4.4 Real-Time Streaming Protocol (Server-Sent Events)
Streaming endpoints (Chat and Agent Execution) use standard SSE:
```http
HTTP/1.1 200 OK
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive

event: step_start
data: {"step_number": 1, "description": "Formulating execution plan"}

event: token
data: {"content": "Analyzing ", "delta_index": 0}

event: tool_call
data: {"tool": "local_vector_search", "params": {"query": "Q3 EBITDA"}}

event: final_deliverable
data: {"output": "Completed successfully", "metrics": {"duration_ms": 1240}}

event: done
data: [DONE]
```

---

## 5. Environment & Secret Management Contract

### 5.1 Environment Variable Hierarchy
1. System Host Environment / Kubernetes Secrets (Highest Priority)
2. Local `.env` file (Loaded only in local development, strictly git-ignored)
3. `.env.example` (Committed to Git, populated **exclusively with non-secret defaults and placeholder tokens**)

### 5.2 Mandatory Variable Schema
```bash
# ==============================================================================
# KELVRIN RUNTIME CONFIGURATION CONTRACT
# ==============================================================================

# Server Core
KELVRIN_ENV=development                 # Options: development | staging | production
KELVRIN_HOST=0.0.0.0
KELVRIN_PORT=8000
KELVRIN_SECRET_KEY=change-in-production-min-32-chars-random-secret
KELVRIN_ACCESS_TOKEN_EXPIRE_MINUTES=480

# Sovereignty & Auth Mode
KELVRIN_AUTH_MODE=google_firebase       # Options: google_firebase | airgap_local | mock_dev
FIREBASE_PROJECT_ID=kelvrin-sovereign-workbench
FIREBASE_CLIENT_EMAIL=firebase-adminsdk@kelvrin.iam.gserviceaccount.com
# Path to service account (OPTIONAL: omit if using JWKS public verification)
FIREBASE_SERVICE_ACCOUNT_PATH=/etc/kelvrin/secrets/firebase-sa.json

# Database & Storage
DATABASE_URL=postgresql+asyncpg://kelvrin_app:kelvrin_pass@postgres:5432/kelvrin_db
DOCUMENT_STORAGE_DIR=/var/lib/kelvrin/documents
VECTOR_DIMENSIONS=1024

# Local Model Inference (OpenAI Compatible Local Gateway)
LOCAL_INFERENCE_URL=http://vllm:8000/v1
LOCAL_EMBEDDING_URL=http://embeddings:8000/v1
PRIMARY_LLM_MODEL=deepseek-ai/DeepSeek-R1-Distill-Qwen-14B
FAST_ROUTER_MODEL=meta-llama/Llama-3.1-8B-Instruct
VISION_MODEL=Qwen/Qwen2-VL-7B-Instruct
EMBEDDING_MODEL=BAAI/bge-m3

# Isolation Sandbox
SANDBOX_BACKEND=docker                  # Options: docker | gvisor | subprocess_restricted
SANDBOX_TIMEOUT_SECONDS=60
SANDBOX_MAX_MEMORY_MB=1024
SANDBOX_NETWORK_DISABLED=true
```

---

## 6. Model Center & Inference Contract

1. **Standard Adapter Interface**: The backend must communicate with all local models using a standardized `LocalInferenceClient` that implements OpenAI-compatible schemas:
   - `POST /v1/chat/completions` (JSON & SSE streaming)
   - `POST /v1/embeddings`
2. **Context Window Enforcement**: The model router must reject or truncate payloads exceeding the target model's verified context window (e.g., 32,768 tokens) before dispatching to the inference engine.
3. **Graceful Degradation**: If the primary GPU-accelerated model engine fails or exhausts VRAM, the router must fall back to a registered secondary model or queue the request rather than crashing.

---

## 7. Sandbox & Code Execution Contract

1. **No Ambient Host Access**: Execution occurs within an ephemeral Docker container or gVisor sandbox. The host filesystem is mounted read-only, except for an isolated, size-capped `/tmp` volume.
2. **Strict Network Isolation**: The sandbox container is launched with `--network none`. No outbound sockets, DNS queries, or TCP connections are permitted.
3. **Execution Timeouts**: Every code execution has an authoritative kernel-level wall-clock timeout (default: 60 seconds). CPU quotas are enforced via cgroups (`--cpus=1.0`, `--memory=1024m`).
4. **Output Sanitization**: Stdout and Stderr are capped at 500KB to prevent memory exhaustion attacks.
