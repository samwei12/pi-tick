#!/usr/bin/env node
import { mkdirSync, lstatSync, symlinkSync, unlinkSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { dataDir, stableCliPath } from "../extensions/tick/bin/paths.mjs";
import { getActiveRun } from "../extensions/tick/bin/run-registry.mjs";

const active = join(dataDir(), "active");
let entries = [];
try { entries = readdirSync(active); } catch (err) { if (err.code !== "ENOENT") throw err; }
for (const file of entries) {
  if (file.endsWith(".json") && getActiveRun(file.slice(0, -5))) {
    throw new Error(`Wait for active job ${file.slice(0, -5)} before installing`);
  }
}
const binDir = process.env.PI_TICK_BIN_DIR || join(homedir(), ".local", "bin");
mkdirSync(binDir, { recursive: true });
const link = join(binDir, "pi-tick");
let existing;
try { existing = lstatSync(link); } catch (err) { if (err.code !== "ENOENT") throw err; }
if (existing && !existing.isSymbolicLink()) throw new Error(`Refusing to replace non-symlink ${link}`);
await import("./sync-cli.mjs");
if (existing) unlinkSync(link);
symlinkSync(stableCliPath(), link);
console.log(`Installed ${link}; add ${binDir} to PATH if needed.`);
