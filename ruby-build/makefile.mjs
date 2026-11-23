// ブラウザの中の make（public/cruby/make.mjs）が読む Makefile を作る。
// 編集できる C のファイルを .o にして、共有ライブラリ（libruby-edit.so と、VM の libruby-vm.so）にまとめる。
// asyncify の最適化は VM だけにかける（config.mjs の EDIT_LIBS）。
// ここに書いたコマンドが、そのままブラウザの中で実行される（clang は YoWASP Clang、wasm-opt は Binaryen.js）。
import { EDITABLE, EDIT_LIBS, COMPILED, COMPILE_FLAGS, INCLUDE_DIRS, libOf } from './config.mjs';
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

export function makefile() {
  // build-pic からの相対パスを、ブラウザの中のファイルの置き場所（build/ と ruby/）に直す
  const inc = INCLUDE_DIRS.map((d) => `-I${path.posix.normalize(`build/${d}`).replace(/^ruby\//, 'ruby/')}`);
  return `CC = clang
CFLAGS = ${wrap(['--target=wasm32-wasip1', ...COMPILE_FLAGS, '-fno-color-diagnostics'])}
INCFLAGS = ${wrap(inc)}
LDFLAGS = --target=wasm32-wasip1 -shared -Wl,--experimental-pic -Wl,--unresolved-symbols=import-dynamic
WASMOPT = wasm-opt
WASMOPTFLAGS = --asyncify --pass-arg=asyncify-import-globals -g

${EDIT_LIBS.map((l) => `${varOf(l)} = ${COMPILED.filter((e) => libOf(e) === l.name).map((e) => `out/${e.name}.o`).join(' ')}`).join('\n')}

.PHONY: all

all: ${EDIT_LIBS.map((l) => `out/${l.name}`).join(' ')}
${EDIT_LIBS.map((l) => `
out/${l.name}: $(${varOf(l)})
\t$(CC) $(LDFLAGS) $^ -o $@
\t$(WASMOPT)${l.optimize ? " -O1" : ""} $(WASMOPTFLAGS) $@ -o $@
`).join('')}
${COMPILED.filter((c) => EDITABLE.some((e) => e.includedBy === c.name)).map((c) => `out/${c.name}.o: ${EDITABLE.filter((e) => e.includedBy === c.name).map((e) => `ruby/${e.name}.c`).join(' ')}\n`).join('')}
out/%.o: ruby/%.c
\t$(CC) $(CFLAGS) $(INCFLAGS) -c $< -o $@
`;
}
