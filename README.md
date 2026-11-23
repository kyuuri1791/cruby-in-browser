# ブラウザで CRuby

CRuby の C のソースを書き換え、ブラウザの中でビルドして動かす Web アプリです。サーバー側では何もコンパイルせず、ビルドも実行も全てブラウザの中で行います。

- エディタで `array.c` などを書き換え、`make` でビルドし、`./ruby main.rb` で実行する
- 課題ごとに RSpec の spec があり、`bin/rspec spec/…` で確かめられる
- 課題は Array や String へのメソッドの追加から、Proc、`define_method`、`method_missing` など VM の中までの 16 個

[Ruby Hack Challenge](https://github.com/ko1/rubyhackchallenge) に着想を得ています。教材の文章と課題は、このリポジトリで書いたものです。

## 仕組み

- Ruby 本体（master）は WebAssembly（wasm32-wasip1）向けにビルドし、配信しておく。編集できる C のファイルだけは本体から抜いておく
- 編集できるファイルは、ブラウザの中で [YoWASP Clang](https://github.com/YoWASP/clang) がコンパイルし、共有ライブラリ（`libruby-edit.so` と、VM だけの `libruby-vm.so`）にまとめる。asyncify は [Binaryen.js](https://github.com/WebAssembly/binaryen) の wasm-opt でかける
- `make` は、GNU make の一部を JavaScript で書き直したもの（`public/cruby/make.mjs`）。配信している `Makefile` をそのまま読む
- `./ruby` を実行すると、本体と共有ライブラリを自作の動的リンカ（`public/cruby/dylink.mjs`）でつないで起動する。WASI は [browser_wasi_shim](https://github.com/bjorn3/browser_wasi_shim) を使う
- 標準ライブラリと RSpec は、`make install` と `gem install` したものをそのまま tar にして配信する
- 大きなファイル（コンパイラ、Ruby 本体、標準ライブラリなど）は gzip して配信し、Web Worker の中で展開する（`public/cruby/gz-fetch.mjs`）。ロリポップ！デプロイナウの Free プランの上限（100MB）に収めるため

## 動かし方

Node.js 22 以上が必要です。

```sh
npm install
npm run dev
```

http://localhost:3000 を開きます。Ruby の素材（`public/cruby/assets/`）は作成済みのものが入っています。作り直す手順は [ruby-build/README.md](ruby-build/README.md) にあります。

## ファイルの構成

| 場所 | 中身 |
|---|---|
| `src/app/` | 画面（Next.js） |
| `src/lib/lessons.ts` | 教材の本文・課題・spec |
| `src/lib/runner.ts` | Web Worker とのやり取り |
| `public/cruby/` | Web Worker（`worker.mjs`）、make、動的リンカ、コンパイラの呼び出し |
| `public/cruby/assets/` | 配信する Ruby の素材（本体、`.o`、共有ライブラリ、ソース、ヘッダ、標準ライブラリ）。大きなものは `.gz` |
| `ruby-build/` | Ruby の素材を作るスクリプト |
| `scripts/e2e/` | ブラウザで動かすテスト（puppeteer） |

## テスト

dev サーバーを起動した状態で実行します。Chromium が必要です（`/usr/bin/chromium`）。

```sh
node scripts/e2e/smoke.mjs http://localhost:3000     # 画面と make・実行の一通り
node scripts/e2e/answers.mjs http://localhost:3000   # 全課題の解答例で spec が通るか
```

画面に出る日本語は textlint で検査します（`npm run lint:ja`）。

## ライセンス

Ruby 本体と、使っているソフトウェアのライセンスは、アプリの「このサイトについて」に一覧があります。ライセンス文は `public/licenses/` にあります。
