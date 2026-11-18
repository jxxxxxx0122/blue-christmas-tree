// 纯逻辑的 Node 断言：从 index.html 中提取 #region logic 区块执行
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const match = html.match(/\/\/ #region logic([\s\S]*?)\/\/ #endregion logic/);
if (!match) {
  console.error('FAIL: #region logic not found in index.html');
  process.exit(1);
}

const logic = new Function(match[1] + '\nreturn { isTap };')();
const limits = { maxMove: 8, maxMs: 350 };
const cases = [
  ['quick tap at rest', logic.isTap(0, 0, 100, limits), true],
  ['moved 9px', logic.isTap(9, 0, 100, limits), false],
  ['held 400ms', logic.isTap(0, 0, 400, limits), false],
  ['small diagonal move', logic.isTap(3, 4, 300, limits), true],
  ['negative travel measured by length', logic.isTap(-6, 4, 120, limits), true],
  ['just beyond the limit', logic.isTap(-7, 4, 120, limits), false],
];

let failed = 0;
for (const [name, got, want] of cases) {
  if (got !== want) {
    console.error(`FAIL: ${name} — got ${got}, want ${want}`);
    failed++;
  } else {
    console.log(`PASS: ${name}`);
  }
}
if (failed) process.exit(1);
console.log('OK: all logic assertions passed');
