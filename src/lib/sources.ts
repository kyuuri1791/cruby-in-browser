// Ruby のソースの元の内容と、ユーザーが書き換えた内容（ページを開いている間だけメモリに持つ）
"use client";

export type Manifest = {
  editable: { name: string; label: string }[];
};

let manifestPromise: Promise<Manifest> | null = null;
export const loadManifest = () =>
  (manifestPromise ??= fetch("/cruby/assets/manifest.json", { cache: "no-cache" }).then((r) => {
    if (!r.ok) throw new Error("manifest.json を読み込めませんでした");
    return r.json() as Promise<Manifest>;
  }));

const originals = new Map<string, Promise<string>>();
export function loadOriginal(name: string): Promise<string> {
  if (!originals.has(name)) {
    // Makefile 以外は Ruby の C のソース（array なら src/array.c）
    const url = name === "Makefile" ? "/cruby/assets/Makefile" : `/cruby/assets/src/${name}.c`;
    const p = fetch(url, { cache: "no-cache" }).then((r) => {
      if (!r.ok) throw new Error(`${name === "Makefile" ? name : `${name}.c`} を読み込めませんでした`);
      return r.text();
    });
    originals.set(name, p);
    p.catch(() => originals.delete(name));
  }
  return originals.get(name)!;
}

// 書き換えた内容は、ページを開いている間だけメモリに持つ（再読み込みすると元に戻る）
const edits = new Map<string, string>();

export const getEdit = (key: string) => edits.get(key);

export function setEdit(key: string, text: string | undefined) {
  if (text === undefined) edits.delete(key);
  else edits.set(key, text);
}
