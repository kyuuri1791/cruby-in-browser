// 画面に出る日本語を 1 つの Markdown に書き出す（文章の見直し用）。
//   node scripts/dump-ja.mjs > 出力.md
// 教材（lessons.ts）は本文の形で、それ以外の画面の文言はファイルごとの箇条書きで出す。コメントは含めない。
import ts from 'typescript';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const JA = /[぀-ヿ㐀-鿿]/;
const { lessons } = await import(path.join(ROOT, 'src/lib/lessons.ts'));

const out = [];
const blocks = (bs = []) => {
  for (const b of bs) {
    if (b.type === 'p') out.push(b.text, '');
    else if (b.type === 'h') out.push(`### ${b.text}`, '');
    else if (b.type === 'note') out.push(`> ${b.text}`, '');
    else if (b.type === 'list') out.push(...b.items.map((i) => `- ${i}`), '');
    else if (b.type === 'code') out.push('```' + b.lang, b.code, '```', '');
  }
};

out.push('# 教材', '');
for (const l of lessons) {
  out.push(`## ${l.title}`, '');
  if (l.body) blocks(l.body);
  if (l.task) { out.push('### 課題', ''); blocks(l.task); }
  if (l.hints) { out.push('### ヒント', ''); blocks(l.hints); }
  if (l.answer) { out.push('### 答え', ''); blocks(l.answer); }
  // spec の it・describe・context の文字列
  const names = [...(l.spec ?? '').matchAll(/(?:describe|context|it)\s+(['"])(.*?)\1/g)].map((m) => m[2]).filter((s) => JA.test(s));
  if (names.length) { out.push('### spec の文言', '', ...names.map((n) => `- ${n}`), ''); }
}

const walk = (dir, acc = []) => {
  for (const n of readdirSync(dir)) {
    const p = path.join(dir, n);
    if (statSync(p).isDirectory()) walk(p, acc);
    else if (/\.tsx?$/.test(n) && !p.endsWith('lessons.ts')) acc.push(p);
  }
  return acc;
};
out.push('# 画面の文言', '');
for (const file of walk(path.join(ROOT, 'src'))) {
  const src = readFileSync(file, 'utf8');
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const items = [];
  const visit = (node) => {
    let text = null;
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isJsxText(node)) text = node.text;
    else if (ts.isTemplateExpression(node)) text = [node.head.text, ...node.templateSpans.map((s) => s.literal.text)].join('…');
    if (text && JA.test(text)) items.push(`- ${text.trim().replace(/\s*\n\s*/g, ' ')}`);
    ts.forEachChild(node, visit);
  };
  visit(sf);
  if (items.length) out.push(`## ${path.relative(ROOT, file)}`, '', ...items, '');
}
console.log(out.join('\n'));
