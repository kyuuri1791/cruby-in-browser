// VS Code 風の検索・置換ウィジェット（CodeMirror の検索パネルを差し替える）
import { EditorView, keymap, type Panel, type ViewUpdate } from "@codemirror/view";
import { EditorSelection, Prec, type Extension } from "@codemirror/state";
import {
  search, SearchQuery, getSearchQuery, setSearchQuery, findNext, findPrevious, replaceNext, replaceAll,
  closeSearchPanel, openSearchPanel, searchPanelOpen,
} from "@codemirror/search";

const MAX_COUNT = 20000;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, text = ""): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (text) e.textContent = text;
  return e;
}

/** 置換欄を開いた状態でパネルを開くための目印 */
let openWithReplace = false;

class FindWidget implements Panel {
  dom: HTMLElement;
  top = true;
  private view: EditorView;
  private query: SearchQuery;
  private searchInput: HTMLInputElement;
  private replaceInput: HTMLInputElement;
  private count: HTMLElement;
  private toggles: Record<"caseSensitive" | "wholeWord" | "regexp", HTMLButtonElement>;
  private replaceRow: HTMLElement;
  private expand: HTMLButtonElement;
  private countTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(view: EditorView) {
    this.view = view;
    this.query = getSearchQuery(view.state);
    this.dom = el("div", { class: "fw", role: "search", "aria-label": "検索と置換" });
    this.dom.addEventListener("keydown", (e) => this.onKey(e));

    this.expand = el("button", { class: "fw-expand", type: "button", title: "置換の表示を切り替え (Ctrl+H)", "aria-label": "置換の表示を切り替え" }, "›");
    this.expand.addEventListener("click", () => this.setReplaceOpen(!this.isReplaceOpen()));

    // 検索の行
    this.searchInput = el("input", { class: "fw-input", type: "text", placeholder: "検索", "aria-label": "検索", "main-field": "true", spellcheck: "false" });
    this.searchInput.value = this.query.search;
    this.searchInput.addEventListener("input", () => this.commit());
    const mkToggle = (key: "caseSensitive" | "wholeWord" | "regexp", label: string, title: string) => {
      const b = el("button", { class: "fw-toggle", type: "button", title, "aria-label": title, "aria-pressed": "false" }, label);
      b.addEventListener("click", () => {
        b.setAttribute("aria-pressed", String(b.getAttribute("aria-pressed") !== "true"));
        this.commit();
        this.searchInput.focus();
      });
      return b;
    };
    this.toggles = {
      caseSensitive: mkToggle("caseSensitive", "Aa", "大文字と小文字を区別する (Alt+C)"),
      wholeWord: mkToggle("wholeWord", "ab", "単語単位で探す (Alt+W)"),
      regexp: mkToggle("regexp", ".*", "正規表現を使う (Alt+R)"),
    };
    this.toggles.wholeWord.classList.add("fw-word");
    for (const k of Object.keys(this.toggles) as (keyof typeof this.toggles)[]) this.toggles[k].setAttribute("aria-pressed", String(this.query[k]));
    const field = el("div", { class: "fw-field" });
    field.append(this.searchInput, this.toggles.caseSensitive, this.toggles.wholeWord, this.toggles.regexp);
    this.count = el("span", { class: "fw-count", "aria-live": "polite" });
    const prev = el("button", { class: "fw-btn", type: "button", title: "前の一致 (Shift+Enter)", "aria-label": "前の一致" }, "↑");
    const next = el("button", { class: "fw-btn", type: "button", title: "次の一致 (Enter)", "aria-label": "次の一致" }, "↓");
    const close = el("button", { class: "fw-btn", type: "button", title: "閉じる (Esc)", "aria-label": "閉じる" }, "✕");
    prev.addEventListener("click", () => { findPrevious(this.view); this.updateCount(); });
    next.addEventListener("click", () => { findNext(this.view); this.updateCount(); });
    close.addEventListener("click", () => this.close());
    const searchRow = el("div", { class: "fw-row" });
    searchRow.append(field, this.count, prev, next, close);

    // 置換の行
    this.replaceInput = el("input", { class: "fw-input", type: "text", placeholder: "置換", "aria-label": "置換", spellcheck: "false" });
    this.replaceInput.value = this.query.replace;
    this.replaceInput.addEventListener("input", () => this.commit());
    const replaceField = el("div", { class: "fw-field" });
    replaceField.append(this.replaceInput);
    const rOne = el("button", { class: "fw-btn", type: "button", title: "置換 (Enter)", "aria-label": "置換" }, "⇄");
    const rAll = el("button", { class: "fw-btn fw-btn-wide", type: "button", title: "全て置換 (Ctrl+Alt+Enter)", "aria-label": "全て置換" }, "全置換");
    rOne.addEventListener("click", () => { replaceNext(this.view); this.updateCount(); });
    rAll.addEventListener("click", () => { replaceAll(this.view); this.updateCount(); });
    this.replaceRow = el("div", { class: "fw-row fw-replace" });
    this.replaceRow.append(replaceField, rOne, rAll);

    const rows = el("div", { class: "fw-rows" });
    rows.append(searchRow, this.replaceRow);
    this.dom.append(this.expand, rows);
    this.setReplaceOpen(openWithReplace);
    openWithReplace = false;
  }

  mount() {
    this.searchInput.select();
    this.updateCount();
  }

  update(u: ViewUpdate) {
    for (const tr of u.transactions) {
      for (const e of tr.effects) {
        if (e.is(setSearchQuery) && !e.value.eq(this.query)) this.setQuery(e.value);
      }
    }
    if (u.docChanged || u.selectionSet) this.scheduleCount();
  }

  private isReplaceOpen() {
    return !this.replaceRow.hidden;
  }

  setReplaceOpen(open: boolean) {
    this.replaceRow.hidden = !open;
    this.expand.textContent = open ? "⌄" : "›";
    this.expand.setAttribute("aria-expanded", String(open));
    this.dom.classList.toggle("fw-open", open);
    if (open) this.replaceInput.focus();
  }

  focusSearch() {
    this.searchInput.focus();
    this.searchInput.select();
  }

  private setQuery(q: SearchQuery) {
    this.query = q;
    this.searchInput.value = q.search;
    this.replaceInput.value = q.replace;
    for (const k of Object.keys(this.toggles) as (keyof typeof this.toggles)[]) this.toggles[k].setAttribute("aria-pressed", String(q[k]));
    this.updateCount();
  }

  private commit() {
    const pressed = (k: keyof typeof this.toggles) => this.toggles[k].getAttribute("aria-pressed") === "true";
    const q = new SearchQuery({
      search: this.searchInput.value, replace: this.replaceInput.value,
      caseSensitive: pressed("caseSensitive"), wholeWord: pressed("wholeWord"), regexp: pressed("regexp"),
    });
    if (q.eq(this.query)) return;
    this.query = q;
    this.view.dispatch({ effects: setSearchQuery.of(q) });
    // VS Code と同じく、入力したらその場で最寄りの一致へ移動する
    if (q.valid && q.search) this.jumpToNearest();
    this.updateCount();
  }

  private jumpToNearest() {
    const { state } = this.view;
    const from = state.selection.main.from;
    const cursor = this.query.getCursor(state, from);
    let m = cursor.next();
    if (m.done) m = this.query.getCursor(state, 0).next();
    if (!m.done) {
      this.view.dispatch({
        selection: EditorSelection.single(m.value.from, m.value.to),
        effects: EditorView.scrollIntoView(m.value.from, { y: "center" }),
        userEvent: "select.search",
      });
    }
  }

  private scheduleCount() {
    if (this.countTimer) clearTimeout(this.countTimer);
    this.countTimer = setTimeout(() => this.updateCount(), 60);
  }

  private updateCount() {
    const q = this.query;
    this.dom.classList.remove("fw-none", "fw-invalid");
    if (!q.search) {
      this.count.textContent = "結果なし";
      return;
    }
    if (!q.valid) {
      this.count.textContent = "正規表現の誤り";
      this.dom.classList.add("fw-invalid");
      return;
    }
    const { state } = this.view;
    const sel = state.selection.main;
    let total = 0;
    let current = 0;
    const cursor = q.getCursor(state);
    for (let m = cursor.next(); !m.done; m = cursor.next()) {
      total++;
      if (m.value.from === sel.from && m.value.to === sel.to) current = total;
      if (total >= MAX_COUNT) break;
    }
    if (total === 0) {
      this.count.textContent = "結果なし";
      this.dom.classList.add("fw-none");
    } else {
      const t = total >= MAX_COUNT ? `${MAX_COUNT}+` : String(total);
      this.count.textContent = current ? `${t} 件中 ${current}` : `${t} 件`;
    }
  }

  private close() {
    closeSearchPanel(this.view);
    this.view.focus();
  }

  private onKey(e: KeyboardEvent) {
    const inReplace = e.target === this.replaceInput;
    if (e.key === "Escape") {
      e.preventDefault();
      this.close();
    } else if (e.key === "Enter" && e.ctrlKey && e.altKey && inReplace) {
      e.preventDefault();
      replaceAll(this.view);
      this.updateCount();
    } else if (e.key === "Enter" && inReplace) {
      e.preventDefault();
      replaceNext(this.view);
      this.updateCount();
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (e.shiftKey) findPrevious(this.view);
      else findNext(this.view);
      this.updateCount();
    } else if (e.altKey && !e.ctrlKey && !e.metaKey && ["c", "w", "r"].includes(e.key.toLowerCase())) {
      e.preventDefault();
      const key = ({ c: "caseSensitive", w: "wholeWord", r: "regexp" } as const)[e.key.toLowerCase() as "c" | "w" | "r"];
      this.toggles[key].click();
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "h") {
      e.preventDefault();
      this.setReplaceOpen(!this.isReplaceOpen());
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f") {
      e.preventDefault();
      this.focusSearch();
    }
  }
}

const widgets = new WeakMap<EditorView, FindWidget>();

/** Ctrl+F / Ctrl+H: 開いていればそこへフォーカス、なければ開く（選択中の文字列が検索語になる） */
function open(withReplace: boolean) {
  return (view: EditorView) => {
    const w = widgets.get(view);
    if (searchPanelOpen(view.state) && w) {
      if (withReplace) w.setReplaceOpen(true);
      else w.focusSearch();
      return true;
    }
    openWithReplace = withReplace;
    return openSearchPanel(view);
  };
}

export const openFind = open(false);

export function findWidget(): Extension {
  return [
    search({
      top: true,
      createPanel: (view) => {
        const w = new FindWidget(view);
        widgets.set(view, w);
        return w;
      },
    }),
    Prec.highest(keymap.of([
      { key: "Mod-f", run: open(false), scope: "editor search-panel" },
      { key: "Mod-h", run: open(true), scope: "editor search-panel" },
      { key: "F3", run: findNext, shift: findPrevious, scope: "editor search-panel", preventDefault: true },
      { key: "Mod-g", run: findNext, shift: findPrevious, scope: "editor search-panel", preventDefault: true },
    ])),
  ];
}
