# Changelog

All notable changes to the **KELVRIN Sovereign Agentic AI Workbench** project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.0.0] - 2026-09-21

### Added
- **Autonomous Agentic ReAct Engine**: Multi-step reasoning loop with dynamic tool discovery, execution verification, and real-time thought step streaming.
- **Multimodal Document Pipeline**: Grounded RAG search using `bge-m3` dense vector embeddings, PDF visual page layout analysis, and bounding-box evidence citations.
- **Native Office Deliverable Generator**: Server-side generation of authenticated `.docx`, `.xlsx`, `.pptx`, and `.pdf` reports directly from agent tasks.
- **Micro-Process Code Sandbox**: Process-isolated Python execution environment with AST module blocking (`os`, `sys`, `socket`, `subprocess`), POSIX `rlimit_cpu` and `rlimit_as` memory ceilings, and ephemeral workspace teardown.
- **Sovereign Multi-Tenant RBAC**: 6 cryptographic privilege tiers with company code boundary isolation and immutable audit logging.
- **Hardware & Egress Telemetry Probe**: Zero-egress hardware telemetry reporting host CPU, RAM, VRAM, and network socket activity.
- **Air-Gap Autonomous Simulation Engine**: Client-side IndexedDB simulation engine enabling 100% interactive standalone frontend operation on Vercel with zero backend dependency.
- **Enterprise DevOps Pipeline**: Multi-stage Docker builds (`Dockerfile.backend`, `Dockerfile.frontend`), automated GitHub Actions CI/CD pipeline, and root `Makefile`.

### Security Hardened
- **Constant-Time Verification**: Upgraded password verification to `hmac.compare_digest` to prevent side-channel timing attacks.
- **Brute-Force Rate Limiting**: Added sliding-window attempt throttling on authentication endpoints (`max 5 failed attempts / 60s`).
- **File Upload Verification**: Implemented magic byte header checks (`%PDF-`, `PK\x03\x04`, `\x89PNG\r\n\x1a\n`) and path traversal boundary assertions.
- **CORS & Database URL Auto-Normalization**: Dynamic origin parsing supporting wildcard regex and automated `postgres://` to `postgresql+asyncpg://` translation.
