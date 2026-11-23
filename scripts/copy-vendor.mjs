// ブラウザ（Web Worker）が直接 import するライブラリを public/cruby/vendor にコピーする。
// これらは import.meta.url から自分の wasm を探すので、バンドルせずそのまま配信する。
import { cpSync, mkdirSync, rmSync, existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const NM = path.join(ROOT, 'node_modules');
const OUT = path.join(ROOT, 'public/cruby/vendor');
const items = [
  ['@yowasp/clang/gen', 'yowasp-clang'],
  ['@yowasp/clang/package.json', 'yowasp-clang/package.json'],
  ['binaryen/index.js', 'binaryen/index.js'],
  ['binaryen/package.json', 'binaryen/package.json'],
  ['@bjorn3/browser_wasi_shim/dist', 'browser_wasi_shim'],
  ['@bjorn3/browser_wasi_shim/package.json', 'browser_wasi_shim/package.json'],
];
const stamp = path.join(OUT, '.done');
if (existsSync(stamp) && !process.argv.includes('--force')) process.exit(0);
rmSync(OUT, { recursive: true, force: true });
for (const [from, to] of items) {
  mkdirSync(path.dirname(path.join(OUT, to)), { recursive: true });
  cpSync(path.join(NM, from), path.join(OUT, to), { recursive: true });
}
// コンパイラの wasm と資源は大きいので gzip にする（ブラウザでは public/cruby/gz-fetch.mjs が展開する）
const clang = path.join(OUT, 'yowasp-clang');
for (const n of readdirSync(clang).filter((n) => /^llvm.*\.(wasm|tar)$/.test(n))) {
  writeFileSync(path.join(clang, `${n}.gz`), gzipSync(readFileSync(path.join(clang, n)), { level: 9 }));
  rmSync(path.join(clang, n));
}
cpSync(path.join(ROOT, 'package.json'), stamp);
console.log('public/cruby/vendor を用意しました');
