#!/usr/bin/env node
/**
 * design/qa/run-all.mjs — one command to rerun the whole QA suite.
 *
 *   node design/qa/run-all.mjs                # build + link + CDP + game tests
 *   node design/qa/run-all.mjs --no-build     # audit the current output
 *   node design/qa/run-all.mjs --shots        # also refresh design/shots/*.png
 *   node design/qa/run-all.mjs --port 8083    # use another port (starts a server if needed)
 *
 * It starts `python -m http.server` itself when nothing answers on the port,
 * runs every check, prints a summary and exits non-zero if anything failed.
 * Machine-readable results land in design/qa/results/*.json.
 */
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = path.join(ROOT, 'design', 'qa', 'results');
const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const arg = (name, fallback) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};
const PORT = Number(arg('--port', '8081'));
const BASE = `http://127.0.0.1:${PORT}`;
const NO_BUILD = has('--no-build');
const WITH_SHOTS = has('--shots');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let serverChild = null;
const steps = [];

function run(label, cmd, cmdArgs, opts = {}) {
  const t0 = Date.now();
  const r = spawnSync(cmd, cmdArgs, { cwd: ROOT, encoding: 'utf8', timeout: opts.timeout || 300000, env: { ...process.env } });
  const output = ((r.stdout || '') + (r.stderr || '')).trim();
  const step = { label, ok: r.status === 0, seconds: Math.round((Date.now() - t0) / 100) / 10, output };
  steps.push(step);
  return step;
}

async function ensureServer() {
  for (let i = 0; i < 3; i++) {
    try {
      const res = await fetch(BASE + '/index.html');
      const html = await res.text();
      if (res.ok && html.includes('Amuda')) return 'reused';
    } catch (e) {}
    await sleep(200);
  }
  serverChild = spawn('python', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1', '--directory', ROOT], {
    cwd: ROOT,
    stdio: 'ignore',
    windowsHide: true,
  });
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(BASE + '/index.html');
      if (res.ok) return 'started';
    } catch (e) {}
    await sleep(250);
  }
  throw new Error(`could not start a static server on ${BASE}`);
}

function readJson(p) {
  try {
    return JSON.parse(fs.readFileSync(path.join(OUT, p), 'utf8'));
  } catch (e) {
    return null;
  }
}

function summarize(step) {
  const lines = step.output.split(/\r?\n/).filter((l) => /^(FAIL|WARN|OK|==|FAILED|ok |✔|✖|ℹ (tests|pass|fail))/.test(l.trim()));
  return lines.slice(-6).join('\n');
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  console.log(`\n# QA suite — ${ROOT}`);
  console.log(`# static server: ${BASE}\n`);

  let serverMode = '';
  try {
    serverMode = await ensureServer();
    console.log(`server: ${serverMode} (${BASE})\n`);
  } catch (e) {
    console.error('FAILED to prepare server:', e.message);
    process.exit(2);
  }

  // 1) build + static checks
  run('build-check', process.execPath, [path.join('design', 'qa', 'build-check.mjs'), ...(NO_BUILD ? ['--no-build'] : [])], { timeout: 180000 });

  // 2) link integrity
  run('link-check', process.execPath, [path.join('design', 'qa', 'link-check.mjs')], { timeout: 120000 });

  // 3) games logic tests (glob is expanded by node itself)
  run('games-tests', process.execPath, ['--test', 'games/_tests/*.test.mjs'], { timeout: 120000 });

  // 4) real-browser audit
  const cdp = run('cdp-audit', process.execPath, [path.join('design', 'qa', 'cdp-audit.mjs'), '--base', BASE], { timeout: 600000 });

  // 5) optional screenshots
  if (WITH_SHOTS) run('screenshots', process.execPath, ['tools/shots.mjs', '--base', BASE], { timeout: 300000 });

  /* ------------------------------------------------------------- report */
  const build = readJson('build-check.json');
  const link = readJson('link-check.json');
  const audit = readJson('cdp-audit.json');
  const count = (arr, lvl) => (arr || []).filter((i) => i.level === lvl).length;

  console.log('\n================ QA SUMMARY ================');
  for (const s of steps) console.log(`${s.ok ? 'PASS' : 'FAIL'}  ${s.label.padEnd(12)} ${String(s.seconds + 's').padStart(7)}`);
  console.log('--------------------------------------------');
  if (build) console.log(`build-check : FAIL ${count(build.issues, 'fail')}  WARN ${count(build.issues, 'warn')}  pages ${build.pages}`);
  if (link) console.log(`link-check  : FAIL ${count(link.issues, 'fail')}  WARN ${count(link.issues, 'warn')}  internal ${link.internal} external ${link.external}`);
  if (audit) {
    const fails = (audit.issues || []).filter((i) => i.level === 'fail');
    const warns = (audit.issues || []).filter((i) => i.level === 'warn');
    console.log(`cdp-audit   : FAIL ${fails.length}  WARN ${warns.length}  page-visits ${audit.pages.length}`);
    if (fails.length) {
      const uniq = [...new Map(fails.map((f) => [f.page + f.code + f.message.slice(0, 60), f])).values()];
      for (const f of uniq.slice(0, 15)) console.log(`  FAIL [${f.page}] ${f.code}: ${f.message}`);
    }
  }
  console.log('============================================');
  const failed = steps.filter((s) => !s.ok);
  if (failed.length) {
    for (const s of failed) console.log(`\n--- ${s.label} (last lines) ---\n${summarize(s)}`);
  }
  console.log(failed.length ? '\nQA: FAILED' : '\nQA: ALL CHECKS PASSED');
  if (serverChild) {
    try {
      serverChild.kill();
    } catch (e) {}
  }
  process.exit(failed.length ? 1 : 0);
})();
