import { existsSync } from "node:fs";
import { buildRunArgs as piPlan, createRpcLifecycle } from "./pi.mjs";
import { buildRunArgs as opencodePlan, createLifecycle } from "./opencode.mjs";
import { which, resolvePiPath } from "../bin-resolve.mjs";
const adapters = {
  pi: { id: "pi", plan: piPlan, lifecycle: createRpcLifecycle, resolve: (job) => job.piPath && existsSync(job.piPath) ? job.piPath : resolvePiPath() },
  opencode: { id: "opencode", plan: opencodePlan, lifecycle: createLifecycle, resolve: (job) => job.agentPath && existsSync(job.agentPath) ? job.agentPath : which("opencode") },
};
export function agentAdapter(id = "pi") {
  const adapter = adapters[id];
  if (!adapter) throw new Error(`unknown agent: ${id}; expected pi or opencode`);
  return adapter;
}
