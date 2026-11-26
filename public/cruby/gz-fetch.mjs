// 大きなファイル（コンパイラ、Ruby 本体、標準ライブラリなど）は gzip して配信し、ここで展開する。
// デプロイナウの Free プランは配信できる大きさが 100MB までなので、そのままでは収まらないため。
// worker.mjs が最初に import する（ライブラリが fetch を読み込む前に差し替える）。
const GZIPPED = /\/cruby\/(vendor\/yowasp-clang\/llvm[^/]*\.(wasm|tar)|assets\/(ruby\.wasm|rubyfs\.tar|headers\.json|llvm-split\.wasm|libruby-[^/]+\.so|lib\/[^/]+\.so))$/;
const TYPES = { wasm: 'application/wasm', json: 'application/json' };

const fetchRaw = globalThis.fetch.bind(globalThis);

globalThis.fetch = async (input, init) => {
  const url = new URL(input instanceof Request ? input.url : input, self.location.href);
  if (!GZIPPED.test(url.pathname)) return fetchRaw(input, init);
  const res = await fetchRaw(`${url.href}.gz`, init);
  if (!res.ok) return res;
  const type = TYPES[url.pathname.split('.').pop()] ?? 'application/octet-stream';
  return new Response(res.body.pipeThrough(new DecompressionStream('gzip')), { headers: { 'Content-Type': type } });
};
