# Ruby の素材を作る手順

ブラウザで動かす Ruby の素材を `public/cruby/assets/` に作る手順です。配信前に 1 回だけやります。
作業用のディレクトリは `spike/`（git には入れない）で、場所は環境変数 `CRUBY_WORK` で変えられます。

## 必要なもの

- clang と wasm-ld（WebAssembly 向けの出力ができるもの）、llvm-ar など
- Ruby 3.1 以上（ビルド中に使う BASERUBY）
- `npm install` 済みであること（`@yowasp/clang` の sysroot と `binaryen` を使う）

## 手順

1. Ruby のソースを取ってくる: `git clone --depth 1 https://github.com/ruby/ruby.git spike/ruby`
2. sysroot を用意する: `@yowasp/clang` の `gen/llvm-resources.tar` を `spike/yowasp-sysroot/` に展開する
3. `spike/fakesdk/bin/clang` を用意する。`--target=wasm32-wasip1 --sysroot=...` を付けて clang を呼ぶラッパーで、llvm-ar なども同じ場所に置く
4. 同じ Ruby master をネイティブでビルドして `spike/baseruby` に入れる（BASERUBY に使う。バージョンが違うと make install が失敗する）
5. wasm 向けに PIC で、拡張を静的リンクしてビルドし、`-fvisibility=hidden` を Makefile から外してから `make WASMOPT=: ruby` する
   ```
   cd spike/ruby && ./autogen.sh
   mkdir ../build-ext && cd ../build-ext
   WASI_SDK_PATH=$PWD/../fakesdk ../ruby/configure --build=x86_64-pc-linux-gnu --host wasm32-unknown-wasi \
     --with-baseruby=$PWD/../baseruby/bin/ruby CFLAGS=-fPIC debugflags= LDFLAGS="-Xlinker -zstack-size=16777216" \
     --with-static-linked-ext --with-ext=stringio,ripper,etc --disable-install-doc
   sed -i 's/ -fvisibility=hidden / /' Makefile
   make -j8 WASMOPT=: ruby
   ```
6. `make install DESTDIR=$PWD/../rubyroot WASMOPT=:` で標準ライブラリを入れる。次に `rubyroot/usr/local/lib/ruby/gems/<ver>/` の同梱 gem を消す。最後に rspec を入れる（`spike/baseruby/bin/gem install rspec --install-dir <そこ> --no-document`）
7. `npm run ruby:prepare`（約 3 分。本体の asyncify に時間がかかる）

編集できるファイルの一覧とコンパイルのフラグは `config.mjs` にあります。ここを変えたら 5 をやり直します。

## しくみのメモ

- 本体（`ruby.wasm`）は、拡張を静的リンクした ruby から、編集できるファイルを抜いたもの。`-pie --export-all --unresolved-symbols=import-dynamic` でリンクし、asyncify してある。
- 編集できるファイルは `.o` にしてから、まとめて 1 つの共有ライブラリ `libruby-edit.so`（`-shared` のサイドモジュール）にする。実行時に `public/cruby/dylink.mjs` でリンクする。
- `libruby-edit.so` の asyncify は最適化なし。`-O1` をかけるとリンクが約 10 倍遅くなり、実行速度はほぼ変わらない。
- VM（`vm.c`）だけは別の `libruby-vm.so` にして、asyncify に `-O1` をかける。最適化しないと Ruby の実行全体が約 1.6 倍遅くなり、rspec がスタックあふれで落ちる。
- `vm_eval.c`・`vm_method.c` は `vm.c` に `#include` されるので、単独ではコンパイルしない（`config.mjs` の `includedBy`）。書き換えると `out/vm.o` を作り直す。
- ブラウザでの再ビルドは、`public/cruby/assets/Makefile`（`makefile.mjs` が作る）を `public/cruby/make.mjs`（小さな make）が読んで行う。配信する `.o` と `libruby-edit.so` も、`prepare.mjs` が同じ Makefile を同じ make・clang（YoWASP）・Binaryen.js で実行して作っている。
- asyncify の状態変数（`__asyncify_state` と `__asyncify_data`）は、全モジュールで `asyncify-import-globals` にしてローダーが共有する。binaryen.js の `setPassArgument` に空文字を渡すと未設定扱いになるので `'1'` を渡す。
