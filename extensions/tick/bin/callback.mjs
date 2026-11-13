import { spawn } from "node:child_process";
import { openSync, closeSync, appendFileSync } from "node:fs";

// One optional executable receives the saved record on stdin. Callback errors
// are logged separately and never retry the task or change its exit status.
export async function runCallback(job, record, { stderr = process.stderr } = {}) {
  if (!job.onComplete) return;
  if (!record.transcriptPath) {
    stderr.write("pi-tick: callback skipped: transcript directory unavailable\n");
    return;
  }
  const logPath = `${record.transcriptPath}.callback.log`;
  let fd;
  try { fd = openSync(logPath, "a", 0o600); }
  catch (err) { stderr.write(`pi-tick: callback log: ${err.message}\n`); return; }
  await new Promise((resolve) => {
    let child;
    try {
      child = spawn(job.onComplete, [], { cwd: job.cwd, detached: true, stdio: ["pipe", fd, fd] });
    } catch (err) {
      closeSync(fd); stderr.write(`pi-tick: callback: ${err.message}\n`); resolve(); return;
    }
    closeSync(fd);
    let finished = false;
    const finish = (status) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      try { appendFileSync(logPath, `\ncallback: ${status}\n`); } catch {}
      resolve();
    };
    const timer = setTimeout(() => {
      try { process.kill(-child.pid, "SIGKILL"); } catch {}
      finish("timeout");
    }, 30_000);
    child.stdin.on("error", () => {});
    child.on("error", (err) => finish(err.message));
    child.on("exit", (code, signal) => finish(signal || `exit ${code}`));
    child.stdin.end(JSON.stringify(record) + "\n");
  });
}
