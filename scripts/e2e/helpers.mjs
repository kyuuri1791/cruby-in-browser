// e2e テストの共通部分
import puppeteer from 'puppeteer-core';
import { readFileSync } from 'node:fs';

export const src = (n) => readFileSync(new URL(`../../public/cruby/assets/src/${n}.c`, import.meta.url), 'utf8');

export async function launch(base, viewport = { width: 1440, height: 900 }) {
  const browser = await puppeteer.launch({ executablePath: '/usr/bin/chromium', headless: true, args: ['--no-sandbox'], protocolTimeout: 600000, defaultViewport: viewport });
  await browser.defaultBrowserContext().overridePermissions(new URL(base).origin, ['clipboard-read', 'clipboard-write', 'clipboard-sanitized-write']);
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/hmr|WebSocket|favicon/.test(m.text())) console.log('[console.error]', m.text().slice(0, 200));
  });
  const h = {
    browser,
    page,
    // 最後の待ち受けのプロンプト（$ ▍）は除く
    out: () => page.$eval('.wb-output', (e) => e.innerText.replace(/\n?\$ ▍\s*$/, '')),
    // 実行中は実行ボタンが押せなくなる。押せるようになったら終わり
    waitIdle: () => page.waitForFunction(() => [...document.querySelectorAll('.wb-term-head button.run-cmd')].every((b) => !b.disabled), { timeout: 300000 }),
    waitEditor: () => page.waitForSelector('.cm-content', { timeout: 60000 }),
    async open(label) {
      // 閉じているフォルダの中なら、フォルダを開いてから探す
      const has = () => page.$$eval('.wb-tree-item .name', (ns, l) => ns.some((n) => n.textContent === l), label);
      if (!(await has())) await page.$$eval('.wb-tree-folder', (fs) => fs.filter((f) => f.textContent.includes('›')).forEach((f) => f.click()));
      await page.$$eval('.wb-tree-item', (ts, l) => ts.find((t) => t.querySelector('.name').textContent === l).click(), label);
      await page.waitForFunction((l) => document.querySelector('.wb-file')?.textContent.endsWith(l), {}, label);
      await page.waitForFunction(() => document.querySelector('.cm-content') || /バイト|ありません/.test(document.querySelector('.binary-info')?.textContent ?? ''), { timeout: 60000 });
    },
    /** 開いているファイルの中身を丸ごと置き換える（クリップボード経由で貼り付け） */
    async replaceText(text) {
      await page.bringToFront();
      await page.evaluate((s) => navigator.clipboard.writeText(s), text);
      await page.focus('.cm-content');
      await page.keyboard.down('Control');
      await page.keyboard.press('a');
      await page.keyboard.press('v');
      await page.keyboard.up('Control');
      await new Promise((r) => setTimeout(r, 200));
    },
    async click(label) {
      await page.$$eval('.wb-term-head button', (bs, l) => bs.find((b) => b.textContent.includes(l)).click(), label);
      await page.waitForFunction(() => document.querySelector('.wb-term-head button.run-cmd')?.disabled, { timeout: 5000 }).catch(() => {});
      await h.waitIdle();
    },
  };
  return h;
}

export function reporter() {
  let fails = 0;
  return {
    expect(label, cond, info = '') {
      console.log(`${cond ? 'OK ' : 'NG '} ${label}${cond ? '' : ' :: ' + String(info).slice(0, 1500)}`);
      if (!cond) fails++;
    },
    get fails() {
      return fails;
    },
  };
}

/** 各章の答え（ファイル名 -> 書き換え後の中身） */
const before = (s, init, fn) => s.replace(new RegExp(`\\nvoid\\n${init}\\(void\\)`), (m) => `\n${fn}\n${m}`);
const after = (s, line, add) => {
  if (!s.includes(line)) throw new Error('目印の行が見つからない: ' + line);
  return s.replace(line, `${line}\n    ${add}`);
};
export const answers = {
  version: { 'version.c': src('version').replace('"ruby " RUBY_VERSION', '"myruby " RUBY_VERSION') },
  'array-second': { 'array.c': after(before(src('array'), 'Init_Array', 'static VALUE\nary_second(VALUE self)\n{\n    return rb_ary_entry(self, 1);\n}'), '    rb_define_method(rb_cArray, "push", rb_ary_push_m, -1);', 'rb_define_method(rb_cArray, "second", ary_second, 0);') },
  'string-shout': { 'string.c': after(before(src('string'), 'Init_String', 'static VALUE\nstr_shout(VALUE self)\n{\n    VALUE result = rb_funcall(self, rb_intern("upcase"), 0);\n    rb_str_cat_cstr(result, "!");\n    return result;\n}'), '    rb_define_method(rb_cString, "upcase", rb_str_upcase, -1);', 'rb_define_method(rb_cString, "shout", str_shout, 0);') },
  'integer-triple': { 'numeric.c': after(before(src('numeric'), 'Init_Numeric', 'static VALUE\nint_triple(VALUE self)\n{\n    return rb_int_mul(self, INT2FIX(3));\n}'), '    rb_define_method(rb_cInteger, "*", rb_int_mul, 1);', 'rb_define_method(rb_cInteger, "triple", int_triple, 0);') },
  'hash-sum-values': { 'hash.c': after(before(src('hash'), 'Init_Hash', "static int\nsum_values_i(VALUE key, VALUE value, VALUE arg)\n{\n    VALUE *sum = (VALUE *)arg;\n    *sum = rb_funcall(*sum, '+', 1, value);\n    return ST_CONTINUE;\n}\n\nstatic VALUE\nrb_hash_sum_values(VALUE hash)\n{\n    VALUE sum = INT2FIX(0);\n    rb_hash_foreach(hash, sum_values_i, (VALUE)&sum);\n    return sum;\n}"), '    rb_define_method(rb_cHash, "keys", rb_hash_keys, 0);', 'rb_define_method(rb_cHash, "sum_values", rb_hash_sum_values, 0);') },
  'nil-to-s': { 'object.c': src('object').replace('    return rb_cNilClass_to_s;', '    return rb_str_new_cstr("(nil)");') },
  'immediate': { 'object.c': after(before(src('object'), 'InitVM_Object', 'static VALUE\nrb_obj_immediate_p(VALUE obj)\n{\n    return RBOOL(RB_SPECIAL_CONST_P(obj));\n}'), '    rb_define_method(rb_mKernel, "instance_variable_get", rb_obj_ivar_get, 1);', 'rb_define_method(rb_mKernel, "immediate?", rb_obj_immediate_p, 0);') },
  'proc-kind': { 'proc.c': after(before(src('proc'), 'Init_Proc', 'static VALUE\nproc_kind(VALUE self)\n{\n    rb_proc_t *proc;\n    GetProcPtr(self, proc);\n    return ID2SYM(rb_intern(proc->header.is_lambda ? "lambda" : "proc"));\n}'), '    rb_define_method(rb_cProc, "lambda?", rb_proc_lambda_p, 0);', 'rb_define_method(rb_cProc, "kind", proc_kind, 0);') },
  'define-method': { 'proc.c': after(before(src('proc'), 'Init_Proc', 'static VALUE\nrb_mod_define_private_method(int argc, VALUE *argv, VALUE mod)\n{\n    const rb_scope_visibility_t scope_visi = {METHOD_VISI_PRIVATE, FALSE};\n    return rb_mod_define_method_with_visibility(argc, argv, mod, &scope_visi);\n}'), '    rb_define_method(rb_cModule, "define_method", rb_mod_define_method, -1);', 'rb_define_method(rb_cModule, "define_private_method", rb_mod_define_private_method, -1);') },
  'module-mixins': {
    'class.c': src('class').replace('\nVALUE\nrb_mod_ancestors(VALUE mod)', '\nVALUE\nrb_mod_mixins(VALUE mod)\n{\n    VALUE p, ary = rb_ary_new();\n\n    for (p = mod; p; p = RCLASS_SUPER(p)) {\n        if (p != RCLASS_ORIGIN(p)) continue;\n        if (BUILTIN_TYPE(p) == T_ICLASS && RB_TYPE_P(METACLASS_OF(p), T_MODULE)) {\n            rb_ary_push(ary, METACLASS_OF(p));\n        }\n    }\n    return ary;\n}\n\nVALUE\nrb_mod_ancestors(VALUE mod)'),
    'object.c': after(before(src('object'), 'InitVM_Object', 'VALUE rb_mod_mixins(VALUE mod);'), '    rb_define_method(rb_cModule, "ancestors", rb_mod_ancestors, 0); /* in class.c */', 'rb_define_method(rb_cModule, "mixins", rb_mod_mixins, 0);'),
  },
  'attr-predicate': { 'object.c': after(before(src('object'), 'InitVM_Object', '#include "method.h"\n\nstatic VALUE\nrb_mod_attr_predicate(int argc, VALUE *argv, VALUE klass)\n{\n    VALUE names = rb_ary_new2(argc);\n\n    for (int i = 0; i < argc; i++) {\n        ID id = id_for_attr(klass, argv[i]);\n        ID attriv = rb_intern_str(rb_sprintf("@%"PRIsVALUE, rb_id2str(id)));\n        ID pred = rb_intern_str(rb_sprintf("%"PRIsVALUE"?", rb_id2str(id)));\n        rb_add_method(klass, pred, VM_METHOD_TYPE_IVAR, (void *)attriv, METHOD_VISI_PUBLIC);\n        rb_ary_push(names, ID2SYM(pred));\n    }\n    return names;\n}'), '    rb_define_method(rb_cModule, "attr_accessor", rb_mod_attr_accessor, -1);', 'rb_define_method(rb_cModule, "attr_predicate", rb_mod_attr_predicate, -1);') },
  'kernel-try': { 'vm_eval.c': after(before(src('vm_eval'), 'Init_vm_eval', 'static VALUE\nrb_obj_try(int argc, VALUE *argv, VALUE self)\n{\n    rb_check_arity(argc, 1, UNLIMITED_ARGUMENTS);\n    VALUE result = rb_check_funcall(self, rb_to_id(argv[0]), argc - 1, argv + 1);\n    return UNDEF_P(result) ? Qnil : result;\n}'), '    rb_define_method(rb_mKernel, "public_send", rb_f_public_send, -1);', 'rb_define_method(rb_mKernel, "try", rb_obj_try, -1);') },
  'tap-eval': { 'vm_eval.c': after(before(src('vm_eval'), 'Init_vm_eval', 'static VALUE\nrb_obj_tap_eval(VALUE self)\n{\n    rb_obj_instance_exec(1, &self, self);\n    return self;\n}'), '    rb_define_method(rb_mKernel, "public_send", rb_f_public_send, -1);', 'rb_define_method(rb_mKernel, "tap_eval", rb_obj_tap_eval, 0);') },
  'method-missing': { 'vm_eval.c': src('vm_eval').replace(`format = rb_fstring_lit("undefined method '%1$s' for %3$s%4$s");`, `format = rb_fstring_lit("no such method '%1$s' for %3$s%4$s");`) },
  'bmethod-proc': {
    'proc.c': src('proc').replace('        body = rb_block_lambda();', '        body = rb_block_proc();').replace('            proc->header.is_lambda = TRUE;\n            proc->header.is_from_method = TRUE;', '            proc->header.is_from_method = TRUE;'),
    'vm_insnhelper.c': src('vm_insnhelper').replace('    if (vm_block_type(block) == block_type_iseq) {\n        CC_SET_FASTPATH(cc, vm_call_iseq_bmethod, TRUE);', '    if (vm_block_type(block) == block_type_iseq && proc->header.is_lambda) {\n        CC_SET_FASTPATH(cc, vm_call_iseq_bmethod, TRUE);'),
    'vm.c': src('vm').replace('return invoke_block_from_c_proc(ec, proc, self, argc, argv, kw_splat, block_handler, TRUE, NULL, me);', 'return invoke_block_from_c_proc(ec, proc, self, argc, argv, kw_splat, block_handler, proc->header.is_lambda, NULL, me);'),
  },
  'opt-plus': {
    'vm_insnhelper.c': src('vm_insnhelper')
      .replace('static VALUE\nvm_opt_plus(VALUE recv, VALUE obj)\n{\n    if (FIXNUM_2_P(recv, obj) &&\n        OP_UNREDEFINED_P(PLUS, INTEGER)) {\n', 'static unsigned long opt_plus_count;\n\nstatic VALUE\nvm_opt_plus_count(VALUE self)\n{\n    return ULONG2NUM(opt_plus_count);\n}\n\nstatic VALUE\nvm_opt_plus(VALUE recv, VALUE obj)\n{\n    if (FIXNUM_2_P(recv, obj) &&\n        OP_UNREDEFINED_P(PLUS, INTEGER)) {\n        opt_plus_count++;\n'),
    'vm.c': after(src('vm'), '    rb_cRubyVM = rb_define_class("RubyVM", rb_cObject);', 'rb_define_singleton_method(rb_cRubyVM, "opt_plus_count", vm_opt_plus_count, 0);'),
  },
};
