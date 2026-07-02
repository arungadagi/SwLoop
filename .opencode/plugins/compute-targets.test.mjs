// Runnable self-check for compute-targets.mjs.
// Run: node compute-targets.test.mjs
import assert from "node:assert";
import { join, resolve } from "node:path";
import { computeSyncTargets } from "./compute-targets.mjs";

const pluginDir = resolve("/repo/.opencode/plugins");
const home = resolve("/home/user");
const targets = computeSyncTargets(pluginDir, home);

assert.strictEqual(targets.length, 3, "expects three sync targets");

const [skillTarget, agentsTarget, commandTarget] = targets;
assert.strictEqual(skillTarget[0], join(resolve("/repo"), ".agents", "skills", "loop"));
assert.strictEqual(skillTarget[1], join(home, ".agents", "skills", "loop"));
assert.strictEqual(agentsTarget[0], join(resolve("/repo"), ".opencode", "agents"));
assert.strictEqual(agentsTarget[1], join(home, ".config", "opencode", "agents"));
assert.strictEqual(commandTarget[0], join(resolve("/repo"), ".opencode", "commands", "loop.md"));
assert.strictEqual(commandTarget[1], join(home, ".config", "opencode", "commands", "loop.md"));

console.log("compute-targets: all checks passed");
