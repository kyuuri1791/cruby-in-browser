"use client";

import { useEffect, useImperativeHandle, useMemo, useRef, useState, type Ref } from "react";
import { useResizable } from "@/lib/useResizable";
import CodeEditor, { type CodeEditorHandle } from "./CodeEditor";
import { getRunner, RUN_TIME_LIMIT_MS, type OutputLine } from "@/lib/runner";
import BinaryInfo from "./BinaryInfo";
import { getEdit, loadManifest, loadOriginal, setEdit, type Manifest } from "@/lib/sources";
import { specPath } from "@/lib/lessons";

type Props = {
  /** 今開いている章（課題をチェックで、この章の spec を実行する） */
  current: { slug: string; spec: string | null };
  /** 全章の spec（spec/ フォルダに並べる） */
  specs: { slug: string; spec: string }[];
  ref?: Ref<WorkbenchHandle>;
};

export type WorkbenchHandle = {
  /** ファイルをタブで開く */
  openFile: (name: string) => void;
  /** 教材の「ファイル:行番号」のリンク。label（array.c など）のファイルを開き、line の近くで anchor を含む行へ移動する */
  openAt: (label: string, line: number, anchor?: string) => void;
};

/** anchor を含む行のうち、line にいちばん近い行（書き換えて行がずれていても、目印の行に着く）。見つからなければ line */
function nearestLine(text: string, line: number, anchor?: string) {
  if (!anchor) return line;
  let best = line;
  let bestDist = Infinity;
  text.split("\n").forEach((l, i) => {
    if (l.includes(anchor) && Math.abs(i + 1 - line) < bestDist) {
      best = i + 1;
      bestDist = Math.abs(i + 1 - line);
    }
  });
  return best;
}

// Ruby のファイル（/work に置いて ruby から読むもの）。C のファイルは "array" のような名前、Ruby のファイルはパスで区別する
const MAIN = "main.rb";
const BIN_RSPEC = "bin/rspec";
// rspec の binstub（gem のラッパーと同じ中身）
const BIN_RSPEC_SRC = '#!/usr/bin/env ruby\nrequire "rubygems"\nload Gem.bin_path("rspec-core", "rspec")\n';
const MAKEFILE = "Makefile";
const RUN_COMMAND = "./ruby main.rb";
const DOT_RSPEC = ".rspec";
const DOT_RSPEC_SRC = "--format documentation\n";
// /work に置くファイル（C のソースと Makefile 以外）
const isRuby = (name: string) => name.endsWith(".rb") || name.startsWith("bin/") || name === DOT_RSPEC;
// 書き換えられるのは C のソースと main.rb だけ
const isReadOnly = (name: string) => name === MAKEFILE || name === DOT_RSPEC || name.startsWith("spec/") || name.startsWith("bin/");

export default function Workbench({ current, specs, ref }: Props) {
  const specFile = current.spec ? specPath(current.slug) : null;
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  // 開いているファイル（タブは 1 つだけで、別のファイルを開くと差し替える）
  const [file, setFile] = useState<string | null>(MAIN);
  const explorer = useResizable(190, 120, 360, "x");
  const panel = useResizable(260, 120, 640, "y", true);
  // C のファイル: 元の内容と、書き換えたものだけ
  const [originals, setOriginals] = useState<Record<string, string>>({});
  const [edits, setEdits] = useState<Record<string, string>>({});
  // Ruby のファイル: 元の内容と、書き換えたものだけ。main.rb は最初は空で、全ての章で同じものを使う
  const rbOriginals = useMemo(() => {
    const o: Record<string, string> = { [MAIN]: "" };
    for (const s of specs) o[specPath(s.slug)] = s.spec;
    o[BIN_RSPEC] = BIN_RSPEC_SRC;
    o[DOT_RSPEC] = DOT_RSPEC_SRC;
    return o;
  }, [specs]);
  // 書き換えはブラウザには保存しない。ページを開いている間だけ残す（sources.ts のメモリ上）
  const [rbEdits, setRbEdits] = useState<Record<string, string>>(() => {
    const e: Record<string, string> = {};
    for (const path of [MAIN, ...specs.map((s) => specPath(s.slug))]) {
      const t = getEdit(path);
      if (t !== undefined) e[path] = t;
    }
    return e;
  });
  const checkCmd = specFile ? `${BIN_RSPEC} ${specFile}` : null;
  const [lines, setLines] = useState<OutputLine[]>([]);
  const [running, setRunning] = useState(false);
  const [confirmRevert, setConfirmRevert] = useState(false);
  // Worker の中のファイル（本体、lib、.so、make が作った .o など）
  const [vfsFiles, setVfsFiles] = useState<string[]>([]);
  const [filesVersion, setFilesVersion] = useState(0);
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set(["bin", "lib", "out", "spec"]));
  const toggleFolder = (label: string) =>
    setCollapsed((c) => {
      const next = new Set(c);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  useEffect(
    () =>
      getRunner().onFiles((f) => {
        setVfsFiles(f);
        setFilesVersion((v) => v + 1);
      }),
    [],
  );
  const editor = useRef<CodeEditorHandle>(null);
  const pendingGoto = useRef<{ line: number; col: number; anchor?: string } | null>(null);
  const outputRef = useRef<HTMLDivElement>(null);

  // 最初に: マニフェスト、このページで書き換えた C のファイル、Makefile
  useEffect(() => {
    getRunner().warmup();
    loadManifest()
      .then((m) => {
        setManifest(m);
        const e: Record<string, string> = {};
        for (const name of [...m.editable.map((f) => f.name), MAKEFILE]) {
          const t = getEdit(name);
          if (t !== undefined) e[name] = t;
        }
        setEdits(e);
      })
      .catch((err) => setLoadError(String(err.message ?? err)));
    loadOriginal(MAKEFILE)
      .then((text) => setOriginals((o) => ({ ...o, [MAKEFILE]: text })))
      .catch((err) => setLoadError(String(err.message ?? err)));
  }, []);

  // 開いている C のファイルの元の内容を読み込む
  useEffect(() => {
    // C のソースと Makefile だけ。Ruby のファイルと、本体や .so などのバイナリは読まない
    if (file === null || isRuby(file) || originals[file] !== undefined || vfsFiles.includes(file)) return;
    loadOriginal(file)
      .then((text) => setOriginals((o) => ({ ...o, [file]: text })))
      .catch((err) => setLoadError(String(err.message ?? err)));
  }, [file, originals, vfsFiles]);

  const rbEdited = (name: string) => rbEdits[name];
  const originalOf = (name: string | null) => (name === null ? undefined : isRuby(name) ? rbOriginals[name] : originals[name]);
  const textOf = (name: string | null) =>
    name === null ? undefined : isRuby(name) ? (rbEdited(name) ?? rbOriginals[name]) : (edits[name] ?? originals[name]);
  const original = originalOf(file);
  const text = textOf(file);
  const readOnly = file !== null && isReadOnly(file);
  const isChanged = (name: string | null) => name !== null && (isRuby(name) ? rbEdited(name) !== undefined : name in edits);

  // ファイルを開いた直後の行移動（エラーの行へ飛ぶ時）
  useEffect(() => {
    if (text === undefined || !pendingGoto.current) return;
    const g = pendingGoto.current;
    pendingGoto.current = null;
    requestAnimationFrame(() => editor.current?.gotoLine(nearestLine(text, g.line, g.anchor), g.col));
  }, [file, text]);

  const setEdited = (name: string, value: string | undefined) => {
    (isRuby(name) ? setRbEdits : setEdits)((e) => {
      const next = { ...e };
      if (value === undefined) delete next[name];
      else next[name] = value;
      return next;
    });
    setEdit(name, value);
  };

  const onChange = (value: string) => {
    if (file === null || original === undefined) return;
    setEdited(file, value === original ? undefined : value);
  };

  // Ctrl+S / ⌘S: 保存するものはないので、ブラウザの「ページを保存」だけ出さないようにする
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === "s") e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const revert = () => {
    if (!confirmRevert) {
      setConfirmRevert(true);
      setTimeout(() => setConfirmRevert(false), 3000);
      return;
    }
    setConfirmRevert(false);
    if (file !== null) setEdited(file, undefined);
  };

  // 出力は実行のたびに消さずに追記していく（古い行から捨てる）
  const MAX_LINES = 5000;
  const addLine = (l: OutputLine) => setLines((ls) => (ls.length >= MAX_LINES ? [...ls.slice(ls.length - MAX_LINES + 1), l] : [...ls, l]));
  // 行が増えたときと、終わって最後のプロンプトを出したときに、一番下までスクロールする
  useEffect(() => {
    outputRef.current?.scrollTo({ top: outputRef.current.scrollHeight });
  }, [lines, running]);

  /** /work に置くファイル（main.rb、spec、bin/rspec） */
  const rubyFiles = () => {
    const files: Record<string, string> = {};
    for (const path of Object.keys(rbOriginals)) files[path] = textOf(path)!;
    return files;
  };

  /** make だけ、または ./ruby（bin/rspec は shebang の通り ruby で実行する）だけを走らせる */
  const execute = async (command: string) => {
    // 待ち受けの $ を、そのままコマンドの行に置き換える（$ が消えてから出直す、のちらつきをなくす）
    addLine({ kind: "prompt", text: `$ ${command}` });
    setRunning(true);
    // 開いた直後で Makefile をまだ読み込んでいなければ、待ってから実行する（押したのに何も起きない、をなくす）
    const makefile = textOf(MAKEFILE) ?? (await loadOriginal(MAKEFILE));
    const sources: Record<string, string> = { ...edits };
    delete sources[MAKEFILE];
    const isMake = command === "make";
    // ボタンのコマンドは決まった形（./ruby main.rb と bin/rspec spec/…）なので、空白で分ければよい
    const words = command.split(" ");
    const args = isMake ? null : words[0] === "./ruby" ? words.slice(1) : words;
    const status = await getRunner().run({ sources, makefile, files: rubyFiles(), make: isMake, args }, addLine);
    setRunning(false);
    if (status === "timeout") addLine({ kind: "stderr", text: `Killed (time limit: ${RUN_TIME_LIMIT_MS / 1000}s)` });
  };

  const openFile = (name: string) => setFile(name);

  const openAt = (label: string, line: number, anchor?: string) => {
    const name = manifest?.editable.find((f) => f.label === label)?.name;
    if (!name) return;
    const current = textOf(name);
    if (name === file && current !== undefined) editor.current?.gotoLine(nearestLine(current, line, anchor), 1);
    else {
      pendingGoto.current = { line, col: 1, anchor };
      openFile(name);
    }
  };

  useImperativeHandle(ref, () => ({
    openFile,
    openAt,
  }));

  const jumpTo = (target: string, line: number, col: number) => {
    if (target === file) {
      editor.current?.gotoLine(line, col);
    } else {
      pendingGoto.current = { line, col };
      openFile(target);
    }
  };

  if (loadError) return <div className="wb-error">読み込みに失敗しました: {loadError}</div>;

  const files = manifest?.editable ?? [];
  const binaryPaths = new Set(vfsFiles);
  const isBinary = (name: string) => binaryPaths.has(name);
  const labelOf = (name: string) =>
    name === MAKEFILE ? MAKEFILE : isRuby(name) || isBinary(name) ? name.split("/").at(-1)! : (files.find((f) => f.name === name)?.label ?? `${name}.c`);
  const pathOf = (name: string) =>
    name === MAKEFILE ? MAKEFILE : isRuby(name) || isBinary(name) ? name.split("/").join(" › ") : `${(files.find((f) => f.name === name)?.dir ?? "ruby").split("/").join(" › ")} › ${labelOf(name)}`;
  const icon = (name: string) =>
    name === MAKEFILE ? (
      <span className="file-icon mk-icon" aria-hidden="true">mk</span>
    ) : isRuby(name) ? (
      <span className="file-icon rb-icon" aria-hidden="true">rb</span>
    ) : isBinary(name) ? (
      <span className="file-icon bin-icon" aria-hidden="true">{name.endsWith(".o") ? "o" : "wa"}</span>
    ) : (
      <span className="file-icon c-icon" aria-hidden="true">C</span>
    );
  const mark = (name: string) =>
    !isRuby(name) && name in edits ? <span className="modified" aria-label="変更あり">M</span> : null;
  const treeItem = (name: string, depth: number) => (
    <li key={name} role="treeitem" aria-selected={name === file}>
      <button
        className={`wb-tree-item${name === file ? " active" : ""}${isBinary(name) ? " binary" : isReadOnly(name) ? " readonly" : ""}`}
        style={{ paddingLeft: 10 + depth * 14 }}
        onClick={() => openFile(name)}
      >
        {icon(name)}
        <span className={!isRuby(name) && name in edits ? "name modified-name" : "name"}>{labelOf(name)}</span>
        {mark(name)}
      </button>
    </li>
  );
  // subfolders は中に入れるフォルダ（ruby/prism など）。key はたたんだ状態を覚えるための名前
  const folder = (label: string, children: string[], depth = 0, subfolders: [string, string[]][] = [], key = label) => {
    const open = !collapsed.has(key);
    const all = [...children, ...subfolders.flatMap(([, c]) => c)];
    return (
      <li key={`dir:${key}`} role="treeitem" aria-expanded={open} aria-selected={false} className="wb-tree-folder-item">
        {/* 中身が全てバイナリか編集できないファイルなら、フォルダも薄く出す */}
        <button className={`wb-tree-folder${all.every((c) => isBinary(c) || isReadOnly(c)) ? " readonly" : ""}`} style={depth ? { paddingLeft: 10 + depth * 14 } : undefined} onClick={() => toggleFolder(key)}>
          <span className="chevron" aria-hidden="true">{open ? "⌄" : "›"}</span> {label}
        </button>
        {open && (
          <ul role="group" className="wb-tree-group">
            {subfolders.map(([sub, c]) => folder(sub, c, depth + 1, [], `${key}/${sub}`))}
            {children.map((c) => treeItem(c, depth + 1))}
          </ul>
        )}
      </li>
    );
  };
  // VS Code と同じく、フォルダが先、その後にファイルを名前順（大文字と小文字は区別しない）
  const byName = (a: string, b: string) => a.localeCompare(b, "en", { sensitivity: "base" });
  const rootFiles = [MAIN, MAKEFILE, DOT_RSPEC, ...vfsFiles.filter((p) => !p.includes("/"))].sort(byName);
  const libFiles = vfsFiles.filter((p) => p.startsWith("lib/")).sort(byName);
  const outFiles = vfsFiles.filter((p) => p.startsWith("out/")).sort(byName);
  const specFiles = specs.map((s) => specPath(s.slug)).sort(byName);
  const binary = file !== null && isBinary(file);

  return (
    <div className="workbench" style={{ gridTemplateColumns: `${explorer.size}px 1px minmax(0, 1fr)` }}>
      <nav className="wb-explorer" aria-label="ファイル">
        <div className="wb-explorer-title">エクスプローラー</div>
        <ul className="wb-tree" role="tree">
          {/* VS Code と同じく、フォルダを名前順に先に並べる */}
          {folder("bin", [BIN_RSPEC])}
          {files.some((f) => f.dir === "build") && folder("build", files.filter((f) => f.dir === "build").map((f) => f.name))}
          {libFiles.length > 0 && folder("lib", libFiles)}
          {outFiles.length > 0 && folder("out", outFiles)}
          {folder(
            "ruby",
            files.filter((f) => !f.dir).map((f) => f.name),
            0,
            [...new Set(files.filter((f) => f.dir?.startsWith("ruby/")).map((f) => f.dir!))].map((d) => [d.slice("ruby/".length), files.filter((f) => f.dir === d).map((f) => f.name)]),
          )}
          {folder("spec", specFiles)}
          {rootFiles.map((name) => treeItem(name, 0))}
        </ul>
      </nav>
      <div {...explorer.handleProps} />

      <div className="wb-main" style={{ gridTemplateRows: `auto auto minmax(0, 1fr) 1px ${panel.size}px` }}>
        <div className="wb-tabs" role="tablist" aria-label="開いているファイル">
          {file && (
            <div className="tab active">
              <span role="tab" aria-selected className="tab-label">
                {icon(file)}
                <span className={!isRuby(file) && file in edits ? "modified-name" : ""}>{labelOf(file)}</span>
                {mark(file)}
              </span>
              <button className="tab-close" onClick={() => setFile(null)} aria-label={`${labelOf(file)} を閉じる`} title="閉じる">×</button>
            </div>
          )}
        </div>
        <div className="wb-toolbar">
          <span className="wb-file">{file ? pathOf(file) : ""}</span>
          {file && (readOnly || binary) && <span className="wb-save">読み取り専用</span>}
          <button className="ghost" onClick={() => editor.current?.openSearch()} disabled={!file || binary}>検索</button>
          <button className="ghost" onClick={revert} disabled={!isChanged(file)}>
            {confirmRevert ? "本当に元に戻す？" : "元に戻す"}
          </button>
        </div>
        <div className="wb-editor">
          {!file ? (
            <div className="wb-loading" />
          ) : binary ? (
            <BinaryInfo path={file} version={`${filesVersion}`} />
          ) : text === undefined ? (
            <div className="wb-loading">{labelOf(file)} を読み込み中…</div>
          ) : (
            <CodeEditor
              ref={editor}
              docKey={file}
              value={text}
              original={readOnly || isRuby(file) ? undefined : original}
              language={file === MAKEFILE || file === DOT_RSPEC ? "make" : isRuby(file) ? "ruby" : "c"}
              readOnly={readOnly}
              onChange={onChange}
            />
          )}
        </div>
        <div {...panel.handleProps} />

        <section className="wb-terminal" aria-label="出力">
          <div className="wb-term-head">
            <span className="wb-panel-title">出力</span>
            <span className="wb-term-spacer" />
            {/* 実行中もボタンは入れ替えずに押せなくするだけにする（幅が変わってちらつかないように） */}
            <button className="run-cmd" onClick={() => execute("make")} disabled={running}>make</button>
            <button className="run-cmd" onClick={() => execute(RUN_COMMAND)} disabled={running}>{RUN_COMMAND}</button>
            {checkCmd && (
              <button className="run-cmd" onClick={() => execute(checkCmd)} disabled={running}>{checkCmd}</button>
            )}
          </div>
          <div className="wb-output" ref={outputRef} aria-live="polite">
            {lines.map((l, i) => (
              <OutputRow key={i} line={l} onJump={jumpTo} />
            ))}
            {/* 終わったら、本物のターミナルと同じく次のプロンプトを出す（実行中は出さない） */}
            {!running && <div className="o-prompt" aria-hidden="true">$</div>}
          </div>
        </section>
      </div>
    </div>
  );
}

function OutputRow({ line, onJump }: { line: OutputLine; onJump: (file: string, line: number, col: number) => void }) {
  switch (line.kind) {
    case "prompt":
      return <div className="o-prompt">{line.text}</div>;
    case "cmd":
      return <div className="o-cmd">{line.text}</div>;
    case "stdout":
      return <div className="o-stdout"><Diagnostics text={line.text} onJump={onJump} /></div>;
    case "stderr":
      return <div className="o-stderr"><Diagnostics text={line.text} onJump={onJump} /></div>;
    case "crash":
    case "error":
      return <div className="o-error">{line.text}</div>;
  }
}

/** ANSI の色（SGR）を class にする。30–37 / 90–97 の文字色と太字だけ */
const ANSI_COLORS = ["black", "red", "green", "yellow", "blue", "magenta", "cyan", "white"];
function parseAnsi(text: string): { text: string; cls: string }[] {
  const out: { text: string; cls: string }[] = [];
  let fg = "";
  let bold = false;
  const re = /\x1b\[([0-9;]*)m/g;
  let last = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m.index > last) out.push({ text: text.slice(last, m.index), cls: [fg, bold ? "a-bold" : ""].filter(Boolean).join(" ") });
    for (const c of (m[1] || "0").split(";").map(Number)) {
      if (c === 0) {
        fg = "";
        bold = false;
      } else if (c === 1) bold = true;
      else if (c === 22) bold = false;
      else if (c === 39) fg = "";
      else if (c >= 30 && c <= 37) fg = `a-${ANSI_COLORS[c - 30]}`;
      else if (c >= 90 && c <= 97) fg = `a-${ANSI_COLORS[c - 90]}`;
    }
    last = re.lastIndex;
  }
  if (last < text.length) out.push({ text: text.slice(last), cls: [fg, bold ? "a-bold" : ""].filter(Boolean).join(" ") });
  return out;
}

/**
 * 色を付けて、エラーの位置をクリックできるようにする:
 *   C のエラー ruby/array.c:9020:33、Ruby のエラー main.rb:3、spec の位置 spec/02_spec.rb:5
 */
function Diagnostics({ text, onJump }: { text: string; onJump: (file: string, line: number, col: number) => void }) {
  return (
    <pre className="diag">
      {parseAnsi(text).map((seg, si) => (
        <span key={si} className={seg.cls || undefined}>
          {seg.text.split(/(ruby\/\w+\.c:\d+:\d+|(?:spec\/)?\w+\.rb:\d+)/g).map((p, i) => {
            const rb = p.match(/^((?:spec\/)?\w+\.rb):(\d+)$/);
            if (rb && (rb[1] === MAIN || rb[1].startsWith("spec/"))) {
              return (
                <button key={i} className="diag-link" onClick={() => onJump(rb[1], Number(rb[2]), 1)}>
                  {p}
                </button>
              );
            }
            const m = p.match(/^ruby\/(\w+)\.c:(\d+):(\d+)$/);
            if (!m) return p;
            return (
              <button key={i} className="diag-link" onClick={() => onJump(m[1], Number(m[2]), Number(m[3]))}>
                {m[1]}.c:{m[2]}:{m[3]}
              </button>
            );
          })}
        </span>
      ))}
    </pre>
  );
}
