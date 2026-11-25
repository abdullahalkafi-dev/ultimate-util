# Current context

_Last updated: 2026-11-26_

## Status
Phase 3: build, nearly done. Specs, design, backend, frontend and all 33 tools are built, committed and pushed. The production build and the Docker stack work. Every tool was exercised in a real browser (Chromium).

**Latest report: [handoff/2026-11-26-audit-2.md](handoff/2026-11-26-audit-2.md)** (known limits and untested items are listed there). The older [status handoff](handoff/2026-11-19-status-and-next-steps.md) is historical: its per-tool table is out of date.

## Next steps
1. Owner decisions: the 47 open questions in features/_shared/open-questions.md.
2. Owner supplies: Google OAuth credentials (then AUTH_MODE=google), Atlas URL, deployment and domain access.
3. Test on Firefox, Safari and real phones; test the items listed as untested in audit 2.
4. Backend integration tests for the cloud tools beyond the current 21.
5. Deployment.

## Key facts
- Monorepo: `frontend/` (Next.js 16, Redux Toolkit + RTK Query), `backend/` (Fastify + Mongoose), `shared/` (zod schemas). pnpm 12, Docker Compose with local MongoDB.
- Production builds use webpack (`next build --webpack`); Turbopack hangs on this codebase.
- Mock login for local testing; real Google login is written but untested (no credentials yet).
- No GitHub CI/CD for now. Commits are authored as the owner with no AI attribution.
- Removed from scope: URL shortener, uptime/SSL monitor, currency rates.
