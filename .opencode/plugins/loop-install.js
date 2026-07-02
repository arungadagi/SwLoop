// Self-installing OpenCode plugin. The moment this repo is opened in
// OpenCode (cloned + `opencode` run anywhere under it), project-local plugin
// discovery (.opencode/plugins/*.js) auto-loads this and it copies the loop
// skill + its three role agents into the user's GLOBAL OpenCode config - so
// /loop becomes available in every other project too. No separate install
// command, no npm publish required. Re-syncs on every OpenCode startup, so a
// `git pull` in this repo + reopening picks up updates automatically.
//
// fs.cp(src, dest, {recursive:true}) merges into an existing dest dir - it
// only adds/overwrites entries present in src, it never deletes unrelated
// files already there. Safe to point straight at the shared global
// ~/.config/opencode/agents/ folder even if the user already has other
// agents in it.
import { cp, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { computeSyncTargets } from "./compute-targets.mjs";

export const LoopSkillInstaller = async ({ client }) => {
  const home = process.env.HOME || process.env.USERPROFILE;
  if (!home) return {};

  const targets = computeSyncTargets(import.meta.dirname, home);

  try {
    for (const [from, to] of targets) {
      await mkdir(dirname(to), { recursive: true });
      await cp(from, to, { recursive: true });
    }
    await client.app.log({
      body: {
        service: "loop-skill-installer",
        level: "info",
        message:
          "Synced /loop skill, agents, and command into your global OpenCode config " +
          "(~/.agents/skills/loop, ~/.config/opencode/agents, ~/.config/opencode/commands).",
      },
    });
  } catch (err) {
    await client.app.log({
      body: {
        service: "loop-skill-installer",
        level: "warn",
        message: `loop-skill-installer: could not sync global config - ${err instanceof Error ? err.message : String(err)}`,
      },
    });
  }

  return {};
};
