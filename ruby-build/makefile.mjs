// ブラウザの中の make（public/cruby/make.mjs）が読む Makefile を作る。
// 編集できる C のファイルを .o にして、共有ライブラリ（libruby-edit.so と、VM の libruby-vm.0.so …）にまとめる。
// asyncify の最適化は VM だけにかける（config.mjs の EDIT_LIBS）。
// ここに書いたコマンドが、そのままブラウザの中で実行される（clang は YoWASP Clang、wasm-opt は Binaryen.js）。
import { EDITABLE, EDIT_LIBS, COMPILED, COMPILE_FLAGS, INCLUDE_DIRS, JOBS, libOf, libFiles, srcPath, splitOf, firstOutput } from './config.mjs';
import path from 'node:path';

const wrap = (words, indent = '\t') => {
  const lines = [];
  let cur = '';
  for (const w of words) {
    if (cur && (cur + ' ' + w).length > 100) {
      lines.push(cur);
      cur = w;
    } else cur = cur ? `${cur} ${w}` : w;
  }
  if (cur) lines.push(cur);
  return lines.join(` \\\n${indent}`);
};

/** OBJS、VM_OBJS のような変数名 */
const varOf = (l) => (l === EDIT_LIBS[0] ? 'OBJS' : `${l.name.replace(/^libruby-|\.so$/g, '').toUpperCase()}_OBJS`);

/** llvm-split が作るファイル（out/vm.bc.0 …） */
const parts = (name, n) => Array.from({ length: n }, (_, i) => `out/${name}.bc.${i}`);
const splits = COMPILED.map(splitOf).filter(Boolean);
/** 分ける共有ライブラリにまとめるソース（1 つだけ） */
const splitSource = (l) => {
  const srcs = COMPILED.filter((e) => libOf(e) === l.name);
  if (srcs.length !== 1) throw new Error(`${l.name}: 分けるライブラリのソースは 1 つにする`);
  return srcs[0].name;
};

export function makefile() {
  // build-pic からの相対パスを、ブラウザの中のファイルの置き場所（build/ と ruby/）に直す
  const inc = INCLUDE_DIRS.map((d) => `-I${path.posix.normalize(`build/${d}`).replace(/^ruby\//, 'ruby/')}`);
  return `CC = clang
CFLAGS = ${wrap(['--target=wasm32-wasip1', ...COMPILE_FLAGS, '-fno-color-diagnostics'])}
INCFLAGS = ${wrap(inc)}
IRFLAGS = --target=wasm32-wasip1 -fPIC -O1 -Xclang -disable-llvm-passes
LDFLAGS = --target=wasm32-wasip1 -shared -Wl,--experimental-pic -Wl,--unresolved-symbols=import-dynamic
WASMOPT = wasm-opt
WASMOPTFLAGS = --asyncify --pass-arg=asyncify-import-globals -g

${EDIT_LIBS.map((l) => (l.split ? `${varOf(l).replace('OBJS', 'LIBS')} = ${libFiles(l).map((f) => `out/${f}`).join(' ')}` : `${varOf(l)} = ${COMPILED.filter((e) => libOf(e) === l.name).map((e) => `out/${e.name}.o`).join(' ')}`)).join('\n')}

MAKEFLAGS += -j${JOBS}

.PHONY: all
.SECONDARY:

all: ${EDIT_LIBS.map((l) => (l.split ? `$(${varOf(l).replace('OBJS', 'LIBS')})` : `out/${l.name}`)).join(' ')}
${EDIT_LIBS.map((l) => (l.split ? `
out/${l.name.replace(/\.so$/, '.%.so')}: out/${splitSource(l)}.bc.%.o
\t$(CC) $(LDFLAGS) $< -o $@
\t$(WASMOPT)${l.optimize ? ' -O1' : ''} $(WASMOPTFLAGS) $@ -o $@
` : `
out/${l.name}: $(${varOf(l)})
\t$(CC) $(LDFLAGS) $^ -o $@
\t$(WASMOPT)${l.optimize ? ' -O1' : ''} $(WASMOPTFLAGS) $@ -o $@
`)).join('')}
${COMPILED.filter((c) => EDITABLE.some((e) => e.includedBy === c.name)).map((c) => `${firstOutput(c)}: ${EDITABLE.filter((e) => e.includedBy === c.name).map(srcPath).join(' ')}\n`).join('')}
out/%.o: ruby/%.c
\t$(CC) $(CFLAGS) $(INCFLAGS) -c $< -o $@
${splits.length ? `
# 大きなソースは、最適化まで済ませた bitcode を llvm-split で分けて、並列に機械語にする。
# 分けたものは別々の共有ライブラリにする。そのため llvm-split は、外に出したシンボルを hidden にしない（--default-visibility）
out/%.bc: ruby/%.c
\t$(CC) $(CFLAGS) $(INCFLAGS) -emit-llvm -c $< -o $@
${[...new Set(splits)].map((n) => `
${parts('%', n).join(' ')}: out/%.bc
\tllvm-split --default-visibility -j ${n} -o out/$*.bc. $<
`).join('')}
out/%.o: out/%
\t$(CC) $(IRFLAGS) -c -x ir $< -o $@
` : ''}`;
}
