// 元の内容から変えた行を、VS Code の git の表示のように行番号の右の縦のバーで示す
// （足した行は緑、変えた行は青、消した場所は赤の三角）
import { StateEffect, StateField, RangeSet, type Extension } from "@codemirror/state";
import { EditorView, ViewPlugin, gutter, GutterMarker, type ViewUpdate } from "@codemirror/view";

type Kind = "add" | "mod" | "del";

class ChangeMarker extends GutterMarker {
  constructor(readonly kind: Kind) {
    super();
  }
  eq(other: ChangeMarker) {
    return other.kind === this.kind;
  }
  elementClass = `cm-change-${this.kind}`;
}
const markers = { add: new ChangeMarker("add"), mod: new ChangeMarker("mod"), del: new ChangeMarker("del") };

/** 元の行 a と今の行 b の差分を、[今の行の始まり, 今の行の終わり, 消した行があるか] の塊で返す（Myers の差分） */
export function diffLines(a: string[], b: string[]): { from: number; to: number; deleted: boolean }[] {
  // 前後の同じ行は先に除く（ほとんどの場合、残りはわずか）
  let pre = 0;
  while (pre < a.length && pre < b.length && a[pre] === b[pre]) pre++;
  let suf = 0;
  while (suf < a.length - pre && suf < b.length - pre && a[a.length - 1 - suf] === b[b.length - 1 - suf]) suf++;
  const A = a.slice(pre, a.length - suf);
  const B = b.slice(pre, b.length - suf);
  const n = A.length;
  const m = B.length;
  if (n === 0 && m === 0) return [];
  const max = n + m;
  const off = max + 1;
  let v = new Int32Array(2 * max + 3);
  const trace: Int32Array[] = [];
  let found = false;
  for (let d = 0; d <= max && !found; d++) {
    trace.push(v.slice());
    for (let k = -d; k <= d; k += 2) {
      let x = k === -d || (k !== d && v[off + k - 1] < v[off + k + 1]) ? v[off + k + 1] : v[off + k - 1] + 1;
      let y = x - k;
      while (x < n && y < m && A[x] === B[y]) {
        x++;
        y++;
      }
      v[off + k] = x;
      if (x >= n && y >= m) {
        found = true;
        break;
      }
    }
    if (found) trace.push(v);
    else v = v.slice();
  }
  // たどり直して、行ごとの「消した」「足した」を求める
  const ops: ("del" | "add" | "eq")[] = [];
  let x = n;
  let y = m;
  for (let d = trace.length - 2; d >= 0; d--) {
    const tv = trace[d];
    const k = x - y;
    const prevK = k === -d || (k !== d && tv[off + k - 1] < tv[off + k + 1]) ? k + 1 : k - 1;
    const px = tv[off + prevK];
    const py = px - prevK;
    while (x > px && y > py) {
      ops.push("eq");
      x--;
      y--;
    }
    if (d > 0) {
      ops.push(x === px ? "add" : "del");
      x = px;
      y = py;
    }
  }
  ops.reverse();
  // 続いた「消した」「足した」を 1 つの塊にする
  const hunks: { from: number; to: number; deleted: boolean }[] = [];
  let bi = pre;
  let cur: { from: number; to: number; deleted: boolean } | null = null;
  for (const op of ops) {
    if (op === "eq") {
      if (cur) hunks.push(cur);
      cur = null;
      bi++;
      continue;
    }
    cur ??= { from: bi, to: bi, deleted: false };
    if (op === "add") {
      bi++;
      cur.to = bi;
    } else cur.deleted = true;
  }
  if (cur) hunks.push(cur);
  return hunks;
}

const setMarks = StateEffect.define<RangeSet<GutterMarker>>();
/** 比べる元の内容が変わったときに、印を付け直させる */
export const refreshChanges = StateEffect.define<null>();
const marks = StateField.define<RangeSet<GutterMarker>>({
  create: () => RangeSet.empty,
  update(value, tr) {
    for (const e of tr.effects) if (e.is(setMarks)) return e.value;
    return value.map(tr.changes);
  },
});

function compute(view: EditorView, original: string) {
  const doc = view.state.doc;
  const now: string[] = [];
  for (let i = 1; i <= doc.lines; i++) now.push(doc.line(i).text);
  const ranges = [];
  for (const h of diffLines(original.split("\n"), now)) {
    if (h.to > h.from) {
      for (let i = h.from; i < h.to; i++) ranges.push(markers[h.deleted ? "mod" : "add"].range(doc.line(i + 1).from));
    } else {
      // 行を消しただけのときは、消した場所の次の行（最後なら前の行）に印を付ける
      const line = Math.min(h.from + 1, doc.lines);
      ranges.push(markers.del.range(doc.line(line).from));
    }
  }
  view.dispatch({ effects: setMarks.of(RangeSet.of(ranges, true)) });
}

/** original は、比べる元の内容を返す関数（無ければ印を出さない） */
export function changeGutter(original: () => string | undefined): Extension {
  const plugin = ViewPlugin.fromClass(
    class {
      timer: ReturnType<typeof setTimeout> | undefined;
      constructor(readonly view: EditorView) {
        this.schedule(0);
      }
      update(u: ViewUpdate) {
        if (u.docChanged) this.schedule(150);
        else if (u.transactions.some((t) => t.effects.some((e) => e.is(refreshChanges)))) this.schedule(0);
      }
      schedule(ms: number) {
        clearTimeout(this.timer);
        this.timer = setTimeout(() => {
          const o = original();
          if (o !== undefined) compute(this.view, o);
        }, ms);
      }
      destroy() {
        clearTimeout(this.timer);
      }
    },
  );
  return [
    marks,
    plugin,
    gutter({ class: "cm-change-gutter", markers: (v) => v.state.field(marks) }),
  ];
}
