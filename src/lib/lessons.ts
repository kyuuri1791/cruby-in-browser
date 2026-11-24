// 教材の中身。文章と課題はこのサイトのオリジナルです。
//
// 本文は Block の配列で書く。文中の `...` はインラインのコードとして表示する。
// 課題の確かめ方は RSpec の spec で書く（bin/rspec spec/<章番号>_spec.rb で実行する）。

export type Block =
  | { type: "p"; text: string }
  | { type: "code"; lang: "c" | "ruby" | "text"; code: string }
  | { type: "list"; items: string[] }
  | { type: "note"; text: string }
  /** 解答例の差分（diff -U3 の形。@@ の行・空白・+・- で始まる行） */
  | { type: "diff"; file: string; diff: string };

export type Lesson = {
  slug: string;
  title: string;
  body?: Block[];
  /** 手を動かす課題の説明 */
  task?: Block[];
  hints?: Block[];
  answer?: Block[];
  /** 課題を確かめる spec（spec/<章番号>_spec.rb として置く） */
  spec?: string;
};

/** 章の spec ファイルの場所 */
export const specPath = (slug: string) => {
  // 章番号だけで名前を付ける（spec/02_spec.rb）
  const n = lessons.findIndex((l) => l.slug === slug);
  return `spec/${String(n).padStart(2, "0")}_spec.rb`;
};

const p = (text: string): Block => ({ type: "p", text });
const rb = (code: string): Block => ({ type: "code", lang: "ruby", code: code.trim() });
const list = (...items: string[]): Block => ({ type: "list", items });
const note = (text: string): Block => ({ type: "note", text });
const diff = (file: string, text: string): Block => ({ type: "diff", file, diff: text.replace(/^\n+/, "").trimEnd() });
const spec = (code: string) => `${code.trim()}\n`;

export const lessons: Lesson[] = [
  {
    slug: "intro",
    title: "はじめに",
    body: [
      p("CRuby の C のソースを書き換え、ブラウザの中でビルドして実行します。"),
      list(
        "エクスプローラーの `ruby/` にある C のファイルを書き換える",
        "`make` でビルド、`./ruby main.rb` で実行、`bin/rspec spec/…` で今の課題の spec を実行",
      ),
      note("標準ライブラリと rspec が入っています。ページを再読み込みすると、書き換えた内容は元に戻ります。"),
    ],
  },
  {
    slug: "version",
    title: "ruby -v の表示",
    task: [
      p("`RUBY_DESCRIPTION` の先頭の `ruby` を `myruby` に変える。"),
      rb(`
RUBY_DESCRIPTION #=> "myruby 4.1.0dev (...) +PRISM [wasm32-wasi]"`),
    ],
    answer: [
      diff("ruby/version.c", `
@@ -86,7 +86,7 @@
 const int ruby_patchlevel = RUBY_PATCHLEVEL;
 const char ruby_api_version_name[] = RUBY_API_VERSION_NAME;
 const char ruby_description[] =
-    "ruby " RUBY_VERSION RUBY_PATCHLEVEL_STR " "
+    "myruby " RUBY_VERSION RUBY_PATCHLEVEL_STR " "
     "(" RUBY_RELEASE_DATETIME RUBY_REVISION_STR ") "
     "[" RUBY_PLATFORM "]";
 static const int ruby_description_opt_point =`),
    ],
    spec: spec(`
RSpec.describe "RUBY_DESCRIPTION" do
  it "myruby で始まる" do
    expect(RUBY_DESCRIPTION).to start_with("myruby ")
  end

  it "バージョンを含む" do
    expect(RUBY_DESCRIPTION).to include(RUBY_VERSION)
  end
end`),
  },
  {
    slug: "array-second",
    title: "Array#second",
    task: [
      p("2 番目の要素を返す `Array#second` を作る。"),
      rb(`
[1, 2, 3].second #=> 2
[1].second       #=> nil
[].second        #=> nil`),
    ],
    hints: [note("配列の要素は `rb_ary_entry(ary, i)` で取れます。範囲外なら `nil` を返します。")],
    answer: [
      diff("ruby/array.c", `
@@ -9014,6 +9014,12 @@
  *  - #sum: Returns a sum of elements according to either <tt>+</tt> or a given block.
  */
 
+static VALUE
+ary_second(VALUE self)
+{
+    return rb_ary_entry(self, 1);
+}
+
 void
 Init_Array(void)
 {
@@ -9050,6 +9056,7 @@
     rb_define_method(rb_cArray, "intersect?", rb_ary_intersect_p, 1);
     rb_define_method(rb_cArray, "<<", rb_ary_push, 1);
     rb_define_method(rb_cArray, "push", rb_ary_push_m, -1);
+    rb_define_method(rb_cArray, "second", ary_second, 0);
     rb_define_alias(rb_cArray,  "append", "push");
     rb_define_method(rb_cArray, "pop", rb_ary_pop_m, -1);
     rb_define_method(rb_cArray, "shift", rb_ary_shift_m, -1);`),
    ],
    spec: spec(`
RSpec.describe Array do
  describe "#second" do
    context "要素が 2 つ以上のとき" do
      it "2 番目の要素を返す" do
        expect([1, 2, 3].second).to eq(2)
      end
    end

    context "要素が 1 つのとき" do
      it "nil を返す" do
        expect([1].second).to be_nil
      end
    end

    context "空のとき" do
      it "nil を返す" do
        expect([].second).to be_nil
      end
    end
  end
end`),
  },
  {
    slug: "string-shout",
    title: "String#shout",
    task: [
      p("大文字にして `!` を付けた文字列を返す `String#shout` を作る。レシーバは変えない。"),
      rb(`
s = "hello"
s.shout #=> "HELLO!"
s       #=> "hello"`),
    ],
    hints: [note("文字列の末尾に C の文字列をつなげるには `rb_str_cat_cstr(str, \"?\")` のように書きます。")],
    answer: [
      diff("ruby/string.c", `
@@ -16353,6 +16353,14 @@
     return ST_CONTINUE;
 }
 
+static VALUE
+str_shout(VALUE self)
+{
+    VALUE result = rb_funcall(self, rb_intern("upcase"), 0);
+    rb_str_cat_cstr(result, "!");
+    return result;
+}
+
 void
 Init_String(void)
 {
@@ -16437,6 +16445,7 @@
     sym_fold       = ID2SYM(rb_intern_const("fold"));
 
     rb_define_method(rb_cString, "upcase", rb_str_upcase, -1);
+    rb_define_method(rb_cString, "shout", str_shout, 0);
     rb_define_method(rb_cString, "downcase", rb_str_downcase, -1);
     rb_define_method(rb_cString, "capitalize", rb_str_capitalize, -1);
     rb_define_method(rb_cString, "swapcase", rb_str_swapcase, -1);`),
    ],
    spec: spec(`
RSpec.describe String do
  describe "#shout" do
    it "大文字にして ! を付ける" do
      expect("hello".shout).to eq("HELLO!")
    end

    it "レシーバを変えない" do
      str = +"ruby"
      expect { str.shout }.not_to change { str }
    end
  end
end`),
  },
  {
    slug: "integer-triple",
    title: "Integer#triple",
    task: [
      p("3 倍した値を返す `Integer#triple` を作る。"),
      rb(`
7.triple       #=> 21
-5.triple      #=> -15
(2**70).triple #=> 3541774862152233910272`),
    ],
    hints: [note("C の整数から Ruby の Integer（Fixnum）を作るには `INT2FIX(42)` のように書きます。")],
    answer: [
      diff("ruby/numeric.c", `
@@ -6490,6 +6490,12 @@
  * - #step: Invokes the given block with the sequence of specified numbers.
  *
  */
+static VALUE
+int_triple(VALUE self)
+{
+    return rb_int_mul(self, INT2FIX(3));
+}
+
 void
 Init_Numeric(void)
 {
@@ -6557,6 +6563,7 @@
     rb_define_method(rb_cInteger, "+", rb_int_plus, 1);
     rb_define_method(rb_cInteger, "-", rb_int_minus, 1);
     rb_define_method(rb_cInteger, "*", rb_int_mul, 1);
+    rb_define_method(rb_cInteger, "triple", int_triple, 0);
     rb_define_method(rb_cInteger, "/", rb_int_div, 1);
     rb_define_method(rb_cInteger, "div", rb_int_idiv, 1);
     rb_define_method(rb_cInteger, "%", rb_int_modulo, 1);`),
    ],
    spec: spec(`
RSpec.describe Integer do
  describe "#triple" do
    context "正の数のとき" do
      it "3 倍にする" do
        expect(7.triple).to eq(21)
      end
    end

    context "負の数のとき" do
      it "3 倍にする" do
        expect(-5.triple).to eq(-15)
      end
    end

    context "Bignum のとき" do
      it "3 倍にする" do
        expect((2**70).triple).to eq(3 * 2**70)
      end
    end
  end
end`),
  },
  {
    slug: "hash-sum-values",
    title: "Hash#sum_values",
    task: [
      p("全ての value の合計を返す `Hash#sum_values` を作る。"),
      rb(`
{ a: 1, b: 2, c: 3 }.sum_values #=> 6
{ x: 1, y: 0.5 }.sum_values     #=> 1.5
{}.sum_values                   #=> 0`),
    ],
    answer: [
      diff("ruby/hash.c", `
@@ -7758,6 +7758,22 @@
  *
  */
 
+static int
+sum_values_i(VALUE key, VALUE value, VALUE arg)
+{
+    VALUE *sum = (VALUE *)arg;
+    *sum = rb_funcall(*sum, '+', 1, value);
+    return ST_CONTINUE;
+}
+
+static VALUE
+rb_hash_sum_values(VALUE hash)
+{
+    VALUE sum = INT2FIX(0);
+    rb_hash_foreach(hash, sum_values_i, (VALUE)&sum);
+    return sum;
+}
+
 void
 Init_Hash(void)
 {
@@ -7811,6 +7827,7 @@
     rb_define_method(rb_cHash, "transform_values!", rb_hash_transform_values_bang, 0);
 
     rb_define_method(rb_cHash, "keys", rb_hash_keys, 0);
+    rb_define_method(rb_cHash, "sum_values", rb_hash_sum_values, 0);
     rb_define_method(rb_cHash, "values", rb_hash_values, 0);
     rb_define_method(rb_cHash, "values_at", rb_hash_values_at, -1);
     rb_define_method(rb_cHash, "fetch_values", rb_hash_fetch_values, -1);`),
    ],
    spec: spec(`
RSpec.describe Hash do
  describe "#sum_values" do
    context "値が Integer のとき" do
      it "値の合計を返す" do
        expect({ a: 1, b: 2, c: 3 }.sum_values).to eq(6)
      end
    end

    context "空のとき" do
      it "0 を返す" do
        expect({}.sum_values).to eq(0)
      end
    end

    context "Float が混ざっているとき" do
      it "Float の合計を返す" do
        expect({ x: 1, y: 0.5 }.sum_values).to eq(1.5)
      end
    end
  end
end`),
  },
  {
    slug: "nil-to-s",
    title: "nil.to_s",
    task: [
      p("`nil.to_s` が `\"(nil)\"` を返すようにする。"),
      rb(`
nil.to_s   #=> "(nil)"
"x=#{nil}" #=> "x=(nil)"`),
    ],
    hints: [note("C の文字列から Ruby の String を作るには `rb_str_new_cstr(\"hoge\")` のように書きます。")],
    answer: [
      diff("ruby/object.c", `
@@ -1428,7 +1428,7 @@
 VALUE
 rb_nil_to_s(VALUE obj)
 {
-    return rb_cNilClass_to_s;
+    return rb_str_new_cstr("(nil)");
 }
 
 /*`),
    ],
    spec: spec(`
RSpec.describe NilClass do
  describe "#to_s" do
    it '"(nil)" を返す' do
      expect(nil.to_s).to eq("(nil)")
    end

    it "式展開にも使われる" do
      expect("x=#{nil}").to eq("x=(nil)")
    end
  end
end`),
  },
  {
    slug: "immediate",
    title: "Object#immediate?",
    task: [
      p("即値なら `true`、そうでなければ `false` を返す `Object#immediate?` を作る。"),
      rb(`
1.immediate?       #=> true
:sym.immediate?    #=> true
nil.immediate?     #=> true
(2**30).immediate? #=> false
1.5.immediate?     #=> false
"str".immediate?   #=> false`),
    ],
    hints: [note("即値かどうかは `RB_SPECIAL_CONST_P(obj)` で、C の真偽値を Ruby の値にするのは `RBOOL(…)` です。登録は `InitVM_Object` に書いてください。")],
    answer: [
      diff("ruby/object.c", `
@@ -4403,6 +4403,12 @@
  *
  */
 
+static VALUE
+rb_obj_immediate_p(VALUE obj)
+{
+    return RBOOL(RB_SPECIAL_CONST_P(obj));
+}
+
 void
 InitVM_Object(void)
 {
@@ -4606,6 +4612,7 @@
     rb_define_method(rb_mKernel, "public_methods", rb_obj_public_methods, -1); /* in class.c */
     rb_define_method(rb_mKernel, "instance_variables", rb_obj_instance_variables, 0); /* in variable.c */
     rb_define_method(rb_mKernel, "instance_variable_get", rb_obj_ivar_get, 1);
+    rb_define_method(rb_mKernel, "immediate?", rb_obj_immediate_p, 0);
     rb_define_method(rb_mKernel, "instance_variable_set", rb_obj_ivar_set_m, 2);
     rb_define_method(rb_mKernel, "instance_variable_defined?", rb_obj_ivar_defined, 1);
     rb_define_method(rb_mKernel, "remove_instance_variable",`),
    ],
    spec: spec(`
RSpec.describe Object do
  describe "#immediate?" do
    context "Fixnum・シンボル・nil・true のとき" do
      it "true を返す" do
        expect([1, :sym, nil, true].map(&:immediate?)).to all(be(true))
      end
    end

    context "Fixnum に入らない整数のとき" do
      it "false を返す" do
        expect((2**30).immediate?).to be(false)
      end
    end

    context "Float のとき" do
      it "false を返す（wasm32 では flonum がない）" do
        expect(1.5.immediate?).to be(false)
      end
    end

    context "文字列や普通のオブジェクトのとき" do
      it "false を返す" do
        expect(["str", Object.new].map(&:immediate?)).to all(be(false))
      end
    end
  end
end`),
  },
  {
    slug: "proc-kind",
    title: "Proc#kind",
    task: [
      p("lambda なら `:lambda`、そうでなければ `:proc` を返す `Proc#kind` を作る。"),
      rb(`
-> {}.kind                 #=> :lambda
proc {}.kind               #=> :proc
method(:puts).to_proc.kind #=> :lambda`),
    ],
    hints: [note("シンボルは `ID2SYM(rb_intern(\"lambda\"))` で作れます。登録は `Init_Proc` の `\"lambda?\"` の行の近くに書いてください。")],
    answer: [
      diff("ruby/proc.c", `
@@ -5447,6 +5447,14 @@
  *
  */
 
+static VALUE
+proc_kind(VALUE self)
+{
+    rb_proc_t *proc;
+    GetProcPtr(self, proc);
+    return ID2SYM(rb_intern(proc->header.is_lambda ? "lambda" : "proc"));
+}
+
 void
 Init_Proc(void)
 {
@@ -5493,6 +5501,7 @@
     rb_define_method(rb_cProc, "to_s", proc_to_s, 0);
     rb_define_alias(rb_cProc, "inspect", "to_s");
     rb_define_method(rb_cProc, "lambda?", rb_proc_lambda_p, 0);
+    rb_define_method(rb_cProc, "kind", proc_kind, 0);
     rb_define_method(rb_cProc, "binding", proc_binding, 0);
     rb_define_method(rb_cProc, "curry", proc_curry, -1);
     rb_define_method(rb_cProc, "<<", proc_compose_to_left, 1);`),
    ],
    spec: spec(`
RSpec.describe Proc do
  describe "#kind" do
    context "lambda のとき" do
      it ":lambda を返す" do
        expect(-> {}.kind).to eq(:lambda)
      end
    end

    context "proc のとき" do
      it ":proc を返す" do
        expect(proc {}.kind).to eq(:proc)
      end
    end

    context "Method#to_proc で作ったとき" do
      it ":lambda を返す" do
        expect(method(:puts).to_proc.kind).to eq(:lambda)
      end
    end
  end
end`),
  },
  {
    slug: "define-method",
    title: "Module#define_private_method",
    task: [
      p("`define_method` と同じ引数を受け取り、いつも private のメソッドを定義する `Module#define_private_method` を作る。戻り値は、定義したメソッド名のシンボル。"),
      rb(`
class Vault
  define_private_method(:secret) { 42 } #=> :secret

  def peek = secret
end

Vault.new.peek   #=> 42
Vault.new.secret #=> NoMethodError`),
    ],
    hints: [note("`define_method` は `Init_Proc` で登録されています。")],
    answer: [
      diff("ruby/proc.c", `
@@ -5447,6 +5447,13 @@
  *
  */
 
+static VALUE
+rb_mod_define_private_method(int argc, VALUE *argv, VALUE mod)
+{
+    const rb_scope_visibility_t scope_visi = {METHOD_VISI_PRIVATE, FALSE};
+    return rb_mod_define_method_with_visibility(argc, argv, mod, &scope_visi);
+}
+
 void
 Init_Proc(void)
 {
@@ -5576,6 +5583,7 @@
     rb_define_method(rb_cModule, "instance_method", rb_mod_instance_method, 1);
     rb_define_method(rb_cModule, "public_instance_method", rb_mod_public_instance_method, 1);
     rb_define_method(rb_cModule, "define_method", rb_mod_define_method, -1);
+    rb_define_method(rb_cModule, "define_private_method", rb_mod_define_private_method, -1);
 
     /* Kernel */
     rb_define_method(rb_mKernel, "define_singleton_method", rb_obj_define_method, -1);`),
    ],
    spec: spec(`
RSpec.describe Module do
  describe "#define_private_method" do
    context "ブロックを渡したとき" do
      it "private のメソッドを定義する" do
        klass = Class.new { define_private_method(:secret) { 42 } }
        expect(klass.private_method_defined?(:secret)).to be(true)
      end
    end

    context "定義したメソッドを外から呼んだとき" do
      it "NoMethodError になる" do
        klass = Class.new { define_private_method(:secret) { 42 } }
        expect { klass.new.secret }.to raise_error(NoMethodError)
      end
    end

    context "定義したとき" do
      it "メソッド名のシンボルを返す" do
        name = nil
        Class.new { name = define_private_method(:secret) { 42 } }
        expect(name).to eq(:secret)
      end
    end
  end
end`),
  },
  {
    slug: "module-mixins",
    title: "Module#mixins",
    task: [
      p("`ancestors` のうちモジュールだけを、同じ順に返す `Module#mixins` を作る。"),
      rb(`
module A; end
module B; end

class C
  include A
  prepend B
end

C.ancestors #=> [B, C, A, Object, Kernel, BasicObject]
C.mixins    #=> [B, A, Kernel]`),
    ],
    hints: [note("`ancestors` は `object.c` の `InitVM_Object` で登録されています。関数は `class.c` に書き、`object.c` で同じように登録してください。`object.c` には、`InitVM_Object` より前に関数の宣言が要ります。")],
    answer: [
      diff("ruby/class.c", `
@@ -2154,6 +2154,20 @@
  */
 
 VALUE
+rb_mod_mixins(VALUE mod)
+{
+    VALUE p, ary = rb_ary_new();
+
+    for (p = mod; p; p = RCLASS_SUPER(p)) {
+        if (p != RCLASS_ORIGIN(p)) continue;
+        if (BUILTIN_TYPE(p) == T_ICLASS && RB_TYPE_P(METACLASS_OF(p), T_MODULE)) {
+            rb_ary_push(ary, METACLASS_OF(p));
+        }
+    }
+    return ary;
+}
+
+VALUE
 rb_mod_ancestors(VALUE mod)
 {
     VALUE p, ary = rb_ary_new();`),
      diff("ruby/object.c", `
@@ -4403,6 +4403,8 @@
  *
  */
 
+VALUE rb_mod_mixins(VALUE mod);
+
 void
 InitVM_Object(void)
 {
@@ -4655,6 +4657,7 @@
     rb_define_method(rb_cModule, "name", rb_mod_name, 0);  /* in variable.c */
     rb_define_method(rb_cModule, "set_temporary_name", rb_mod_set_temporary_name, 1);  /* in variable.c */
     rb_define_method(rb_cModule, "ancestors", rb_mod_ancestors, 0); /* in class.c */
+    rb_define_method(rb_cModule, "mixins", rb_mod_mixins, 0);
     rb_define_method(rb_cModule, "descendants", rb_mod_descendants, 0); /* in class.c */
 
     rb_define_method(rb_cModule, "attr", rb_mod_attr, -1);`),
    ],
    spec: spec(`
RSpec.describe Module do
  describe "#mixins" do
    context "include と prepend をしたとき" do
      it "prepend したモジュールを先に返す" do
        a = Module.new
        b = Module.new
        klass = Class.new { include a; prepend b }
        expect(klass.mixins.first(2)).to eq([b, a])
      end
    end

    context "BasicObject を直接継承したとき" do
      it "空の配列を返す" do
        expect(Class.new(BasicObject).mixins).to eq([])
      end
    end
  end
end`),
  },
  {
    slug: "attr-predicate",
    title: "Module#attr_predicate",
    task: [
      p("インスタンス変数の値を返す `名前?` のメソッドを定義する `Module#attr_predicate` を作る。戻り値は、定義したメソッド名の配列。"),
      rb(`
class User
  attr_predicate :admin, :guest #=> [:admin?, :guest?]

  def initialize(admin)
    @admin = admin
  end
end

User.new(true).admin? #=> true
User.new(true).guest? #=> nil`),
    ],
    hints: [note("`rb_add_method` は `method.h` で宣言されているので、`object.c` に `#include \"method.h\"` を足します。引数から ID を作るのは、`attr_reader` と同じく `id_for_attr` で書けます。登録は `InitVM_Object` で行うので、関数はそれより前に書いてください。")],
    answer: [
      diff("ruby/object.c", `
@@ -4403,6 +4403,23 @@
  *
  */
 
+#include "method.h"
+
+static VALUE
+rb_mod_attr_predicate(int argc, VALUE *argv, VALUE klass)
+{
+    VALUE names = rb_ary_new2(argc);
+
+    for (int i = 0; i < argc; i++) {
+        ID id = id_for_attr(klass, argv[i]);
+        ID attriv = rb_intern_str(rb_sprintf("@%"PRIsVALUE, rb_id2str(id)));
+        ID pred = rb_intern_str(rb_sprintf("%"PRIsVALUE"?", rb_id2str(id)));
+        rb_add_method(klass, pred, VM_METHOD_TYPE_IVAR, (void *)attriv, METHOD_VISI_PUBLIC);
+        rb_ary_push(names, ID2SYM(pred));
+    }
+    return names;
+}
+
 void
 InitVM_Object(void)
 {
@@ -4661,6 +4678,7 @@
     rb_define_method(rb_cModule, "attr_reader", rb_mod_attr_reader, -1);
     rb_define_method(rb_cModule, "attr_writer", rb_mod_attr_writer, -1);
     rb_define_method(rb_cModule, "attr_accessor", rb_mod_attr_accessor, -1);
+    rb_define_method(rb_cModule, "attr_predicate", rb_mod_attr_predicate, -1);
 
     rb_define_alloc_func(rb_cModule, rb_module_s_alloc);
     rb_undef_method(rb_singleton_class(rb_cModule), "allocate");`),
    ],
    spec: spec(`
RSpec.describe Module do
  describe "#attr_predicate" do
    context "インスタンス変数が true のとき" do
      it "true を返す" do
        klass = Class.new do
          attr_predicate :admin

          def initialize
            @admin = true
          end
        end
        expect(klass.new.admin?).to be(true)
      end
    end

    context "インスタンス変数を設定していないとき" do
      it "nil を返す" do
        klass = Class.new { attr_predicate :admin }
        expect(klass.new.admin?).to be_nil
      end
    end

    context "名前を 2 つ渡したとき" do
      it "定義したメソッド名の配列を返す" do
        names = nil
        Class.new { names = attr_predicate(:admin, :guest) }
        expect(names).to eq(%i[admin? guest?])
      end
    end
  end
end`),
  },
  {
    slug: "kernel-try",
    title: "Kernel#try",
    task: [
      p("メソッドがあれば呼んだ結果を、なければ `nil` を返す `Kernel#try` を作る。"),
      rb(`
"ruby".try(:upcase)      #=> "RUBY"
1.try(:+, 2)             #=> 3
nil.try(:no_such_method) #=> nil`),
    ],
    hints: [note("`Qundef` かどうかは `UNDEF_P(v)` で確かめます。登録は `Init_vm_eval` の `\"public_send\"` の行の近くに書いてください。")],
    answer: [
      diff("ruby/vm_eval.c", `
@@ -2967,6 +2967,14 @@
     return (struct vm_ifunc *)ifunc;
 }
 
+static VALUE
+rb_obj_try(int argc, VALUE *argv, VALUE self)
+{
+    rb_check_arity(argc, 1, UNLIMITED_ARGUMENTS);
+    VALUE result = rb_check_funcall(self, rb_to_id(argv[0]), argc - 1, argv + 1);
+    return UNDEF_P(result) ? Qnil : result;
+}
+
 void
 Init_vm_eval(void)
 {
@@ -2992,6 +3000,7 @@
     rb_define_method(rb_mKernel, "send", rb_f_send, -1);
 #endif
     rb_define_method(rb_mKernel, "public_send", rb_f_public_send, -1);
+    rb_define_method(rb_mKernel, "try", rb_obj_try, -1);
 
     rb_define_method(rb_cModule, "module_exec", rb_mod_module_exec_internal, -1);
     rb_define_method(rb_cModule, "class_exec", rb_mod_module_exec_internal, -1);`),
    ],
    spec: spec(`
RSpec.describe Kernel do
  describe "#try" do
    context "メソッドがあるとき" do
      it "呼んだ結果を返す" do
        expect("ruby".try(:upcase)).to eq("RUBY")
      end
    end

    context "引数を渡したとき" do
      it "引数ごと渡して呼ぶ" do
        expect(1.try(:+, 2)).to eq(3)
      end
    end

    context "メソッドがないとき" do
      it "nil を返す" do
        expect(nil.try(:no_such_method)).to be_nil
      end
    end
  end
end`),
  },
  {
    slug: "tap-eval",
    title: "Kernel#tap_eval",
    task: [
      p("ブロックの中の `self` をレシーバにして実行し、レシーバを返す `Kernel#tap_eval` を作る。"),
      rb(`
[1, 2].tap_eval { push(3) } #=> [1, 2, 3]
[1, 2].tap { push(3) }      #=> NoMethodError`),
    ],
    hints: [note("`yield_under` は、今実行中のフレームに渡されたブロックを使います。C の関数から `rb_obj_instance_exec` を呼べば、その関数に渡されたブロックがそのまま使われます。")],
    answer: [
      diff("ruby/vm_eval.c", `
@@ -2967,6 +2967,13 @@
     return (struct vm_ifunc *)ifunc;
 }
 
+static VALUE
+rb_obj_tap_eval(VALUE self)
+{
+    rb_obj_instance_exec(1, &self, self);
+    return self;
+}
+
 void
 Init_vm_eval(void)
 {
@@ -2992,6 +2999,7 @@
     rb_define_method(rb_mKernel, "send", rb_f_send, -1);
 #endif
     rb_define_method(rb_mKernel, "public_send", rb_f_public_send, -1);
+    rb_define_method(rb_mKernel, "tap_eval", rb_obj_tap_eval, 0);
 
     rb_define_method(rb_cModule, "module_exec", rb_mod_module_exec_internal, -1);
     rb_define_method(rb_cModule, "class_exec", rb_mod_module_exec_internal, -1);`),
    ],
    spec: spec(`
RSpec.describe Kernel do
  describe "#tap_eval" do
    context "ブロックの中で" do
      it "self がレシーバになる" do
        ary = [1, 2]
        ary.tap_eval { push(3) }
        expect(ary).to eq([1, 2, 3])
      end
    end

    context "呼んだとき" do
      it "レシーバを返す" do
        ary = []
        expect(ary.tap_eval {}).to equal(ary)
      end
    end
  end
end`),
  },
  {
    slug: "method-missing",
    title: "method_missing",
    task: [
      p("見つからないメソッドを呼んだときのメッセージの `undefined method` を `no such method` に変える。"),
      rb(`
Object.new.foo
#=> no such method 'foo' for an instance of Object (NoMethodError)`),
    ],
    answer: [
      diff("ruby/vm_eval.c", `
@@ -978,7 +978,7 @@
     VALUE name = argv[0];
 
     if (!format) {
-        format = rb_fstring_lit("undefined method '%1$s' for %3$s%4$s");
+        format = rb_fstring_lit("no such method '%1$s' for %3$s%4$s");
     }
     if (exc == rb_eNoMethodError) {
         VALUE args = rb_ary_new4(argc - 1, argv + 1);`),
    ],
    spec: spec(`
RSpec.describe NoMethodError do
  describe "#message" do
    context "見つからないメソッドを呼んだとき" do
      it "no such method で始まる" do
        expect { Object.new.foo }.to raise_error(NoMethodError, /\\Ano such method 'foo'/)
      end
    end

    context "method_missing を定義したとき" do
      it "例外にならず、method_missing が呼ばれる" do
        klass = Class.new do
          def method_missing(name, *) = name
          def respond_to_missing?(*) = true
        end
        expect(klass.new.foo).to eq(:foo)
      end
    end
  end
end`),
  },
  {
    slug: "bmethod-proc",
    title: "define_method と lambda",
    task: [
      p("ブロックで定義したメソッドを proc として扱い、足りない引数を `nil` で埋めるようにする。lambda を渡したときは、今まで通り引数の数を確かめる。"),
      rb(`
class Foo
  define_method(:pair) { |a, b| [a, b] }
  define_method(:strict, ->(a, b) { [a, b] })
end

Foo.new.pair(1)   #=> [1, nil]
Foo.new.strict(1) #=> ArgumentError`),
    ],
    hints: [note("`vm_call_iseq_bmethod` は lambda のときだけ使うようにします。proc のときは `vm_call_noniseq_bmethod` から `vm_invoke_bmethod` に進むので、そこで proc の `is_lambda` を渡します。")],
    answer: [
      diff("ruby/proc.c", `
@@ -3156,7 +3156,7 @@
     name = argv[0];
     id = rb_check_id(&name);
     if (argc == 1) {
-        body = rb_block_lambda();
+        body = rb_block_proc();
     }
     else {
         body = argv[1];
@@ -3208,7 +3208,6 @@
         if (vm_proc_iseq(procval) != NULL) {
             rb_proc_t *proc;
             GetProcPtr(procval, proc);
-            proc->header.is_lambda = TRUE;
             proc->header.is_from_method = TRUE;
         }
         rb_add_method(mod, id, VM_METHOD_TYPE_BMETHOD, (void *)procval, scope_visi->method_visi);`),
      diff("ruby/vm_insnhelper.c", `
@@ -4278,7 +4278,7 @@
     while (vm_block_type(block) == block_type_proc) {
         block = vm_proc_block(block->as.proc);
     }
-    if (vm_block_type(block) == block_type_iseq) {
+    if (vm_block_type(block) == block_type_iseq && proc->header.is_lambda) {
         CC_SET_FASTPATH(cc, vm_call_iseq_bmethod, TRUE);
         return vm_call_iseq_bmethod(ec, cfp, calling);
     }`),
      diff("ruby/vm.c", `
@@ -2059,7 +2059,7 @@
                      int argc, const VALUE *argv, int kw_splat, VALUE block_handler, const rb_callable_method_entry_t *me)
 {
     /* bmethod procs never carry a refinement cref (Proc#refined rejects them) */
-    return invoke_block_from_c_proc(ec, proc, self, argc, argv, kw_splat, block_handler, TRUE, NULL, me);
+    return invoke_block_from_c_proc(ec, proc, self, argc, argv, kw_splat, block_handler, proc->header.is_lambda, NULL, me);
 }
 
 VALUE`),
    ],
    spec: spec(`
RSpec.describe Module do
  describe "#define_method" do
    context "ブロックを渡したとき" do
      it "足りない引数を nil で埋める" do
        klass = Class.new { define_method(:pair) { |a, b| [a, b] } }
        expect(klass.new.pair(1)).to eq([1, nil])
      end
    end

    context "lambda を渡したとき" do
      it "引数の数が違うと ArgumentError になる" do
        klass = Class.new { define_method(:pair, ->(a, b) { [a, b] }) }
        expect { klass.new.pair(1) }.to raise_error(ArgumentError)
      end
    end
  end
end`),
  },
  {
    slug: "opt-plus",
    title: "opt_plus 命令",
    task: [
      p("`+` を `opt_plus` 命令の近道（整数どうしをメソッドを呼ばずに足す）で計算した回数を返す `RubyVM.opt_plus_count` を作る。"),
      rb(`
a = 1
b = 2
before = RubyVM.opt_plus_count
a + b
RubyVM.opt_plus_count - before #=> 1
a.send(:+, b)
RubyVM.opt_plus_count - before #=> 1`),
    ],
    hints: [note("回数は `vm_insnhelper.c` の静的変数で数えます。`vm_insnhelper.c` は `vm.c` に `#include` されているので、`vm.c` の `Init_VM` から、その変数を読む関数を登録できます。`rb_cRubyVM` を作った行より後に書いてください。")],
    answer: [
      diff("ruby/vm_insnhelper.c", `
@@ -7056,11 +7056,20 @@
 #endif
 }
 
+static unsigned long opt_plus_count;
+
+static VALUE
+vm_opt_plus_count(VALUE self)
+{
+    return ULONG2NUM(opt_plus_count);
+}
+
 static VALUE
 vm_opt_plus(VALUE recv, VALUE obj)
 {
     if (FIXNUM_2_P(recv, obj) &&
         OP_UNREDEFINED_P(PLUS, INTEGER)) {
+        opt_plus_count++;
         return rb_fix_plus_fix(recv, obj);
     }
     else if (FLONUM_2_P(recv, obj) &&`),
      diff("ruby/vm.c", `
@@ -4779,6 +4779,7 @@
      * This module is not portable between Ruby implementations.
      */
     rb_cRubyVM = rb_define_class("RubyVM", rb_cObject);
+    rb_define_singleton_method(rb_cRubyVM, "opt_plus_count", vm_opt_plus_count, 0);
     rb_undef_alloc_func(rb_cRubyVM);
     rb_undef_method(CLASS_OF(rb_cRubyVM), "new");
     rb_define_singleton_method(rb_cRubyVM, "stat", vm_stat, -1);`),
    ],
    spec: spec(`
RSpec.describe RubyVM do
  describe ".opt_plus_count" do
    let(:a) { 1 }
    let(:b) { 2 }

    context "整数どうしを + で足したとき" do
      it "1 増える" do
        x = a
        y = b
        before = RubyVM.opt_plus_count
        x + y
        expect(RubyVM.opt_plus_count - before).to eq(1)
      end
    end

    context "send(:+) で呼んだとき" do
      it "増えない" do
        x = a
        y = b
        before = RubyVM.opt_plus_count
        x.send(:+, y)
        expect(RubyVM.opt_plus_count - before).to eq(0)
      end
    end

    context "Integer#+ を再定義したとき" do
      it "増えない" do
        Integer.prepend(Module.new { def +(other) = super })
        x = a
        y = b
        before = RubyVM.opt_plus_count
        x + y
        expect(RubyVM.opt_plus_count - before).to eq(0)
      end
    end
  end
end`),
  },
  {
    slug: "free",
    title: "Playground",
    body: [
      p("課題はありません。どのファイルも自由に書き換えて試せます。"),
      p("`main.rb` に spec を書いて、`./ruby main.rb` で実行してもかまいません。"),
      rb(`
require "rspec/autorun"

RSpec.describe Array do
  describe "#second" do
    it "2 番目の要素を返す" do
      expect([1, 2, 3].second).to eq(2)
    end
  end
end`),
    ],
  },
];

export const lessonBySlug = (slug: string) => lessons.find((l) => l.slug === slug);
