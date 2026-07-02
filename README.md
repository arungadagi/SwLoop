# /loop

A TDD orchestration skill for [OpenCode](https://opencode.ai) and [Pi](https://pi.dev). It turns your coding agent into an orchestrator that drives a fixed loop for a requirement:

```
requirement -> tester writes failing tests -> reviewer -> (revise loop) -> accepted tests
            -> developer implements -> orchestrator runs the real suite (ground truth)
            -> reviewer -> (revise loop) -> accepted code -> orchestrator verifies -> done
```

Both review loops are capped (default 5 rounds each, independently) so a run can never spin forever - it stops and hands back to you instead of guessing. You can pause, redirect, or abort a run at any point by editing `.loop/control.md` in the project it's running against, or by hitting Esc.

## What's in this repo

```
.agents/skills/loop/SKILL.md      the orchestrator - phases, caps, control/verdict/state protocols
.opencode/agents/loop-tester.md   role: writes failing tests, never implements
.opencode/agents/loop-developer.md role: implements to pass tests, never edits tests
.opencode/agents/loop-reviewer.md role: read-only, must end every response with a VERDICT block
.pi/extensions/loop-subagent/     Pi has no built-in sub-agent concept; this extension adds one
                                  (spawns each role as an isolated child `pi -p` session) and
                                  registers a real `/loop` Pi command aliasing to `/skill:loop`
.opencode/commands/loop.md        registers a real `/loop` OpenCode command - more reliable than
                                  hoping the model infers "read SKILL.md" from plain text
.opencode/plugins/loop-install.js self-installing OpenCode plugin - copies the skill, agents,
                                  and command into your global config the moment this repo is opened
package.json                     Pi package manifest (`pi install`); npm metadata for discoverability
```

`.opencode/agents/loop-*.md` are the single source of truth for each role's instructions. OpenCode's `task` tool reads them natively as subagents; the Pi extension reads the same files directly (stripping the frontmatter) to seed each spawned child session. Nothing is duplicated between the two hosts.

Both hosts also get a real registered `/loop` command, not just a skill the model has to decide to load on its own - Pi's own docs note plain text isn't always reliably recognized as "go read the skill." This pattern (and the OpenCode plugin `config` hook used to install one) comes directly from studying [ponytail](https://github.com/DietrichGebert/ponytail), a published OpenCode+Pi package.

## Install

### Pi

```bash
pi install git:github.com/<your-username>/LoopSkill
```

This is Pi's real package installer - see [Pi Packages](https://pi.dev/docs/latest/packages). It reads the `pi` key in `package.json` and picks up both the skill and the `loop_subagent` extension (which also registers a real `/loop` command aliasing to `/skill:loop`) in one step. Add `-l` to install into the current project instead of globally.

### OpenCode

OpenCode has no install *command* for skills (only for npm-registry plugins, a different subsystem) - see [Agent Skills](https://opencode.ai/docs/skills). But this repo ships its own installer using OpenCode's real, native project-plugin mechanism, so there's no manual copying either:

```bash
git clone https://github.com/<your-username>/LoopSkill.git
cd LoopSkill
opencode   # first run: .opencode/plugins/loop-install.js auto-loads and copies
           # the skill, agents, and /loop command into ~/.agents/skills/loop,
           # ~/.config/opencode/agents, and ~/.config/opencode/commands -
           # /loop is now available in every project
```

That's it - no separate install command, no npm publish required. `git pull` in this folder and reopening re-syncs any updates automatically, since the plugin runs on every OpenCode startup.

If you'd rather not run a plugin (or want it project-scoped instead of global), copy the files by hand:

**Global**, without the plugin:

```powershell
# PowerShell
git clone https://github.com/<your-username>/LoopSkill.git "$env:TEMP\loop-skill"
New-Item -ItemType Directory -Force -Path "$env:USERPROFILE\.agents\skills", "$env:USERPROFILE\.config\opencode\agents", "$env:USERPROFILE\.config\opencode\commands" | Out-Null
Copy-Item -Recurse -Force "$env:TEMP\loop-skill\.agents\skills\loop" "$env:USERPROFILE\.agents\skills\loop"
Copy-Item -Force "$env:TEMP\loop-skill\.opencode\agents\loop-*.md" "$env:USERPROFILE\.config\opencode\agents\"
Copy-Item -Force "$env:TEMP\loop-skill\.opencode\commands\loop.md" "$env:USERPROFILE\.config\opencode\commands\"
```

```bash
# bash / macOS / Linux
git clone https://github.com/<your-username>/LoopSkill.git /tmp/loop-skill
mkdir -p ~/.agents/skills ~/.config/opencode/agents ~/.config/opencode/commands
cp -r /tmp/loop-skill/.agents/skills/loop ~/.agents/skills/loop
cp /tmp/loop-skill/.opencode/agents/loop-*.md ~/.config/opencode/agents/
cp /tmp/loop-skill/.opencode/commands/loop.md ~/.config/opencode/commands/
```

**Project-scoped instead** (shared with your team via your own repo): same copy commands, targeting `<your-project>/.agents/skills/loop`, `<your-project>/.opencode/agents/`, and `<your-project>/.opencode/commands/` instead of the global paths.

## Usage

```
/loop "<requirement>"                         # start a new TDD loop for a requirement
/loop "<requirement>" --max 8                 # override iteration cap per loop (default 5)
/loop "<requirement>" --test-cmd "pytest -q"  # skip auto-detection, use this test command
/loop --resume                                # resume the most recent run from .loop/state.md
/loop --status                                # print current .loop/state.md and stop, no action
/loop --help                                  # print usage and stop
```

Run it from inside the project you want `/loop` to work on - not from inside a clone of this repo. It creates a `.loop/` folder there (state, control file, review transcripts); the skill suggests adding it to `.gitignore` on first run.

While a run is active, edit `.loop/control.md` to `PAUSE`, add `GUIDANCE: <text>`, `SET_MAX: <n>`, or `ABORT` - the orchestrator polls it at every phase boundary. Esc always works as a hard interrupt independent of that file.

## Known limitations

- `loop-install.js`'s logic was verified directly with Node (real `fs.cp` against this repo's actual files, into a throwaway fake home directory) and its path math has a runnable check in `compute-targets.test.mjs`. What's *not* verified is OpenCode's real plugin loader itself - the exact factory signature, and whether project-local `.opencode/plugins/*.js` needs a trust/approval step before it runs. No `opencode` binary available here to confirm end-to-end.
- The Pi extension assumes `pi -p ... --session <path>` creates a new session file if the path doesn't already exist. Not independently verified against a real Pi install yet.
- The Pi extension shells out to `pi` on PATH via `pi.exec`. On Windows, npm installs `pi` as a `.cmd` shim; if spawning fails, that resolution is the first thing to check.
- The `package.json` `pi.extensions` path points at `.pi/extensions` (a directory containing one `loop-subagent/index.ts` subfolder). Whether `pi install`'s manifest-driven loading recurses into that subfolder the same way Pi's native project-local `.pi/extensions/*/index.ts` scanning does has not been verified.

## Todos & Critical Points

- Verify end-to-end on a real Pi host: install with `pi install git:github.com/arungadagi/SwLoop` and confirm the `loop_subagent` extension spawns sessions and `pi` session files are created as expected.
- Verify OpenCode plugin behavior on a real OpenCode install: open this repo and confirm `.opencode/plugins/loop-install.js` runs and copies skill/agents/command into the user's global config paths without manual steps.
- Run the full smoke E2E locally (Pi + OpenCode) and exercise the following scenarios:
  - fresh project with no test framework (bootstrap flow), confirm Phase 1 harness sanity check runs and returns actionable errors to the tester when broken.
  - project with existing tests (pytest, jest, go test, etc.), confirm test detection and that orchestrator runs the real suite as ground truth.
  - multi-requirement document decomposition: confirm `.loop/items/<NN>-<slug>/` layout and sequential item processing works.
- Add CI that runs the repo self-checks on push: the two existing tests `strip-frontmatter.test.mjs` and `compute-targets.test.mjs` plus a Node syntax/type check for the Pi extension. This prevents regressions in the install/strip toolchain.
- Consider publishing options: (A) keep repo install-only and document steps (current), (B) publish to npm so OpenCode plugin path can be installed from registry (requires npm publish).
- UX follow-ups (optional): make `--no-decompose` explicit in `/loop` help, support parallel batch processing, and add CI/git-hook integration to fail PRs when loops regress tests.

Critical points / known blockers

- The orchestrator's Phase 1 harness sanity check is implemented in SKILL.md, but must be validated against actual `pi` and `opencode` tool behavior in the wild — otherwise a broken bootstrap could still be misrouted.
- `pi -p --session <path>` behavior on Windows (creation of `.cmd` shims and session files) needs verification; Windows path and `.cmd` execution are common failure modes for Pi extension.
- OpenCode plugin auto-install may be gated by a trust/approval UI or require a specific plugin factory signature that differs between versions — test on real OpenCode to be sure.
- The current implementation uses sequential processing for batch items; parallelism is intentionally skipped for simplicity (ponytail: direct, sequential). Add parallelism only if you need it.
