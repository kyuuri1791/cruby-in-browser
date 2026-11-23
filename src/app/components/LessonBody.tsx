import type { Block } from "@/lib/lessons";

/** `...` をインラインのコードにする */
function Inline({ text }: { text: string }) {
  const parts = text.split(/(`[^`]+`)/g);
  return (
    <>
      {parts.map((p, i) => (p.startsWith("`") && p.endsWith("`") && p.length > 1 ? <code key={i}>{p.slice(1, -1)}</code> : <span key={i}>{p}</span>))}
    </>
  );
}

export default function LessonBody({ blocks }: { blocks: Block[] }) {
  return (
    <>
      {blocks.map((b, i) => {
        switch (b.type) {
          case "p":
            return <p key={i}><Inline text={b.text} /></p>;
          case "code":
            return <pre key={i} className={`codeblock lang-${b.lang}`}><code>{b.code}</code></pre>;
          case "list":
            return <ul key={i}>{b.items.map((it, j) => <li key={j}><Inline text={it} /></li>)}</ul>;
          case "note":
            return <aside key={i} className="note"><Inline text={b.text} /></aside>;
        }
      })}
    </>
  );
}
