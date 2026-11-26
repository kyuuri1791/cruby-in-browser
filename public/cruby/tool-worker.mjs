// clang（YoWASP Clang）と wasm-opt（Binaryen.js）を動かすだけの Worker。
// worker.mjs が make -j の数だけ作り、レシピのコマンドを同時に実行する。
//   受け取る: { id, tool: 'clang', argv, tree }      tree はコンパイラに見せるファイル
//             { id, tool: 'warmup' }                 clang を読み込んでおく
//             { id, tool: 'wasm-opt', argv, data }   data は入力の wasm
//   返す:     { id, type: 'stdout' | 'stderr', bytes }（clang の出力）
//             { id, type: 'done', files }            clang: -o の出力だけを入れた木（{ out: { 'vm.o': Uint8Array } }）
//             { id, type: 'done', result }           wasm-opt: { code, data, error }
//             { id, type: 'error', code, message }
import './gz-fetch.mjs?v=2';
import { optimizeWasm } from './toolchain.mjs?v=14';

const getIn = (tree, path) => path.split('/').reduce((d, p) => (d && typeof d === 'object' && !(d instanceof Uint8Array) ? d[p] : undefined), tree);

// 使うものだけ読み込む（clang は 100MB ある）
let clangP;
const loadClang = () => (clangP ??= import('./vendor/yowasp-clang/bundle.js').then((m) => m.runClang));
let binaryenP;
const loadBinaryen = () => (binaryenP ??= import('./vendor/binaryen/index.js').then((m) => m.default));

self.onmessage = async ({ data: msg }) => {
  const { id, tool, argv } = msg;
  const send = (type, rest = {}, transfer = []) => self.postMessage({ id, type, ...rest }, transfer);
  try {
    if (tool === 'warmup') {
      // clang の wasm を読み込んでコンパイルしておく（最初の make を速くする）
      await (await loadClang())(['clang', '--version'], {}, { stdout: () => {}, stderr: () => {} }).catch(() => {});
      send('done');
      return;
    }
    if (tool === 'wasm-opt') {
      const result = optimizeWasm(await loadBinaryen(), argv, msg.data);
      send('done', { result }, result.data ? [result.data.buffer] : []);
      return;
    }
    const runClang = await loadClang();
    const stream = (type) => (bytes) => send(type, { bytes });
    const result = await runClang(argv, msg.tree, { stdout: stream('stdout'), stderr: stream('stderr') });
    const oi = argv.indexOf('-o');
    const files = {};
    if (oi >= 0) {
      const data = getIn(result, argv[oi + 1]);
      if (data instanceof Uint8Array) {
        const ps = argv[oi + 1].split('/');
        let d = files;
        for (const p of ps.slice(0, -1)) d = d[p] ??= {};
        d[ps.at(-1)] = data;
      }
    }
    send('done', { files });
  } catch (e) {
    send('error', { code: typeof e?.code === 'number' ? e.code : 1, message: String(e?.message ?? e) });
  }
};
