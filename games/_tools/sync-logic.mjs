/**
 * 把每个游戏的 logic.mjs（ES module）同步生成一份 logic.classic.js（经典脚本）。
 *
 * 为什么需要两份？
 * - logic.mjs 给 node --test 用（ES module 可以 import，规则可测）。
 * - 页面必须能用普通 <script> 加载（headless / file:// 下 type="module" 受限），
 *   所以生成 UMD 风格的 logic.classic.js，把导出挂到 window.GameLogic。
 *
 * 用法：
 *   node games/_tools/sync-logic.mjs          # 重新生成全部 logic.classic.js
 *   node games/_tools/sync-logic.mjs --check  # 只校验是否已同步（CI / 测试用）
 *
 * games/_tests/sync.test.mjs 会调用 transform() 校验两份文件内容一致，
 * 所以忘记同步会直接测试失败，不会出现"页面规则和测试规则不一样"。
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const GAMES = ['snake', '2048', 'breakout'];

const HEADER = `/* eslint-disable */
/**
 * AUTO-GENERATED FILE — 请勿手动修改！
 * 由 games/_tools/sync-logic.mjs 从同目录的 logic.mjs 生成。
 * 重新生成：node games/_tools/sync-logic.mjs
 */
`;

/**
 * @param {string} source logic.mjs 的源码
 * @returns {{ code: string, names: string[] }}
 */
export function transform(source) {
  if (/^\s*import\s/m.test(source)) {
    throw new Error('logic.mjs 不能包含 import：页面用的是经典 <script>，无法解析模块语法');
  }
  if (/^\s*export\s+default\b/m.test(source)) {
    throw new Error('不支持 export default，请使用具名导出');
  }
  if (/^\s*export\s*\{/m.test(source)) {
    throw new Error('不支持 export { ... }，请使用 export function / export const 声明');
  }

  const names = [];
  const nameRe = /^export\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)|^export\s+(?:const|let|class)\s+([A-Za-z_$][\w$]*)/gm;
  let match = nameRe.exec(source);
  while (match) {
    names.push(match[1] || match[2]);
    match = nameRe.exec(source);
  }
  if (names.length === 0) throw new Error('logic.mjs 没有找到任何具名导出');

  // 去掉行首的 export 关键字，保留函数 / 常量声明本体
  const body = source.replace(
    /^export\s+(?=(?:async\s+)?function\s+|const\s+|let\s+|class\s+)/gm,
    '',
  );
  if (/^\s*export\s/m.test(body)) {
    throw new Error('仍残留 export 声明，请只使用受支持的导出写法');
  }

  const footer = `\n/* 浏览器经典脚本入口：页面通过 window.GameLogic 访问纯逻辑 */\n(function (global) {\n  global.GameLogic = {\n${names.map((name) => `    ${name},`).join('\n')}\n  };\n})(typeof window !== 'undefined' ? window : globalThis);\n`;

  return { code: `${HEADER}${body}\n${footer}`, names };
}

function gamePaths(game) {
  const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', game);
  return {
    source: path.join(dir, 'logic.mjs'),
    target: path.join(dir, 'logic.classic.js'),
  };
}

export function buildClassic(game, root) {
  const sourcePath = root
    ? path.join(root, game, 'logic.mjs')
    : gamePaths(game).source;
  const source = readFileSync(sourcePath, 'utf8');
  return transform(source).code;
}

function main(argv) {
  const check = argv.includes('--check');
  let dirty = 0;
  for (const game of GAMES) {
    const paths = gamePaths(game);
    const expected = buildClassic(game);
    let current = '';
    try {
      current = readFileSync(paths.target, 'utf8');
    } catch {
      current = '';
    }
    if (current === expected) {
      console.log(`✓ ${game}/logic.classic.js 已同步`);
      continue;
    }
    dirty += 1;
    if (check) {
      console.error(`✗ ${game}/logic.classic.js 与 logic.mjs 不同步`);
    } else {
      writeFileSync(paths.target, expected, 'utf8');
      console.log(`↻ 已生成 ${game}/logic.classic.js`);
    }
  }
  if (check && dirty > 0) {
    console.error('请运行：node games/_tools/sync-logic.mjs');
    process.exitCode = 1;
  } else if (dirty === 0) {
    console.log('全部逻辑文件已同步。');
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2));
}
