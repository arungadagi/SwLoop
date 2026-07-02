---
name: loop
description: Orchestrates a test-driven development loop for a requirement - spawns a tester subagent to write failing tests, a developer subagent to implement code, and a reviewer subagent to critique both until accepted, with a hard iteration cap and user-controllable pause/guidance/abort via .loop/control.md. Accepts a short requirement or a full requirement document (e.g. via @file), and can decompose a multi-requirement document into a sequential batch of independent loops. Use when the user invokes /loop, asks to "loop" a feature or requirement, or wants an automated TDD red-green-review cycle.
---

# /loop

Turns the current agent into a TDD orchestrator: requirement → tests → review → implementation → review → verify, driven by three subagents (`loop-tester`, `loop-developer`, `loop-reviewer`). You (the primary agent) are the orchestrator — you own the loop, run the real test suite, and are the only one who talks to the user. Works under OpenCode (via its `task` tool) and under Pi (via the `loop_subagent` tool from the bundled Pi extension) — see "Subagent invocation" below for how to tell which one you have.

## Usage

```
/loop "<requirement>"                         # start a new TDD loop for a requirement
/loop "<requirement>" --max 8                 # override iteration cap per loop (default 5)
/loop "<requirement>" --test-cmd "pytest -q"  # skip auto-detection, use this test command
/loop "<requirement>" --no-decompose          # skip the multi-requirement check, always a single run
/loop --resume                                # resume the most recent run (single or batch)
/loop --status                                # print current status and stop, no action
/loop --help                                  # print this usage block and stop
```

If invoked with `--help`/`-h` and nothing else: print this `## Usage` block verbatim and stop. Do not detect anything, do not touch files.

`<requirement>` can be a short one-line description or a full requirement document — paste it inline, or hand over a file (e.g. `/loop @requirements.md`) so its full content is included in the message before you ever see it. Either way, treat everything between `/loop` and the first recognized `--flag` as the requirement text, however long. If that text actually describes several distinct requirements rather than one, see Decomposition below — `--no-decompose` skips that check entirely.

If invoked with `--status`: if `.loop/batch.md` exists, print the batch summary (every item and its status) plus the current item's phase/counters/verdict; otherwise read `.loop/state.md` and `.loop/control.md` and print a concise single-run summary (phase, both counters vs cap, last verdict, status). Either way, stop — do not invoke any subagent, do not run tests, do not write anything.

If invoked with neither a requirement nor `--resume`/`--status`/`--help`: tell the user a requirement is required, show the first line of Usage, and stop.

All `.loop/` paths below are relative to the current working directory (the project root you're running in). When running as part of a batch (Decomposition), every `.loop/xxx` path named anywhere in Phases 0-6 means `.loop/items/<NN>-<slug>/xxx` instead — the phase logic itself never changes, only where its files live.

## Overall flow

```
Phase 0  SETUP            detect/confirm test command, init .loop/
Phase 1  TEST DESIGN       @loop-tester   writes failing tests
Phase 2  TEST REVIEW       @loop-reviewer ACCEPT|REVISE, loops to tester (cap: test_review)
Phase 3  IMPLEMENT         @loop-developer writes code to pass accepted tests
Phase 4  RUN TESTS         orchestrator runs real suite (ground truth)
                           fail -> back to Phase 3 (cap: dev_review)
Phase 5  CODE REVIEW       @loop-reviewer ACCEPT|REVISE
                           REVISE -> back to Phase 3 (cap: dev_review)
Phase 6  VERIFY            orchestrator re-runs suite + checks requirement coverage -> done
```

Two independent counters, each capped at `--max` (default 5):
- `test_review` — rounds between tester and reviewer (Phase 1/2), including the orchestrator sending tests back to the tester if the harness itself doesn't run cleanly (Phase 1's sanity check).
- `dev_review` — rounds through the developer, whether triggered by a failing test run (Phase 4) or a reviewer REVISE (Phase 5). Both route back to Phase 3, so both spend the same budget.

Hitting a cap **stops the run** (`status: blocked`), writes state, and reports the blocker to the user. Never auto-accept unreviewed or red code just because the cap was hit.

## Subagent invocation

Every phase below says "invoke the tester/developer/reviewer." Determine once, at Phase 0, which mechanism your host gives you, then use it consistently for the whole run:

- **OpenCode — `task` tool available:** call it with `subagent_type: "loop-tester" | "loop-developer" | "loop-reviewer"`, `task_id: <stored ref>` to resume that role's session or omitted for a fresh one, `prompt: <text>`. Store whatever `task_id` it returns.
- **Pi — `loop_subagent` tool available:** call it with `role: "tester" | "developer" | "reviewer"`, `resume: true|false` (true only if you already have a stored session ref for that role in this run), `prompt: <text>`. It spawns an isolated non-interactive `pi -p` child session, seeded with that role's instructions from `.opencode/agents/loop-<role>.md`, and returns the child's final response plus a `sessionFile` path — store that path as the ref.
- **Neither tool available:** tell the user this host is missing the loop subagent mechanism (no `task` tool, and no `loop_subagent` tool from the Pi extension) and stop. Do not role-play the subagent yourself in the same context — that defeats the separation between orchestrator and worker.

Store whatever identifier comes back (`task_id` or `sessionFile`) in state.md's Subagent Sessions section, generically as each role's "session ref," and pass it back on the next resume for that same role. Everything else below (prompts, phase logic, caps) is identical regardless of which mechanism you're using.

## Step 0: Parse invocation

Extract: requirement text (quoted string), `--max N`, `--test-cmd "..."`, `--no-decompose`, `--resume`, `--status`, `--help`. Handle `--help`/`--status` as above and stop before doing anything else.

## Step 1: Fresh run (no --resume)

1. **Detect test command** (skip if `--test-cmd` given): use the Test command detection table below.
2. **Confirm with the user** via the `question` tool: show the detected (or given) command, offer "use this" vs "let me type a different one." Do this even when `--test-cmd` was passed only if detection strongly disagrees with it — otherwise just proceed with the explicit flag, no need to ask.
3. **Decide single vs batch** (skip straight to step 4 if `--no-decompose` was given): see Decomposition below. If it resolves to a single requirement, continue with step 4 here. If confirmed as a batch, follow the batch setup in Decomposition instead — steps 4-7 below still describe what happens for each item, just rooted at `.loop/items/<NN>-<slug>/` instead of `.loop/`.
4. Create `.loop/` in the project root if it doesn't exist.
5. Write initial `.loop/state.md` (see State file schema) with `phase: test_design`, both counters at 0, `status: running`.
6. Write initial `.loop/control.md` (see Control file schema) with `CONTINUE`.
7. If a `.gitignore` exists and doesn't already reference `.loop/`, append a `.loop/` line to it. If no `.gitignore` exists, just mention in your summary that `.loop/` holds run artifacts and the user may want to ignore it. Don't ask — this is trivial and reversible.
8. Proceed to Phase 1.

## Step 2: Resume (--resume)

1. Check for `.loop/batch.md` first. If it exists and isn't `status: done`, this is a batch resume: read it, find the current item (the first one not `done`/`skipped`), and resume that item using steps 2-4 below scoped to `.loop/items/<NN>-<slug>/` instead of `.loop/`. Continue the batch loop (Decomposition) from there once that item finishes.
2. Otherwise, read `.loop/state.md`. If missing: tell the user there's nothing to resume, show how to start a new run, stop.
3. If `status: done`: tell the user this run already completed, show the summary, stop.
4. If `status: aborted`: tell the user the run was aborted and ask (plain text, not a tool call) whether to start a fresh `/loop` — don't auto-restart.
5. Otherwise (`running`, `paused`, or `blocked`): restore requirement, test command, both counters, cap, and the three session refs (tester/developer/reviewer — may be unset if that subagent hasn't run yet). Jump straight to the recorded `phase`, skipping Step 1 entirely.

## Decomposition (multi-requirement documents)

Right after confirming the test command (Step 1), decide whether the requirement text actually describes several distinct, independently-testable requirements (numbered sections, separate user stories, a checklist of unrelated capabilities) rather than one requirement described at length. This is your judgment call, not a rigid parser — a long requirement with background, motivation, and acceptance criteria for *one* feature is not multiple requirements; don't over-split. Skip this whole check if `--no-decompose` was given.

If it looks like multiple items:
1. List them as a short numbered summary — one line each: a short title plus one-sentence scope.
2. Confirm via the `question` tool. Options: "Use this split", "Run as one requirement instead" (falls back to a single run covering everything, no batch), or let the user type a corrected list (the tool's built-in custom-answer option).
3. If the user picks "one requirement," or only one item was ever detected: continue with the normal single-run Step 1 (steps 4 onward) — nothing else changes.
4. If confirmed as a batch: switch to batch mode for the rest of this run.

### Batch mode

- Create `.loop/items/` alongside `.loop/`.
- Write `.loop/batch.md` (schema below), listing every confirmed item as `pending`, numbered `01`, `02`, ... in the order given.
- Write `.loop/control.md` at the top level — this is now **batch-scoped** control, separate from each item's own control file (see Control hierarchy below).
- For each item, in order: create `.loop/items/<NN>-<slug>/`, write that item's own `state.md` (`phase: test_design`, both counters at 0, `status: running`) and `control.md` (`CONTINUE`) exactly like a normal single run, then run Phases 1-6 for that item — every `.loop/xxx` path in Phases 0-6 means `.loop/items/<NN>-<slug>/xxx` here. `<NN>` is the zero-padded item number; `<slug>` is a short kebab-case name derived from the item's title (e.g. `02-password-reset`).
- When an item reaches `done`: mark it `done` in `batch.md`, log it, move to the next `pending` item.
- When an item reaches `blocked` or `aborted`: mark it in `batch.md`, **pause the whole batch** (mirror the status onto `batch.md` too) and hand back to the user — do not silently continue to the next item on a known-bad state. The user can fix/guide that item and `--resume`, or explicitly skip it via `SKIP_ITEM` (below).
- `--max` applies **per item**, independently — each item gets its own fresh `test_review`/`dev_review` budget, not a shared total across the batch.
- After the last item finishes (or the batch is intentionally stopped early), write a batch summary and hand back to the user.

### Control hierarchy (batch mode only)

Two control files are live at once — editing the wrong one won't do what you want:

- `.loop/control.md` (top level) — **batch-scoped**. Polled at the same boundary-check moments, in addition to the current item's own control file:
  - `CONTINUE` (default), `SET_MAX: <n>` (applies to all remaining items' caps)
  - `PAUSE_BATCH` — finish the current item, then stop before starting the next one
  - `ABORT_BATCH` — stop immediately, including whatever item is currently running
  - `SKIP_ITEM` — abandon the current item's progress, mark it `skipped` in `batch.md`, move straight to the next `pending` item
  - `GUIDANCE: <text>` — same one-shot injection as item-level, but only reaches whichever subagent call happens next in the *current* item
- `.loop/items/<NN>-<slug>/control.md` (per item) — the same vocabulary as a normal single run (`CONTINUE`/`PAUSE`/`GUIDANCE`/`ABORT`/`SET_MAX`), scoped to just that item's phases.

### `.loop/batch.md` schema

```
# Loop Batch

- source: <short description - filename if handed over via @file, else "inline">
- status: running | paused | blocked | aborted | done
- max: <cap, applies per item>
- test_cmd: <command, shared across all items>
- started: <timestamp>
- updated: <timestamp>

## Items
1. [done]    01-rate-limiting    Add rate limiting to login endpoint
2. [running] 02-password-reset   Add password reset flow
3. [pending] 03-audit-log        Add audit logging for admin actions

## Log
- [<timestamp>] <event>
```

In batch mode, each item still gets its own clarity check (below) right before its own Phase 1 — blocking ambiguity in item 5 pauses at item 5 when its turn comes, it doesn't stall the whole batch from starting.

## Requirement clarity

Not every ambiguity is worth stopping for. Distinguish two kinds before Phase 1 starts for the current item:

- **Minor ambiguity** — an implementation detail the requirement didn't spell out, but any reasonable choice is fine and easily corrected later (e.g. "per IP" without saying header vs socket address). Don't stop for this — proceed to Phase 1; the tester makes a reasonable assumption and flags it in its report per its own instructions, and the reviewer can push back in Phase 2 if the assumption looks wrong.
- **Blocking ambiguity** — the requirement has no way to define pass/fail without more information: a missing number where the domain clearly needs one (a rate limit with no request count or window, a timeout with no duration, pagination with no page size), or language that's inherently subjective and unquantified ("faster," "nicer," "more secure," "improve X") with nothing concrete backing it. Left alone, this doesn't fail loudly — the tester invents a number, the developer implements against it, and the reviewer (reasoning from the *same* vague text) has no more grounds to object than the tester did. The run can end fully tested, fully reviewed, and `status: done`, against a number nobody actually asked for.

For blocking ambiguity, stop before Phase 1 and ask via the `question` tool — the specific handling differs by kind:

- **Missing quantification** (a number/threshold is absent but the requirement is otherwise concrete): ask directly for the missing value, offering common sensible defaults as options where the domain has an obvious convention — e.g. "How many login attempts before rate limiting kicks in? Common choices: 5/minute, 10/minute, or specify your own."
- **Inherently unquantifiable as stated** (subjective language with no way to define "done" — "make it look nicer," "improve performance" with no target): say plainly that this isn't the kind of requirement automated tests can validate as written, and ask whether to (a) reframe it into concrete, checkable criteria (you can suggest some, but the user decides what "done" means), (b) proceed anyway understanding the loop's tests will only check that nothing broke, not that the subjective goal was met, or (c) skip `/loop` for this one and handle it directly instead.

Once resolved, proceed to Phase 1 with the clarified requirement text, and update the stored requirement in state.md (or the item's state.md, in batch mode) if the user's answer changed it — Phase 1's prompt should use the clarified version, not the original vague one.

## Boundary check — run this before every phase, and before every review round within a phase

1. Read `.loop/control.md` — in batch mode, this is the batch-scoped file; also read the current item's own `.loop/items/<NN>-<slug>/control.md` for item-scoped commands (see Control hierarchy).
2. `ABORT` → set `status: aborted` in state.md, write a short summary of progress so far, stop the entire run. Do not invoke any more subagents.
3. `PAUSE` → tell the user the loop is paused at the current phase, note that editing `.loop/control.md` to `CONTINUE` (or just telling you to continue) resumes it, then stop your turn. Re-run this same boundary check the next time you're invoked for this loop.
4. `GUIDANCE: <text>` → capture `<text>`, plan to inject it as "User guidance: `<text>`" into the very next subagent prompt, then rewrite `control.md` back to `CONTINUE` (one-shot, not sticky), proceed.
5. `SET_MAX: <n>` → update the cap for both counters in `state.md` and in your working context, rewrite `control.md` back to `CONTINUE`, proceed.
6. `CONTINUE`, file missing, or unrecognized content → proceed normally.
7. After acting on the above, update `.loop/state.md` (phase, timestamp, counters) before doing the phase's actual work.

## Phase 1 — Test design

Run boundary check. Check the requirement for blocking ambiguity (see Requirement clarity) before going further — resolve it first if found. Then invoke the tester subagent (see Subagent invocation), fresh — no stored session ref yet for this run. Prompt:

```
You are working within an active /loop TDD run as the tester.

Requirement:
<requirement>

Test command for this project: <test_cmd>
Project root: <cwd>

Write failing test case(s) that fully capture this requirement. Do not implement
production code. Follow the project's existing test framework and conventions.
[If no test framework exists yet: bootstrap <agreed framework> as confirmed in Phase 0, minimal config only.]
[User guidance: <text>]   <- only if boundary check captured GUIDANCE

Report: files created/changed, one line per test explaining what it verifies,
and any ambiguity in the requirement you had to assume an answer for.
```

Store the returned session ref as `tester_ref` in state.md. Record files touched. Summarize the subagent's report into `.loop/tests-review.md` (its output isn't visible to the user otherwise).

Before moving to Phase 2, run `<test_cmd>` yourself once as a sanity check — not to gate on pass/fail (the tests are *supposed* to fail right now, no implementation exists), but to confirm the harness itself actually works: the command runs without erroring out, and the new test(s) are genuinely discovered and executed, not silently skipped or failing to collect. This matters most right after a fresh bootstrap (see "No test framework yet"), but it's worth doing either way — otherwise Phase 2 spends a review round critiquing test *content* when the tests don't even run.

- **Runs, fails for the right reason** (assertion failures, not errors) → proceed to Phase 2 as normal.
- **Harness is broken** (command not found, import/collection error, "0 tests ran," etc.) → this is a setup problem, not a test-design disagreement. Send it back to the *same* tester session (resume `tester_ref`) with the actual error output and an instruction to fix the harness/test setup, then repeat this sanity check. This counts against `test_review` — same counter, same cap, since it's still the tester's phase budget, just orchestrator-driven instead of reviewer-driven. If the cap is hit here: `status: blocked`, report the harness error, hand back.

## Phase 2 — Test review (loop)

While `test_review` counter < cap:

1. Run boundary check.
2. Invoke the reviewer subagent, resuming `reviewer_ref` if set, else fresh. Prompt:

```
You are reviewing test cases in an active /loop TDD run, before any implementation exists.

Requirement:
<requirement>

Test files:
<file list>

Check: do these tests fully and correctly capture the requirement? Missing edge
cases? Do they test behavior, not implementation details? Will they fail right
now for the right reason (missing implementation)?
[User guidance: <text>]

End with the VERDICT block exactly as specified in your instructions.
```

3. Store returned ref as `reviewer_ref`. Append the review to `.loop/tests-review.md`.
4. Parse the `VERDICT` block.
   - **ACCEPT** → break this loop, go to Phase 3.
   - **REVISE** → increment `test_review` counter. If now `>= cap`: set `status: blocked`, summarize the outstanding `BLOCKING` items, stop the run, hand back to the user. Else: invoke the tester subagent again, resuming `tester_ref`, with prompt `"Reviewer requested changes to the tests. Blocking feedback:\n<BLOCKING bullets>\n\nRevise the tests accordingly. Do not implement production code."` (+ guidance if any), append its report to `tests-review.md`, loop back to step 1.

## Phase 3 — Implement

Run boundary check. Invoke the developer subagent, resuming `developer_ref` if set (re-entry from Phase 4/5), else fresh. Prompt (first entry):

```
You are working within an active /loop TDD run as the developer.

Requirement:
<requirement>

Accepted test files (do not modify these):
<file list>

Test command: <test_cmd>

Write the minimal implementation needed to make these tests pass. Follow
existing project conventions. Do not modify test files — if you believe a
test is wrong, say so in your report instead of editing it.
[User guidance: <text>]

Report: files changed and why.
```

On re-entry from Phase 4 (tests still red), use instead: `"Running <test_cmd> still fails:\n<trimmed failing output>\n\nFix the implementation. Do not modify test files."` (+ guidance if any).

On re-entry from Phase 5 (reviewer REVISE), use instead: `"Reviewer requested changes to the implementation. Blocking feedback:\n<BLOCKING bullets>\n\nRevise the implementation accordingly. Do not modify test files."` (+ guidance if any).

Store/refresh `developer_ref`. Record files touched. Proceed to Phase 4.

## Phase 4 — Run tests (ground truth, orchestrator only)

Run boundary check. Run `<test_cmd>` yourself via the bash tool in the project root. This is the only source of truth for pass/fail — never take the developer's word for it. "Any fail" means literally any failing test in the output, not just ones tied to this requirement — that's the point: `<test_cmd>` should cover the whole surface you care about (see Test command detection), so a failure anywhere is a real regression signal from this round's change, not noise to filter out.

- **All pass** → append result to state.md, proceed to Phase 5.
- **Any fail** → increment `dev_review` counter. If now `>= cap`: set `status: blocked`, include the failing output, stop the run, hand back to the user. Else: go back to Phase 3 with the failing output (re-entry prompt above).

## Phase 5 — Code review (loop)

While `dev_review` counter < cap:

1. Run boundary check.
2. Capture context for the reviewer: if the project is a git repo, use `git diff` (or `git diff --stat` plus the diff for changed files) for the changed files; otherwise use the developer's self-reported file list and read those files directly.
3. Invoke the reviewer subagent, resuming `reviewer_ref` (same reviewer session as test-review, so it already has context on what the tests were meant to cover). Prompt:

```
You are now reviewing the implementation in this active /loop TDD run.

Requirement:
<requirement>

Changed files:
<file list or diff summary>

All tests currently pass (<test_cmd> exit 0). Check: does the implementation
correctly and robustly satisfy the requirement without hacks (e.g. hardcoding
expected test values), unnecessary complexity, or missing error handling? Is
it consistent with project conventions?
[User guidance: <text>]

End with the VERDICT block exactly as specified in your instructions.
```

4. Append the review to `.loop/code-review.md`. Parse `VERDICT`.
   - **ACCEPT** → break this loop, go to Phase 6.
   - **REVISE** → increment `dev_review` counter. If now `>= cap`: set `status: blocked`, summarize outstanding `BLOCKING` items, stop, hand back. Else: go back to Phase 3 with the reviewer re-entry prompt (above) — which then flows through Phase 4 again before returning here. Never skip re-running tests after a code change, even a review-driven one.

## Phase 6 — Verify (orchestrator only, no subagents)

Run boundary check. Re-run `<test_cmd>` yourself one more time as the final ground truth. Then sanity-check requirement coverage yourself: read the requirement, list the accepted tests, confirm each distinct point in the requirement maps to at least one test. This is your own judgment call, not a subagent call.

- **Suite green + coverage looks reasonable** → `status: done`, write the final summary into `state.md`, print the summary to the user: requirement, files touched, test results, how many review rounds were used per counter, and pointers to `.loop/tests-review.md` / `.loop/code-review.md` for full transcripts.
- **Suite red here** → a regression slipped past Phase 4/5 (the environment changed, or `<test_cmd>` was scoped narrower than what actually got touched). This is a regression, not a coverage gap — handle it exactly like a Phase 4 failure: increment `dev_review`; if now `>= cap`, `status: blocked`, report, hand back; otherwise go back to Phase 3 with the failing output.
- **You spot a real coverage gap** (suite is green, but the requirement isn't fully tested) → do not silently loop again. Report the specific gap to the user as your final note and let them decide (e.g. run a new `/loop` for the gap, or accept as-is). Avoid inventing a meta-loop here.

## Test command detection

Probe the project root, in order, and propose the first match (still confirm via the `question` tool per Step 1):

| Signal | Proposed command |
|---|---|
| `package.json` has a real `test` script (not the npm placeholder) | `npm test` |
| `pytest.ini`, `pyproject.toml` with `[tool.pytest...]`, or a `tests/`/`test_*.py` pattern | `pytest` |
| `go.mod` | `go test ./...` |
| `Cargo.toml` | `cargo test` |
| `pom.xml` | `mvn test` |
| `build.gradle` / `build.gradle.kts` | `gradle test` |
| none of the above, but a language/stack is still identifiable | see "No test framework yet" below |
| nothing identifiable at all | ask the user directly — a command to use, or whether this requirement even suits automated tests |

### No test framework yet

Go and Rust always ship a built-in test runner — if `go.mod`/`Cargo.toml` exists, that row above always applies even with zero existing test files (an empty result is a valid "all pass"). For other languages, no framework existing yet means Phase 0's confirmation has to happen in two parts, since nobody — including the user — can name a real command for a framework that doesn't exist:

1. Detect the primary language from whatever *does* exist (file extensions, a manifest like `package.json`/`pyproject.toml` even without test config, etc.).
2. Propose that language's standard framework to bootstrap — prefer what the language already ships before adding a dependency (e.g. Node 18+'s built-in `node --test` needs nothing extra), but if the ecosystem's de facto convention is a third-party framework (pytest for Python, Jest/Vitest for a typical JS/TS project), propose that instead of a purist stdlib-only choice nobody on the team will recognize. A test framework is expected infrastructure, not a shortcut to avoid.
3. Confirm both the framework and the resulting command via the `question` tool in one step — e.g. "No test framework detected. Propose bootstrapping pytest, test command `pytest -q` — use this, or specify something else?"
4. Pass the agreed framework into Phase 1's prompt explicitly (the tester bootstraps *that*, not whatever it feels like) — see the bootstrap line in the Phase 1 prompt template. Phase 1's own sanity check then verifies the bootstrap actually works before any review round is spent on it.

If no language is identifiable at all — an empty project, or a requirement that isn't the kind of thing automated tests cover in the first place (a pure prose/docs change, for instance) — say so plainly and ask the user whether to proceed without an automated test command, pick a language/framework anyway, or stop. Don't guess silently either way.

Every command above runs the whole project's suite, not just new tests — that's deliberate: Phase 4 reruns this exact command every round, so a whole-project command is what makes it catch regressions elsewhere as they happen, not just at the very end. If `--test-cmd` was given and targets a specific file or subfolder rather than the whole project (e.g. one package in a monorepo), say so explicitly while confirming it: regressions outside that scope won't be caught by this run at any phase, including Phase 6 — that's the tradeoff of scoping it down, and the user should knowingly accept it, not discover it later.

## State file — `.loop/state.md`

```
# Loop State

- requirement: <text>
- test_cmd: <command>
- phase: setup | test_design | test_review | implement | run_tests | code_review | verify
- status: running | paused | blocked | aborted | done
- max: <cap>
- started: <timestamp>
- updated: <timestamp>

## Counters
- test_review: <n> / <max>
- dev_review: <n> / <max>

## Subagent Sessions
- tester: <task_id | session-file path, or ->
- developer: <task_id | session-file path, or ->
- reviewer: <task_id | session-file path, or ->

## Last Verdict
VERDICT: ...
BLOCKING: ...
NOTES: ...

## Files Touched
- <path>

## Log
- [<timestamp>] <phase> <one-line event>
```

Update this file at every boundary check and after every phase action — it's the only thing `--resume` and `--status` read.

## Control file — `.loop/control.md`

```
CONTINUE

<!--
One command as the first non-comment line:
CONTINUE            proceed normally (default)
PAUSE               halt at next boundary; edit back to CONTINUE (or just say so) to resume
GUIDANCE: <text>    inject this into the very next subagent prompt, then auto-resets to CONTINUE
ABORT               stop the run cleanly and hand back to the user
SET_MAX: <n>        change the iteration cap for both counters, live
-->
```

The user edits this file directly at any time; you poll it at every boundary check (see above). Independently, the user can also just hit Esc to hard-interrupt your turn at any moment — that's not something this file controls, it's a standing capability of the underlying tool.

This is the single-run / per-item vocabulary. In batch mode, `.loop/control.md` at the top level is a separate, batch-scoped file with its own commands (`PAUSE_BATCH`, `ABORT_BATCH`, `SKIP_ITEM`) — see Control hierarchy under Decomposition.

## Verdict contract (what you expect back from loop-reviewer)

```
VERDICT: ACCEPT | REVISE
BLOCKING: <bullets, empty if ACCEPT>
NOTES: <optional>
```

Parse this literally. Never infer a verdict from prose if this block is missing — if a reviewer response lacks it, treat it as `REVISE` with `BLOCKING: reviewer did not return a parseable VERDICT block, re-review` and re-invoke the same reviewer session ref once before counting it against the cap.
