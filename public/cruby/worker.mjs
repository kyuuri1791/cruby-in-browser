// Ruby をブラウザの中でビルドして動かす Web Worker
//
// make と ./ruby を、次の通り本当に実行する。
//   1. make … Makefile を読み、更新時刻を比べて古くなったものだけを作り直す（make.mjs）。
//      レシピのコマンドは、clang（YoWASP Clang）と wasm-opt（Binaryen.js）で実行する。
//   2. ./ruby … 本体の ruby（PIE の wasm）と lib/*.so、make が作った（または配信済みの）libruby-edit.so などを、
//      実行時にリンクして動かす（dylink.mjs。Linux の ld.so の役目）。
// ファイルは Worker の中の仮想ファイルシステムに置き、ページを開いている間は保たれる。
//
// 受け取るメッセージ:
//   { type: 'run', id, sources, makefile, files, make, args, prompt }
//     make     … true なら make だけ、false なら ./ruby だけを実行する
//     sources  … 編集された C のファイルだけ（{ array: '...' }）。無いものは元のソース
//     makefile … Makefile の中身
//     files    … /work に置くファイル（{ 'main.rb': '...', 'spec/x_spec.rb': '...' }）
//     args     … ruby に渡す引数
//     prompt   … 出力の欄に出すコマンド行（'./ruby main.rb'）
// 返すメッセージ:
//   { type: 'prompt' | 'cmd' | 'stdout' | 'stderr' | 'crash' | 'error', id, text }
//   { type: 'phase', id }   … ./ruby を起動した（ここから時間制限を数える）
//   { type: 'make-failed' | 'done', id }
//   { type: 'files', files: [path] }   … 仮想ファイルシステムのファイル一覧（ヘッダとソースを除く）
// その他:
//   { type: 'stat', reqId, path } -> { type: 'stat-result', reqId, info: { size, kind } | null }
import './gz-fetch.mjs?v=1'; // ライブラリより先に読み込む（gzip した素材を展開する fetch に差し替える）
import { runClang } from './vendor/yowasp-clang/bundle.js';
import binaryen from './vendor/binaryen/index.js';
import { WASI, OpenFile, File, Directory, ConsoleStdout, PreopenDirectory } from './vendor/browser_wasi_shim/index.js';
import { link } from './dylink.mjs?v=11';
import { make } from './make.mjs?v=11';
import { createCommands, headerFilter, readFile as readFileIn } from './toolchain.mjs?v=12';

const ASSETS = new URL('./assets/', import.meta.url);
const MAX_OUTPUT_LINES = 2000;

const fetchOk = (path) =>
  fetch(new URL(path, ASSETS), { cache: 'no-cache' }).then((r) => {
    if (!r.ok) throw new Error(`failed to fetch ${path} (${r.status})`);
    return r;
  });
let manifestPromise;
const loadManifest = () => (manifestPromise ??= fetchOk('manifest.json').then((r) => r.json()));
let headersPromise;
const loadHeaders = () => (headersPromise ??= fetchOk('headers.json').then((r) => r.json()));

// wasm のコンパイル結果のキャッシュ（同じバイト列なら使い回す）
const moduleCache = new WeakMap(); // Uint8Array -> Promise<WebAssembly.Module>
const compileBytes = (bytes) => {
  if (!moduleCache.has(bytes)) moduleCache.set(bytes, WebAssembly.compile(bytes));
  return moduleCache.get(bytes);
};
const urlModuleCache = new Map();
const compileUrl = (path) => {
  if (!urlModuleCache.has(path)) {
    const p = fetchOk(path).then((r) => r.arrayBuffer()).then((b) => WebAssembly.compile(b));
    urlModuleCache.set(path, p);
    p.catch(() => urlModuleCache.delete(path));
  }
  return urlModuleCache.get(path);
};

// ---- Ruby の標準ライブラリと gem（rubyfs.tar を展開して / に置く） ----
let rubyFsPromise;
function loadRubyFs() {
  return (rubyFsPromise ??= fetchOk('rubyfs.tar').then((r) => r.arrayBuffer()).then((b) => untar(new Uint8Array(b))));
}

/** ustar 形式の tar を browser_wasi_shim の Directory の木にする（展開した内容は実行のたびに使い回す） */
function untar(buf) {
  const root = new Map();
  const dec = new TextDecoder();
  const str = (o, n) => dec.decode(buf.subarray(o, o + n)).replace(/\0.*$/s, '');
  let longName = null;
  for (let off = 0; off + 512 <= buf.length; ) {
    if (buf[off] === 0) break;
    const size = parseInt(str(off + 124, 12).trim() || '0', 8);
    const type = String.fromCharCode(buf[off + 156] || 48);
    const prefix = str(off + 345, 155);
    let name = longName ?? (prefix ? `${prefix}/${str(off, 100)}` : str(off, 100));
    longName = null;
    const data = buf.subarray(off + 512, off + 512 + size);
    off += 512 + Math.ceil(size / 512) * 512;
    if (type === 'L') {
      longName = dec.decode(data).replace(/\0.*$/s, '');
      continue;
    }
    name = name.replace(/^\.\//, '').replace(/\/$/, '');
    if (!name || type === 'x' || type === 'g') continue;
    const parts = name.split('/');
    let dir = root;
    for (const p of parts.slice(0, type === '5' ? parts.length : -1)) {
      if (!dir.has(p)) dir.set(p, new Directory(new Map()));
      dir = dir.get(p).contents;
    }
    if (type === '0' || type === '\0') dir.set(parts.at(-1), new File(data.slice()));
  }
  return root;
}

// ---- 仮想ファイルシステム（make とコンパイラが使う） ----
// path -> { mtime, data?: Uint8Array | string, load?: () => Promise<Uint8Array | string> }
const vfs = new Map();
let clock = 1;
const now = () => ++clock;
const lastSource = new Map(); // name -> 前回の内容（null は元のソース）
let isHeader = () => false; // コンパイラに渡すヘッダを選ぶ（toolchain.mjs の headerFilter）
let vfsReady;

function initVfs() {
  return (vfsReady ??= (async () => {
    const [manifest, headers] = await Promise.all([loadManifest(), loadHeaders()]);
    for (const [p, text] of Object.entries(headers.files)) vfs.set(p, { mtime: 0, data: text });
    isHeader = headerFilter(headers.deps);
    const prebuilt = (path, url) => vfs.set(path, { mtime: 0, load: () => fetchOk(url).then((r) => r.arrayBuffer()).then((b) => new Uint8Array(b)), prebuilt: url });
    // 本体と libc など（ruby-build/prepare.mjs でビルドして配信しているもの）
    prebuilt('ruby', 'ruby.wasm');
    for (const l of manifest.libs) prebuilt(`lib/${l}`, `lib/${l}`);
    for (const { name, includedBy } of manifest.editable) {
      vfs.set(`ruby/${name}.c`, { mtime: 0, load: () => fetchOk(`src/${name}.c`).then((r) => r.text()) });
      // 配信済みの .o（ruby-build/prepare.mjs が、同じ Makefile・同じ clang で作ったもの）。#include される .c は .o を持たない
      if (!includedBy) prebuilt(`out/${name}.o`, `obj/${name}.o`);
    }
    for (const { name } of manifest.editLibs) prebuilt(`out/${name}`, name);
    postFiles();
  })());
}

/** エクスプローラーに出すファイル（ヘッダと C のソースは除く） */
function postFiles() {
  const files = [...vfs.keys()].filter((path) => !path.startsWith('build/') && !path.startsWith('ruby/'));
  self.postMessage({ type: 'files', files });
}

/** バイナリのファイルの種類と大きさ（エクスプローラーで開いた時に出す） */
async function stat(path) {
  if (!vfs.has(path)) return null;
  const data = await readFile(path);
  if (path.endsWith('.o')) return { size: data.length, kind: 'object' };
  const mod = await compileBytes(data);
  const dylink = WebAssembly.Module.customSections(mod, 'dylink.0').length > 0;
  const hasStart = WebAssembly.Module.exports(mod).some((e) => e.name === '_start');
  return { size: data.length, kind: !dylink ? 'module' : hasStart ? 'pie' : 'shared' };
}

const readFile = (path) => readFileIn(vfs, path);

/** 編集された C のファイルを仮想ファイルシステムに反映する。内容が変わったら更新時刻を進める */
function syncSources(manifest, sources) {
  for (const { name } of manifest.editable) {
    const content = sources[name] ?? null;
    if (lastSource.has(name) && lastSource.get(name) === content) continue;
    const first = !lastSource.has(name);
    lastSource.set(name, content);
    if (first && content === null) continue;
    const path = `ruby/${name}.c`;
    vfs.set(path, content === null ? { mtime: now(), load: () => fetchOk(`src/${name}.c`).then((r) => r.text()) } : { mtime: now(), data: content });
  }
}

// ---- レシピのコマンド（clang と wasm-opt。toolchain.mjs） ----
const COMMANDS = createCommands({
  runClang,
  binaryen,
  fs: vfs,
  now,
  isHeader: (p, argv) => isHeader(p, argv),
});

// ---- 実行 ----
async function run({ id, sources = {}, makefile, files = {}, make: doMake = false, args = null, prompt }) {
  const post = (msg) => self.postMessage({ id, ...msg });
  const manifest = await loadManifest();
  await initVfs();
  syncSources(manifest, sources);
  if (prompt) post({ type: 'prompt', text: `$ ${prompt}` });

  const out = { stdout: (text) => post({ type: 'stdout', text }), stderr: (text) => post({ type: 'stderr', text }) };
  if (doMake) {
    const ok = await make({
      makefile,
      fs: { mtime: (p) => vfs.get(p)?.mtime },
      echo: (text) => post({ type: 'cmd', text }),
      error: out.stderr,
      exec: async (argv) => {
        const cmd = COMMANDS[argv[0]];
        if (!cmd) {
          out.stderr(`make: ${argv[0]}: No such file or directory`);
          return 127;
        }
        return cmd(argv, out);
      },
    });
    postFiles();
    post({ type: ok ? 'done' : 'make-failed' });
    return;
  }

  // ./ruby（本体と *.so を実行時にリンクして動かす）
  const load = async (path) => {
    const f = vfs.get(path);
    if (!f) return null;
    return f.prebuilt && f.data === undefined ? compileUrl(f.prebuilt) : compileBytes(await readFile(path));
  };
  const mainMod = await load('ruby');
  const libMods = await Promise.all(manifest.libs.map((l) => load(`lib/${l}`)));
  const editMods = await Promise.all(manifest.editLibs.map(({ name }) => load(`out/${name}`)));
  const missing = manifest.editLibs.find((_, i) => !editMods[i]);
  if (missing) {
    post({ type: 'stderr', text: `./ruby: error while loading shared libraries: out/${missing.name}: cannot open shared object file: No such file or directory` });
    post({ type: 'done' });
    return;
  }
  let lines = 0;
  const emit = (type) => (text) => {
    if (++lines > MAX_OUTPUT_LINES) {
      if (lines === MAX_OUTPUT_LINES + 1) post({ type: 'cmd', text: `... (output truncated after ${MAX_OUTPUT_LINES} lines)` });
      return;
    }
    post({ type, text });
  };
  // ファイルの配置（本物の Ruby をインストールした環境と同じ）
  //   /usr/local/lib/ruby/…  … make install した標準ライブラリと、gem install した rspec（rubyfs.tar）
  //   /work                  … プロジェクトのファイル（main.rb、spec/…、bin/rspec）。ここをカレントディレクトリにする
  const enc = new TextEncoder();
  const work = new Map();
  for (const [path, text] of Object.entries(files)) {
    const parts = path.split('/');
    let dir = work;
    for (const p of parts.slice(0, -1)) {
      if (!dir.has(p)) dir.set(p, new Directory(new Map()));
      dir = dir.get(p).contents;
    }
    dir.set(parts.at(-1), new File(enc.encode(text)));
  }
  const root = new Map([...(await loadRubyFs()), ['work', new Directory(work)], ['root', new Directory(new Map())], ['tmp', new Directory(new Map())]]);
  const wasi = new WASI(['./ruby', ...args], ['HOME=/root', 'PWD=/work'], [
    new OpenFile(new File([])),
    ConsoleStdout.lineBuffered(emit('stdout')),
    ConsoleStdout.lineBuffered(emit('stderr')),
    new PreopenDirectory('/', root),
  ]);
  const shared = () => new WebAssembly.Global({ value: 'i32', mutable: true }, 0);
  const r = link({
    modules: [
      ...manifest.libs.map((name, i) => ({ name, module: libMods[i] })),
      ...manifest.editLibs.map(({ name }, i) => ({ name, module: editMods[i] })),
      { name: 'ruby', module: mainMod, main: true },
    ],
    wasiImports: wasi.wasiImport,
    extraImports: { 'env.__asyncify_state': shared(), 'env.__asyncify_data': shared() },
    onMemory: (memory) => { wasi.inst = { exports: { memory } }; },
  });
  // シェルが cd /work してから ./ruby を起動するのと同じく、libc の chdir で /work に移る
  const path0 = enc.encode('/work\0');
  const buf = r.syms.get('malloc').fn(path0.length);
  new Uint8Array(r.memory.buffer).set(path0, buf);
  r.syms.get('chdir').fn(buf);
  post({ type: 'phase' }); // ここから時間制限を数える（runner.ts）
  try {
    wasi.start({ exports: { memory: r.memory, _start: r.main.exports._start } });
  } catch (e) {
    // ネイティブなら Segmentation fault などで落ちる場面
    post({ type: 'crash', text: `wasm trap: ${e?.message ?? e}` });
  }
  post({ type: 'done' });
}

self.onmessage = async ({ data }) => {
  if (data.type === 'warmup') {
    // 最初の実行を速くするため、先に素材を読み込んでおく（失敗したら、実行のときにエラーを出す）
    const m = await loadManifest().catch(() => null);
    if (m) await Promise.all([initVfs(), loadRubyFs(), compileUrl('ruby.wasm'), ...m.libs.map((l) => compileUrl(`lib/${l}`)), ...m.editLibs.map(({ name }) => compileUrl(name))]).catch(() => {});
    return;
  }
  if (data.type === 'stat') {
    try {
      await initVfs();
      self.postMessage({ type: 'stat-result', reqId: data.reqId, info: await stat(data.path) });
    } catch {
      self.postMessage({ type: 'stat-result', reqId: data.reqId, info: null });
    }
    return;
  }
  if (data.type !== 'run') return;
  try {
    await run(data);
  } catch (e) {
    self.postMessage({ id: data.id, type: 'error', text: String(e?.stack ?? e) });
  }
};
self.postMessage({ type: 'ready' });
