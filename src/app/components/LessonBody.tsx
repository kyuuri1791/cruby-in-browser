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

/** 「ファイル:行番号」のリンクを押した時に呼ぶ関数（作業台でそのファイルのその行を開く） */
export type Locate = (label: string, line: number, anchor?: string) => void;

/**
 * `...` をインラインのコードにし、{{ファイル:行番号|目印}} を、そのファイルのその行を開くリンクにする。
 * 目印は、その行に含まれるコード。書き換えて行がずれていても、行番号の近くで目印を探して移動する
 */
function Inline({ text, onLocate }: { text: string; onLocate?: Locate }) {
  const parts = text.split(/(`[^`]+`|\{\{[^}]+\}\})/g);
  return (
    <>
      {parts.map((p, i) => {
        const loc = p.match(/^\{\{([^:|]+):(\d+)(?:\|(.*))?\}\}$/);
        if (loc) {
          const [, label, line, anchor] = loc;
          return (
            <button key={i} type="button" className="loc-link" onClick={() => onLocate?.(label, Number(line), anchor)} title={`${label} の ${line} 行目を開く`}>
              {label}:{line}
            </button>
          );
        }
        return p.startsWith("`") && p.endsWith("`") && p.length > 1 ? <code key={i}>{p.slice(1, -1)}</code> : <span key={i}>{p}</span>;
      })}
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
                <td className="d-code">
                  {r.cls === "d-hunk" ? (
                    r.text
                  ) : (
                    <>
                      {/* 記号はコピーされないようにする */}
                      <span className="d-sign">{`${r.sign} `}</span>
                      {r.text}
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}

/** copyable: コードブロックにコピーのボタンを付ける（手順と課題） */
export default function LessonBody({ blocks, copyable = false, onLocate }: { blocks: Block[]; copyable?: boolean; onLocate?: Locate }) {
  return (
    <>
      {blocks.map((b, i) => {
        switch (b.type) {
          case "p":
            return <p key={i}><Inline text={b.text} onLocate={onLocate} /></p>;
          case "code":
            return <CodeBlock key={i} lang={b.lang} code={b.code} copyable={copyable} />;
          case "list":
            return <ul key={i}>{b.items.map((it, j) => <li key={j}><Inline text={it} onLocate={onLocate} /></li>)}</ul>;
          case "note":
            return <aside key={i} className="note"><Inline text={b.text} onLocate={onLocate} /></aside>;
          case "diff":
            return <Diff key={i} file={b.file} diff={b.diff} />;
        }
      })}
    </>
  );
}
