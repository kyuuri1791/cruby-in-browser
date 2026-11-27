// 日本語の文章を textlint で検査する。
//   node scripts/lint-ja.mjs [ファイル...]   （省略時は src/・scripts/・ruby-build/・public/cruby/*.mjs の全部）
// textlint は TypeScript の中の文字列を読めないので、日本語を含む文字列リテラルと JSX のテキストを抜き出し、
// 1 つずつ Markdown として検査する（`...` はコードとして扱われ、検査の対象外になる）。
// コードの見本（lessons.ts の c()・rb()・spec() の中身）は対象外。
import { createLinter, loadTextlintrc } from 'textlint';
import ts from 'typescript';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const JA = /[぀-ヿ㐀-鿿]/;
const CODE_CALLS = new Set(['c', 'rb', 'spec']);

function walk(dir, out = []) {
  for (const n of readdirSync(dir)) {
    const p = path.join(dir, n);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(tsx?|mjs|md)$/.test(n)) out.push(p);
  }
  return out;
}

/** TS/TSX から日本語を含む文字列を { text, line, col } で返す */
function extract(file) {
  const src = readFileSync(file, 'utf8');
  if (file.endsWith('.md')) return [{ text: src, line: 1, col: 1 }];
  const kind = file.endsWith('.tsx') ? ts.ScriptKind.TSX : file.endsWith('.mjs') ? ts.ScriptKind.JS : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, kind);
  const items = [];
  const add = (node, text) => {
    if (!JA.test(text)) return;
    const { line, character } = sf.getLineAndCharacterOfPosition(node.getStart() + 1);
    items.push({ text: text.trim(), line: line + 1, col: character + 1 });
  };
  const visit = (node) => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && CODE_CALLS.has(node.expression.text)) return;
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) add(node, node.text);
    else if (ts.isTemplateExpression(node)) add(node, [node.head.text, ...node.templateSpans.map((s) => s.literal.text)].filter(Boolean).join('…'));
    else if (ts.isJsxText(node)) add(node, node.text);
    ts.forEachChild(node, visit);
  };
  visit(sf);
  // コメント（// と /* */）も検査する
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, false, sf.languageVariant, src);
  for (let t = scanner.scan(); t !== ts.SyntaxKind.EndOfFileToken; t = scanner.scan()) {
    if (t !== ts.SyntaxKind.SingleLineCommentTrivia && t !== ts.SyntaxKind.MultiLineCommentTrivia) continue;
    const raw = scanner.getTokenText();
    if (!JA.test(raw)) continue;
    const { line, character } = sf.getLineAndCharacterOfPosition(scanner.getTokenPos());
    const body = raw.replace(/^\/\/\s?/, '').replace(/^\/\*+\s?|\s*\*\/$/g, '').replace(/^\s*\* ?/gm, '');
    // コメントは行ごとに区切って書くことが多いので、1 行を 1 段落として扱う（行の番号は保つ）
    items.push({ text: body.split('\n').join('\n\n'), line: line + 1, col: character + 1, comment: true, paragraphPerLine: true });
  }
  return items;
}

const files = process.argv.slice(2).length
  ? process.argv.slice(2).map((f) => path.resolve(f))
  : [
      ...walk(path.join(ROOT, 'src')),
      ...walk(path.join(ROOT, 'ruby-build')),
      ...walk(path.join(ROOT, 'scripts')),
      ...readdirSync(path.join(ROOT, 'public/cruby')).filter((n) => n.endsWith('.mjs')).map((n) => path.join(ROOT, 'public/cruby', n)),
    ];
const linter = createLinter({ descriptor: await loadTextlintrc({ configFilePath: path.join(ROOT, '.textlintrc.json') }) });

// コメントにはパスやコード片（a/b、?lesson=、[x] など）がそのまま出てくるので、記号まわりのルールは当てはめない
const CODE_LIKE_RULES = new Set([
  'ja-spacing/ja-no-space-around-slash',
  'ja-spacing/ja-no-space-around-parentheses',
  'ja-technical-writing/no-exclamation-question-mark',
  'ja-technical-writing/no-unmatched-pair',
  'ja-technical-writing/max-comma',
]);

let count = 0;
// 検査するのは、このプロジェクトのソースと文書だけ（node_modules や public/cruby/vendor などは除く）
const TARGET = /^(src|scripts|ruby-build)\/.*\.(tsx?|mjs|md)$|^public\/cruby\/[^/]+\.mjs$/;
for (const file of files.filter((f) => TARGET.test(path.relative(ROOT, f)))) {
  for (const item of extract(file)) {
    // 教材の {{ファイル:行番号|目印}} はリンク（目印はコード）なので、インラインのコードとして検査する
    const text = item.text.replace(/\{\{([^:|}]+):(\d+)\|[^}]*\}\}/g, '`$1:$2`');
    const result = await linter.lintText(text, 'item.md');
    for (const m of result.messages) {
      if (item.comment && CODE_LIKE_RULES.has(m.ruleId)) continue;
      count++;
      const line = item.line + (item.paragraphPerLine ? (m.line - 1) / 2 : m.line - 1);
      const col = m.line === 1 ? item.col + m.column - 1 : m.column;
      console.log(`${path.relative(ROOT, file)}:${line}:${col}: ${m.message.split('\n')[0]} (${m.ruleId})`);
    }
  }
}
if (count) {
  console.log(`\n${count} 件`);
  process.exit(1);
}
