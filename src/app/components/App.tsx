"use client";

import { useEffect, useRef, useState } from "react";
import type { Lesson } from "@/lib/lessons";
import LessonBody from "./LessonBody";
import LessonLayout from "./LessonLayout";
import Workbench from "./WorkbenchClient";
import type { WorkbenchHandle } from "./Workbench";

const TITLE = "ブラウザで CRuby";

/**
 * 1 画面のアプリ。左の目次で章を切り替えると、問題文だけが変わる。
 * エディタ・タブ・出力・書き換えた内容は、章を切り替えてもそのまま残る。
 * URL は /?lesson=<slug> にする（ページは読み込み直さない）。
 */
export default function App({ lessons, initialSlug }: { lessons: Lesson[]; initialSlug: string }) {
  const [slug, setSlug] = useState(initialSlug);
  const workbench = useRef<WorkbenchHandle>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const index = Math.max(0, lessons.findIndex((l) => l.slug === slug));
  const lesson = lessons[index];
  const specs = lessons.filter((l) => l.spec).map((l) => ({ slug: l.slug, spec: l.spec! }));
  const [tocOpen, setTocOpen] = useState(false);

  const show = (next: string, push: boolean) => {
    const l = lessons.find((x) => x.slug === next);
    if (!l) return;
    setSlug(next);
    setTocOpen(false);
    if (push) window.history.pushState(null, "", next === lessons[0].slug ? "/" : `/?lesson=${next}`);
    workbench.current?.openFile("main.rb");
    textRef.current?.scrollTo({ top: 0 });
  };

  // ブラウザの戻る・進む
  useEffect(() => {
    const onPop = () => {
      const s = new URLSearchParams(window.location.search).get("lesson") ?? lessons[0].slug;
      show(s, false);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  });

  useEffect(() => {
    document.title = index === 0 ? TITLE : `${lesson.title} | ${TITLE}`;
  }, [index, lesson.title]);

  const prev = lessons[index - 1];
  const next = lessons[index + 1];
  // 前後の章へのリンク（本文の上と下に置く）
  const pager = (pos: "top" | "bottom") => (
    <nav className={`lesson-nav lesson-nav-${pos}`} aria-label={pos === "top" ? "前後の章（上）" : "前後の章（下）"}>
      {prev ? <button className="link" onClick={() => show(prev.slug, true)}>← {prev.title}</button> : <span />}
      {next ? <button className="link" onClick={() => show(next.slug, true)}>{next.title} →</button> : <span />}
    </nav>
  );

  return (
    <LessonLayout
      lesson={
        <div className="lesson-pane-inner">
          <nav className="lesson-toc" aria-label="目次">
            <button className="toc-toggle" aria-expanded={tocOpen} onClick={() => setTocOpen(!tocOpen)}>
              <span className="chevron" aria-hidden="true">{tocOpen ? "⌄" : "›"}</span>
              目次
              <span className="toc-count">{index} / {lessons.length - 1}</span>
            </button>
            {tocOpen && <ol>
              {lessons.map((l, i) => (
                <li key={l.slug}>
                  {l.part && <div className="toc-part">{l.part}</div>}
                  <button className={l.slug === slug ? "toc-item active" : "toc-item"} aria-current={l.slug === slug ? "page" : undefined} onClick={() => show(l.slug, true)}>
                    <span className="toc-num">{i}</span>
                    <span className="toc-title">{l.title}</span>
                  </button>
                </li>
              ))}
            </ol>}
          </nav>
          <div className="lesson-scroll" ref={textRef}>
            <article className="lesson-text" key={lesson.slug}>
              {pager("top")}
              <h1>{lesson.title}</h1>
              {lesson.body && <LessonBody blocks={lesson.body} copyable />}
              {lesson.refs && (
                <section className="refs">
                  <h2>参考文献</h2>
                  <ul>
                    {lesson.refs.map((r) => (
                      <li key={r.url}>
                        <a href={r.url} target="_blank">{r.title}</a>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              {lesson.task && (
                <section className="task">
                  <h2>課題</h2>
                  <LessonBody blocks={lesson.task} />
                </section>
              )}
              {lesson.hints && (
                <details className="hint">
                  <summary>ヒント</summary>
                  <LessonBody blocks={lesson.hints} />
                </details>
              )}
              {lesson.answer && (
                <details className="hint">
                  <summary>解答例</summary>
                  <LessonBody blocks={lesson.answer} />
                </details>
              )}
              {pager("bottom")}
            </article>
          </div>
        </div>
      }
      workbench={
        <Workbench
          ref={workbench}
          current={{ slug: lesson.slug, spec: lesson.spec ?? null }}
          specs={specs}
        />
      }
    />
  );
}
