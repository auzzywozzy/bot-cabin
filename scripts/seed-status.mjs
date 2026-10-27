// Runs before `npm run dev`. Creates sample status files (public/status/<agent>.json) for any agent
// that does not have one yet, so the office shows people at work on a fresh clone.
// These files are git-ignored. Update them with ./scripts/set-status.sh.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AGENTS } from '../src/agents.config.js';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'status');
fs.mkdirSync(dir, { recursive: true });
const SAMPLE = ['working', 'meeting', 'break', 'idle'];
const TASKS = ['Sample task: tidying the backlog', 'Sample task: weekly sync', 'Sample task: coffee', ''];
AGENTS.forEach((a, i) => {
  const f = path.join(dir, `${a.id}.json`);
  // keep real updates; refresh our own sample files so they do not look stale
  if (fs.existsSync(f) && !/Sample task|"task":""/.test(fs.readFileSync(f, 'utf8'))) return;
  const k = i % SAMPLE.length;
  fs.writeFileSync(f, JSON.stringify({ agent: a.id, state: SAMPLE[k], task: TASKS[k], updated: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z') }) + '\n');
});
