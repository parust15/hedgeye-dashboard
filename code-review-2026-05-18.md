# Code Review — 2026-05-18

**Scope:** Last 6 commits (`c99f45c..f7e6225`) — ETF info modal, ETF Pro Plus Active Setups, Macro Show tab, TopTabs constellation arc.

**Method:** 9 parallel review agents (Test Runner, Linter, Code Reviewer, Security, Quality, Test Quality, Performance, Deployment, Simplification).

---

## Verdict: **Needs Attention**

Code is generally well-structured and follows project conventions. **Two findings deserve a fix before next iteration**; the rest are quality debt that can be addressed in batches.

---

## Needs Attention (Critical / High)

### 1. EtfInfoModal lacks focus trap, initial focus, and scroll lock
**File:** `src/components/EtfInfoModal.jsx:38-65`
**Severity:** HIGH (a11y regression)
**Why:** `aria-modal="true"` is declared, but Tab still cycles through page content behind the backdrop. Body keeps scrolling. Other modals in the app (`TickerDetailModal`) handle this correctly — this one regressed.
**Fix:** Add `useRef` for the panel; focus the close button on mount, restore previous focus on unmount; set `document.body.style.overflow = 'hidden'` in the same effect.
**Cost:** ~10 lines.

### 2. `no-useless-assignment` may mask a latent sort bug
**File:** `src/components/EtfProPlusPanel.jsx:347`
**Severity:** HIGH (could be silent bug)
**Why:** `cmp` is assigned then never read in one branch of the 8-mode sort switch. ESLint flagged it as possible dead code OR a missing return.
**Fix:** Read the line and either delete the assignment or add the missing return.
**Cost:** 2 minutes of eyeball.

---

## Suggestions

### Performance (Agent 7)

| # | Impact | Effort | Finding |
|---|---|---|---|
| 3 | MED | LOW | **EtfProPlusPanel re-renders all 40 `SignalCard`s on every search keystroke.** Memoize `openInfoModal`/`closeInfoModal` with `useCallback`, debounce search (~150ms), wrap `SignalCard` in `React.memo`. (`src/components/EtfProPlusPanel.jsx:551-563`) |
| 4 | MED | LOW | **EtfProPlusPanel writes localStorage on every keystroke.** Debounce the persistence effect (200-500ms). (`src/components/EtfProPlusPanel.jsx:222-228`) |
| 5 | LOW | LOW | **TopTabs re-measure thrash.** Effect re-runs reinstall ResizeObserver per hover/click. Split into mount-only + state-only effects, drop the `lastMeasuredWidth.current = 0` reset. (`src/components/TopTabs.jsx:74-103`) |
| 6 | LOW | LOW | **`colorizeTickers` rebuilds regex + Sets per render.** Hoist to `useMemo` keyed on callouts. (`src/components/MacroShowPanel.jsx:64-95`) |
| 7 | LOW | LOW | **`useEtfInfo` module-level cache unbounded.** Cap at ~64 entries with FIFO/LRU or add a TTL. (`src/lib/useEtfInfo.js:14`) |
| 8 | LOW | LOW | **`parseAdded` constructs `new Date()` per rerank row per render.** Wrap `RerankRow` in `React.memo`. (`src/components/EtfReRankPanel.jsx:15-29,201`) |

### Code Quality / Simplification (Agents 5, 9)

| # | Impact | Effort | Finding |
|---|---|---|---|
| 9 | MED | LOW | **`preview/*` folder (5 components + 250 lines CSS + App.jsx branch) is dead** if the constellation choice is final. Delete or gate behind `import.meta.env.DEV`. |
| 10 | LOW | LOW | **`readArray()` duplicated** in `MacroShowPanel.jsx:21-32` + `MacroDayCard.jsx:35-46`. Extract to `src/lib/jsonbArray.js`. |
| 11 | LOW | LOW | **`window` shadows global** at `MacroShowPanel.jsx:107`. Rename to `windowDays`. |
| 12 | LOW | LOW | **Empty `.macro-panel {}` ruleset** in App.css. Delete. |
| 13 | LOW | MED | **6 `loadInitial*` functions in EtfProPlusPanel** could be one `usePersistedState(key, default, validate)` hook. Same pattern repeats in RR / Macro / TopTabs. |
| 14 | LOW | LOW | **`MoversStrip` is two copy-pasted halves** (`EtfReRankPanel.jsx:110-174`). Extract `<MoversColumn>`. |
| 15 | LOW | LOW | **Date formatters scattered across 3 files** (`MacroShowPanel`, `MacroDayCard`, `EtfReRankPanel`). Consolidate. |
| 16 | LOW | MED | **EtfProPlusPanel 65-line sort switch** could be a comparator-lookup table. |

### Deployment (Agent 8)

| # | Impact | Effort | Finding |
|---|---|---|---|
| 17 | LOW | LOW | **`?tabsPreview=1` ships to prod.** Gate behind `import.meta.env.DEV` so the 4 preview tab components aren't reachable via URL fiddling in production. (`src/App.jsx:96-110`) |
| 18 | LOW | LOW | **Async IIFE in App.jsx has no try/catch** for the ambient `signalTickers` fetch. Inconsistent with `useMacroShow.js`. (`src/App.jsx:56-74`) |

### Lint (Agent 2)

| # | Impact | Effort | Finding |
|---|---|---|---|
| 19 | LOW | LOW | **3 `no-unused-vars`** — `useMemo` in App.jsx, `tint`/`dominance` in AmbientBackground.jsx. Delete. |
| 20 | LOW | MED | **13 `react-hooks/set-state-in-effect`** errors swamp signal-to-noise. Most are legitimate "reset state on null prop" patterns. Either suppress on the legitimate sites with rationale comments, or downgrade the rule to `warn` in `eslint.config.js` so real errors surface. |

### Test Coverage (Agents 1, 6)

| # | Impact | Effort | Finding |
|---|---|---|---|
| 21 | MED | MED | **0 new tests for 12 changed files.** Priority gaps (HIGH risk — invisible to click-testing): `rangeWidthPct`, `priceInRangePct`, the 8-mode sort comparator, `toSignalRow`, `colorizeTickers` regex, `useWeeklyTop5` ranking, `parseAdded` date math. Pattern + tools already in place (`src/lib/*.test.js`, vitest + fake timers). |

---

## All Clear

- **Agent 4 (Security):** No exploitable issues. Zero `dangerouslySetInnerHTML`/`innerHTML`/`eval`. All Supabase queries use parameterized builders, no SQL string concat. localStorage reads all allowlist-validate. Modal text rendered as JSX children (auto-escaped). `colorizeTickers` properly escapes regex metacharacters. No hardcoded secrets. `.env.local` correctly gitignored.
- **Agent 8 (Dependency / Deploy):** Zero new deps. `npm audit` clean (0 high/moderate/low). No breaking API changes. Supabase views referenced (`hedgeye_macro_show_daily_v`, `hedgeye_macro_show_period_summary`) exist. No localStorage keys renamed (no user state loss on rollback).
- **Agent 1 (Tests):** 68/68 tests pass, no flakes, 1.48s.

---

## Suggested Next Action

**Quick wins (~30 min total):**
1. Fix #1 EtfInfoModal a11y (focus trap + scroll lock)
2. Fix #2 `cmp` no-useless-assignment investigation
3. Delete #11 `window` shadow, #12 empty ruleset, #19 unused vars
4. Gate #17 `?tabsPreview=1` behind `import.meta.env.DEV`

**Medium effort (~1-2h):**
5. Fix #3 SignalCard memoization + search debounce
6. Decide #9 preview/* fate — delete if not in active design exploration

**Defer:**
- Lint suppression / rule downgrade (#20)
- Test backfill (#21) — pattern exists, can be a dedicated commit
- The duplication cleanup (#10, #14, #15) — wait for the next feature to force the rule-of-three

---

*Generated by parallel 9-agent code review on `f7e6225` (HEAD). Restart Claude Code after reading to clear the large agent transcript context.*
