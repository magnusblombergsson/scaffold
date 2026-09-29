#!/usr/bin/env node
// Throwaway probe for "Hands-on test: sync clients vs rename-over saves and conflicts" (#22).
// Exercises the save pattern from the safe-writes research inside a synced folder and
// records what the sync client does. No dependencies; Node 20+.
//
//   node sync-probe.mjs setup    <probe-dir>
//   node sync-probe.mjs save     <probe-dir> <file> <label>     temp + fsync + rename-over
//   node sync-probe.mjs append   <probe-dir> <file> <label>     in-place append (JSONL logs)
//   node sync-probe.mjs burst    <probe-dir> <count> <ms>       rename-over a 20 MB file repeatedly
//   node sync-probe.mjs watch    <probe-dir> <seconds> <label>  log fs.watch events
//   node sync-probe.mjs snapshot <probe-dir> <label>            list files with ids, blocks, hashes
//
// Reports go to <probe-dir>/_reports/<host>-<label>.json so they sync back to the other machine.

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HOST = os.hostname();
const SKIP = new Set(['_reports', '_tool']);
const [cmd, dir, ...rest] = process.argv.slice(2);
if (!cmd || !dir) { console.error('usage: see header of sync-probe.mjs'); process.exit(2); }

const now = () => new Date().toISOString();
const line = (label) => `${HOST} ${label} ${now()}\n`;

async function report(label, data) {
  const out = path.join(dir, '_reports', `${HOST}-${label}.json`);
  await fsp.mkdir(path.dirname(out), { recursive: true });
  await fsp.writeFile(out, JSON.stringify({ host: HOST, label, at: now(), ...data }, null, 2));
  console.log(`report: ${out}`);
}

async function stat(p) {
  try {
    const s = await fsp.stat(p, { bigint: true });
    return { ino: s.ino.toString(), size: Number(s.size), blocks: Number(s.blocks), mtime: new Date(Number(s.mtimeMs)).toISOString() };
  } catch (e) { return { error: e.code }; }
}

async function renameWithRetry(from, to) {
  const start = Date.now();
  for (let attempt = 1; ; attempt++) {
    try { await fsp.rename(from, to); return attempt; }
    catch (e) {
      if (!['EPERM', 'EBUSY', 'EACCES'].includes(e.code) || Date.now() - start > 60_000) throw e;
      await new Promise((r) => setTimeout(r, Math.min(attempt * 10, 100)));
    }
  }
}

// The save pattern under test: same-dir temp with a .tmp suffix, fsync, rename over the target.
async function atomicSave(target, content) {
  const tmp = path.join(path.dirname(target), `.${path.basename(target)}.${crypto.randomBytes(4).toString('hex')}.tmp`);
  const fh = await fsp.open(tmp, 'w');
  try { await fh.writeFile(content); await fh.sync(); } finally { await fh.close(); }
  return renameWithRetry(tmp, target);
}

// Windows attributes Node cannot see: O = offline (online-only placeholder), P/U = pinned/unpinned.
function attribs(root) {
  if (process.platform !== 'win32') return {};
  const out = execFileSync('attrib', ['/s', path.join(root, '*')], { encoding: 'latin1' });
  const map = {};
  for (const l of out.split(/\r?\n/)) if (l.trim()) map[path.relative(root, l.slice(21).trim())] = l.slice(0, 21).replace(/\s+/g, '');
  return map;
}

async function walk(root, rel = '') {
  const found = [];
  for (const d of await fsp.readdir(path.join(root, rel), { withFileTypes: true })) {
    const r = path.join(rel, d.name);
    if (SKIP.has(d.name) && !rel) continue;
    if (d.isDirectory()) found.push(...await walk(root, r)); else found.push(r);
  }
  return found;
}

switch (cmd) {
  case 'setup': {
    await fsp.mkdir(path.join(dir, 'scenes'), { recursive: true });
    await fsp.mkdir(path.join(dir, 'conversations'), { recursive: true });
    await fsp.mkdir(path.join(dir, '_tool'), { recursive: true });
    await fsp.copyFile(fileURLToPath(import.meta.url), path.join(dir, '_tool', 'sync-probe.mjs'));
    await atomicSave(path.join(dir, 'project.json'), JSON.stringify({ probe: true, by: HOST, at: now() }, null, 2));
    await atomicSave(path.join(dir, 'scenes', 'scene.md'), line('setup'));
    await fsp.writeFile(path.join(dir, 'conversations', 'conv.jsonl'), JSON.stringify({ by: HOST, label: 'setup', at: now() }) + '\n');
    console.log(`probe folder ready: ${dir}`);
    break;
  }
  case 'save': {
    const [file, label] = rest;
    const target = path.join(dir, file);
    const before = await stat(target);
    const attempts = await atomicSave(target, line(label));
    const after = await stat(target);
    console.log({ file, before, after, renameAttempts: attempts });
    await report(`save-${label}`, { file, before, after, renameAttempts: attempts });
    break;
  }
  case 'append': {
    const [file, label] = rest;
    const target = path.join(dir, file);
    const before = await stat(target);
    await fsp.appendFile(target, JSON.stringify({ by: HOST, label, at: now() }) + '\n');
    const after = await stat(target);
    console.log({ file, before, after });
    await report(`append-${label}`, { file, before, after });
    break;
  }
  case 'burst': {
    const [count = '20', ms = '500'] = rest;
    const target = path.join(dir, 'scenes', 'big.md');
    const pad = 'lorem ipsum '.repeat(20 * 1024 * 1024 / 12);
    const saves = [];
    for (let i = 1; i <= Number(count); i++) {
      const head = line(`burst-${i}`);
      const attempts = await atomicSave(target, head + pad);
      saves.push({ i, head: head.trim(), attempts, at: now() });
      process.stdout.write(`save ${i}/${count} (rename attempts ${attempts})\n`);
      await new Promise((r) => setTimeout(r, Number(ms)));
    }
    await report('burst', { saves, final: saves.at(-1).head });
    break;
  }
  case 'watch': {
    const [seconds = '120', label = 'watch'] = rest;
    const events = [];
    const w = fs.watch(dir, { recursive: true }, (type, name) => {
      if (name && SKIP.has(name.split(path.sep)[0])) return;
      events.push({ at: now(), type, name });
      console.log(now(), type, name);
    });
    console.log(`watching ${dir} for ${seconds}s…`);
    await new Promise((r) => setTimeout(r, Number(seconds) * 1000));
    w.close();
    await report(`watch-${label}`, { events });
    break;
  }
  case 'snapshot': {
    const [label = 'snapshot'] = rest;
    const attr = attribs(dir);
    const files = [];
    for (const rel of await walk(dir)) {
      const p = path.join(dir, rel);
      const s = await stat(p); // before reading, so a placeholder still shows blocks: 0
      let head = null, sha = null;
      if (!rel.endsWith('.tmp')) {
        const buf = await fsp.readFile(p);
        sha = crypto.createHash('sha256').update(buf).digest('hex').slice(0, 12);
        head = buf.subarray(0, 200).toString('utf8').split('\n').filter(Boolean).slice(0, 3);
      }
      files.push({ rel, attrib: attr[rel] ?? null, ...s, sha, head });
    }
    console.table(files.map(({ rel, attrib, ino, size, blocks, sha }) => ({ rel, attrib, ino, size, blocks, sha })));
    await report(`snapshot-${label}`, { files });
    break;
  }
  default:
    console.error(`unknown command: ${cmd}`); process.exit(2);
}
