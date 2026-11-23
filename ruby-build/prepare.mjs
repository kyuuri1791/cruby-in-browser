// ブラウザで使う Ruby の素材を作る（配信前に 1 回だけ実行）
//
//   node ruby-build/prepare.mjs
//
// 前提: ruby-build/README.md の手順で、wasm 向けの PIC ビルド（$CRUBY_WORK/build-ext）と、
//       $CRUBY_WORK/rubyroot への make install・gem install rspec が済んでいること。
// 出力: public/cruby/assets/
//   ruby.wasm              … 編集対象ファイルを抜いた本体（拡張を静的リンク。asyncify 済み）
//   rubyfs.tar             … 標準ライブラリと rspec（/usr/local/lib/ruby 以下）
//   obj/<name>.o           … 編集対象ファイルの .o（Makefile のレシピで作ったもの）
//   libruby-edit.so など   … それをまとめた共有ライブラリ（asyncify 済み。config.mjs の EDIT_LIBS）
//   lib/<lib>.so           … libc など（asyncify 済み）
//   src/<name>.c           … 編集対象ファイルの元のソース
//   headers.json           … ブラウザでコンパイルするときに必要なヘッダ（build/ と ruby/ に置く）と、ソースごとの依存の一覧
//   Makefile               … ブラウザの中の make が読む Makefile（ruby-build/makefile.mjs が作る）
//   manifest.json          … 編集できるファイルと共有ライブラリの一覧
// 大きなファイル（ruby.wasm、rubyfs.tar、headers.json、*.so）は .gz にして置く
import binaryen from 'binaryen';
import { readFileSync, writeFileSync, mkdirSync, statSync, existsSync, rmSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { execFileSync, execSync } from 'node:child_process';
import path from 'node:path';
import { EDITABLE, EDIT_LIBS, COMPILED, COMPILE_FLAGS, INCLUDE_DIRS, LIBS } from './config.mjs';
import { makefile } from './makefile.mjs';
import { runClang } from '@yowasp/clang';
import { make } from '../public/cruby/make.mjs';
import { createCommands, headerFilter } from '../public/cruby/toolchain.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const WORK = process.env.CRUBY_WORK ?? path.join(ROOT, 'spike');
const B = path.join(WORK, process.env.CRUBY_BUILD ?? 'build-ext');
const SYSROOT = path.join(WORK, 'yowasp-sysroot');
const CC = path.join(WORK, 'fakesdk/bin/clang');
const OUT = path.join(ROOT, 'public/cruby/assets');
const TMP = path.join(WORK, 'prepare-tmp');
for (const d of [OUT, `${OUT}/obj`, `${OUT}/lib`, `${OUT}/src`, TMP]) mkdirSync(d, { recursive: true });

const t0 = performance.now();
const lap = (m) => console.error(`[${((performance.now() - t0) / 1000).toFixed(1)}s] ${m}`);
const onlySo = process.argv.includes('--so-only');

function asyncify(bytes) {
  const mod = binaryen.readBinary(bytes);
  binaryen.setOptimizeLevel(1);
  binaryen.setShrinkLevel(0);
  binaryen.setDebugInfo(true); // 関数名を残す（エラー時のスタックトレース用）
  binaryen.setPassArgument('asyncify-import-globals', '1'); // 状態変数を全モジュールで共有する
  mod.runPasses(['asyncify']);
  mod.optimize();
  const out = mod.emitBinary();
  mod.dispose();
  binaryen.clearPassArguments();
  return out;
}

// 1. 本体: 拡張（stringio、ripper など）を静的リンクした ruby から、編集対象を抜いて PIE としてリンク
//    （ruby の Makefile のリンク行: main.o ext/extinit.o ext/*/*.a enc/encinit.o enc/libenc.a enc/libtrans.a -lruby-static）
if (!onlySo) {
  const noedit = `${TMP}/libruby-noedit.a`;
  execFileSync('cp', [path.join(B, 'libruby-static.a'), noedit]);
  // 編集対象と、拡張・エンコーディングのダミー初期化（本物を extinit.o / encinit.o でリンクする）を抜く
  execFileSync(path.join(WORK, 'fakesdk/bin/llvm-ar'), ['d', noedit, ...COMPILED.map((e) => `${e.name}.o`), 'dmyext.o', 'dmyenc.o']);
  const extLibs = execSync('ls ext/*/*.a ext/*/*/*.a 2>/dev/null || true', { cwd: B, shell: '/bin/sh' }).toString().split(/\s+/).filter(Boolean);
  execFileSync(CC, ['-Wl,-pie', '-Wl,--import-memory', '-Wl,--export-all', '-Wl,--no-gc-sections', '-Wl,--experimental-pic', '-Wl,--unresolved-symbols=import-dynamic', '-Wl,--strip-debug',
    'main.o', 'ext/extinit.o', 'enc/encinit.o', '-Wl,--whole-archive', ...extLibs, 'enc/libenc.a', 'enc/libtrans.a', noedit, '-Wl,--no-whole-archive',
    ...LIBS.filter((l) => l !== 'libc.so').map((l) => `-l${l.replace(/^lib|\.so$/g, '')}`), '-lm', '-o', `${TMP}/main.linked.wasm`], { cwd: B, stdio: 'inherit' });
  lap(`本体リンク（拡張: ${extLibs.join(', ')}）`);
  writeFileSync(`${OUT}/ruby.wasm`, asyncify(readFileSync(`${TMP}/main.linked.wasm`)));
  lap('本体 asyncify');
  for (const lib of LIBS) {
    writeFileSync(`${OUT}/lib/${lib}`, asyncify(readFileSync(path.join(SYSROOT, 'lib/wasm32-wasip1', lib))));
  }
  lap('libc など asyncify');
}

// 2. 編集対象: ブラウザと同じ Makefile を、ブラウザと同じ make・clang（YoWASP）・wasm-opt（Binaryen.js）で実行する
const incFlags = INCLUDE_DIRS.map((d) => `-I${d}`);
const headers = {};
for (const { name } of EDITABLE) writeFileSync(`${OUT}/src/${name}.c`, readFileSync(path.join(WORK, 'ruby', `${name}.c`)));
// 編集できるファイルはヘッダに入れない（#include される vm_eval.c なども、書き換えた中身をコンパイラに渡す）
const editablePaths = new Set(EDITABLE.map((e) => `ruby/${e.name}.c`));
// ソースごとの依存ファイル（コンパイルのときは、そのソースの依存だけをコンパイラに渡す）
const depsOf = {};
for (const { name } of COMPILED) {
  const src = path.join(WORK, 'ruby', `${name}.c`);
  // 依存ヘッダ（sysroot 以外）。ブラウザ側の仮想 FS では build/ と ruby/ に置く
  const base = ['--target=wasm32-wasip1', ...COMPILE_FLAGS, ...incFlags];
  const deps = execFileSync('clang', [...base, `--sysroot=${SYSROOT}`, '-isystem', `${SYSROOT}/include/wasm32-wasip1`, '-MM', src], { cwd: B })
    .toString().replace(/\\\n/g, ' ').split(/\s+/).slice(2).filter((f) => f && !f.includes('yowasp-sysroot') && !f.endsWith(`${name}.c`));
  depsOf[`ruby/${name}.c`] = [];
  for (const f of deps) {
    const key = path.relative(WORK, path.resolve(B, f)).replace(/^build-(pic|ext)\//, 'build/');
    depsOf[`ruby/${name}.c`].push(key);
    if (!editablePaths.has(key)) headers[key] ??= readFileSync(path.resolve(B, f), 'utf8');
  }
}
writeFileSync(`${OUT}/headers.json`, JSON.stringify({ files: headers, deps: depsOf }));
const mk = makefile();
writeFileSync(`${OUT}/Makefile`, mk);
{
  const fs = new Map();
  let clock = 1;
  for (const [p, text] of Object.entries(headers)) fs.set(p, { mtime: 0, data: text });
  for (const { name } of EDITABLE) fs.set(`ruby/${name}.c`, { mtime: 1, data: readFileSync(`${OUT}/src/${name}.c`, 'utf8') });
  const commands = createCommands({ runClang, binaryen, fs, now: () => ++clock, isHeader: headerFilter(depsOf) });
  const ok = await make({
    makefile: mk,
    fs: { mtime: (p) => fs.get(p)?.mtime },
    echo: (t) => console.error(t.length > 120 ? `${t.slice(0, 117)}...` : t),
    error: (t) => console.error(t),
    exec: (argv) => (commands[argv[0]] ? commands[argv[0]](argv, { stdout: console.error, stderr: console.error }) : 127),
  });
  if (!ok) throw new Error('make に失敗しました');
  for (const { name } of COMPILED) writeFileSync(`${OUT}/obj/${name}.o`, fs.get(`out/${name}.o`).data);
  for (const { name } of EDIT_LIBS) writeFileSync(`${OUT}/${name}`, fs.get(`out/${name}`).data);
}
lap(`${EDIT_LIBS.map((l) => l.name).join('・')} と .o`);

// 3. 標準ライブラリと rspec（$CRUBY_WORK/rubyroot に make install と gem install rspec をしたもの）を 1 つの tar に
{
  const rubyroot = path.join(WORK, 'rubyroot');
  execFileSync('tar', ['--format=ustar', '--owner=0', '--group=0', '--sort=name', '--mtime=@0', '-cf', `${OUT}/rubyfs.tar`, '-C', rubyroot,
    '--exclude=*/gems/*/cache', '--exclude=*/gems/*/doc', 'usr/local/lib/ruby']);
  lap(`rubyfs.tar（${(statSync(`${OUT}/rubyfs.tar`).size / 1e6).toFixed(1)}MB）`);
}

// 3. マニフェスト（ブラウザが読む一覧）
writeFileSync(`${OUT}/manifest.json`, JSON.stringify({
  editable: EDITABLE,
  editLibs: EDIT_LIBS.map(({ name }) => ({ name })),
  libs: LIBS,
}, null, 2));
// 4. 大きなファイルは gzip にする（ブラウザでは public/cruby/gz-fetch.mjs が展開する）
for (const f of ['ruby.wasm', 'rubyfs.tar', 'headers.json', ...EDIT_LIBS.map((l) => l.name), ...LIBS.map((l) => `lib/${l}`)]) {
  const p = `${OUT}/${f}`;
  if (!existsSync(p)) continue;
  writeFileSync(`${p}.gz`, gzipSync(readFileSync(p), { level: 9 }));
  rmSync(p);
}
lap('完了');
