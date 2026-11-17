import { existsSync } from "node:fs";
import { buildRunArgs as piPlan, createRpcLifecycle } from "./pi.mjs";
import { buildRunArgs as opencodePlan, createLifecycle } from "./opencode.mjs";
import { buildRunArgs as commandPlan, createLifecycle as commandLifecycle, COMMAND_SHELL } from "./command.mjs";
import { buildRunArgs as codexPlan, createLifecycle as createCodexLifecycle } from "./codex.mjs";
import { which, resolvePiPath } from "../bin-resolve.mjs";
const adapters = {
  pi: { id: "pi", plan: piPlan, lifecycle: createRpcLifecycle, resolve: (job) => job.piPath && existsSync(job.piPath) ? job.piPath : resolvePiPath() },
  opencode: { id: "opencode", plan: opencodePlan, lifecycle: createLifecycle, resolve: (job) => job.agentPath && existsSync(job.agentPath) ? job.agentPath : which("opencode") },
  command: { id: "command", plan: commandPlan, lifecycle: commandLifecycle, resolve: () => COMMAND_SHELL },
  codex: { id: "codex", plan: codexPlan, lifecycle: createCodexLifecycle, resolve: (job) => job.agentPath && existsSync(job.agentPath) ? job.agentPath : which("codex") },
};
export function agentAdapter(id = "pi") {
  const adapter = adapters[id];
  if (!adapter) throw new Error(`unknown agent: ${id}; expected pi, opencode, command or codex`);
  return adapter;
}
