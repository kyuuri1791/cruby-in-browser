// 開発サーバーに対して、主な流れをヘッドレス Chromium で確かめる
//   node scripts/e2e/smoke.mjs [http://127.0.0.1:3123]
import { mkdirSync } from 'node:fs';
import { launch, reporter, answers } from './helpers.mjs';

const BASE = process.argv[2] ?? 'http://127.0.0.1:3123';
const SHOTS = new URL('../../spike/shots/', import.meta.url).pathname;
mkdirSync(SHOTS, { recursive: true });
const h = await launch(BASE);
const { page } = h;
const r = reporter();
const termHeadText = () => page.$eval('.wb-term-head', (e) => e.innerText.replace(/\s+/g, ' ').trim());
// 目次は折りたたまれているので、開いてから章を選ぶ
const goToc = async (title) => {
  if ((await page.$eval('.toc-toggle', (b) => b.getAttribute('aria-expanded'))) !== 'true') await page.click('.toc-toggle');
  await page.$$eval('.toc-item', (bs, t) => bs.find((b) => b.textContent.includes(t)).click(), title);
};
const hasM = () => page.$('.wb-tree-item.active .modified').then(Boolean);

// 1. トップ
await page.goto(BASE);
await page.waitForSelector('.lesson-toc', { timeout: 60000 });
r.expect('目次は最初は閉じている', (await page.$$('.lesson-toc li')).length === 0);
await page.click('.toc-toggle');
r.expect('トップがそのままアプリで、目次を開くと 37 個並ぶ', (await page.$$('.lesson-toc li')).length === 37);
r.expect('教材の欄を畳むボタンがない', !(await page.$('.lesson-collapse, .lesson-expand')));
r.expect('クリアの印がない', !(await page.$('.done-mark')));

// 2. はじめに: 何も書き換えずに実行
await page.goto(`${BASE}/?lesson=intro`);
await h.waitEditor();
r.expect('main.rb は最初は空', (await page.$eval('.cm-content', (e) => e.innerText)).trim() === '');
await h.replaceText('puts "Hello, MRI!"');
let t = Date.now();
await h.click('make');
await h.click('./ruby main.rb');
let out = await h.out();
r.expect(`はじめに: 実行できる (${Date.now() - t}ms)`, out.includes('$ make') && out.includes('$ ./ruby main.rb') && out.includes("make: Nothing to be done for 'all'.") && out.includes('Hello, MRI!'), out);
r.expect('出力の欄の外に文字を出さない', (await termHeadText()) === '出力 make ./ruby main.rb', await termHeadText());
// エクスプローラーに本体・lib・.so がある
const treeNames = () => page.$$eval('.wb-tree-item .name, .wb-tree-folder', (es) => es.map((e) => e.textContent.replace(/[⌄›]/g, '').trim()));
let names = await treeNames();
r.expect('エクスプローラーに本体 ruby・bin・lib・out・Makefile・.rspec がある', ['ruby', 'bin', 'lib', 'out', 'Makefile', '.rspec'].every((n) => names.includes(n)), names.join(','));
r.expect('bin・spec・lib・out フォルダが最初から閉じている', !names.some((n) => n.endsWith('_spec.rb') || n === 'rspec' || n === 'libc.so' || n === 'array.o'), names.join(','));
await h.open('ruby');
let info = await page.$eval('.binary-info', (e) => e.innerText);
r.expect('ruby を開くと種類と大きさだけ出る', /^WebAssembly 実行ファイル（PIE）・[\d,]+ バイト$/.test(info.trim()), info);

// ボタンを押しても位置や幅が変わらない
const rects = () => page.$$eval('.wb-term-head button', (bs) => bs.map((b) => { const r = b.getBoundingClientRect(); return [Math.round(r.x), Math.round(r.width)].join(':'); }).join(' '));
const beforeRects = await rects();
await page.$$eval('.wb-term-head button', (bs) => bs.find((b) => b.textContent === './ruby main.rb').click());
await page.waitForFunction(() => document.querySelector('.wb-term-head button.run-cmd').disabled);
const duringRects = await rects();
await h.waitIdle();
r.expect('実行中もボタンの位置と幅が変わらない', beforeRects === duringRects && beforeRects === (await rects()), `${beforeRects} / ${duringRects}`);

// 3. array: 書き換えると M が付く。保存はしない
await page.goto(`${BASE}/?lesson=array-second`);
await h.waitEditor();
r.expect('章を開くと main.rb が開く', (await page.$eval('.wb-file', (e) => e.textContent)) === 'main.rb');
await h.open('array.c');
await page.focus('.cm-content');
await page.keyboard.type('/* hello */');
r.expect('書き換えると M が付く', await hasM());
let prevented = await page.evaluate(() => {
  const e = new KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true, cancelable: true });
  document.querySelector('.cm-content').dispatchEvent(e);
  return e.defaultPrevented;
});
r.expect('Ctrl+S でブラウザの保存ダイアログを出さない', prevented);
r.expect('保存中・保存済みの表示がない', !(await page.$eval('.wb-toolbar', (e) => e.innerText)).includes('保存'));
r.expect('localStorage に何も保存しない', (await page.evaluate(() => localStorage.length)) === 0);

// 4. 答えを貼り付けて課題チェック
await h.replaceText(answers['array-second']['array.c']);
t = Date.now();
await h.click('make');
await h.click('bin/rspec');
out = await h.out();
r.expect('make で wasm-ld の「not yet stable」の警告が出ない', !out.includes('not yet stable'), out);
r.expect(`array: spec が通る (${Date.now() - t}ms)`, out.includes('$ bin/rspec spec/30_spec.rb') && out.includes('3 examples, 0 failures') && out.includes('  #second'), out);
await h.open('libruby-edit.so');
info = await page.$eval('.binary-info', (e) => e.innerText);
r.expect('libruby-edit.so の情報', /^WebAssembly 共有ライブラリ・[\d,]+ バイト$/.test(info.trim()), info);
await h.open('array.o');
info = await page.$eval('.binary-info', (e) => e.innerText);
r.expect('array.o の情報', /^オブジェクトファイル・[\d,]+ バイト$/.test(info.trim()), info);
r.expect('make がレシピのコマンドを実行している', /^clang .* -c ruby\/array\.c -o out\/array\.o$/m.test(out) && /^clang .* -shared .* out\/version\.o out\/array\.o .* -o out\/libruby-edit\.so$/m.test(out) && out.includes('wasm-opt --asyncify --pass-arg=asyncify-import-globals -g out/libruby-edit.so -o out/libruby-edit.so'), out);
r.expect('前の実行の出力も残っている（追記型）', out.split('\n').filter((l) => l.startsWith('$ ')).length >= 2, out);
r.expect('出力の欄の外に文字を出さない（課題チェックの後）', !(await termHeadText()).match(/終了|失敗|クリア|make が/), await termHeadText());
await page.screenshot({ path: SHOTS + 'array-done.png' });

// 5. 目次で章を切り替える（ページは読み込み直さない）
const outBefore = await h.out();
await page.evaluate(() => { window.__noReload = true; });
await goToc('String#shout');
await page.waitForFunction(() => location.search === '?lesson=string-shout');
r.expect('章を切り替えても読み込み直さない', await page.evaluate(() => window.__noReload === true));
r.expect('問題文が切り替わる', (await page.$eval('.lesson-text h1', (e) => e.textContent)).includes('String#shout'));
r.expect('出力の内容が残る', (await h.out()) === outBefore);
r.expect('章を切り替えると main.rb が開く', (await page.$eval('.wb-file', (e) => e.textContent)) === 'main.rb');
r.expect('課題をチェックのボタンが今の章の spec になる', (await page.$$eval('.wb-term-head button', (bs) => bs.map((b) => b.textContent).join('|'))).includes('bin/rspec spec/31_spec.rb'));
await h.open('array.c');
r.expect('章を切り替えても書き換えが残る', await hasM());
await page.goBack();
await page.waitForFunction(() => location.search === '?lesson=array-second');
r.expect('ブラウザの戻るで前の章に戻る', (await page.$eval('.lesson-text h1', (e) => e.textContent)).includes('Array#at') && (await page.evaluate(() => window.__noReload === true)));
// main.rb は全ての章で同じ。書き換えは章を移っても残る
r.expect('「試すコード」の欄がない', !(await page.$('.try')));
await h.open('main.rb');
await h.replaceText('p :edited_in_array');
await goToc('nil.to_s');
await page.waitForFunction(() => location.search === '?lesson=nil-to-s');
await h.open('main.rb');
r.expect('章を切り替えても main.rb の書き換えが残る', (await page.$eval('.cm-content', (e) => e.innerText)).includes(':edited_in_array'));
await page.goBack();
await page.waitForFunction(() => location.search === '?lesson=array-second');
// spec/ に全章の spec がある
await page.$$eval('.wb-tree-folder', (fs) => fs.filter((f) => f.textContent.includes('spec') && f.textContent.includes('›')).forEach((f) => f.click()));
const specNames = await page.$$eval('.wb-tree-item .name', (es) => es.map((e) => e.textContent).filter((t) => t.endsWith('_spec.rb')));
r.expect('spec フォルダに課題のある全て（35 個）の spec がある', specNames.length === 35, specNames.join(','));

// 6. 再読み込みすると元に戻る
await page.goto(`${BASE}/?lesson=array-second`);
await h.waitEditor();
await h.open('array.c');
r.expect('再読み込みすると書き換えが消える', !(await hasM()) && !(await page.$eval('.cm-content', (e) => e.innerText)).includes('ary_second'));

// 7. コンパイルエラー → クリックで行へ移動
await h.replaceText(answers['array-second']['array.c'].replace('return rb_ary_entry(self, 1);', 'return rb_ary_entry(self, 1)'));
await h.click('make');
await h.click('./ruby main.rb');
out = await h.out();
r.expect('コンパイルエラーで make が止まる', out.includes("expected ';'") && /make: \*\*\* \[Makefile:\d+: out\/array\.o\] Error 1/.test(out), out.slice(-800));
await page.$$eval('.diag-link', (ls) => ls.find((l) => /^array\.c:\d+:\d+$/.test(l.textContent)).click());
await new Promise((res) => setTimeout(res, 300));
r.expect('エラー行へ移動する', (await page.$eval('.cm-activeLine', (e) => e.innerText)).includes('rb_ary_entry(self, 1)'));

// 8. 元に戻す（2 回押し）
await page.$$eval('.wb-toolbar button', (bs) => bs.find((b) => b.textContent.includes('元に戻す')).click());
await page.$$eval('.wb-toolbar button', (bs) => bs.find((b) => b.textContent.includes('本当に')).click());
r.expect('元に戻すと M が消える', !(await hasM()));

// 9. main.rb: 無限ループを止める、エラー行へ移動
await h.open('main.rb');
await h.replaceText('loop {}');
t = Date.now();
await h.click('make');
const makeMs = Date.now() - t;
t = Date.now();
await h.click('./ruby main.rb');
// 手元の目安は 8 秒。CI のマシンは遅いので、環境変数 MAKE_LIMIT_MS で緩める
const makeLimit = Number(process.env.MAKE_LIMIT_MS ?? 8000);
r.expect(`make（array.c を作り直してリンク）が ${makeLimit / 1000} 秒以内 (${makeMs}ms)`, makeMs < makeLimit);
r.expect(`無限ループは 10 秒で止まる (${Date.now() - t}ms)`, (await h.out()).trimEnd().endsWith('Killed (time limit: 10s)') && Date.now() - t < 12000, (await h.out()).slice(-200));
r.expect('止めるボタンがない', !(await page.$('button.stop')));
await h.replaceText('p 6 * 7\nputs __FILE__\nraise "oops"');
await h.click('make');
await h.click('./ruby main.rb');
out = await h.out();
r.expect('止めた後も main.rb を実行できる', out.includes('42') && /^main\.rb$/m.test(out) && out.includes('main.rb:3'), out.slice(-500));
await h.open('array.c');
await page.$$eval('.diag-link', (ls) => ls.findLast((l) => l.textContent === 'main.rb:3').click());
await new Promise((res) => setTimeout(res, 300));
r.expect('main.rb のエラー行へ移動する', (await page.$eval('.wb-file', (e) => e.textContent)) === 'main.rb' && (await page.$eval('.cm-activeLine', (e) => e.innerText)).includes('raise'));

// 10. Makefile
await h.open('Makefile');
r.expect('Makefile を開ける', (await page.$eval('.cm-content', (e) => e.innerText)).includes('libruby-edit.so: $(OBJS)'));
await page.focus('.cm-content');
await page.keyboard.down('Control'); await page.keyboard.press('End'); await page.keyboard.up('Control');
await page.keyboard.type('\n');
const before = await page.$eval('.cm-content', (e) => e.innerText);
r.expect('Makefile は読み取り専用で書き換えられない', !(await hasM()) && (await page.$eval('.cm-content', (e) => e.innerText)) === before && (await page.$eval('.wb-toolbar', (e) => e.innerText)).includes('読み取り専用'));

// 11. version
await page.goto(`${BASE}/?lesson=version`);
await h.waitEditor();
await h.open('version.c');
await h.replaceText(answers.version['version.c']);
await h.click('make');
await h.click('bin/rspec');
r.expect('version: spec が通る', (await h.out()).includes('2 examples, 0 failures'), await h.out());
r.expect('spec のファイル名に章番号が付く', (await h.out()).includes('$ bin/rspec spec/01_spec.rb'));
await h.open('main.rb');
await h.replaceText('puts RUBY_DESCRIPTION');
await h.click('make');
await h.click('./ruby main.rb');
r.expect('version: main.rb の RUBY_DESCRIPTION が myruby で始まる', /^myruby 4\./m.test(await h.out()), await h.out());

// 12. 見た目
await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]);
const bg = await page.evaluate(() => [getComputedStyle(document.body).backgroundColor, getComputedStyle(document.querySelector('.wb-terminal')).backgroundColor]);
r.expect('ダークモードの OS でも明るい配色', bg[0] === 'rgb(255, 255, 255)' && bg[1] === 'rgb(255, 255, 255)' && (await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme)) === 'light', JSON.stringify(bg));
await page.emulateMediaFeatures([]);
const urlBefore = page.url();
const dialogOpen = () => page.$eval('.about-dialog', (d) => d.open);
await page.hover('.about-trigger');
await new Promise((res) => setTimeout(res, 400));
r.expect('このサイトについて: マウスを乗せただけでは出ない', !(await dialogOpen()));
await page.click('.about-trigger');
r.expect('このサイトについて: クリックすると同じ画面の中央に出て、背景が暗くなる', (await dialogOpen()) && page.url() === urlBefore && (await page.$$('.about-dialog .license-table tbody tr')).length >= 5
  && (await page.$eval('.about-dialog', (d) => getComputedStyle(d, '::backdrop').backgroundColor)) !== 'rgba(0, 0, 0, 0)');
await page.keyboard.press('Escape');
r.expect('このサイトについて: Esc で閉じる', !(await dialogOpen()));
await page.click('.about-trigger');
await page.mouse.click(5, 5);
r.expect('このサイトについて: 背景をクリックすると閉じる', !(await dialogOpen()));
await page.setViewport({ width: 390, height: 844 });
await page.goto(`${BASE}/?lesson=array-second`);
await page.waitForSelector('.wb-tree', { timeout: 60000 });
const over = await page.evaluate(() => [document.documentElement.scrollWidth - window.innerWidth, [...document.querySelectorAll('body *')].filter((e) => e.getBoundingClientRect().right > window.innerWidth + 1).slice(0, 5).map((e) => e.className || e.tagName).join(',')]);
r.expect('スマホ幅で横にはみ出さない', over[0] <= 0, JSON.stringify(over));

await h.browser.close();
console.log(r.fails ? `失敗 ${r.fails} 件` : 'すべて OK');
process.exit(r.fails ? 1 : 0);
