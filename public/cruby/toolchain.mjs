// Makefile のレシピから呼ばれるコマンド（clang、llvm-split、wasm-opt）。
// ブラウザの Worker（worker.mjs）と、配信する素材を作る ruby-build/prepare.mjs の両方で使う。
//   clang       … YoWASP Clang（LLVM を WebAssembly にしたもの）
//   llvm-split  … LLVM の llvm-split を WASI 向けにビルドしたもの（ruby-build/llvm-split/）。WASI は browser_wasi_shim
//   wasm-opt    … Binaryen.js（wasm-opt と同じ Binaryen を JavaScript から使う）
//
// fs は仮想ファイルシステム: Map<path, { mtime, data?: Uint8Array | string, load?: () => Promise }>

const getIn = (tree, path) => path.split('/').reduce((d, p) => (d && typeof d === 'object' && !(d instanceof Uint8Array) ? d[p] : undefined), tree);

const OPT = { '-O0': [0, 0], '-O1': [1, 0], '-O2': [2, 0], '-O3': [3, 0], '-O4': [4, 0], '-Os': [2, 1], '-Oz': [2, 2] };

export async function readFile(fs, path) {
  const f = fs.get(path);
  if (!f) return undefined;
  if (f.data === undefined) f.data = await f.load();
  return f.data;
}

/**
 * コマンドの表を作る。
 *   runClang … @yowasp/clang の runClang
 *   binaryen … binaryen（Binaryen.js）
 *   fs       … 仮想ファイルシステム
 *   now      … 次の更新時刻を返す関数
 *   isHeader … コンパイラに見せるファイル（ヘッダ）かどうか。(path, argv) で呼ぶ
 *   wasi     … browser_wasi_shim のモジュール（llvm-split を動かす）
 *   loadTool … ツールの wasm の WebAssembly.Module を返す関数（loadTool('llvm-split')）
 *   runWasmOpt … 省略可。(argv, data) => Promise<{ code, data, error }>。別の Worker で wasm-opt を動かすときに渡す
 */
/**
 * コンパイラに見せるファイルを選ぶ関数を作る。deps はソースごとの依存ファイル（headers.json の deps）。
 * ruby/x.c をコンパイルするときは、その依存（ヘッダと、vm.c が #include する vm_eval.c など）だけを渡す。
 * リンクのときは何も渡さない。
 */
export function headerFilter(deps) {
  const sets = new Map(Object.entries(deps).map(([src, list]) => [src, new Set(list)]));
  return (p, argv) => {
    if (!argv.includes('-c')) return false;
    const src = argv.find((a) => sets.has(a));
    return src ? sets.get(src).has(p) : p.startsWith('build/') || p.startsWith('ruby/');
  };
}

/**
 * wasm-opt と同じ引数で、Binaryen.js でバイト列を変換する（ファイルを読み書きしない）。
 * -O は全てのパスに効く（無ければ最適化レベル 0）。-O を書いた位置で最適化のパスも走らせる。
 * 返り値: { code, data?, error? }
 */
export function optimizeWasm(binaryen, argv, data) {
  let input;
  let debug = false;
  let level = [0, 0];
  const steps = []; // ['pass', name] | ['opt', [level, shrink]]
  const passArgs = [];
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-o') i++;
    else if (a === '-g' || a === '--debuginfo') debug = true;
    else if (a in OPT) {
      level = OPT[a];
      steps.push(['opt', OPT[a]]);
    } else if (a.startsWith('--pass-arg=')) {
      const [k, v] = a.slice('--pass-arg='.length).split('@');
      passArgs.push([k, v ?? '1']); // Binaryen.js では空文字が「未設定」扱いになるので 1 にする
    } else if (/^--[a-z0-9-]+$/.test(a)) steps.push(['pass', a.slice(2)]);
    else if (!a.startsWith('-')) input = a;
    else return { code: 1, error: `wasm-opt: unknown option '${a}'` };
  }
  if (!input) return { code: 1, error: 'wasm-opt: no input file' };
  let mod;
  try {
    mod = binaryen.readBinary(data);
    binaryen.setDebugInfo(debug);
    binaryen.setOptimizeLevel(level[0]);
    binaryen.setShrinkLevel(level[1]);
    for (const [k, v] of passArgs) binaryen.setPassArgument(k, v);
    for (const [kind, x] of steps) {
      if (kind === 'pass') mod.runPasses([x]);
      else mod.optimize();
    }
    return { code: 0, data: mod.emitBinary() };
  } catch (e) {
    return { code: 1, error: `wasm-opt: ${e?.message ?? e}` };
  } finally {
    mod?.dispose();
    binaryen.clearPassArguments();
  }
}

export function createCommands({ runClang, binaryen, runWasmOpt, fs, now, isHeader, wasi, loadTool }) {
  async function clang(argv, out) {
    // コンパイラに見せるファイル: ヘッダと、引数に出てくるファイル
    const tree = {};
    const put = (rel, data) => {
      const ps = rel.split('/');
      let d = tree;
      for (const p of ps.slice(0, -1)) d = d[p] ??= {};
      d[ps.at(-1)] = data;
    };
    for (const [p, f] of fs) if (isHeader(p, argv)) put(p, f.data ?? (await readFile(fs, p)));
    // -o の出力先は渡さない（渡すと、新しく書き出したものではなく渡した古いものが返ってくる）
    const oi = argv.indexOf('-o');
    const output = oi >= 0 ? argv[oi + 1] : undefined;
    for (const a of argv.slice(1)) if (!a.startsWith('-') && a !== output && fs.has(a)) put(a, await readFile(fs, a));
    const dec = new TextDecoder();
    let buf = '';
    const flush = (b) => {
      if (b) buf += dec.decode(b, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop();
      for (const l of lines) out.stderr(l);
    };
    let result;
    try {
      result = await runClang(argv, tree, { stdout: flush, stderr: flush });
    } catch (e) {
      flush(null);
      if (buf) out.stderr(buf);
      return typeof e?.code === 'number' && e.code !== 0 ? e.code : 1;
    }
    if (buf) out.stderr(buf);
    if (output) {
      const data = getIn(result, output);
      if (data instanceof Uint8Array) fs.set(output, { mtime: now(), data });
    }
    return 0;
  }

  async function wasmOpt(argv, out) {
    const input = argv.slice(1).find((a, i, all) => !a.startsWith('-') && all[i - 1] !== '-o');
    const oi = argv.indexOf('-o');
    const output = oi >= 0 ? argv[oi + 1] : undefined;
    const data = input ? await readFile(fs, input) : undefined;
    if (input && !(data instanceof Uint8Array)) {
      out.stderr(`wasm-opt: ${input}: No such file or directory`);
      return 1;
    }
    const r = await (runWasmOpt ?? ((a, d) => optimizeWasm(binaryen, a, d)))(argv, data);
    if (r.error) out.stderr(r.error);
    if (r.code === 0 && output) fs.set(output, { mtime: now(), data: r.data });
    return r.code;
  }

  /** llvm-split（引数のファイルを渡し、-o の接頭辞で始まるファイルを受け取る） */
  async function llvmSplit(argv, out) {
    const { WASI, OpenFile, File, Directory, PreopenDirectory, ConsoleStdout } = wasi;
    const root = new Map();
    const dirOf = (rel) => {
      let d = root;
      for (const p of rel.split('/').slice(0, -1)) {
        if (!d.has(p)) d.set(p, new Directory(new Map()));
        d = d.get(p).contents;
      }
      return d;
    };
    const oi = argv.indexOf('-o');
    const prefix = oi >= 0 ? argv[oi + 1] : 'split';
    dirOf(prefix);
    for (const a of argv.slice(1)) if (!a.startsWith('-') && fs.has(a)) dirOf(a).set(a.split('/').at(-1), new File(await readFile(fs, a)));
    const w = new WASI(argv, [], [
      new OpenFile(new File([])),
      ConsoleStdout.lineBuffered(out.stdout),
      ConsoleStdout.lineBuffered(out.stderr),
      new PreopenDirectory('/', root),
    ]);
    let code;
    try {
      const inst = await WebAssembly.instantiate(await loadTool('llvm-split'), { wasi_snapshot_preview1: w.wasiImport });
      code = w.start(inst);
    } catch (e) {
      out.stderr(`llvm-split: ${e?.message ?? e}`);
      return 1;
    }
    const base = prefix.split('/').at(-1);
    for (const [name, f] of dirOf(prefix)) {
      if (name.startsWith(base) && f instanceof File) fs.set(prefix.slice(0, prefix.length - base.length) + name, { mtime: now(), data: f.data });
    }
    return code;
  }

  return { clang, 'llvm-split': llvmSplit, 'wasm-opt': wasmOpt };
}
