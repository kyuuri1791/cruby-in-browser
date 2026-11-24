import { useState } from "react";
import type { Block } from "@/lib/lessons";

/** コードブロック。copyable なら、右上のボタンで中身をクリップボードにコピーできる */
function CodeBlock({ lang, code, copyable }: { lang: string; code: string; copyable: boolean }) {
  const [copied, setCopied] = useState(false);
  if (!copyable) return <pre className={`codeblock lang-${lang}`}><code>{code}</code></pre>;
  const copy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div className="codeblock-wrap">
      <pre className={`codeblock lang-${lang}`}><code>{code}</code></pre>
      <button className="copy-btn" onClick={copy} aria-label="コピー">{copied ? "コピーしました" : "コピー"}</button>
    </div>
  );
}

/** `...` をインラインのコードにする */
function Inline({ text }: { text: string }) {
  const parts = text.split(/(`[^`]+`)/g);
  return (
    <>
      {parts.map((p, i) => (p.startsWith("`") && p.endsWith("`") && p.length > 1 ? <code key={i}>{p.slice(1, -1)}</code> : <span key={i}>{p}</span>))}
    </>
  );
}

/** GitHub の差分のように、行番号を付けて追加を緑、削除を赤で出す */
function Diff({ file, diff }: { file: string; diff: string }) {
  const rows: { cls: string; old: string; new: string; sign: string; text: string }[] = [];
  let o = 0;
  let n = 0;
  for (const line of diff.split("\n")) {
    const h = line.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (h) {
      o = Number(h[1]);
      n = Number(h[2]);
      rows.push({ cls: "d-hunk", old: "", new: "", sign: "", text: line });
      continue;
    }
    const sign = line[0] ?? " ";
    const text = line.slice(1);
    if (sign === "+") rows.push({ cls: "d-add", old: "", new: String(n++), sign, text });
    else if (sign === "-") rows.push({ cls: "d-del", old: String(o++), new: "", sign, text });
    else rows.push({ cls: "", old: String(o++), new: String(n++), sign: " ", text });
  }
  return (
    <figure className="diffblock">
      <figcaption>{file}</figcaption>
      <div className="diff-scroll">
        <table>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className={r.cls || undefined}>
                <td className="d-num">{r.old}</td>
                <td className="d-num">{r.new}</td>
                <td className="d-code">{r.cls === "d-hunk" ? r.text : `${r.sign} ${r.text}`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}

/** copyable: コードブロックにコピーのボタンを付ける（課題の前の手順だけ） */
export default function LessonBody({ blocks, copyable = false }: { blocks: Block[]; copyable?: boolean }) {
  return (
    <>
      {blocks.map((b, i) => {
        switch (b.type) {
          case "p":
            return <p key={i}><Inline text={b.text} /></p>;
          case "code":
            return <CodeBlock key={i} lang={b.lang} code={b.code} copyable={copyable} />;
          case "list":
            return <ul key={i}>{b.items.map((it, j) => <li key={j}><Inline text={it} /></li>)}</ul>;
          case "note":
            return <aside key={i} className="note"><Inline text={b.text} /></aside>;
          case "diff":
            return <Diff key={i} file={b.file} diff={b.diff} />;
        }
      })}
    </>
  );
}
