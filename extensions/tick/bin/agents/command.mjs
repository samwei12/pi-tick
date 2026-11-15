// Command jobs: run the job's prompt as a /bin/sh command line, no model.
// Exit code decides success; the last non-empty stdout line becomes the
// run's final text (finalTextPreview), so a script can print a one-line
// JSON or text summary. stdout and stderr go to the transcript verbatim.
export const COMMAND_SHELL = "/bin/sh";

export function buildRunArgs(job) {
  return { args: ["-c", String(job.prompt)], effectiveModel: null, isSlashCommand: false };
}

export function createLifecycle() {
  let last = null;
  return {
    writePrompt() {}, clear() {},
    handleLine(line) { const t = String(line).trim(); if (t) last = t.slice(0, 2000); },
    getFinalText: () => last,
    getLastUsage: () => null,
    getFinalError: () => null,
  };
}
