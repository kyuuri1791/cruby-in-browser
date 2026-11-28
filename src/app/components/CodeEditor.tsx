"use client";

import { useEffect, useImperativeHandle, useRef, type Ref } from "react";
import { EditorState, Compartment } from "@codemirror/state";
import {
  EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter, drawSelection, highlightSpecialChars,
} from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { searchKeymap, highlightSelectionMatches } from "@codemirror/search";
import { findWidget, openFind } from "./findWidget";
import { syntaxHighlighting, defaultHighlightStyle, bracketMatching, indentUnit, StreamLanguage } from "@codemirror/language";
import { ruby } from "@codemirror/legacy-modes/mode/ruby";
import { cpp } from "@codemirror/lang-cpp";

export type CodeEditorHandle = {
  /** 指定した行へ移動して選択する */
  gotoLine: (line: number, col?: number) => void;
  openSearch: () => void;
};

type Props = {
  /** ファイルが変わったら作り直す */
  docKey: string;
  value: string;
  /** c: Ruby の C のソース / ruby: Ruby のファイル / make: Makefile と .rspec */
  language?: "c" | "ruby" | "make";
  readOnly?: boolean;
  onChange: (value: string) => void;
  ref?: Ref<CodeEditorHandle>;
};

const theme = EditorView.theme({
  "&": { height: "100%", fontSize: "13px", backgroundColor: "var(--code-bg)", color: "var(--fg)" },
  ".cm-scroller": { fontFamily: "var(--mono)", lineHeight: "1.5" },
  ".cm-gutters": { backgroundColor: "var(--code-bg)", color: "var(--muted)", borderRight: "1px solid var(--border)" },
  // 現在行の背景は選択の色の上に重なるので、半透明にする（不透明だと全選択で最後の行だけ選択の色が見えない）
  ".cm-activeLine": { backgroundColor: "rgba(27, 31, 36, 0.04)" },
  ".cm-activeLineGutter": { backgroundColor: "var(--active-line)" },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection": { backgroundColor: "var(--selection) !important" },
  ".cm-cursor": { borderLeftColor: "var(--fg)" },
  // 検索ウィジェットは VS Code のようにエディタ右上に浮かせる（本文を押し下げない）
  ".cm-panels.cm-panels-top": { position: "absolute", top: "0", right: "18px", left: "auto", border: "none", backgroundColor: "transparent", zIndex: "10" },
  ".cm-searchMatch": { backgroundColor: "var(--search-match)", borderRadius: "2px" },
  ".cm-searchMatch.cm-searchMatch-selected": { backgroundColor: "var(--search-current)", outline: "1px solid var(--search-current-border)" },
});

export default function CodeEditor({ docKey, value, language = "c", readOnly = false, onChange, ref }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  // ファイルを切り替えたときだけ作り直す（入力のたびに作り直さない）
  useEffect(() => {
    const lang = new Compartment();
    const v = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: value,
        extensions: [
          lineNumbers(), highlightActiveLineGutter(), highlightSpecialChars(), history(), drawSelection(),
          highlightActiveLine(), bracketMatching(), highlightSelectionMatches(),
          // Ruby の C のソースはタブ幅 8・字下げ 4、Ruby のコードは字下げ 2
          // Makefile のレシピはタブで始める必要がある
          indentUnit.of(language === "ruby" ? "  " : language === "make" ? "\t" : "    "),
          EditorState.tabSize.of(language === "ruby" ? 2 : 8),
          syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
          lang.of(language === "ruby" ? StreamLanguage.define(ruby) : language === "make" ? [] : cpp()), theme, findWidget(),
          EditorState.readOnly.of(readOnly),
          keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap, indentWithTab]),
          EditorView.updateListener.of((u) => {
            if (u.docChanged) onChangeRef.current(u.state.doc.toString());
          }),
        ],
      }),
    });
    view.current = v;
    return () => {
      v.destroy();
      view.current = null;
    };
    // value は最初の内容としてだけ使う
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docKey]);

  // 外から内容が差し替えられたとき（「元に戻す」など）
  useEffect(() => {
    const v = view.current;
    if (v && v.state.doc.toString() !== value) {
      v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: value } });
    }
  }, [value]);

  useImperativeHandle(ref, () => ({
    gotoLine(line, col = 1) {
      const v = view.current;
      if (!v) return;
      const l = v.state.doc.line(Math.max(1, Math.min(line, v.state.doc.lines)));
      const pos = Math.min(l.from + col - 1, l.to);
      v.dispatch({ selection: { anchor: pos }, effects: EditorView.scrollIntoView(pos, { y: "center" }) });
      v.focus();
    },
    openSearch() {
      if (view.current) openFind(view.current);
    },
  }), []);

  return <div ref={host} className="code-editor" />;
}
