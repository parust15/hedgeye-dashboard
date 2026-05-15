# Claude conventions for hedgeye-dashboard

## Context handoff

When this session's context is filling up, or when the user asks for a "handoff" / "summary" / "compact", use the `/handoff` slash command — DO NOT rely on Claude Code's default auto-compaction. The handoff command writes a structured `session_summary.md` to the project root that the next session reads as its first action.

If a fresh session starts and `session_summary.md` exists in the project root, read it FIRST before doing anything else. It is the authoritative handoff document — chat history and auto-compaction summaries are secondary.

## Project rules

- **No new Supabase tables or views.** Schema is fixed; new data needs go through views the user creates server-side. The Supabase project is `dabtaxwqtsbepfwpgsta`.
- **Never use mock data.** Real data only. Empty states must be handled by the UI itself.
- **`Number(null) === 0` is a known footgun in this codebase.** Always guard `r.field != null` BEFORE `Number.isFinite(Number(r.field))`. This pattern has caused silent bugs in `rangePct` and `PerformanceSection` — don't recreate it.
- **localStorage keys are namespaced as `dashboard.<feature>`.** Existing keys: `dashboard.activeTab`, `dashboard.callView`, `dashboard.trendFilter`, `dashboard.selectedTickers`. Do not rename — it discards user state on next deploy.
- **Commits require explicit user approval** when working on a multi-feature batch. Single-fix commits during iteration are fine to propose, but the user makes the call.
- **Do not skip git hooks** (`--no-verify`) or bypass signing unless the user explicitly asks for it. If a pre-commit hook fails, fix the underlying issue and create a NEW commit (not `--amend`).

## Stack reminders

- React 19 + Vite 8 + recharts 3.8 + @supabase/supabase-js 2.105
- Vitest + @testing-library/react + jsdom for tests
- Deployed to Vercel from `main` branch (auto-deploy on push)
