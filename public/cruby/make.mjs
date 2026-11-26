// 小さな make。GNU make の書き方のうち、この教材の Makefile に必要な分を実装している。
//   変数（= := += ?=）、$(VAR) ${VAR} $(VAR:%.c=%.o)、自動変数 $@ $< $^ $*、
//   明示ルールとパターンルール（%。ターゲットが複数なら 1 回のレシピで全部できる）、.PHONY、.SECONDARY、
//   レシピの @ と -、行末の \ による継続、MAKEFLAGS の -j（並列実行）
// ファイルの読み書きとコマンドの実行は、呼び出し側（worker.mjs）から渡す。

class MakeError extends Error {}

function splitWords(s) {
  return s.split(/\s+/).filter(Boolean);
}

/** シェルと同じく ' と " を解釈して、コマンド行を引数に分ける（パイプやリダイレクトはない） */
export function shellSplit(line) {
  const words = [];
  let cur = '';
  let has = false;
  let quote = null;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quote) {
      if (ch === quote) quote = null;
      else if (ch === '\\' && quote === '"' && i + 1 < line.length) cur += line[++i];
      else cur += ch;
    } else if (ch === "'" || ch === '"') {
      quote = ch;
      has = true;
    } else if (ch === '\\' && i + 1 < line.length) {
      cur += line[++i];
      has = true;
    } else if (/\s/.test(ch)) {
      if (has) words.push(cur);
      cur = '';
      has = false;
    } else {
      cur += ch;
      has = true;
    }
  }
  if (has) words.push(cur);
  return words;
}

export function parseMakefile(text, name = 'Makefile') {
  const vars = new Map(); // name -> { value, recursive }
  const rules = []; // { targets, prereqs, recipe: [{ text, line }], line, pattern }
  const phony = new Set();
  let secondaryAll = false;
  const secondary = new Set();

  // 行末の \ で次の行と繋ぐ（レシピ以外）
  const raw = text.replace(/\r\n?/g, '\n').split('\n');
  const lines = [];
  for (let i = 0; i < raw.length; i++) {
    let l = raw[i];
    const start = i + 1;
    while (l.endsWith('\\') && i + 1 < raw.length) {
      l = l.slice(0, -1) + ' ' + raw[++i].replace(/^\s+/, '');
    }
    lines.push({ text: l, line: start });
  }

  let current = null;
  for (const { text: l, line } of lines) {
    if (l.startsWith('\t')) {
      if (!current) throw new MakeError(`${name}:${line}: *** recipe commences before first target.  Stop.`);
      current.recipe.push({ text: l.slice(1), line });
      continue;
    }
    const s = l.replace(/(^|[^\\])#.*$/, '$1').trim();
    if (!s) continue;
    const assign = s.match(/^([A-Za-z_][A-Za-z0-9_.-]*)\s*(\+=|:=|::=|\?=|=)\s*(.*)$/);
    if (assign) {
      current = null;
      const [, v, op, value] = assign;
      if (op === '+=') {
        const old = vars.get(v);
        vars.set(v, { value: old ? `${old.value} ${value}` : value, recursive: old ? old.recursive : true });
      } else if (op === '?=') {
        if (!vars.has(v)) vars.set(v, { value, recursive: true });
      } else if (op === ':=' || op === '::=') {
        vars.set(v, { value: expand(value, vars, {}), recursive: false });
      } else {
        vars.set(v, { value, recursive: true });
      }
      continue;
    }
    const rule = s.match(/^([^:=]+?)\s*:(?!=)\s*(.*)$/);
    if (rule) {
      const targets = splitWords(expand(rule[1], vars, {}));
      const [prereqText, inlineRecipe] = rule[2].split(/;(.*)/s);
      const prereqs = splitWords(expand(prereqText, vars, {}));
      if (targets.includes('.PHONY')) {
        prereqs.forEach((p) => phony.add(p));
        current = null;
        continue;
      }
      if (targets.includes('.SECONDARY')) {
        if (prereqs.length === 0) secondaryAll = true;
        prereqs.forEach((p) => secondary.add(p));
        current = null;
        continue;
      }
      current = { targets, prereqs, recipe: [], line, pattern: targets.some((t) => t.includes('%')) };
      if (inlineRecipe?.trim()) current.recipe.push({ text: inlineRecipe.trim(), line });
      rules.push(current);
      continue;
    }
    throw new MakeError(`${name}:${line}: *** missing separator.  Stop.`);
  }
  return { vars, rules, phony, secondary, secondaryAll, name };
}

function patSubst(pattern, replacement, word) {
  const i = pattern.indexOf('%');
  if (i < 0) return word === pattern ? replacement : word;
  const pre = pattern.slice(0, i);
  const post = pattern.slice(i + 1);
  if (word.length >= pre.length + post.length && word.startsWith(pre) && word.endsWith(post)) {
    const stem = word.slice(pre.length, word.length - post.length);
    return replacement.includes('%') ? replacement.replace('%', stem) : replacement;
  }
  return word;
}

function expand(text, vars, auto, depth = 0) {
  if (depth > 50) throw new MakeError('*** Recursive variable references itself (eventually).  Stop.');
  let out = '';
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch !== '$') {
      out += ch;
      continue;
    }
    const next = text[i + 1];
    if (next === '$') {
      out += '$';
      i++;
      continue;
    }
    let ref;
    if (next === '(' || next === '{') {
      const close = next === '(' ? ')' : '}';
      let level = 1;
      let j = i + 2;
      for (; j < text.length && level > 0; j++) {
        if (text[j] === next) level++;
        else if (text[j] === close) level--;
      }
      ref = text.slice(i + 2, j - 1);
      i = j - 1;
    } else {
      ref = next ?? '';
      i++;
    }
    ref = expand(ref, vars, auto, depth + 1);
    const sub = ref.match(/^([^:]+):([^=]*)=(.*)$/);
    const name = sub ? sub[1] : ref;
    let value;
    if (name in auto) value = auto[name];
    else {
      const v = vars.get(name);
      value = v ? (v.recursive ? expand(v.value, vars, auto, depth + 1) : v.value) : '';
    }
    if (sub) {
      const from = sub[2].includes('%') ? sub[2] : `%${sub[2]}`;
      const to = sub[2].includes('%') ? sub[3] : `%${sub[3]}`;
      value = splitWords(value).map((w) => patSubst(from, to, w)).join(' ');
    }
    out += value;
  }
  return out;
}

function matchPattern(pattern, target) {
  const i = pattern.indexOf('%');
  const pre = pattern.slice(0, i);
  const post = pattern.slice(i + 1);
  if (target.length < pre.length + post.length || !target.startsWith(pre) || !target.endsWith(post)) return null;
  return target.slice(pre.length, target.length - post.length);
}

/**
 * make を実行する。
 *   fs.mtime(path)  … ファイルの更新時刻（無ければ undefined）
 *   exec(argv)      … コマンドを実行して終了コードを返す（Promise）
 *   echo(text)      … 標準出力に 1 行（実行するコマンドや make のメッセージ）
 *   error(text)     … 標準エラーに 1 行
 */
export async function make({ makefile, goals = [], fs, exec, echo, error }) {
  let mk;
  try {
    mk = parseMakefile(makefile);
  } catch (e) {
    if (e instanceof MakeError) {
      error(`make: ${e.message}`);
      return false;
    }
    throw e;
  }
  const explicit = mk.rules.filter((r) => !r.pattern);
  const patterns = mk.rules.filter((r) => r.pattern);
  if (goals.length === 0) {
    const first = explicit.find((r) => !r.targets[0].startsWith('.'));
    if (!first) {
      error('make: *** No targets.  Stop.');
      return false;
    }
    goals = [first.targets[0]];
  }

  const explicitTargets = new Set(explicit.flatMap((r) => r.targets));
  const isSecondary = (t) => mk.secondaryAll || mk.secondary.has(t);

  // ターゲットの作り方を探す（明示ルール → パターンルール）
  const planCache = new Map();
  function plan(target, depth = 0) {
    if (planCache.has(target)) return planCache.get(target);
    if (depth > 20) return null;
    const rs = explicit.filter((r) => r.targets.includes(target));
    let prereqs = rs.flatMap((r) => r.prereqs);
    let recipeRule = rs.find((r) => r.recipe.length) ?? null;
    let stem = '';
    let viaPattern = false;
    if (!recipeRule && !mk.phony.has(target)) {
      for (const r of patterns) {
        for (const pt of r.targets) {
          const s = matchPattern(pt, target);
          if (s === null) continue;
          const pre = r.prereqs.map((p) => p.replace('%', s));
          if (pre.every((p) => fs.mtime(p) !== undefined || explicitTargets.has(p) || plan(p, depth + 1))) {
            recipeRule = r;
            stem = s;
            viaPattern = true;
            prereqs = [...pre, ...prereqs];
            break;
          }
        }
        if (recipeRule) break;
      }
    }
    const result = rs.length || recipeRule ? { prereqs, recipeRule, stem, viaPattern } : null;
    planCache.set(target, result);
    return result;
  }

  // 無い中間ファイル（.SECONDARY）は、ターゲットがその元より新しければ作らない。
  // 元は、その先の前提までたどる（途中にあるファイルが古ければ、その先の新しいソースで判断する）
  function newestSource(target, depth = 0) {
    const t = fs.mtime(target);
    const p = plan(target);
    if (!p || depth > 20) return t ?? Infinity;
    return Math.max(t ?? -Infinity, ...p.prereqs.map((q) => newestSource(q, depth + 1)));
  }

  const done = new Map(); // target -> Promise<作り直したか>
  const groupRuns = new Map(); // 複数ターゲットのパターンルールの実行（ルールと % の部分ごとに 1 回）
  let didSomething = false;

  // 並列実行の数（Makefile の MAKEFLAGS の -j）。レシピの実行をこの数までに抑える
  const makeflags = expand('$(MAKEFLAGS)', mk.vars, {});
  const jobs = Math.max(1, Number(makeflags.match(/(?:^|\s)-j\s*(\d+)/)?.[1] ?? 1));
  let running = 0;
  const waiting = [];
  const acquire = () => (running < jobs ? (running++, Promise.resolve()) : new Promise((r) => waiting.push(r)));
  const release = () => (waiting.length ? waiting.shift()() : running--);

  // 前提を並列に作る。どれかが失敗しても、走っているものが終わるまで待つ
  async function updateAll(prereqs, target) {
    const results = await Promise.allSettled(prereqs.map((q) => update(q, target)));
    const failed = results.find((r) => r.status === 'rejected');
    if (failed) throw failed.reason;
    return results.some((r) => r.value);
  }

  function update(target, parent) {
    if (!done.has(target)) done.set(target, build(target, parent));
    return done.get(target);
  }

  async function build(target, parent) {
    const p = plan(target);
    if (!p) {
      if (fs.mtime(target) !== undefined) return false;
      throw new MakeError(parent ? `*** No rule to make target '${target}', needed by '${parent}'.  Stop.` : `*** No rule to make target '${target}'.  Stop.`);
    }
    const mine = fs.mtime(target);
    const prereqs = p.prereqs.filter((q) => {
      const intermediate = !explicitTargets.has(q) && !goals.includes(q);
      return !(fs.mtime(q) === undefined && intermediate && isSecondary(q) && mine !== undefined && newestSource(q) <= mine);
    });
    const rebuiltPrereq = await updateAll(prereqs, target);
    const needs =
      mk.phony.has(target) ||
      mine === undefined ||
      rebuiltPrereq ||
      p.prereqs.some((q) => (fs.mtime(q) ?? -Infinity) > mine);
    if (!needs || !p.recipeRule || p.recipeRule.recipe.length === 0) return needs && !p.recipeRule ? rebuiltPrereq : false;
    // ターゲットが複数のパターンルールは、1 回のレシピで全てのターゲットを作る（GNU make と同じ）
    if (p.viaPattern && p.recipeRule.targets.length > 1) {
      const key = `${p.recipeRule.line}\0${p.stem}`;
      if (!groupRuns.has(key)) groupRuns.set(key, runRecipe(target, p));
      return groupRuns.get(key);
    }
    return runRecipe(target, p);
  }

  async function runRecipe(target, p) {
    const auto = { '@': target, '<': p.prereqs[0] ?? '', '^': [...new Set(p.prereqs)].join(' '), '*': p.stem };
    await acquire();
    try {
      for (const { text, line } of p.recipeRule.recipe) {
        let cmd = expand(text, mk.vars, auto).trim();
        let silent = false;
        let ignore = false;
        while (/^[@+-]/.test(cmd)) {
          if (cmd[0] === '@') silent = true;
          if (cmd[0] === '-') ignore = true;
          cmd = cmd.slice(1).trimStart();
        }
        if (!cmd) continue;
        if (!silent) echo(cmd);
        didSomething = true;
        const code = await exec(shellSplit(cmd));
        if (code !== 0) {
          if (ignore) {
            error(`make: [${mk.name}:${line}: ${target}] Error ${code} (ignored)`);
            continue;
          }
          throw new MakeError(`*** [${mk.name}:${line}: ${target}] Error ${code}`);
        }
      }
    } finally {
      release();
    }
    return true;
  }

  try {
    for (const g of goals) {
      const before = didSomething;
      await update(g);
      if (didSomething === before) {
        const p = plan(g);
        if (p?.recipeRule || fs.mtime(g) !== undefined) echo(`make: '${g}' is up to date.`);
        else echo(`make: Nothing to be done for '${g}'.`);
      }
    }
    return true;
  } catch (e) {
    if (e instanceof MakeError) {
      error(`make: ${e.message}`);
      return false;
    }
    throw e;
  }
}
