import { scheduledPrompt } from "./prompt.mjs";

// Model ids reach codex as `-m`, so they must be what codex resolves itself:
// `model` or `provider/model`. Callers that route through their own gateway
// often write `gateway/provider/model#effort`; the leading gateway segment is
// dropped. Reasoning effort is a codex config override
// (`model_reasoning_effort`), never part of the id.
export function parseModel(spec) {
  if (!spec) return { model: null, effort: null };
  const hash = spec.lastIndexOf("#");
  const rawModel = hash === -1 ? spec : spec.slice(0, hash);
  const effort = hash === -1 ? null : spec.slice(hash + 1) || null;
  const segments = rawModel.split("/");
  const model = segments.length > 2 ? segments.slice(1).join("/") : rawModel;
  return { model, effort };
}

// ─── Phase: spawn plan ──────────────────────────────────────────────────
// `codex exec` is the non-interactive entry point. --ephemeral keeps scheduled
// runs out of the session store (the codex analogue of pi's --no-session);
// --skip-git-repo-check lets a job run in a directory that is not a checkout,
// and --color never keeps ANSI escapes out of the transcript.
export function buildRunArgs(job, { defaultModel }) {
  if (job.prompt.trimStart().startsWith("/")) throw new Error("slash commands require agent pi");
  const effectiveModel = job.model ?? defaultModel ?? null;
  const { model, effort } = parseModel(effectiveModel);
  const args = ["exec", "--json", "--ephemeral", "--skip-git-repo-check", "--color", "never"];
  if (model) args.push("-m", model);
  if (effort) args.push("-c", `model_reasoning_effort="${effort}"`);
  args.push(scheduledPrompt(job));
  return { args, effectiveModel, isSlashCommand: false };
}

export function createLifecycle() {
  const tracker = createCodexOutcomeTracker();
  return {
    writePrompt() {},
    clear() {},
    handleLine(line) { try { tracker.observe(JSON.parse(line)); } catch {} },
    getFinalText: tracker.finalText,
    getLastUsage: tracker.usage,
    getFinalError: tracker.error,
  };
}

// ─── Phase: outcome tracking ────────────────────────────────────────────
// `codex exec --json` emits one JSON object per line: `item.completed` for
// finished reasoning / messages / tool calls, `turn.completed` with usage, and
// `error` / `turn.failed` for failures. The LAST assistant message decides the
// run's final text, matching the pi and opencode adapters.
export function createCodexOutcomeTracker() {
  let lastError = null;
  let completed = false;
  let finalText = null;
  const tokens = { input: 0, output: 0 };
  let hasUsage = false;
  return {
    observe(event) {
      if (!event || typeof event.type !== "string") return;
      if (event.type === "item.completed") {
        const item = event.item || {};
        if (item.type === "agent_message" && typeof item.text === "string") {
          const text = item.text.trim();
          if (text.length > 0) finalText = text;
        }
        if (item.type === "error" && item.message) {
          lastError = String(item.message);
          finalText = null;
        }
        return;
      }
      if (event.type === "turn.completed") {
        completed = true;
        const usage = event.usage || {};
        if (typeof usage.input_tokens === "number" || typeof usage.output_tokens === "number") {
          hasUsage = true;
          tokens.input += usage.input_tokens || 0;
          tokens.output += usage.output_tokens || 0;
        }
        return;
      }
      if (event.type === "turn.failed" || event.type === "error") {
        const message = event.error?.message || event.message || event.error?.type || "Codex error";
        lastError = String(message);
        finalText = null;
      }
    },
    error() {
      if (lastError) return String(lastError).slice(0, 200);
      if (!completed) return "Codex exited without a completed turn";
      if (!finalText) return "Codex completed without an assistant message";
      return null;
    },
    finalText: () => finalText,
    usage: () => (hasUsage ? tokens : null),
  };
}
