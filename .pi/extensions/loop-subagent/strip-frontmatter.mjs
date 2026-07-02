// Zero-dependency by design: this is the one piece of parsing logic in the
// loop-subagent extension that doesn't need pi's SDK, so it's split out here
// to stay testable without installing pi itself. See strip-frontmatter.test.mjs.
export function stripFrontmatter(markdown) {
  return markdown.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, "").trim();
}
