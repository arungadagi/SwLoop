// Pure, zero-dependency path logic for the loop-install plugin - kept separate
// from loop-install.js (which needs OpenCode's plugin context) so it stays
// testable without that runtime. See compute-targets.test.mjs.
import { join } from "node:path";

// pluginDir: the directory this plugin file lives in (.opencode/plugins).
// home: the user's home directory.
// Returns [from, to] pairs to sync from the repo into the user's global
// OpenCode config.
export function computeSyncTargets(pluginDir, home) {
  const repoRoot = join(pluginDir, "..", "..");
  return [
    [join(repoRoot, ".agents", "skills", "loop"), join(home, ".agents", "skills", "loop")],
    [join(repoRoot, ".opencode", "agents"), join(home, ".config", "opencode", "agents")],
    [join(repoRoot, ".opencode", "commands", "loop.md"), join(home, ".config", "opencode", "commands", "loop.md")],
  ];
}
