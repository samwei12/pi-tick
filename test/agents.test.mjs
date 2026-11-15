import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runJob } from "../extensions/tick/bin/runner.mjs";
import { agentAdapter } from "../extensions/tick/bin/agents/index.mjs";
import { createTick } from "../extensions/tick/bin/commands/add.mjs";

test("Pi and OpenCode share the runner and callback, without model fallback", async () => {
  const dir = mkdtempSync(join(tmpdir(), "tick-agents-"));
  process.env.PI_TICK_DATA_DIR = dir;
  const quiet = { write() {} };
  const callback = join(dir, "callback.mjs");
  writeFileSync(callback, `#!${process.execPath}\nimport { readFileSync, writeFileSync } from 'node:fs';
const r = JSON.parse(readFileSync(0, 'utf8'));
const saved = readFileSync(${JSON.stringify(join(dir, "runs.jsonl"))}, 'utf8');
if (!saved.includes(r.runId)) process.exit(2);
writeFileSync(${JSON.stringify(join(dir, "callback-result.json"))}, JSON.stringify(r));
`, { mode: 0o755 });
  for (const agent of ["pi", "opencode"]) {
    const exe = join(dir, agent);
    const events = agent === "pi"
      ? [{ type: "message_end", message: { role: "assistant", stopReason: "stop", content: [{ type: "text", text: "DONE" }] } }]
      : [{ type: "text", part: { text: "DONE" } }, { type: "step_finish", part: { reason: "stop" } }];
    writeFileSync(exe, `#!${process.execPath}\nimport { writeFileSync } from 'node:fs';
writeFileSync(${JSON.stringify(join(dir, "args.json"))}, JSON.stringify({ args: process.argv.slice(2), cwd: process.cwd(), pwd: process.env.PWD }));
${events.map(e => `console.log(${JSON.stringify(JSON.stringify(e))});`).join("\n")}
`, { mode: 0o755 });
    const job = await createTick({ jobId: agent, prompt: "Create the requested report", cwd: dir,
      agent, model: "magpie/group/tools", onComplete: callback, scheduleKind: "daily", scheduleOpts: { time: "09:00" } }, { stdout: quiet });
    const options = { agentPath: exe, piPath: exe, transcriptsDir: join(dir, "runs"), logsDir: join(dir, "logs"), stderr: quiet };
    mkdirSync(options.logsDir, { recursive: true });
    const r = await runJob(job, "manual", options);
    assert.equal(r.exitCode, 0);
    assert.equal(r.finalTextPreview, "DONE");
    const observed = JSON.parse(readFileSync(join(dir, "args.json"), "utf8"));
    assert.equal(realpathSync(observed.cwd), realpathSync(dir));
    assert.equal(observed.pwd, dir);
    const args = observed.args;
    assert.ok(args.includes("magpie/group/tools"));
    assert.match(args.at(-1), /already authorized unattended/);
    const receipt = JSON.parse(readFileSync(join(dir, "callback-result.json"), "utf8"));
    assert.equal(receipt.agent, agent);
    assert.equal(receipt.model, "magpie/group/tools");

    const failure = agent === "pi"
      ? { type: "message_end", message: { role: "assistant", stopReason: "error", errorMessage: "quota", content: [] } }
      : { type: "error", error: { type: "quota", message: "exhausted" } };
    writeFileSync(exe, `#!${process.execPath}\nconsole.log(${JSON.stringify(JSON.stringify(failure))});\n`, { mode: 0o755 });
    const failed = await runJob(job, "manual", options);
    assert.equal(failed.exitCode, 1);
    assert.equal(failed.reason, "model_error");
    assert.equal(JSON.parse(readFileSync(join(dir, "callback-result.json"))).exitCode, 1);
  }
});

test("unsupported agents and non-Pi slash commands are rejected", () => {
  assert.throws(() => agentAdapter("missing"), /unknown agent/);
  assert.throws(() => agentAdapter("opencode").plan({ prompt: "/tick list" }, {}), /require agent pi/);
});

test("command jobs run a shell line without a model and record exit status", async () => {
  const dir = mkdtempSync(join(tmpdir(), "tick-command-"));
  process.env.PI_TICK_DATA_DIR = dir;
  const quiet = { write() {} };
  const script = join(dir, "watch.sh");
  writeFileSync(script, `#!/bin/sh\necho "checking $1"\necho '{"ok":true,"new":0}'\n`, { mode: 0o755 });
  const job = await createTick({ jobId: "cmd", prompt: `${script} catalog`, cwd: dir, agent: "command",
    scheduleKind: "interval", scheduleOpts: { minutes: "10" } }, { stdout: quiet });
  assert.equal(job.agent, "command");
  const adapter = agentAdapter("command");
  const exe = adapter.resolve(job);
  const options = { agentPath: exe, piPath: exe, transcriptsDir: join(dir, "runs"), logsDir: join(dir, "logs"), stderr: quiet };
  mkdirSync(options.logsDir, { recursive: true });
  const ok = await runJob(job, "manual", options);
  assert.equal(ok.exitCode, 0);
  assert.equal(ok.reason, "exit_code");
  assert.equal(ok.finalTextPreview, '{"ok":true,"new":0}');
  assert.match(readFileSync(ok.transcriptPath, "utf8"), /checking catalog/);

  writeFileSync(script, `#!/bin/sh\necho '{"ok":false,"error":"catalog fetch failed"}'\nexit 2\n`, { mode: 0o755 });
  const failed = await runJob(job, "manual", options);
  assert.equal(failed.exitCode, 2);
  assert.equal(failed.error, '{"ok":false,"error":"catalog fetch failed"}');
  const runs = readFileSync(join(dir, "runs.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
  assert.deepEqual(runs.map((r) => [r.agent, r.model, r.exitCode]), [["command", null, 0], ["command", null, 2]]);
});

test("command jobs reject a model", async () => {
  process.env.PI_TICK_DATA_DIR = mkdtempSync(join(tmpdir(), "tick-command-model-"));
  await assert.rejects(createTick({ jobId: "cmd2", prompt: "/bin/true", cwd: tmpdir(), agent: "command",
    model: "x", scheduleKind: "daily", scheduleOpts: { time: "09:00" } }, { stdout: { write() {} } }), /take no --model/);
});
