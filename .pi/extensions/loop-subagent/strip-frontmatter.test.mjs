// Runnable self-check for strip-frontmatter.mjs - the one non-trivial parser
// in the loop-subagent extension. Run: node strip-frontmatter.test.mjs
import assert from "node:assert";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { stripFrontmatter } from "./strip-frontmatter.mjs";

// 1. Real shipped role file: frontmatter must be fully removed, body kept.
const reviewerPath = join(import.meta.dirname, "..", "..", "..", ".opencode", "agents", "loop-reviewer.md");
const raw = await readFile(reviewerPath, "utf8");
const stripped = stripFrontmatter(raw);
assert.ok(!stripped.startsWith("---"), "leading frontmatter fence should be removed");
assert.ok(!stripped.includes("mode: subagent"), "frontmatter body should be removed");
assert.ok(stripped.startsWith("You are the reviewer"), "role body content should remain intact");

// 2. No frontmatter present: input returned unchanged (aside from trim).
const plain = "Just a plain instruction body.\nSecond line.";
assert.strictEqual(stripFrontmatter(plain), plain);

// 3. Frontmatter-looking text that never closes: left alone rather than
//    swallowing the whole file (regex requires a closing `---` fence).
const unclosed = "---\nname: x\nno closing fence here";
assert.strictEqual(stripFrontmatter(unclosed), unclosed);

console.log("strip-frontmatter: all checks passed");
