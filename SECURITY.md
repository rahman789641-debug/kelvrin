# Security Policy & Architecture — KELVRIN Sovereign Agentic AI Workbench

## 1. Security Overview & Sovereignty Principles

KELVRIN is engineered specifically for classified, defense, aerospace, and high-consequence industrial deployments requiring strictly zero outbound data egress and 100% on-premises model execution.

The system adheres to the principle of **Architectural Honesty & Defense-in-Depth**:
- **Zero Cloud AI Egress**: No confidential user documents, RAG chunks, or conversational prompts ever dial external commercial LLM APIs.
- **Local Enclave Processing**: Vector embeddings (`bge-m3`), reasoning models (`deepseek-r1:14b`), fast routers (`llama3.1:8b`), and multimodal vision engines (`qwen2-vl:7b`) execute exclusively within local host GPU memory or CPU inference runtimes.
- **Micro-Process Sandbox Guardrails**: Python Code Lab executes via isolated POSIX child processes with strict AST static analysis, network interface patching, and OS kernel resource ceilings (`RLIMIT_CPU`, `RLIMIT_AS`).
- **Cryptographic Auditability**: Every administrative action, model routing decision, document access, and failed authentication is logged to an immutable audit trail with masked sensitive fields and request correlation IDs (`X-Correlation-ID`).

---

## 2. Enterprise Security Architecture & Hardening Controls

The codebase has undergone a complete security overhaul implementing 32 rigorous controls:

### 2.1 Cryptographic Key & Secret Management
- **Zero Hardcoded Secrets**: All API secrets, database credentials, and admin passwords are provided strictly via environment variables.
- **Startup Enforcement**: Fast-failing startup validators guarantee that `JWT_SECRET_KEY` (minimum 32 characters), `INITIAL_ADMIN_PASSWORD` (minimum 12 characters), and PostgreSQL credentials exist before accepting traffic.
- **Pluggable Secrets Interface**: Integrated `SecretsManager` interface supporting `EnvSecretsManager` for development, `VaultSecretsManager` (HashiCorp Vault KV v2 over mTLS) for on-prem sovereign enclaves, and cloud secret manager adapters.

### 2.2 Authentication, Backdoor Removal & Token Revocation
- **Zero Backdoors**: All mock authentication bypasses (`mock_google_`, `AIR_GAP_LOCAL` tokens) and email-based role elevations have been completely eliminated.
- **Bcrypt Password Hashing**: Passwords are hashed using modern `bcrypt` (work factor 12 rounds) with backward-compatible verification for legacy PBKDF2 hashes.
- **Real JWT Logout & Revocation**: Every issued JWT includes a unique `jti`. Logout operations store cryptographic SHA-256 token hashes in the `revoked_tokens` table, rejecting blacklisted tokens on all subsequent requests.
- **Refresh Token Rotation**: Refreshing an access token revokes the old refresh token, preventing replay attacks.

### 2.3 PostgreSQL Row-Level Security (RLS) & Multi-Tenancy
- **Database-Engine Tenant Isolation**: PostgreSQL Row-Level Security (RLS) is enabled and forced across all multi-tenant tables (`users`, `documents`, `agent_runs`, `deliverables`, `conversations`, `audit_logs`).
- **Session-Bound Policies**: Queries are constrained by `app.current_company_code` session parameters, preventing cross-tenant data access even in the event of application-level filter errors.
- **Centralized Authorization**: Centralized `authorize_tenant_access()` guarantees strict company code boundary enforcement across all document, chat, agent, and deliverable endpoints.

### 2.4 Rate Limiting & Denial-of-Service Mitigation
- **Auth Rate Limiting**: Dedicated sliding-window rate limiter restricts sensitive authentication endpoints (`/local-login`, `/google-login`, user registration) to a maximum of 5 attempts per 60 seconds per IP and identifier, returning `HTTP 429 Too Many Requests` with `Retry-After` headers.
- **Global API Rate Limiting**: Global middleware enforces a 120 req/min ceiling on unauthenticated requests and 1200 req/min on authenticated users.

### 2.5 HTTP Security & Attack Mitigation
- **Zero Wildcard CORS in Production**: Wildcard `*` origins are strictly prohibited when `ENVIRONMENT` is `production` or `staging`.
- **Security Headers**: Standard enterprise headers are injected into every HTTP response:
  - `Content-Security-Policy`: Restricts scripts, styles, frames, and objects.
  - `X-Content-Type-Options`: `nosniff` prevents MIME-sniffing attacks.
  - `X-Frame-Options`: `DENY` mitigates Clickjacking attacks.
  - `X-XSS-Protection`: `1; mode=block` blocks legacy reflected XSS.
  - `Strict-Transport-Security`: `max-age=31536000; includeSubDomains; preload` enforces HTTPS.
  - `Referrer-Policy`: `strict-origin-when-cross-origin` prevents URL leakage.
  - `Permissions-Policy`: Restricts camera, microphone, geolocation, and hardware APIs.
- **SQL Injection Immunity**: 100% of data queries utilize SQLAlchemy ORM / Core parameterized statements. Zero raw string interpolation exists in SQL queries.

---

## 3. Supported Versions

| Version | Status | Air-Gap Ready | Supported |
|---|---|---|---|
| 1.0.x   | Active | Yes (Local Enclave) | :white_check_mark: |
| < 1.0.0 | Deprecated | Preview Only | :x: |

---

## 4. Reporting a Security Vulnerability

If you discover a potential vulnerability or security flaw in KELVRIN:

1. **Do NOT open a public GitHub issue.**
2. Send an encrypted email to `security@kelvrin.internal` (or your assigned Sovereign Security Officer).
3. Include:
   - Specific component affected (e.g. Code Sandbox, Document Security, Token Authority)
   - Step-by-step reproduction instructions
   - Potential impact analysis (e.g. Sandbox escape, path traversal, authorization bypass)
4. The Sovereign Security Team will acknowledge receipt within 24 hours and provide a remediated hotfix within 72 hours under responsible disclosure protocols.
