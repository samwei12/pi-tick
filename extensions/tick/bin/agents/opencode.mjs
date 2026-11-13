import { scheduledPrompt } from "./prompt.mjs";
export function buildRunArgs(job, { defaultModel }) {
  if (job.prompt.trimStart().startsWith("/")) throw new Error("slash commands require agent pi");
  const effectiveModel = job.model ?? defaultModel ?? null;
  const args = ["run", "--standalone", "--auto", "--archived", "--format", "json"];
  if (effectiveModel) args.push("-m", effectiveModel);
  args.push(scheduledPrompt(job));
  return { args, effectiveModel, isSlashCommand: false };
}
export function createLifecycle() {
  const tracker = createOpencodeOutcomeTracker();
  return {
    writePrompt() {}, clear() {},
    handleLine(line) { try { tracker.observe(JSON.parse(line)); } catch {} },
    getFinalText: tracker.finalText, getLastUsage: tracker.usage, getFinalError: tracker.error,
  };
}

export function createOpencodeOutcomeTracker() {
  let lastError = null;
  let lastFinish = null;
  let stepTexts = [];
  let finalText = null;
  const tokens = { input: 0, output: 0 };
  return {
    observe(event) {
      const part = event?.part || {};
      if (event?.type === 'step_start') stepTexts = [];
      if (event?.type === 'text' && typeof part.text === 'string') {
        stepTexts.push(part.text);
        const joined = stepTexts.join('\n').trim();
        finalText = joined.length > 0 ? joined : finalText;
      }
      if (event?.type === 'step_finish') {
        lastFinish = part.reason || 'unknown';
        tokens.input += part.tokens?.input || 0;
        tokens.output += part.tokens?.output || 0;
        if (lastFinish === 'stop') lastError = null;
      }
      if (event?.type === 'error') {
        const e = event.error || {};
        lastError = [e.type, e.message].filter(Boolean).join(': ') || 'OpenCode error';
        finalText = null;
      }
    },
    error() {
      if (lastError) return String(lastError).slice(0, 200);
      if (!lastFinish) return 'OpenCode exited without an assistant result';
      if (lastFinish !== 'stop') return `OpenCode exited before the turn completed (${lastFinish})`;
      return null;
    },
    finalText: () => finalText,
    usage: () => (lastFinish ? tokens : null),
  };
}
