import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { prettyPrintTranscript } from "../extensions/tick/bin/transcript-view.mjs";
import { cmdShow } from "../extensions/tick/bin/commands/show.mjs";
import { ensureDataDirs, saveCatalog } from "../extensions/tick/bin/catalog.mjs";
import { transcriptsDir } from "../extensions/tick/bin/paths.mjs";

test("Codex items render as thinking, tool calls and final text", () => {
  const view = prettyPrintTranscript([
    { type: "item.completed", item: { type: "reasoning", text: "思考" } },
    { type: "item.completed", item: { type: "command_execution", command: "printf OK", aggregated_output: "OK" } },
    { type: "item.completed", item: { type: "file_change", changes: [{ path: "notes/a.md" }] } },
    { type: "item.completed", item: { type: "agent_message", text: "任务完成" } },
    { type: "turn.completed", usage: { input_tokens: 10, output_tokens: 3 } },
  ]);
  assert.match(view, /思考/);
  assert.match(view, /→ shell: \{"command":"printf OK"\}/);
  assert.match(view, /^    OK$/m);
  assert.match(view, /file_change.*notes\/a\.md/);
  assert.match(view, /任务完成/);
});

test("OpenCode text and completed tools stay readable without message_end", () => {
  const view = prettyPrintTranscript([
    { type: "tool_use", part: { tool: "shell", state: { status: "completed", input: { command: "printf OK" }, output: "OK" } } },
    { type: "text", part: { text: "任务完成" } },
    { type: "step_finish", part: { reason: "stop" } },
  ]);
  assert.match(view, /shell/);
  assert.match(view, /任务完成/);
});

test("show --tail counts codex and OpenCode turns, not raw events", () => {
  process.env.PI_TICK_DATA_DIR = mkdtempSync(join(tmpdir(), "tick-view-"));
  ensureDataDirs();
  saveCatalog({ version: 1, jobs: [{
    id: "tail", prompt: "p", cwd: "/tmp", schedule: { kind: "daily", value: { time: "09:00" } },
    enabled: false, model: null, agent: "codex", createdAt: "x", updatedAt: "x", lastRun: null,
  }] });
  const dir = join(transcriptsDir(), "tail");
  const file = join(dir, "2026-11-17T00-00-00-000Z_abcd1234.jsonl");
  const events = [
    { type: "item.completed", item: { type: "agent_message", text: "first" } },
    { type: "turn.completed", usage: { input_tokens: 1, output_tokens: 1 } },
    { type: "item.completed", item: { type: "agent_message", text: "second" } },
    { type: "turn.completed", usage: { input_tokens: 1, output_tokens: 1 } },
  ];
  mkdirSync(dir, { recursive: true });
  writeFileSync(file, events.map((e) => JSON.stringify(e)).join("\n") + "\n");

  let out = "";
  const stdout = { write: (s) => { out += s; return true; } };
  cmdShow(["tail", "--tail", "1", "--no-meta"], { stdout, stderr: { write() {} } });
  assert.match(out, /second/);
  assert.doesNotMatch(out, /first/);
});
