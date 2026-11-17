# pi-tick (personal fork)

`CLAUDE.md` is a symlink to this file; edit only `AGENTS.md`. This repository is public: keep
personal paths, job prompts and host details out of commits.

## What runs is the installed copy, not this checkout

`node scripts/install.mjs` copies `extensions/tick/bin/` into the data dir
(`~/.pi/agent/tick`, or `PI_TICK_DATA_DIR`) and points `~/.local/bin/pi-tick` at it. launchd
and cron start that copy, so a source change does nothing until it is installed.

- After changing anything under `extensions/tick/bin/`, run the tests below, then
  `node scripts/install.mjs`. It refuses while a job is running; wait and retry, never kill
  the run. Installing keeps `jobs.json`, run history and transcripts.
- Never edit the `.mjs` files in the data dir; the next install overwrites them.
- A new `--agent` or flag counts as done only after a real `pi-tick run <id> --manual` with
  the installed CLI (a throwaway job, deleted afterwards) shows a successful run in `pi-tick log`.

## Tests

- `npm test`: core suite (runs in a temp `HOME`, does not touch real jobs).
- `npm run test:agents`: agent adapters and transcript rendering; run after touching
  `bin/agents/` or `transcript-view.mjs`.
- `npm run test:macos`: real launchd integration, only when changing the launchd backend.

## Scope of the fork

Keep the diff from upstream small: adapters live in `extensions/tick/bin/agents/<agent>.mjs`
(command args, executable lookup, event parsing); the runner owns process lifetime and
storage. Scheduling, timeouts, history and retention stay upstream's. No model retry,
fallback or notification logic here; that belongs to the caller. Update README's fork
section when adding an agent or flag. Upstream merges: see README.

## Jobs are data, not source

Change jobs only through the CLI (`add`, `enable`, `disable`, `delete`); back up `jobs.json`
first. pi-tick rewrites `jobs.json` atomically and on every run, so do not replace it with a
symlink.
