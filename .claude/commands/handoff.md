---
description: Generate a structured session_summary.md for context handoff (replaces auto-compaction)
---

You are performing a context handoff before this session's window fills.

Generate a file called `session_summary.md` in the project root with the following sections. Overwrite any existing `session_summary.md` — it is a single-session artifact, not a log.

## Objective
One paragraph. The core goal of this session. Not what was discussed — what was being built or solved.

## State at Handoff
- Exact files created, modified, or deleted (full paths)
- Schema changes applied (tables, columns, migrations run)
- Services or credentials touched
- Commands run with non-obvious side effects (commits pushed, deploys triggered, secrets rotated, etc.)

## Decisions Made
Each decision on its own line: `[LOCKED] <decision> — <one-line rationale>`
Mark `[LOCKED]` only if reversing it would break downstream work. Unlocked decisions get no prefix.

## What Was Tried and Failed
List only failures that affected the approach. Skip dead ends that don't constrain next steps.

## Open Threads
Numbered list. Each item: what needs doing next AND what the blocker or dependency is. If there is no blocker, say "no blocker — just do it."

## Constraints Active
Hard rules, scope limits, or prior commitments that the next session MUST NOT violate. Include things like "do not change schema X", "do not rename localStorage key Y", "guard for Number(null) === 0 in field Z".

## Next Prompt (paste-ready)
A single fenced block the next session can paste verbatim to resume without re-explaining state. Reference `session_summary.md` at the top so the next session reads this file first. Include enough context that it could skip ALL re-orientation.

---

**Rules for writing this file:**

- Write only what you can verify from this session's actual history. NEVER infer or fabricate. If you didn't witness something directly, do not put it in the file.
- If a section has nothing to report, write "Nothing to report" — do not omit the section.
- The file MUST be self-contained. The next session reads only this file, not the chat history.
- Do not summarize conversation tone, apologies, or meta-commentary about how the session went. State, decisions, and next steps only.
- Use full absolute or repo-relative paths for files. Do not abbreviate ("the panel" → say `src/components/RiskRangesPanel.jsx`).
- Mark `[LOCKED]` decisions sparingly. A decision is locked only if undoing it would force a real rework, not just because it feels final.
- The "Next Prompt" block is the most important section. Write it as if the next session has amnesia and you have one shot to bootstrap it.
