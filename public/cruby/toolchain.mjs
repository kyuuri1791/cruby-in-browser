// Makefile のレシピから呼ばれるコマンド（clang と wasm-opt）。
// ブラウザの Worker（worker.mjs）と、配信する素材を作る ruby-build/prepare.mjs の両方で使う。
//   clang     … YoWASP Clang（LLVM を WebAssembly にしたもの）
//   wasm-opt  … Binaryen.js（wasm-opt と同じ Binaryen を JavaScript から使う）
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

export function createCommands({ runClang, binaryen, fs, now, isHeader }) {
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
    // wasm-opt と同じく、-O は全てのパスに効く（無ければ最適化レベル 0）。-O を書いた位置で最適化のパスも走らせる
    let input;
    let output;
    let debug = false;
    let level = [0, 0];
    const steps = []; // ['pass', name] | ['opt', [level, shrink]]
    const passArgs = [];
    for (let i = 1; i < argv.length; i++) {
      const a = argv[i];
      if (a === '-o') output = argv[++i];
      else if (a === '-g' || a === '--debuginfo') debug = true;
      else if (a in OPT) {
        level = OPT[a];
        steps.push(['opt', OPT[a]]);
      } else if (a.startsWith('--pass-arg=')) {
        const [k, v] = a.slice('--pass-arg='.length).split('@');
        passArgs.push([k, v ?? '1']); // Binaryen.js では空文字が「未設定」扱いになるので 1 にする
      } else if (/^--[a-z0-9-]+$/.test(a)) steps.push(['pass', a.slice(2)]);
      else if (!a.startsWith('-')) input = a;
      else {
        out.stderr(`wasm-opt: unknown option '${a}'`);
        return 1;
      }
    }
    if (!input) {
      out.stderr('wasm-opt: no input file');
      return 1;
    }
    const data = await readFile(fs, input);
    if (!(data instanceof Uint8Array)) {
      out.stderr(`wasm-opt: ${input}: No such file or directory`);
      return 1;
    }
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
      const result = mod.emitBinary();
      if (output) fs.set(output, { mtime: now(), data: result });
      return 0;
    } catch (e) {
      out.stderr(`wasm-opt: ${e?.message ?? e}`);
      return 1;
    } finally {
      mod?.dispose();
      binaryen.clearPassArguments();
    }
  }

  return { clang, 'wasm-opt': wasmOpt };
}
