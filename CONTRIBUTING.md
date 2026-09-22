# Contributing to KELVRIN Sovereign Workbench

Thank you for your interest in contributing to the **KELVRIN Sovereign Agentic AI Workbench**. 
This document outlines our engineering standards, contribution workflow, and review guidelines.

---

## 1. Engineering Principles

- **Zero Cloud AI Dependency**: Never add external cloud AI SDKs (OpenAI, Anthropic, Google Cloud AI) to core modules. All inference must remain on-premises and OpenAI-API-compatible.
- **Architectural Honesty**: Clearly distinguish between `AUTH_MODE=local` (100% air-gap disconnected) and `AUTH_MODE=google_firebase` (hybrid web token verification).
- **Strict Typing**: All backend Python code must use Pydantic schemas or type annotations. All frontend code must pass `tsc -b` with zero errors.
- **Zero Secrets in Git**: Never commit `.env` files, production tokens, or database dumps.

---

## 2. Development Setup

```bash
# 1. Clone repository
git clone https://github.com/your-org/kelvrin.git
cd kelvrin

# 2. Setup backend virtualenv & install dependencies
python3 -m venv backend/venv
source backend/venv/bin/activate
pip install -r backend/requirements.txt

# 3. Setup frontend dependencies
cd frontend && npm install && cd ..

# 4. Run automated test suite to ensure green baseline
make test

# 5. Launch development servers
make dev
```

---

## 3. Commit Message Conventions

We adhere to the [Conventional Commits](https://www.conventionalcommits.org/) standard:

- `feat(auth)`: Add brute-force rate limiter to local authentication
- `fix(rag)`: Correct cosine similarity threshold for bge-m3 embeddings
- `perf(frontend)`: Implement Rollup manualChunks for vendor code splitting
- `refactor(models)`: Clean up model provider factory interface
- `test(e2e)`: Add multimodal corrupted PDF resilience tests
- `docs(readme)`: Update system architecture diagram

---

## 4. Pre-Pull Request Checklist

Before submitting a pull request, run the following verification commands:

```bash
# 1. Verify all 110 automated tests pass
make test

# 2. Verify TypeScript types compile cleanly
make lint

# 3. Verify frontend production build succeeds
make build

# 4. Verify Docker configurations parse correctly
docker compose config -q
```

All Pull Requests require approval from at least one Core Maintainer and a passing CI workflow.
