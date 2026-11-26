// ブラウザで編集・再ビルドできる Ruby のソースファイル
//   lib        … まとめる共有ライブラリ（省略時は EDIT_LIBS の先頭）
//   includedBy … 単独ではコンパイルせず、そのファイルに #include されるもの
//   dir        … ブラウザの中で置くフォルダ（省略時は ruby。build は Ruby のビルドで生成されたファイル）
export const EDITABLE = [
  { name: 'version', label: 'version.c' },
  { name: 'array', label: 'array.c' },
  { name: 'string', label: 'string.c' },
  { name: 'numeric', label: 'numeric.c' },
  { name: 'hash', label: 'hash.c' },
  { name: 'object', label: 'object.c' },
  { name: 'range', label: 'range.c' },
  { name: 'time', label: 'time.c' },
  { name: 'proc', label: 'proc.c' },
  { name: 'class', label: 'class.c' },
  // VM は別の共有ライブラリにする（asyncify に最適化をかけないと、Ruby の実行全体が遅くなるため）
  { name: 'vm', label: 'vm.c', lib: 'libruby-vm.so' },
  // vm.c が #include している .c。単独ではコンパイルせず、書き換えると vm.o を作り直す
  { name: 'vm_eval', label: 'vm_eval.c', includedBy: 'vm' },
  { name: 'vm_method', label: 'vm_method.c', includedBy: 'vm' },
  { name: 'vm_insnhelper', label: 'vm_insnhelper.c', includedBy: 'vm' },
  // 命令の本体。insns.def から生成されたものを vm_exec.c が #include している（命令の追加はできない）
  { name: 'vm_inc', label: 'vm.inc', dir: 'build', includedBy: 'vm' },
];
/** ブラウザの中のパス（ruby/array.c、build/vm.inc） */
export const srcPath = (e) => `${e.dir ?? 'ruby'}/${e.label}`;

// Ruby の configure が選ぶ warnflags と同じもの
const WARN_FLAGS = [
  '-Wall', '-Wextra', '-Wextra-tokens', '-Wdeprecated-declarations', '-Wdivision-by-zero', '-Wimplicit-function-declaration',
  '-Wimplicit-int', '-Wpointer-arith', '-Wwrite-strings', '-Wold-style-definition', '-Wmissing-noreturn', '-Wno-cast-function-type',
  '-Wno-long-long', '-Wno-missing-field-initializers', '-Wno-overlength-strings', '-Wno-tautological-compare', '-Wno-unused-parameter',
  '-Wno-unused-value', '-Wunused-variable', '-Wno-constant-logical-operand', '-Wno-parentheses-equality', '-Wno-self-assign',
  '-Wmisleading-indentation', '-Wshorten-64-to-32', '-Wundef',
];

// ブラウザでのコンパイルと、元の .so を作るときの共通フラグ（両方で同じにする）
export const COMPILE_FLAGS = [
  '-D_WASI_EMULATED_SIGNAL', '-D_WASI_EMULATED_MMAN', '-D_WASI_EMULATED_GETPID', '-D_WASI_EMULATED_PROCESS_CLOCKS',
  '-DRUBY_EXPORT', '-DPRISM_XALLOCATOR', '-fno-strict-overflow', '-fdeclspec', '-std=gnu23',
  '-fPIC', '-fvisibility=default', '-O1',
  // Ruby 本体の make と同じ警告を出す（コード生成には影響しない）
  ...WARN_FLAGS,
];

// build-pic ディレクトリから見たインクルードパス
export const INCLUDE_DIRS = ['.', '.ext/include/wasm32-wasi', '.ext/include', '../ruby/include', '../ruby', '../ruby/prism', '../ruby/enc/unicode/17.0.0'];

// 本体と一緒に読み込む共有ライブラリ（インスタンス化の順）
export const LIBS = ['libc.so', 'libwasi-emulated-mman.so', 'libwasi-emulated-signal.so', 'libwasi-emulated-getpid.so', 'libwasi-emulated-process-clocks.so'];

// 編集できるファイルをまとめる共有ライブラリ。optimize は asyncify のあとに -O1 をかけるか
//   libruby-edit.so … 最適化なし（-O1 をかけるとリンクが数倍遅くなり、実行速度はほぼ変わらない）
//   libruby-vm.so   … 最適化あり（VM は最適化しないと実行全体が約 1.6 倍遅くなり、rspec がスタックあふれで落ちる）
export const EDIT_LIBS = [
  { name: 'libruby-edit.so', optimize: false },
  { name: 'libruby-vm.so', optimize: true },
];
export const libOf = (e) => e.lib ?? EDIT_LIBS[0].name;
/** 単独でコンパイルするファイル（.o を作るもの） */
export const COMPILED = EDITABLE.filter((e) => !e.includedBy);
