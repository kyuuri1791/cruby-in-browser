// 教材の {{ファイル:行番号|目印}} を、配信しているソース（public/cruby/assets/src）と照らし合わせる。
//   node scripts/locations.mjs          … 行番号の行に目印があるか確かめる（無ければ終了コード 1）
//   node scripts/locations.mjs --fix    … 行番号を直す。{{ファイル|目印}} と書いたものにも行番号を入れる
// 目印が複数の行にあるときは、{{ファイル|目印|手がかり}} と書くと、手がかりを含む行より後で最初の行にする
// （直した後は {{ファイル:行番号|目印}} の形になる）
import { readFileSync, writeFileSync } from 'node:fs';

const ROOT = new URL('../', import.meta.url);
const LESSONS = new URL('src/lib/lessons.ts', ROOT);
const fix = process.argv.includes('--fix');
const sources = new Map();
const lines = (label) => {
  if (!sources.has(label)) sources.set(label, readFileSync(new URL(`public/cruby/assets/src/${label}`, ROOT), 'utf8').split('\n'));
  return sources.get(label);
};
// lessons.ts の文字列の中なので、目印の \" と \\ は元に戻して探す
const unescape = (s) => s.replace(/\\(["\\])/g, '$1');

let errors = 0;
const text = readFileSync(LESSONS, 'utf8');
const out = text.replace(/\{\{([^:|}]+)(?::(\d+))?\|([^|}]+)(?:\|([^}]+))?\}\}/g, (all, label, line, anchorRaw, hint) => {
  const anchor = unescape(anchorRaw);
  const ls = lines(label);
  if (line && !hint && ls[Number(line) - 1]?.includes(anchor)) return all;
  if (!fix) {
    console.log(`NG ${label}:${line ?? '?'} に「${anchor}」がない`);
    errors++;
    return all;
  }
  const from = hint ? ls.findIndex((l) => l.includes(unescape(hint))) : 0;
  const hits = ls.map((l, i) => (i >= from && l.includes(anchor) ? i : -1)).filter((i) => i >= 0);
  if (from < 0 || hits.length === 0 || (!hint && hits.length > 1)) {
    console.log(`NG ${label} の「${anchor}」が ${hits.length} 行ある${hint ? `（手がかり「${hint}」の後）` : ''}`);
    errors++;
    return all;
  }
  return `{{${label}:${hits[0] + 1}|${anchorRaw}}}`;
});
if (fix && out !== text) writeFileSync(LESSONS, out);
const count = (out.match(/\{\{[^}]+\}\}/g) ?? []).length;
console.log(errors ? `${errors} 件の問題（全 ${count} 件）` : `全 ${count} 件 OK`);
process.exit(errors ? 1 : 0);
