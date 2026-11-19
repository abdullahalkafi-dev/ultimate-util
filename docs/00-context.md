# Current context

_Last updated: 2026-11-19_

## Status
Phase 3: build. Specs and approved design are done and pushed. Backend and frontend foundation are done and pushed. 20 of 33 tools have a screen in the working tree, 13 do not, and none of the tool work beyond Word Counter is committed or reviewed yet.

**Start here: [handoff/2026-11-19-status-and-next-steps.md](handoff/2026-11-19-status-and-next-steps.md).** It has the exact per-tool state, known problems, next steps and the audit checklist.

## Next steps
1. Fix the 3 type errors, run the full checks and a production build.
2. Review and register the finished tools, commit one tool at a time.
3. Build the 13 missing tools.
4. Integration tests for cloud tools, Docker smoke test, docs update.
5. Owner supplies: Google OAuth credentials, Atlas URL, deployment and domain access (later).

## Key facts
- Monorepo: `frontend/` (Next.js 16, Redux Toolkit + RTK Query), `backend/` (Fastify + Mongoose), `shared/` (zod schemas). pnpm 12, Docker Compose with local MongoDB.
- Mock login for local testing; real Google login is written but untested (no credentials yet).
- No GitHub CI/CD for now. Commits are authored as the owner with no AI attribution.
- Removed from scope: URL shortener, uptime/SSL monitor, currency rates.
