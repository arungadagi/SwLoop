# Todo List

## High Priority

- [ ] Verify end-to-end on a real Pi host and confirm `loop_subagent` session creation.
- [ ] Verify OpenCode plugin auto-install on a real OpenCode install.
- [ ] Run smoke E2E for bootstrap, existing-test, and multi-requirement flows.

## Medium Priority

- [ ] Add CI for repo self-checks and Pi extension syntax check.

## Low Priority

- [ ] Decide on publishing path: repo install-only vs npm publish.

## Critical Points

- Phase 1 harness sanity check must be validated against real `pi` and `opencode` behavior.
- `pi -p --session <path>` on Windows needs verification.
- OpenCode plugin auto-install may require trust/approval or a different factory signature.
- Batch processing is sequential by design; add parallelism only if needed.
