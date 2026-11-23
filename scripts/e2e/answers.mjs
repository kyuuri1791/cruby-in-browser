// 各章の「答えの例」を当てはめて、課題チェック（spec）が全部通ることを確かめる
//   node scripts/e2e/answers.mjs [http://127.0.0.1:3123]
import { launch, answers } from './helpers.mjs';

const BASE = process.argv[2] ?? 'http://127.0.0.1:3123';
const h = await launch(BASE);
let fails = 0;
for (const [slug, files] of Object.entries(answers)) {
  await h.page.goto(`${BASE}/?lesson=${slug}`);
  await h.waitEditor();
  for (const [label, text] of Object.entries(files)) {
    await h.open(label);
    await h.replaceText(text);
  }
  const t = Date.now();
  await h.click('make');
  await h.click('bin/rspec');
  const out = await h.out();
  const ok = / 0 failures$/m.test(out) && !/Error 1/.test(out);
  if (!ok) fails++;
  console.log(`${ok ? 'OK' : 'NG'} ${slug} (${Date.now() - t}ms)`, ok ? '' : '\n' + out.slice(-1500));
}
await h.browser.close();
process.exit(fails ? 1 : 0);
