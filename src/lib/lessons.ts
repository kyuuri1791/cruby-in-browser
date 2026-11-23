// 教材の中身。文章と課題はこのサイトのオリジナルです。
//
// 本文は Block の配列で書く。文中の `...` はインラインのコードとして表示する。
// 課題の確かめ方は RSpec の spec で書く（bin/rspec spec/<章番号>_spec.rb で実行する）。

export type Block =
  | { type: "p"; text: string }
  | { type: "code"; lang: "c" | "ruby" | "text"; code: string }
  | { type: "list"; items: string[] }
  | { type: "note"; text: string };

export type Lesson = {
  slug: string;
  title: string;
  /** 最初に開くファイル（version, array など）。null なら C のファイルは開かない */
  file: string | null;
  body: Block[];
  /** 手を動かす課題の説明 */
  task?: Block[];
  hints?: Block[];
  answer?: Block[];
  /** 課題を確かめる spec（spec/<章番号>_spec.rb として置く） */
  spec?: string;
  /** この章の main.rb の最初の内容 */
  playground: string;
};

/** 章の spec ファイルの場所 */
export const specPath = (slug: string) => {
  // 章番号だけで名前を付ける（spec/02_spec.rb）
  const n = lessons.findIndex((l) => l.slug === slug);
  return `spec/${String(n).padStart(2, "0")}_spec.rb`;
};

const p = (text: string): Block => ({ type: "p", text });
const c = (code: string): Block => ({ type: "code", lang: "c", code: code.trim() });
const rb = (code: string): Block => ({ type: "code", lang: "ruby", code: code.trim() });
const list = (...items: string[]): Block => ({ type: "list", items });
const note = (text: string): Block => ({ type: "note", text });
const spec = (code: string) => `${code.trim()}\n`;

export const lessons: Lesson[] = [
  {
    slug: "intro",
    title: "はじめに",
    file: null,
    body: [
      p("CRuby の C のソースを書き換え、ブラウザの中でビルドして実行します。"),
      list(
        "エクスプローラーの `ruby/` にある C のファイルを書き換える",
        "`make` でビルド、`./ruby main.rb` で実行、`bin/rspec spec/…` で今の課題の spec を実行",
      ),
      note("標準ライブラリと rspec が入っています。ページを再読み込みすると、書き換えた内容は元に戻ります。"),
    ],
    playground: 'puts "Hello, MRI!"\np RUBY_VERSION',
  },
  {
    slug: "version",
    title: "ruby -v の表示",
    file: "version",
    body: [
      p("`ruby -v` の表示と `RUBY_DESCRIPTION` は、`version.c` の `ruby_description` から作られます。"),
      c(`
const char ruby_description[] =
    "ruby " RUBY_VERSION RUBY_PATCHLEVEL_STR " "
    "(" RUBY_RELEASE_DATETIME RUBY_REVISION_STR ") "
    "[" RUBY_PLATFORM "]";`),
    ],
    task: [p("先頭の `ruby` を `myruby` に変える。")],
    answer: [c(`
    "myruby " RUBY_VERSION RUBY_PATCHLEVEL_STR " "`)],
    spec: spec(`
RSpec.describe "RUBY_DESCRIPTION" do
  it "myruby で始まる" do
    expect(RUBY_DESCRIPTION).to start_with("myruby ")
  end

  it "バージョンを含む" do
    expect(RUBY_DESCRIPTION).to include(RUBY_VERSION)
  end
end`),
    playground: "puts RUBY_DESCRIPTION",
  },
  {
    slug: "array-second",
    title: "Array#second",
    file: "array",
    body: [
      p("メソッドは `Init_Array` の中で `rb_define_method(クラス, \"名前\", 関数, 引数の数)` を呼んで登録しています。"),
      c(`
    rb_define_method(rb_cArray, "push", rb_ary_push_m, -1);`),
      p("配列の要素は `rb_ary_entry(ary, i)` で取れます（範囲外は `nil`）。"),
    ],
    task: [p("`[1, 2, 3].second` が `2`、`[1].second` が `nil` を返す `Array#second` を作る。")],
    hints: [note("`rb_cArray` は `Init_Array` の中の `rb_define_class` で作られるので、登録はそれより後に書きます。`\"push\"` を登録している行の近くに書くと確実です。")],
    answer: [c(`
static VALUE
ary_second(VALUE self)
{
    return rb_ary_entry(self, 1);
}

    rb_define_method(rb_cArray, "second", ary_second, 0);`)],
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
    playground: "p [1, 2, 3].second\np [:only].second",
  },
  {
    slug: "string-shout",
    title: "String#shout",
    file: "string",
    body: [
      p("C から Ruby のメソッドを呼ぶには `rb_funcall(recv, rb_intern(\"name\"), argc, ...)` を使います。文字列の末尾に C の文字列をつなげるには `rb_str_cat_cstr` を使います。"),
    ],
    task: [p("`\"hello\".shout` が `\"HELLO!\"` を返す `String#shout` を作る。レシーバは変えない。")],
    answer: [c(`
static VALUE
str_shout(VALUE self)
{
    VALUE result = rb_funcall(self, rb_intern("upcase"), 0);
    rb_str_cat_cstr(result, "!");
    return result;
}

    rb_define_method(rb_cString, "shout", str_shout, 0);`)],
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
    playground: 'p "hello".shout\np "Ruby is fun".shout',
  },
  {
    slug: "integer-triple",
    title: "Integer#triple",
    file: "numeric",
    body: [
      p("`rb_int_mul(x, y)` は、結果が Fixnum に収まらなければ Bignum を返します。"),
    ],
    task: [p("`7.triple` が `21` を返し、`(2**70).triple` も正しく計算する `Integer#triple` を作る。")],
    answer: [c(`
static VALUE
int_triple(VALUE self)
{
    return rb_int_mul(self, INT2FIX(3));
}

    rb_define_method(rb_cInteger, "triple", int_triple, 0);`)],
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
    playground: "p 7.triple\np (2**70).triple",
  },
  {
    slug: "hash-sum-values",
    title: "Hash#sum_values",
    file: "hash",
    body: [
      p("`rb_hash_foreach(hash, func, arg)` は要素ごとに `func(key, value, arg)` を呼びます。続けるなら `ST_CONTINUE` を返します。"),
    ],
    task: [p("値の合計を返す `Hash#sum_values` を作る。空のハッシュなら `0` を返す。値に `Float` が混ざっていてもよい。")],
    answer: [c(`
static int
sum_values_i(VALUE key, VALUE value, VALUE arg)
{
    VALUE *sum = (VALUE *)arg;
    *sum = rb_funcall(*sum, '+', 1, value);
    return ST_CONTINUE;
}

static VALUE
rb_hash_sum_values(VALUE hash)
{
    VALUE sum = INT2FIX(0);
    rb_hash_foreach(hash, sum_values_i, (VALUE)&sum);
    return sum;
}

    rb_define_method(rb_cHash, "sum_values", rb_hash_sum_values, 0);`)],
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
    playground: "p({a: 1, b: 2, c: 3}.sum_values)\np({}.sum_values)",
  },
  {
    slug: "nil-to-s",
    title: "nil.to_s",
    file: "object",
    body: [
      p("`nil.to_s` の実体は `object.c` の `rb_nil_to_s` です。式展開（`#{nil}`）では、`NilClass#to_s` が再定義されていなければ、`vm_insnhelper.c` の `vm_objtostring` がこの関数を直接呼びます。"),
    ],
    task: [p("`nil.to_s` が `\"(nil)\"` を返すようにする。")],
    answer: [c(`
VALUE
rb_nil_to_s(VALUE obj)
{
    return rb_str_new_cstr("(nil)");
}`)],
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
    playground: 'p nil.to_s\nputs "x=#{nil}"',
  },
  {
    slug: "immediate",
    title: "Object#immediate?",
    file: "object",
    body: [
      p("Ruby のオブジェクトは、C では全て `VALUE` 型（ポインタと同じ大きさの整数）で扱います。多くの `VALUE` は、メモリ上のオブジェクトを指すポインタです。ただし、小さな整数、シンボル、`nil`・`true`・`false` はオブジェクトを作らず、値を `VALUE` そのものに埋め込みます（即値）。たとえば Fixnum の `n` は `(n << 1) | 1` で、`nil` は `Qnil` という決まった値です。"),
      c(`
static inline bool
RB_SPECIAL_CONST_P(VALUE obj)
{
    return (obj == RUBY_Qfalse) || RB_IMMEDIATE_P(obj);
}`),
      p("このサイトの Ruby は wasm32 向けなので、`VALUE` は 32 ビットです。64 ビットの環境と違い、Fixnum の範囲は `-2**30` から `2**30 - 1` までで、`Float` は即値（flonum）になりません。"),
    ],
    task: [p("即値なら `true`、そうでなければ `false` を返す `Object#immediate?` を作る。")],
    hints: [note("即値かどうかは `RB_SPECIAL_CONST_P(obj)` で、C の真偽値を Ruby の値にするのは `RBOOL(…)` です。登録は `InitVM_Object` に書いてください。")],
    answer: [c(`
static VALUE
rb_obj_immediate_p(VALUE obj)
{
    return RBOOL(RB_SPECIAL_CONST_P(obj));
}

    rb_define_method(rb_mKernel, "immediate?", rb_obj_immediate_p, 0);`)],
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
    playground: "p 1.immediate?\np (2**30 - 1).immediate?\np (2**30).immediate?\np 1.5.immediate?\np nil.immediate?",
  },
  {
    slug: "proc-kind",
    title: "Proc#kind",
    file: "proc",
    body: [
      p("`Proc` の中身は `rb_proc_t` 構造体で、`GetProcPtr(procval, proc)` で取り出せます。lambda かどうかは `proc->header.is_lambda` に入っていて、`Proc#lambda?` はそれを返すだけです。"),
      c(`
VALUE
rb_proc_lambda_p(VALUE procval)
{
    rb_proc_t *proc;
    GetProcPtr(procval, proc);

    return RBOOL(proc->header.is_lambda);
}`),
    ],
    task: [p("lambda なら `:lambda`、そうでなければ `:proc` を返す `Proc#kind` を作る。")],
    hints: [note("シンボルは `ID2SYM(rb_intern(\"lambda\"))` で作れます。登録は `Init_Proc` の `\"lambda?\"` の行の近くに書いてください。")],
    answer: [c(`
static VALUE
proc_kind(VALUE self)
{
    rb_proc_t *proc;
    GetProcPtr(self, proc);
    return ID2SYM(rb_intern(proc->header.is_lambda ? "lambda" : "proc"));
}

    rb_define_method(rb_cProc, "kind", proc_kind, 0);`)],
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
    playground: "p(-> {}.kind)\np(proc {}.kind)\np method(:puts).to_proc.kind",
  },
  {
    slug: "define-method",
    title: "Module#define_private_method",
    file: "proc",
    body: [
      p("`define_method` の本体は `rb_mod_define_method` です。今の可視性（`private` の後かどうか）を `CREF_SCOPE_VISI(cref)` から読み、`rb_mod_define_method_with_visibility` に渡します。`private` の後に `define_method` で定義したメソッドが private になるのは、このためです。"),
      c(`
VALUE
rb_mod_define_method(int argc, VALUE *argv, VALUE mod)
{
    const rb_cref_t *cref = rb_vm_cref_in_context(mod, mod);
    const rb_scope_visibility_t default_scope_visi = {METHOD_VISI_PUBLIC, FALSE};
    const rb_scope_visibility_t *scope_visi = &default_scope_visi;

    if (cref) {
        scope_visi = CREF_SCOPE_VISI(cref);
    }

    return rb_mod_define_method_with_visibility(argc, argv, mod, scope_visi);
}`),
    ],
    task: [p("`define_method` と同じ引数を受け取り、いつも private のメソッドを定義する `Module#define_private_method` を作る。戻り値は `define_method` と同じく、定義したメソッド名のシンボル。")],
    hints: [note("`define_method` は `Init_Proc` で登録されています。")],
    answer: [c(`
static VALUE
rb_mod_define_private_method(int argc, VALUE *argv, VALUE mod)
{
    const rb_scope_visibility_t scope_visi = {METHOD_VISI_PRIVATE, FALSE};
    return rb_mod_define_method_with_visibility(argc, argv, mod, &scope_visi);
}

    rb_define_method(rb_cModule, "define_private_method", rb_mod_define_private_method, -1);`)],
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
    playground: "class Vault\n  define_private_method(:secret) { 42 }\n\n  def peek = secret\nend\n\np Vault.new.peek\np Vault.private_method_defined?(:secret)",
  },
  {
    slug: "module-mixins",
    title: "Module#mixins",
    file: "class",
    body: [
      p("`include` や `prepend` をすると、モジュールを指す `T_ICLASS` の内部クラスが作られ、スーパークラスの連なり（`RCLASS_SUPER`）に挟み込まれます。`Module#ancestors` は、この連なりをたどって並べています。"),
      c(`
    for (p = mod; p; p = RCLASS_SUPER(p)) {
        if (p == refined_class) break;
        if (p != RCLASS_ORIGIN(p)) continue;
        if (BUILTIN_TYPE(p) == T_ICLASS) {
            rb_ary_push(ary, METACLASS_OF(p));
        }
        else {
            rb_ary_push(ary, p);
        }
    }`),
      p("`prepend` されたクラスは、自分のメソッドを移した origin（これも `T_ICLASS`）を連なりの後ろに作ります。`p != RCLASS_ORIGIN(p)` は、元のクラスを飛ばして origin の位置で数えるための条件です。"),
    ],
    task: [p("`ancestors` のうちモジュールだけを、同じ順に返す `Module#mixins` を作る。")],
    hints: [note("`ancestors` は `object.c` の `InitVM_Object` で登録されています。関数は `class.c` に書き、`object.c` で同じように登録してください。`object.c` には、`InitVM_Object` より前に関数の宣言が要ります。")],
    answer: [
      c(`
VALUE
rb_mod_mixins(VALUE mod)
{
    VALUE p, ary = rb_ary_new();

    for (p = mod; p; p = RCLASS_SUPER(p)) {
        if (p != RCLASS_ORIGIN(p)) continue;
        if (BUILTIN_TYPE(p) == T_ICLASS && RB_TYPE_P(METACLASS_OF(p), T_MODULE)) {
            rb_ary_push(ary, METACLASS_OF(p));
        }
    }
    return ary;
}`),
      p("`object.c` には次の 2 行を足す。"),
      c(`
VALUE rb_mod_mixins(VALUE mod);

    rb_define_method(rb_cModule, "mixins", rb_mod_mixins, 0);`),
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
    playground: "module A; end\nmodule B; end\n\nclass C\n  include A\n  prepend B\nend\n\np C.ancestors\np C.mixins",
  },
  {
    slug: "attr-predicate",
    title: "Module#attr_predicate",
    file: "object",
    body: [
      p("`attr_reader` で定義したメソッドは、Ruby のコードを持ちません。`vm_method.c` の `rb_attr` が、インスタンス変数を読むだけの種類（`VM_METHOD_TYPE_IVAR`）のメソッドとして登録します。"),
      c(`
    attriv = rb_intern_str(rb_sprintf("@%"PRIsVALUE, rb_id2str(id)));
    if (read) {
        rb_add_method(klass, id, VM_METHOD_TYPE_IVAR, (void *)attriv, visi);
    }`),
    ],
    task: [p("`attr_predicate :admin` で、`@admin` を返す `admin?` を定義する `Module#attr_predicate` を作る。戻り値は、定義したメソッド名の配列。")],
    hints: [note("`rb_add_method` は `method.h` で宣言されているので、`object.c` に `#include \"method.h\"` を足します。引数から ID を作るのは、`attr_reader` と同じく `id_for_attr` で書けます。登録は `InitVM_Object` で行うので、関数はそれより前に書いてください。")],
    answer: [c(`
#include "method.h"

static VALUE
rb_mod_attr_predicate(int argc, VALUE *argv, VALUE klass)
{
    VALUE names = rb_ary_new2(argc);

    for (int i = 0; i < argc; i++) {
        ID id = id_for_attr(klass, argv[i]);
        ID attriv = rb_intern_str(rb_sprintf("@%"PRIsVALUE, rb_id2str(id)));
        ID pred = rb_intern_str(rb_sprintf("%"PRIsVALUE"?", rb_id2str(id)));
        rb_add_method(klass, pred, VM_METHOD_TYPE_IVAR, (void *)attriv, METHOD_VISI_PUBLIC);
        rb_ary_push(names, ID2SYM(pred));
    }
    return names;
}

    rb_define_method(rb_cModule, "attr_predicate", rb_mod_attr_predicate, -1);`)],
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
    playground: "class User\n  attr_predicate :admin\n\n  def initialize(admin)\n    @admin = admin\n  end\nend\n\np User.new(true).admin?",
  },
  {
    slug: "kernel-try",
    title: "Kernel#try",
    file: "vm_eval",
    body: [
      p("`Init_vm_eval` を見ると、`send` は `rb_define_method` では登録されていません。VM が直接処理する種類（`VM_METHOD_TYPE_OPTIMIZED`）のメソッドとして登録されています。C からメソッドを呼ぶ関数もここにあり、`rb_check_funcall` は、呼べるメソッドがあれば呼んで結果を返し、なければ `Qundef` を返します。"),
      c(`
VALUE
rb_check_funcall(VALUE recv, ID mid, int argc, const VALUE *argv)
{
    return rb_check_funcall_default_kw(recv, mid, argc, argv, Qundef, RB_NO_KEYWORDS);
}`),
      p("`vm_eval.c` は単独ではコンパイルされず、`vm.c` に `#include` されています。"),
    ],
    task: [p("`obj.try(:name, *args)` で、メソッドがあれば呼んだ結果を、なければ `nil` を返す `Kernel#try` を作る。")],
    hints: [note("`Qundef` かどうかは `UNDEF_P(v)` で確かめます。登録は `Init_vm_eval` の `\"public_send\"` の行の近くに書いてください。")],
    answer: [c(`
static VALUE
rb_obj_try(int argc, VALUE *argv, VALUE self)
{
    rb_check_arity(argc, 1, UNLIMITED_ARGUMENTS);
    VALUE result = rb_check_funcall(self, rb_to_id(argv[0]), argc - 1, argv + 1);
    return UNDEF_P(result) ? Qnil : result;
}

    rb_define_method(rb_mKernel, "try", rb_obj_try, -1);`)],
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
    playground: 'p "ruby".try(:upcase)\np nil.try(:upcase)',
  },
  {
    slug: "tap-eval",
    title: "Kernel#tap_eval",
    file: "vm_eval",
    body: [
      p("`instance_eval` と `instance_exec` は、`vm_eval.c` の `yield_under` で、ブロックの中の `self` をレシーバに切り替えてから実行します。C から使うときは `rb_obj_instance_exec` を呼びます。"),
      c(`
VALUE
rb_obj_instance_exec(int argc, const VALUE *argv, VALUE self)
{
    return yield_under(self, TRUE, argc, argv, RB_NO_KEYWORDS);
}`),
    ],
    task: [p("ブロックを `instance_exec` で実行してからレシーバを返す `Kernel#tap_eval` を作る。`tap` と違い、ブロックの中の `self` がレシーバになる。")],
    hints: [note("C の関数に渡されたブロックは、そのまま `rb_obj_instance_exec` に引き継がれます。")],
    answer: [c(`
static VALUE
rb_obj_tap_eval(VALUE self)
{
    rb_obj_instance_exec(1, &self, self);
    return self;
}

    rb_define_method(rb_mKernel, "tap_eval", rb_obj_tap_eval, 0);`)],
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
    playground: "p [1, 2].tap_eval { push(3) }",
  },
  {
    slug: "method-missing",
    title: "method_missing",
    file: "vm_eval",
    body: [
      p("Ruby のコードで見つからないメソッドを呼ぶと、VM は呼び出しを `method_missing(:名前, 引数…)` に書き換えて呼び直します。書き換えるのは `vm_insnhelper.c` の `vm_call_method_missing_body` です。"),
      c(`
    /* shift arguments: m(a, b, c) #=> method_missing(:m, a, b, c) */
    ...
    argv[0] = ID2SYM(vm_ci_mid(orig_ci));`),
      p("`method_missing` を定義していなければ、`BasicObject#method_missing` の実体である `vm_eval.c` の `rb_method_missing` が呼ばれます。そこから `raise_method_missing` が `NoMethodError` を作ります。メッセージの書式は、その先の `rb_make_no_method_exception` で決まります。"),
      c(`
static VALUE
rb_method_missing(int argc, const VALUE *argv, VALUE obj)
{
    rb_execution_context_t *ec = GET_EC();
    raise_method_missing(ec, argc, argv, obj, ec->method_missing_reason);
    UNREACHABLE_RETURN(Qnil);
}`),
    ],
    task: [p("見つからないメソッドを呼んだときのメッセージを、`undefined method 'foo' for …` から `no such method 'foo' for …` に変える。")],
    answer: [c(`
    if (!format) {
        format = rb_fstring_lit("no such method '%1$s' for %3$s%4$s");
    }`)],
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
    playground: "begin\n  Object.new.foo\nrescue NoMethodError => e\n  puts e.message\nend",
  },
  {
    slug: "bmethod-proc",
    title: "define_method と lambda",
    file: "proc",
    body: [
      p("`define_method` にブロックを渡して定義したメソッドは、lambda と同じく引数の数を厳密に確かめます。lambda として扱っている箇所は 3 つあります。"),
      list(
        "`proc.c` の `rb_mod_define_method_with_visibility`: ブロックを `rb_block_lambda()` で受け取る。複製した proc には `is_lambda = TRUE` を付ける",
        "`vm_insnhelper.c` の `vm_call_bmethod`: 中身が iseq なら `vm_call_iseq_bmethod` に進む。ここでは引数をメソッドと同じ方法（`arg_setup_method`）で受け取る",
        "`vm.c` の `vm_invoke_bmethod`: それ以外の経路でも、`is_lambda` に `TRUE` を渡して呼ぶ",
      ),
      c(`
    if (vm_block_type(block) == block_type_iseq) {
        CC_SET_FASTPATH(cc, vm_call_iseq_bmethod, TRUE);
        return vm_call_iseq_bmethod(ec, cfp, calling);
    }`),
    ],
    task: [p("ブロックで定義したメソッドを proc として扱い、足りない引数を `nil` で埋めるようにする。lambda を渡したときは、今まで通り引数の数を確かめる。")],
    hints: [note("`vm_call_iseq_bmethod` は lambda のときだけ使うようにします。proc のときは `vm_call_noniseq_bmethod` から `vm_invoke_bmethod` に進むので、そこで proc の `is_lambda` を渡します。")],
    answer: [
      p("`proc.c` の 2 か所を変える。"),
      c(`
        body = rb_block_proc();

            /* proc->header.is_lambda = TRUE; の行を消す */
            proc->header.is_from_method = TRUE;`),
      p("`vm_insnhelper.c` の `vm_call_bmethod` で、速い経路を lambda のときだけにする。"),
      c(`
    if (vm_block_type(block) == block_type_iseq && proc->header.is_lambda) {`),
      p("`vm.c` の `vm_invoke_bmethod` で、`TRUE` の代わりに proc の値を渡す。"),
      c(`
    return invoke_block_from_c_proc(ec, proc, self, argc, argv, kw_splat, block_handler, proc->header.is_lambda, NULL, me);`),
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
    playground: "class Foo\n  define_method(:pair) { |a, b| [a, b] }\nend\n\np Foo.new.pair(1)",
  },
  {
    slug: "opt-plus",
    title: "opt_plus 命令",
    file: "vm_insnhelper",
    body: [
      p("Ruby から見ると `a + b` は `a.+(b)` というメソッド呼び出しですが、YARV は普通の呼び出しの命令（`send`）ではなく、`+` 専用の `opt_plus` 命令にコンパイルします。`RubyVM::InstructionSequence.compile(\"a + b\").disasm` で確かめられます。"),
      p("`opt_plus` は `vm_insnhelper.c` の `vm_opt_plus` を呼びます。両方が Fixnum で、`Integer#+` が再定義されていなければ（`OP_UNREDEFINED_P`）、メソッドを探して呼ぶ手順を省き、その場で足します。結果は `Integer#+` を呼んだときと同じです。当てはまらなければ `Qundef` を返し、普通のメソッド呼び出しの手順に戻ります。"),
      c(`
static VALUE
vm_opt_plus(VALUE recv, VALUE obj)
{
    if (FIXNUM_2_P(recv, obj) &&
        OP_UNREDEFINED_P(PLUS, INTEGER)) {
        return rb_fix_plus_fix(recv, obj);
    }`),
    ],
    task: [p("整数どうしでこの近道を通った回数を返す `RubyVM.opt_plus_count` を作る。")],
    hints: [note("回数は `vm_insnhelper.c` の静的変数で数えます。`vm_insnhelper.c` は `vm.c` に `#include` されているので、`vm.c` の `Init_VM` から、その変数を読む関数を登録できます。`rb_cRubyVM` を作った行より後に書いてください。")],
    answer: [
      p("`vm_insnhelper.c` で数える。"),
      c(`
static unsigned long opt_plus_count;

static VALUE
vm_opt_plus_count(VALUE self)
{
    return ULONG2NUM(opt_plus_count);
}

static VALUE
vm_opt_plus(VALUE recv, VALUE obj)
{
    if (FIXNUM_2_P(recv, obj) &&
        OP_UNREDEFINED_P(PLUS, INTEGER)) {
        opt_plus_count++;
        return rb_fix_plus_fix(recv, obj);
    }`),
      p("`vm.c` の `Init_VM` で登録する。"),
      c(`
    rb_cRubyVM = rb_define_class("RubyVM", rb_cObject);
    rb_define_singleton_method(rb_cRubyVM, "opt_plus_count", vm_opt_plus_count, 0);`),
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
    playground: 'puts RubyVM::InstructionSequence.compile("a = 1; b = 2; a + b").disasm\n\na = 1\nb = 2\nbefore = RubyVM.opt_plus_count\n3.times { a + b }\np RubyVM.opt_plus_count - before',
  },
  {
    slug: "free",
    title: "Playground",
    file: null,
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
    playground: 'puts "Hello, MRI!"',
  },
];

export const lessonBySlug = (slug: string) => lessons.find((l) => l.slug === slug);
