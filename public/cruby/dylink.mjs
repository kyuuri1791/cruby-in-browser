// 小さな WebAssembly 動的リンカ（wasm-ld の -pie / -shared 出力 = dylink.0 形式を読む）
// ブラウザでもそのまま使えるよう、ファイル読み込みは呼び出し側から渡す。

const PAGE = 65536;
const align = (x, a) => Math.ceil(x / a) * a;

export function parseDylink(bytes) {
  const mod = bytes instanceof WebAssembly.Module ? bytes : new WebAssembly.Module(bytes);
  const info = { mod, memSize: 0, memAlign: 0, tableSize: 0, tableAlign: 0, needed: [] };
  for (const s of WebAssembly.Module.customSections(mod, 'dylink.0')) {
    const d = new Uint8Array(s); let p = 0;
    const leb = () => { let r = 0, sh = 0, b; do { b = d[p++]; r |= (b & 0x7f) << sh; sh += 7; } while (b & 0x80); return r >>> 0; };
    const str = () => { const n = leb(); const t = new TextDecoder().decode(d.subarray(p, p + n)); p += n; return t; };
    while (p < d.length) {
      const type = d[p++], len = leb(), end = p + len;
      if (type === 1) Object.assign(info, { memSize: leb(), memAlign: 2 ** leb(), tableSize: leb(), tableAlign: 2 ** leb() });
      else if (type === 2) { const n = leb(); for (let i = 0; i < n; i++) info.needed.push(str()); }
      p = end;
    }
  }
  return info;
}

/**
 * modules: [{ name, module: WebAssembly.Module, main?: true }]（インスタンス化する順。依存される側を先に）
 * wasiImports: wasi_snapshot_preview1 の実装
 * extraImports: { 'module.name': value } 追加・上書きしたい import
 */
export function link({ modules, wasiImports, onMemory = () => {}, stackSize = 16 * 1024 * 1024, initialPages = 512, extraImports = {}, log = () => {} }) {
  const infos = modules.map(({ name, module }) => ({ name, ...parseDylink(module) }));
  const tableNeed = infos.reduce((a, i) => a + i.tableSize + i.tableAlign, 1) + 64;

  // メモリ配置: [0, 1024) 予約 → スタック → 各モジュールの静的データ → ヒープ
  let cur = 1024;
  const stackLow = cur; cur += stackSize; const stackHigh = cur;
  for (const i of infos) { cur = align(cur, Math.max(i.memAlign, 16)); i.memBase = cur; cur += i.memSize; }
  const heapBase = align(cur, 16);
  const memory = new WebAssembly.Memory({ initial: Math.max(initialPages, Math.ceil(heapBase / PAGE) + 16) });
  const table = new WebAssembly.Table({ element: 'anyfunc', initial: tableNeed });
  let tableCur = 1; // 0 は NULL 関数ポインタ用
  for (const i of infos) { tableCur = align(tableCur, Math.max(i.tableAlign, 1)); i.tableBase = tableCur; tableCur += i.tableSize; }

  const syms = new Map();   // name -> { kind: 'func', fn } | { kind: 'data', addr }
  const gotMem = new Map(); // name -> WebAssembly.Global
  const gotFunc = new Map();
  const funcIndex = new Map(); // fn -> table index
  const i32 = (v, mutable = false) => new WebAssembly.Global({ value: 'i32', mutable }, v);
  const stackPointer = i32(stackHigh, true);

  const special = {
    __stack_pointer: stackPointer, __heap_base: i32(heapBase), __heap_end: i32(memory.buffer.byteLength),
    __stack_low: i32(stackLow), __stack_high: i32(stackHigh),
  };
  for (const n of ['__heap_base', '__heap_end', '__stack_low', '__stack_high']) syms.set(n, { kind: 'data', addr: special[n].value });

  const addToTable = (fn) => {
    if (funcIndex.has(fn)) return funcIndex.get(fn);
    if (tableCur >= table.length) table.grow(Math.max(64, tableCur - table.length + 1));
    const idx = tableCur++; table.set(idx, fn); funcIndex.set(fn, idx); return idx;
  };
  const resolveFunc = (name) => {
    const s = syms.get(name);
    if (!s || s.kind !== 'func') throw new Error(`未定義の関数: ${name}`);
    return s.fn;
  };

  const instances = [];
  for (const info of infos) {
    const imports = { env: {}, 'GOT.mem': {}, 'GOT.func': {}, wasi_snapshot_preview1: wasiImports };
    for (const imp of WebAssembly.Module.imports(info.mod)) {
      const key = `${imp.module}.${imp.name}`;
      if (key in extraImports) { (imports[imp.module] ??= {})[imp.name] = extraImports[key]; continue; }
      if (imp.module === 'wasi_snapshot_preview1') continue;
      if (imp.module === 'env') {
        if (imp.name === 'memory') imports.env.memory = memory;
        else if (imp.name === '__indirect_function_table') imports.env.__indirect_function_table = table;
        else if (imp.name === '__memory_base') imports.env.__memory_base = i32(info.memBase);
        else if (imp.name === '__table_base') imports.env.__table_base = i32(info.tableBase);
        else if (imp.kind === 'global' && special[imp.name]) imports.env[imp.name] = special[imp.name];
        else if (imp.kind === 'function') {
          const s = syms.get(imp.name);
          // 既に定義済みなら wasm 関数を直接渡す（JS を挟まない）。未定義なら後で解決するスタブ。
          imports.env[imp.name] = s?.kind === 'func' ? s.fn : (...a) => resolveFunc(imp.name)(...a);
        } else if (imp.kind === 'tag' || imp.kind === 'global') {
          (imports.env)[imp.name] = extraImports[key];
        }
      } else if (imp.module === 'GOT.mem') {
        imports['GOT.mem'][imp.name] = gotMem.get(imp.name) ?? gotMem.set(imp.name, i32(0, true)).get(imp.name);
      } else if (imp.module === 'GOT.func') {
        imports['GOT.func'][imp.name] = gotFunc.get(imp.name) ?? gotFunc.set(imp.name, i32(0, true)).get(imp.name);
      } else {
        (imports[imp.module] ??= {});
      }
    }
    const inst = new WebAssembly.Instance(info.mod, imports);
    info.instance = inst;
    instances.push(inst);
    for (const [name, v] of Object.entries(inst.exports)) {
      if (typeof v === 'function') {
        if (!syms.has(name) || syms.get(name).weak) syms.set(name, { kind: 'func', fn: v });
      } else if (v instanceof WebAssembly.Global) {
        if (!syms.has(name)) syms.set(name, { kind: 'data', addr: info.memBase + v.value });
      }
    }
    log(`${info.name}: memBase=${info.memBase} memSize=${info.memSize} tableBase=${info.tableBase} tableSize=${info.tableSize}`);
  }

  // GOT を埋める
  const missing = [];
  for (const [name, g] of gotMem) {
    const s = syms.get(name);
    if (s?.kind === 'data') g.value = s.addr;
    else if (s?.kind === 'func') g.value = addToTable(s.fn);
    else missing.push(`GOT.mem ${name}`);
  }
  for (const [name, g] of gotFunc) {
    const s = syms.get(name);
    if (s?.kind === 'func') g.value = addToTable(s.fn);
    else missing.push(`GOT.func ${name}`);
  }
  if (missing.length) log(`未解決: ${missing.join(', ')}`);

  // データ再配置とコンストラクタ（依存される側 = 後ろから）
  onMemory(memory);
  // PIC モジュールのデータ再配置（_start や _initialize では行われないのでローダーが呼ぶ）
  for (const info of infos) info.instance.exports.__wasm_apply_data_relocs?.();

  for (const info of infos) {
    if (modules.find((m) => m.name === info.name).main) continue;
    const ex = info.instance.exports;
    (ex._initialize ?? ex.__wasm_call_ctors)?.();
  }
  const main = infos.find((i) => modules.find((m) => m.name === i.name).main).instance;
  return { memory, table, syms, infos, main, missing };
}
