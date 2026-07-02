// Pi has no built-in sub-agent concept (by design - see pi's "Design Principles"
// docs). This extension is the workaround the /loop skill needs: it registers a
// `loop_subagent` tool that spawns an isolated, non-interactive child `pi -p`
// process per role (tester/developer/reviewer), so each gets its own session
// and context instead of the orchestrator role-playing all three itself.
//
// Role instructions are NOT duplicated here - they're read straight from
// .opencode/agents/loop-<role>.md (the same files OpenCode's Task tool loads
// natively as subagents), so there is exactly one place that defines what each
// role does. This extension only supplies the mechanism Pi is missing.
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { StringEnum } from "@earendil-works/pi-ai";
import { readFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { stripFrontmatter } from "./strip-frontmatter.mjs";

type Role = "tester" | "developer" | "reviewer";

const ROLE_FILES: Record<Role, string> = {
  tester: "loop-tester.md",
  developer: "loop-developer.md",
  reviewer: "loop-reviewer.md",
};

// Pi has no per-role permission system like OpenCode's agent frontmatter
// (permission.edit/bash). --exclude-tools is the closest equivalent, so the
// reviewer's "never edits, never runs shell" rule is enforced here, not just
// requested in its prompt.
const ROLE_EXCLUDED_TOOLS: Partial<Record<Role, string[]>> = {
  reviewer: ["write", "edit", "bash"],
};

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "loop_subagent",
    label: "Loop Subagent",
    description:
      "Spawns an isolated tester/developer/reviewer subagent for the /loop TDD skill, as a " +
      "non-interactive child pi session with that role's own instructions and history. Only " +
      "use this while following the /loop skill's orchestrator steps.",
    promptSnippet: "Spawn a tester/developer/reviewer subagent for the /loop skill",
    promptGuidelines: [
      "Use loop_subagent only while executing the /loop skill's orchestrator phases, never as a general-purpose tool.",
      "Use loop_subagent with resume=true to continue a role's existing session ref from .loop/state.md, resume=false to start that role fresh.",
    ],
    parameters: Type.Object({
      role: StringEnum(["tester", "developer", "reviewer"] as const),
      prompt: Type.String({ description: "Task prompt to send to the subagent" }),
      resume: Type.Boolean({
        description: "true to continue this role's existing /loop session, false to start fresh",
      }),
    }),
    async execute(_toolCallId, params, signal, onUpdate, ctx) {
      const { role, prompt, resume } = params as { role: Role; prompt: string; resume: boolean };

      const roleFilePath = join(ctx.cwd, ".opencode", "agents", ROLE_FILES[role]);
      let roleInstructions: string;
      try {
        roleInstructions = stripFrontmatter(await readFile(roleFilePath, "utf8"));
      } catch {
        throw new Error(
          `Could not read role instructions at ${roleFilePath}. The /loop skill expects ` +
            `.opencode/agents/${ROLE_FILES[role]} to exist alongside this extension.`,
        );
      }

      const sessionDir = join(ctx.cwd, ".loop", "sessions");
      await mkdir(sessionDir, { recursive: true });
      const sessionFile = join(sessionDir, `${role}.jsonl`);

      if (resume && !existsSync(sessionFile)) {
        throw new Error(
          `resume=true for role "${role}" but no prior session exists at ${sessionFile}. ` +
            `Call again with resume=false to start one.`,
        );
      }

      const args = [
        "-p",
        prompt,
        "--append-system-prompt",
        roleInstructions,
        "--session",
        sessionFile,
        "--approve",
      ];
      const excluded = ROLE_EXCLUDED_TOOLS[role];
      if (excluded) args.push("--exclude-tools", excluded.join(","));

      onUpdate?.({ content: [{ type: "text", text: `Running loop-${role} subagent...` }] });

      // ponytail: shells out to the `pi` binary on PATH rather than embedding
      // the SDK - matches pi's own stated design principle for this ("use
      // external tools" for workflows it doesn't build in). On Windows, npm
      // global installs resolve `pi` through a .cmd shim; if pi.exec can't
      // find it directly, that's the first thing to check.
      const result = await pi.exec("pi", args, { signal });

      if (result.code !== 0) {
        throw new Error(
          `loop-${role} subagent exited with code ${result.code}.\n${result.stderr || result.stdout}`,
        );
      }

      return {
        content: [{ type: "text", text: result.stdout.trim() }],
        details: { role, sessionFile, exitCode: result.code },
      };
    },
  });

  // Pi's own docs note that plain "/loop ..." text isn't always reliably
  // recognized as "go read the loop SKILL.md" - only the literal /skill:name
  // syntax deterministically forces that. Registering a real /loop command
  // that forwards into /skill:loop (same pattern pi-coding-agent's own
  // ponytail package uses for its skills) makes invocation reliable instead
  // of hoping the model infers it.
  pi.registerCommand("loop", {
    description: "Start or resume a /loop TDD run for a requirement",
    handler: (args, ctx) => {
      const message = args?.trim() ? `/skill:loop ${args.trim()}` : "/skill:loop";
      if (ctx?.isIdle?.() === false) {
        pi.sendUserMessage(message, { deliverAs: "followUp" });
        ctx?.ui?.notify?.("/loop queued as a follow-up.", "info");
        return;
      }
      pi.sendUserMessage(message);
    },
  });
}
