"use client";

import { useRef, type ReactNode } from "react";

// 「このサイトについて」。ヘッダーのボタンをクリックすると、画面の中央にダイアログで出す（画面は移らない）

// ビルドに使った CRuby のコミット（ruby-build/README.md の手順 1 と同じ）
const CRUBY_REVISION = "a28ce4f87653cc29eb67ec31f7dfdaadcf3436a3";

const components = [
  { name: "Ruby（CRuby）", what: "Ruby 本体と C のソース", license: "Ruby License または BSD-2-Clause", files: [["COPYING", "/licenses/ruby-COPYING.txt"], ["BSDL", "/licenses/ruby-BSDL.txt"], ["LEGAL", "/licenses/ruby-LEGAL.txt"]], url: "https://github.com/ruby/ruby" },
  { name: "YoWASP Clang/LLD（LLVM）", what: "clang・wasm-ld・wasi-libc", license: "ISC、Apache-2.0 with LLVM Exceptions（LLVM）、wasi-libc は各ファイルのライセンス", files: [], url: "https://github.com/YoWASP/clang" },
  { name: "LLVM（llvm-split）", what: "llvm-split（YoWASP の LLVM を WASI 向けにビルドし、--default-visibility を足したもの）", license: "Apache-2.0 with LLVM Exceptions", files: [], url: "https://github.com/YoWASP/llvm-project" },
  { name: "Binaryen", what: "wasm-opt（asyncify）", license: "Apache-2.0", files: [["LICENSE", "/licenses/binaryen-LICENSE.txt"]], url: "https://github.com/WebAssembly/binaryen" },
  { name: "browser_wasi_shim", what: "WASI", license: "MIT または Apache-2.0", files: [["LICENSE-MIT", "/licenses/browser_wasi_shim-LICENSE-MIT.txt"]], url: "https://github.com/bjorn3/browser_wasi_shim" },
  { name: "CodeMirror", what: "コードエディタ", license: "MIT", files: [["LICENSE", "/licenses/codemirror-LICENSE.txt"]], url: "https://codemirror.net/" },
];

export default function AboutDialog() {
  const dialog = useRef<HTMLDialogElement>(null);
  const close = () => dialog.current?.close();
  return (
    <>
      <button type="button" className="about-trigger" onClick={() => dialog.current?.showModal()}>
        このサイトについて
      </button>
      {/* Esc で閉じるのは dialog の標準の動き。暗くした背景をクリックしても閉じる */}
      <dialog ref={dialog} className="about-dialog" aria-labelledby="about-title" onClick={(e) => e.target === dialog.current && close()}>
        <div className="about-body">
          <div className="about-head">
            <h1 id="about-title">このサイトについて</h1>
            <button type="button" className="about-close" aria-label="閉じる" onClick={close}>✕</button>
          </div>
          <p>
            <a href="https://github.com/ko1/rubyhackchallenge" target="_blank">Ruby Hack Challenge</a> に着想を得た非公式サイトです。
          </p>
          <h2>CRuby の版</h2>
          <p>
            4.1.0dev、{""}
            <a href={`https://github.com/ruby/ruby/tree/${CRUBY_REVISION}`} target="_blank"><code>{CRUBY_REVISION.slice(0, 10)}</code></a>
            （2026-11-17）。エディタの C のファイルはこのコミットのソースです。
          </p>
          <h2>仕組み</h2>
          <ul>
            <li>Ruby 本体は stringio・ripper などの拡張を静的リンクし、編集できる C のファイルを除いて WebAssembly（PIE）にビルドしてある。</li>
            <li>make は、GNU make の一部を JavaScript で書き直したもの。エクスプローラーの Makefile をそのまま読んで実行する。</li>
            <li>clang は YoWASP Clang、wasm-opt は Binaryen.js で、どちらもブラウザの中で動く。同時に動かせるよう、それぞれ別の Web Worker で実行する。</li>
            <li>編集できるファイルは <code>libruby-edit.so</code> と、VM・パーサ・コンパイラの共有ライブラリ <code>libruby-vm.0.so</code> などにまとめ、<code>./ruby</code> の起動時に動的リンクする。VM・パーサ・コンパイラは最適化しないと Ruby の実行全体が遅くなるので、こちらだけ最適化をかけている。</li>
            <li><code>vm.c</code>・<code>prism.c</code>・<code>compile.c</code> は大きなファイルなので、bitcode にしてから <code>llvm-split</code>（WASI 向けにビルドしたもの）でそれぞれ 4 つに分け、<code>make -j4</code> で並列にビルドする。</li>
            <li>標準ライブラリは <code>make install</code>、rspec は <code>gem install</code> したものをそのまま使う。</li>
          </ul>
          <h2>使っているソフトウェアとライセンス</h2>
          <table className="license-table">
            <thead>
              <tr><th>名前</th><th>使っているところ</th><th>ライセンス</th></tr>
            </thead>
            <tbody>
              {components.map((c) => (
                <tr key={c.name}>
                  <td><a href={c.url} target="_blank">{c.name}</a></td>
                  <td>{c.what}</td>
                  <td>
                    {c.license}
                    {c.files.length > 0 && (
                      <div className="small">
                        {c.files.map(([label, href]) => <a key={href} href={href} target="_blank">{label}</a>).reduce<ReactNode[]>((a, el, i) => (i ? [...a, "・", el] : [el]), [])}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </dialog>
    </>
  );
}
