# KELVRIN Sovereign Agentic AI Workbench — Network Policy

## 1. Zero-Egress Architectural Mandate

The KELVRIN Sovereign Agentic AI Workbench is engineered for air-gapped, on-premises, and sovereign enterprise deployments. The system operates under a strict **Zero-Egress Security Policy**:

1. **No External AI Model APIs**: All text, code, multimodal, and embedding models run on local hardware or within internal local inference servers (e.g. vLLM, Ollama, local PyTorch runtimes). Under no circumstances are prompts, document chunks, or embeddings transmitted to third-party cloud AI APIs (OpenAI, Anthropic, cloud-hosted endpoints).
2. **Confidential Document Isolation**: All documents uploaded to the platform are stored strictly on local encrypted disk volumes (`/data/sovereign_vault` and `/scratch`). Raw document contents never leave the host boundaries.
3. **Deterministic Sandbox Isolation**: All untrusted agent-generated code runs in isolated micro-process containers with `AF_INET` socket creation prohibited, preventing runtime socket egress.

---

## 2. Authentication Modes (`AUTH_MODE`)

The workbench explicitly distinguishes between disconnected air-gapped environments and hybrid identity environments:

| Mode | Flag | Description | Network Dependency |
|---|---|---|---|
| **True Air-Gapped** | `AUTH_MODE=local` | Pure local authentication using cryptographic bcrypt password hashes stored in the sovereign database. Offline JWT bearer tokens issued locally. | **Zero External Traffic**: Complete network isolation. |
| **Hybrid Sovereign** | `AUTH_MODE=firebase` | Google/Firebase identity verification enabled for federated enterprise SSO. Outbound network communication is strictly restricted to Google Identity token verification endpoints (`googleapis.com`). All documents, data, RAG, and AI inference remain 100% on-premises. | **External Identity Only**: Token verification traffic to Google endpoints. |

### Configuration
To deploy in a truly air-gapped facility, set the environment variable:
```bash
export AUTH_MODE=local
```
When `AUTH_MODE=local`, Firebase initialization is completely bypassed and all token verification is handled locally by the internal security provider.

---

## 3. Network Boundary & Port Topology

```
+-------------------------------------------------------------------------+
|                        SOVEREIGN ENCLAVE HOST                           |
|                                                                         |
|  [Vite Frontend SPA]  <---->  [FastAPI Sovereign Gateway]               |
|  Port: 5173 (127.0.0.1)        Port: 8000 (127.0.0.1)                   |
|                                         |                               |
|                     +-------------------+-------------------+           |
|                     |                                       |           |
|             [PostgreSQL / SQLite]                  [Local Model Fleet]  |
|             Port: 5432 (127.0.0.1)                 Port: 8000 / 11434   |
|                                                                         |
|             [Isolated Code Sandbox]                                     |
|             Socket: DISABLED (PermissionError on AF_INET)               |
|             Resource bounds: CPU=5.0s, RAM=512MB                        |
+-------------------------------------------------------------------------+
                                    |
                            [AIR-GAP BOUNDARY]
                                    |
                    X  BLOCKED: 0.0.0.0/0 Egress
```

### Port Bindings
- **FastAPI ASGI Server**: Bound strictly to `127.0.0.1:8000`. Public wildcard (`0.0.0.0`) binding is prohibited unless fronted by an authenticated reverse proxy with mutual TLS (mTLS).
- **Frontend SPA**: Served locally on `127.0.0.1:5173`.
- **Database**: PostgreSQL or local SQLite accessed via localhost sockets.

---

## 4. Connector & Tool Allowlisting (SSRF Prevention)

In compliance with Principle 19 of the Sovereign Architecture:
- All external connectors are **DISABLED BY DEFAULT**.
- Connectors enforce a strict endpoint allowlist.
- Local loopback restrictions prevent Server-Side Request Forgery (SSRF):
  - Requests to cloud metadata IP (`169.254.169.254`) are statically blocked.
  - External IP addresses are rejected unless an explicit IP allowlist entry is approved by a Super Admin.
  - Connectors log every invocation to `connector_executions` and `audit_logs`.

---

## 5. Security & Audit Telemetry

The platform continuously records and audits all operational events:
- `USER_LOGIN` / `USER_LOGOUT`
- `DOCUMENT_UPLOADED`, `DOCUMENT_VIEWED`, `DOCUMENT_DOWNLOADED`
- `AI_REQUEST`, `MODEL_SELECTED`
- `AGENT_STARTED`, `TOOL_EXECUTED`
- `FILE_GENERATED`, `FILE_DOWNLOADED`
- `CONNECTOR_CALLED`
- `PERMISSION_DENIED`, `SSRF_BLOCKED`

All events are tamper-evident and queryable in the **Immutable Audit Logs** interface with zero confidential text or prompt exposure.
