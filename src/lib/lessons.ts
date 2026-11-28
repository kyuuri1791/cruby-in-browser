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

/** 参考文献（人が書いた解説やリファレンス）。title の後ろの括弧に、書いた人や載っている場所を入れる */
export type Ref = { title: string; url: string };

export type Lesson = {
  slug: string;
  title: string;
  /** 目次で、この章の前に出す部の見出し（部の最初の章にだけ書く） */
  part?: string;
  body?: Block[];
  /** 参考文献。手順の後、課題の上に並べる */
  refs?: Ref[];
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
const c = (code: string): Block => ({ type: "code", lang: "c", code: code.trim() });
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
        "エクスプローラーの `ruby/` と `build/` にある C のファイルを書き換える",
        "`make` でビルド、`./ruby main.rb` で実行、`bin/rspec spec/…` で今の課題の spec を実行",
      ),
      p("このサイトは、CRuby の中を実際に動かして確かめるためのハンズオン環境です。仕組みの説明は書いていないので、手順を試したら各章の参考文献を読んでください。"),
      p("課題で扱うのは、パーサとコンパイラ、VM の命令の一部とメソッド呼び出し、メソッドの定義と探索、オブジェクトの表現、ブロックです。GC・JIT は扱いません。"),
      note("標準ライブラリと rspec が入っています。ページを再読み込みすると、書き換えた内容は元に戻ります。"),
    ],
  },
  {
    slug: "version",
    title: "ruby -v の表示",
    body: [
      p("1. `main.rb` に次を書いて実行する。"),
      rb(`
p RUBY_VERSION.equal?(Ruby::VERSION)
p defined?(Ruby::COPYRIGHT)
p defined?(RUBY_COPYRIGHT)`),
      p("2. {{version.c:165|\"COPYRIGHT\"}} の行を消し、`make` して 1 と同じコードを実行する。"),
    ],
    refs: [
      { title: "(2) MRI ソースコードの構造（Ruby Hack Challenge）", url: "https://github.com/ko1/rubyhackchallenge/blob/master/JA/2_mri_structure.md" },
      { title: "rb_define_global_const（るりま）", url: "https://docs.ruby-lang.org/ja/latest/function/rb_define_global_const.html" },
    ],
    task: [
      p("`RUBY_DESCRIPTION` の先頭の `ruby` を `myruby` に変える。"),
      rb(`
p RUBY_DESCRIPTION #=> "myruby 4.1.0dev (...) +PRISM [wasm32-wasi]"`),
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
    slug: "lexer",
    part: "第 1 部　p 1 + 2 が動くまで",
    title: "字句解析",
    body: [
      p("1. `main.rb` に次を書いて実行する。"),
      rb(`
def lex(code)
  puts code
  Ruby::Prism.lex(code).value.each { |t, _| puts "  #{t.value.ljust(4)} #{t.type}" }
end
lex "p 1 + 2"
lex "p +2"
lex "x = 1; p x +2"
lex "p 1 ＋ 2"`),
      p("2. {{prism.c:11010|LEX(PM_TOKEN_PLUS);}} の `LEX(PM_TOKEN_PLUS);` を `LEX(PM_TOKEN_MINUS);` に変える。`make` し、`main.rb` に下を書いて実行する。`p 1 + 2` は何を出すか。"),
      rb(`
def lex(code)
  puts code
  Ruby::Prism.lex(code).value.each { |t, _| puts "  #{t.value.ljust(4)} #{t.type}" }
end
lex "p 1 + 2"
p 1 + 2`),
    ],
    refs: [
      { title: "Advent of Prism: Part 0 - Introduction（Kevin Newton）", url: "https://kddnewton.com/2023/11/30/advent-of-prism-part-0.html" },
      { title: "第 11 章「状態付きスキャナ」（Ruby ソースコード完全解説）", url: "https://i.loveruby.net/ja/rhg/book/contextual.html" },
      { title: "Prism（Kevin Newton）", url: "https://kddnewton.com/2024/01/23/prism.html" },
    ],
    task: [
      p("全角の `＋` を、`+` と同じ `PLUS` の字句にする。"),
      rb(`
p Ruby::Prism.lex("1 ＋ 2").value.map { |t, _| t.type } #=> [:INTEGER, :PLUS, :INTEGER, :EOF]`),
    ],
    hints: [
      note("どの記号にも当たらなかった文字は、`parser_lex` の `switch` の `default:` で識別子として読まれます。"),
      note("`＋` は UTF-8 で `EF BC 8B` の 3 バイトです。字句の先頭は `parser->current.start` で、次の条件で判定できます。字句の終わり（`parser->current.end`）は 1 バイト目の次を指しています。"),
      c(`parser->end - parser->current.start >= 3 && (uint8_t) parser->current.start[0] == 0xEF && (uint8_t) parser->current.start[1] == 0xBC && (uint8_t) parser->current.start[2] == 0x8B`),
    ],
    answer: [
      diff("ruby/prism/prism.c", `
@@ -11370,6 +11370,11 @@ parser_lex(pm_parser_t *parser) {
                     LEX(lex_at_variable(parser));
 
                 default: {
+                    if (parser->end - parser->current.start >= 3 && (uint8_t) parser->current.start[0] == 0xEF && (uint8_t) parser->current.start[1] == 0xBC && (uint8_t) parser->current.start[2] == 0x8B) {
+                        parser->current.end += 2;
+                        lex_state_set(parser, PM_LEX_STATE_BEG);
+                        LEX(PM_TOKEN_PLUS);
+                    }
                     if (*parser->current.start != '_') {
                         size_t width = char_is_identifier_start(parser, parser->current.start, parser->end - parser->current.start);`),
    ],
    spec: spec(`
RSpec.describe "全角の ＋" do
  def types(code) = Ruby::Prism.lex(code).value.map { |t, _| t.type }

  it "PLUS の字句になる" do
    expect(types("1 ＋ 2")).to eq([:INTEGER, :PLUS, :INTEGER, :EOF])
  end

  it "前後に空白がなくても PLUS の字句になる" do
    expect(types("1＋2")).to eq([:INTEGER, :PLUS, :INTEGER, :EOF])
  end

  it "半角の + はそのまま" do
    expect(types("1 + 2")).to eq([:INTEGER, :PLUS, :INTEGER, :EOF])
  end
end`),
  },
  {
    slug: "parser",
    title: "構文解析",
    body: [
      p("1. `main.rb` に次を書いて実行する。"),
      rb(`
pp Ruby::Prism.parse("p 1 + 2").value.statements.body[0]
pp Ruby::Prism.parse("10 - 1").value.statements.body[0]`),
      p("2. {{prism.c:2991|node->receiver = receiver;}} と {{prism.c:2995|pm_arguments_node_arguments_append(parser->arena, arguments, argument);}} で、`receiver` と `argument` を入れ替えて次のようにする。`make` し、`main.rb` に下を書いて実行する。木と結果はどう変わるか。"),
      c(`
node->receiver = argument;
pm_arguments_node_arguments_append(parser->arena, arguments, receiver);`),
      rb(`
def text(node) = node.type == :integer_node ? node.value.to_s : node.slice
def tree(code)
  call = Ruby::Prism.parse(code).value.statements.body[0]
  puts code
  puts "  #{call.name} の呼び出し"
  puts "  ├ receiver:  #{call.receiver ? text(call.receiver) : "（なし）"}"
  puts "  └ arguments: #{call.arguments.arguments.map { |n| text(n) }.join(", ")}"
end
tree "10 - 1"
tree "10.-(1)"
p 10 - 1
p 10.-(1)
p "a" + "b"`),
      note("壊したパーサは、Ruby で書かれた prism の表示のライブラリも読むので、`pp` では木を表示できません。ここでは `receiver` と `arguments` を直接読んで表示します。"),
    ],
    refs: [
      { title: "Advent of Prism: Part 13 - Calls (part 1)（Kevin Newton）", url: "https://kddnewton.com/2023/12/13/advent-of-prism-part-13.html" },
      { title: "Advent of Prism: Part 1 - Literals（Kevin Newton）", url: "https://kddnewton.com/2023/12/01/advent-of-prism-part-1.html" },
      { title: "第 10 章「パーサ」（Ruby ソースコード完全解説）", url: "https://i.loveruby.net/ja/rhg/book/parser.html" },
    ],
    task: [
      p("前の章の `＋` を、`+` と同じメソッド呼び出しにする。"),
      rb(`
p 1 ＋ 2 #=> 3
p Ruby::Prism.parse("1 ＋ 2").value.statements.body[0].name #=> :+`),
    ],
    hints: [
      note("前の章の課題の変更も要ります。前の章の手順 2 で、字句を `MINUS` にしても `p 1 + 2` が 3 になったのはなぜかを考えてみてください。"),
    ],
    answer: [
      p("前の章の解答例の変更に加えて、次の変更をする。"),
      diff("ruby/prism/prism.c", `
@@ -2995,7 +2995,11 @@ pm_call_node_binary_create(pm_parser_t *
     pm_arguments_node_arguments_append(parser->arena, arguments, argument);
     node->arguments = arguments;
 
-    node->name = pm_parser_constant_id_token(parser, operator);
+    if (operator->type == PM_TOKEN_PLUS && operator->end - operator->start == 3) {
+        node->name = pm_parser_constant_id_constant(parser, "+", 1);
+    } else {
+        node->name = pm_parser_constant_id_token(parser, operator);
+    }
     return node;
 }`),
    ],
    spec: spec(`
RSpec.describe "全角の ＋ の呼び出し" do
  it "+ のメソッド呼び出しになる" do
    expect(Ruby::Prism.parse("1 ＋ 2").value.statements.body[0].name).to eq(:+)
  end

  it "足し算になる" do
    expect(eval("1 ＋ 2")).to eq(3)
  end

  it "opt_plus 命令にコンパイルされる" do
    insns = RubyVM::InstructionSequence.compile("x = 1; x ＋ 2").to_a.last.grep(Array).map(&:first)
    expect(insns).to include(:opt_plus)
  end
end`),
  },
  {
    slug: "p-compile",
    title: "コンパイラ",
    body: [
      p("1. `main.rb` に次を書いて実行する。"),
      rb(`
pp Ruby::Prism.parse("p 1 + 2").value
puts RubyVM::InstructionSequence.compile("p 1 + 2").disasm`),
      p("2. {{prism_compile.c:9740|PUSH_INSN1(ret, location, putobject, operand);}} の `PUSH_INSN1(ret, location, putobject, operand);` の前に次の行を足す。`make` し、`main.rb` に下を書いて実行する。どれが変わるか。"),
      c(`if (operand == INT2FIX(2)) operand = INT2FIX(20);`),
      rb(`
p 1 + 2
p eval("1 + 2")
p "1 + 2"
p [2].size`),
      p("3. `main.rb` に下を書いて実行する。次に、{{prism_compile.c:7565|if (pm_opt_str_freeze_p(iseq, node)) {}} の `if (pm_opt_str_freeze_p(iseq, node)) {` を `if (0) {` に変える。`make` し、もう一度実行する。命令列はどう変わるか。"),
      rb(`puts RubyVM::InstructionSequence.compile('"a".freeze').disasm`),
    ],
    refs: [
      { title: "Prism（Kevin Newton）", url: "https://kddnewton.com/2024/01/23/prism.html" },
      { title: "Advent of Prism: Part 1 - Literals（Kevin Newton）", url: "https://kddnewton.com/2023/12/01/advent-of-prism-part-1.html" },
      { title: "YARV Maniacs 【第 9 回】 特化命令（るびま）", url: "https://magazine.rubyist.net/articles/0017/0017-YarvManiacs.html" },
    ],
    task: [
      p("コンパイラで、整数リテラルの `1 + 2` を `putobject 4` にする。"),
      rb(`
p 1 + 2         #=> 4
x = 1
p x + 2         #=> 3
p 1.send(:+, 2) #=> 3`),
    ],
    hints: [
      note("3 で書き換えた `switch (method_id)` に、`+`（`idPLUS`）の場合を足します。"),
      note("`node->receiver` と `node->arguments->arguments.nodes[0]` が、`+` の左右のノードです。整数リテラルのノードは `PM_INTEGER_NODE` で、値は `parse_integer` で取れます。"),
    ],
    answer: [
      diff("ruby/prism_compile.c", `
@@ -7571,6 +7571,15 @@ pm_compile_call_node(rb_iseq_t *iseq, co
         }
         break;
       }
+      case idPLUS: {
+        const pm_node_t *arg = node->arguments && node->arguments->arguments.size == 1 ? node->arguments->arguments.nodes[0] : NULL;
+        if (node->receiver && PM_NODE_TYPE_P(node->receiver, PM_INTEGER_NODE) && arg && PM_NODE_TYPE_P(arg, PM_INTEGER_NODE) &&
+            parse_integer((const pm_integer_node_t *) node->receiver) == INT2FIX(1) && parse_integer((const pm_integer_node_t *) arg) == INT2FIX(2)) {
+            if (!popped) PUSH_INSN1(ret, location, putobject, INT2FIX(4));
+            return;
+        }
+        break;
+      }
     }
 
     if (PM_NODE_FLAG_P(node, PM_CALL_NODE_FLAGS_ATTRIBUTE_WRITE) && !popped) {`),
    ],
    spec: spec(`
RSpec.describe "コンパイラで 1 + 2 を 4 にする" do
  it "1 + 2 は 4" do
    expect(eval("1 + 2")).to eq(4)
  end

  it "putobject 4 にコンパイルされる" do
    insns = RubyVM::InstructionSequence.compile("1 + 2").to_a.last.grep(Array)
    expect(insns).to eq([[:putobject, 4], [:leave]])
  end

  it "変数の足し算は変わらない" do
    expect(eval("x = 1; x + 2")).to eq(3)
  end

  it "send で呼んだときは変わらない" do
    expect(eval("1.send(:+, 2)")).to eq(3)
  end
end`),
  },
  {
    slug: "p-vm",
    title: "VM",
    body: [
      p("1. `main.rb` に次を書いて実行する。"),
      rb(`puts RubyVM::InstructionSequence.compile("p 1 + 2").disasm`),
      p("2. {{vm_insnhelper.c:7064|return rb_fix_plus_fix(recv, obj);}} の `return rb_fix_plus_fix(recv, obj);` の前に次の行を足す。`make` し、`main.rb` に下を書いて実行する。どれで出力されるか。"),
      c(`fprintf(stderr, "fast path\\n");`),
      rb(`
p 1 + 2
p 1.send(:+, 2)
p "a" + "b"`),
    ],
    refs: [
      { title: "Advent of YARV: Part 0 - Introduction（Kevin Newton）", url: "https://kddnewton.com/2022/11/30/advent-of-yarv-part-0.html" },
      { title: "Advent of YARV: Part 1 - Pushing onto the stack（Kevin Newton）", url: "https://kddnewton.com/2022/12/01/advent-of-yarv-part-1.html" },
      { title: "YARV Maniacs 【第 9 回】 特化命令（るびま）", url: "https://magazine.rubyist.net/articles/0017/0017-YarvManiacs.html" },
    ],
    task: [
      p("`vm_opt_plus` で、整数の 1 と 2 を足したときだけ 4 を返す。"),
      rb(`
x = 1
y = 2
p x + y         #=> 4
p 1 + 2         #=> 4
p x.send(:+, y) #=> 3`),
    ],
    hints: [note("整数の 1 は `INT2FIX(1)` です。`VALUE` どうしは `==` で比べられます。")],
    answer: [
      diff("ruby/vm_insnhelper.c", `
@@ -7061,6 +7061,7 @@ vm_opt_plus(VALUE recv, VALUE obj)
 {
     if (FIXNUM_2_P(recv, obj) &&
         OP_UNREDEFINED_P(PLUS, INTEGER)) {
+        if (recv == INT2FIX(1) && obj == INT2FIX(2)) return INT2FIX(4);
         return rb_fix_plus_fix(recv, obj);
     }
     else if (FLONUM_2_P(recv, obj) &&`),
    ],
    spec: spec(`
RSpec.describe "VM で 1 + 2 を 4 にする" do
  let(:one) { 1 }
  let(:two) { 2 }

  it "変数の 1 と 2 を足すと 4" do
    x = one
    y = two
    expect(x + y).to eq(4)
  end

  it "リテラルの 1 + 2 も 4" do
    expect(eval("1 + 2")).to eq(4)
  end

  it "2 + 1 は 3 のまま" do
    x = two
    y = one
    expect(x + y).to eq(3)
  end

  it "send で呼んだときは変わらない" do
    expect(one.send(:+, two)).to eq(3)
  end
end`),
  },
  {
    slug: "p-call",
    title: "C の関数",
    body: [
      p("1. {{vm_insnhelper.c:3936|val = (*cfunc->invoker)(recv, argc, argv, cfunc->func);}} の `val = (*cfunc->invoker)(recv, argc, argv, cfunc->func);` の前に次の行を足す。`make` し、`main.rb` に下を書いて実行する。`cfunc +` はどちらで出力されるか。"),
      c(`if (me->def->original_id == idPLUS) fprintf(stderr, "cfunc +\\n");`),
      rb(`
p 1 + 2
p 1.send(:+, 2)`),
      p("2. 1 の行を消し、{{numeric.c:6557|rb_define_method(rb_cInteger, \"+\", rb_int_plus, 1);}} の `rb_define_method(rb_cInteger, \"+\", rb_int_plus, 1);` を消す。`make` し、1 と同じコードを実行する。何が起きるか。"),
    ],
    refs: [
      { title: "Advent of YARV: Part 6 - Calling methods (1)（Kevin Newton）", url: "https://kddnewton.com/2022/12/06/advent-of-yarv-part-6.html" },
      { title: "(3) 演習：メソッドの追加（Ruby Hack Challenge）", url: "https://github.com/ko1/rubyhackchallenge/blob/master/JA/3_practice.md" },
      { title: "第 15 章「メソッド」（Ruby ソースコード完全解説）", url: "https://i.loveruby.net/ja/rhg/book/method.html" },
    ],
    task: [
      p("`Integer#+` の C の関数で、1 と 2 を足したときだけ 4 を返す。"),
      rb(`
p 1.send(:+, 2) #=> 4
p 1 + 2         #=> 3`),
    ],
    hints: [note("`numeric.c` の `Init_Numeric` で `\"+\"` を登録している行から、関数を探してください。")],
    answer: [
      diff("ruby/numeric.c", `
@@ -4202,6 +4202,7 @@ rb_fix_plus(VALUE x, VALUE y)
 VALUE
 rb_int_plus(VALUE x, VALUE y)
 {
+    if (x == INT2FIX(1) && y == INT2FIX(2)) return INT2FIX(4);
     if (FIXNUM_P(x)) {
         return fix_plus(x, y);
     }`),
    ],
    spec: spec(`
RSpec.describe "Integer#+ の C の関数で 1 + 2 を 4 にする" do
  let(:one) { 1 }
  let(:two) { 2 }

  it "send で呼ぶと 4" do
    expect(one.send(:+, two)).to eq(4)
  end

  it "+ で書くと 3 のまま" do
    x = one
    y = two
    expect(x + y).to eq(3)
  end

  it "2 + 1 は send でも 3" do
    expect(two.send(:+, one)).to eq(3)
  end
end`),
  },
  {
    slug: "keyword",
    part: "第 2 部　深掘り",
    title: "予約語と字句の状態",
    body: [
      p("このまとまりの問い：同じ文字列が、なぜ違う字句や構文木になるのか。"),
      p("1. `main.rb` に次を書いて実行する。`+` の切られ方の違いを見てみる。"),
      rb(`
def lex(code)
  puts code
  Ruby::Prism.lex(code).value.each { |t, _| puts "  #{t.value.ljust(4)} #{t.type}" }
end
lex "p +2"
lex "x = 1; p x +2"`),
      p("2. `p +2` は、`+2` を `p` する、として実行される。`+2` は {{prism.c:10991|PM_WARN_AMBIGUOUS_FIRST_ARGUMENT_PLUS), true) : false)}} の行の `lex_state_spcarg_p` で 1 つの数値になっている（引数を書ける状態で前に空白があり、直後に空白がない）。"),
      p("この 3 項演算子全体を `false` に変えて `make` し、以下を実行する。`+` の字句と、`p +2` の結果はどうなるか。"),
      rb(`
def lex(code)
  puts code
  Ruby::Prism.lex(code).value.each { |t, _| puts "  #{t.value.ljust(4)} #{t.type}" }
end
lex "p +2"
p +2`),
      p("3. 2 の変更を戻して `make` し直し、以下を実行する。`if` についてどのような違いが出ているかを確認する。"),
      rb(`
def lex(code)
  puts code
  Ruby::Prism.lex(code).value.each { |t, _| puts "  #{t.value.ljust(4)} #{t.type}" }
end
lex "if x then 1 end"
lex "1 if x"`),
    ],
    refs: [
      { title: "第 11 章「状態付きスキャナ」（Ruby ソースコード完全解説）", url: "https://i.loveruby.net/ja/rhg/book/contextual.html" },
      { title: "Advent of Prism: Part 7 - Control-flow（Kevin Newton）", url: "https://kddnewton.com/2023/12/07/advent-of-prism-part-7.html" },
      { title: "Prism（Kevin Newton）", url: "https://kddnewton.com/2024/01/23/prism.html" },
    ],
    task: [
      p("`もし` を `if` と同じ予約語にする。"),
      rb(`
p(もし true then :true else :false end) #=> :true
p :ok もし true                         #=> :ok`),
    ],
    hints: [
      note("予約語は `pm_keyword_find` で表から探しています。"),
      note("普通の `if` と後置の `if` の使い分けは、`lex_identifier` で `previous_lex_state` を見て決めています。`もし` を `if` の項目として返せば、使い分けもそのまま効きます。"),
    ],
    answer: [
      diff("ruby/prism/prism.c", `
@@ -8559,6 +8559,7 @@
 static PRISM_INLINE const pm_keyword_t *
 pm_keyword_find(const uint8_t *start, const uint8_t *end) {
     ptrdiff_t width = end - start;
+    if (width == 6 && memcmp(start, "もし", 6) == 0) return pm_keyword_find((const uint8_t *) "if", (const uint8_t *) "if" + 2);
     if (width < 2 || width > PM_KEYWORD_LENGTH_MAXIMUM) return NULL;
 
     size_t uwidth = (size_t) width;`),
    ],
    spec: spec(`
RSpec.describe "予約語の もし" do
  def types(code) = Ruby::Prism.lex(code).value.map { |t, _| t.type }

  it "文の頭では KEYWORD_IF になる" do
    expect(types("もし x then 1 end").first).to eq(:KEYWORD_IF)
    expect(eval("もし true then :true else :false end")).to eq(:true)
  end

  it "後ろに置くと KEYWORD_IF_MODIFIER になる" do
    expect(types("1 もし x")[1]).to eq(:KEYWORD_IF_MODIFIER)
    expect(eval(":ok もし true")).to eq(:ok)
  end

  it "もしも は識別子のまま" do
    expect(eval("もしも = 1; もしも")).to eq(1)
  end
end`),
  },
  {
    slug: "numeric-suffix",
    title: "数値リテラル",
    body: [
      p("1. `main.rb` に次を書いて実行する。suffix の付いた数値がどんな字句になるかを見てみる。"),
      rb(`
p Ruby::Prism.lex("1_000 0x10 3r 2i").value.map { |t, _| t.type }`),
      p("2. 大体の 10 進の整数は、字句解析の途中で {{prism.c:8247|value = value * 10 + (uint64_t) (c - '0');}} の行が 1 桁ずつ値にしている。この行を `value = value * 10;` に変えて `make` し、以下を実行する。どれが変わり、どれが変わらないかを確認する。"),
      rb(`
p 12
p 1_2
p 0x12
p 12.5
p 12345678901234567890`),
    ],
    refs: [
      { title: "Advent of Prism: Part 1 - Literals（Kevin Newton）", url: "https://kddnewton.com/2023/12/01/advent-of-prism-part-1.html" },
      { title: "リテラル（るりま）", url: "https://docs.ruby-lang.org/ja/latest/doc/spec=2fliteral.html" },
    ],
    task: [
      p("整数の後ろに `k` を付けたとき、1000 倍の意味として実行できるようにする。"),
      rb(`
p 3k      #=> 3000
p 12k + 1 #=> 12001`),
    ],
    hints: [
      note("2 で見たとおり、大体の 10 進の整数は字句解析の途中で値まで計算しています（`parser->integer.value`）。その値は、`pm_integer_node_create` が `parser->integer.start == token->start` のときに使います。"),
      note("`r` や `i` の suffix は、`lex_numeric` で `match(parser, 'r')` のように読んでいます。"),
    ],
    answer: [
      diff("ruby/prism/prism.c", `
@@ -8306,6 +8306,9 @@
     if (parser->current.end < parser->end) {
         bool seen_e = false;
         type = lex_numeric_prefix(parser, &seen_e);
+        if (type == PM_TOKEN_INTEGER && parser->integer.start == parser->current.start && match(parser, 'k')) {
+            parser->integer.value *= 1000;
+        }
 
         const uint8_t *end = parser->current.end;
         pm_token_type_t suffix_type = type;`),
    ],
    spec: spec(`
RSpec.describe "整数の k" do
  it "1000 倍になる" do
    expect(eval("3k")).to eq(3000)
    expect(eval("12k + 1")).to eq(12001)
  end

  it "1 つの INTEGER の字句になる" do
    expect(Ruby::Prism.lex("3k").value.map { |t, _| t.type }).to eq([:INTEGER, :EOF])
  end

  it "k のない整数は変わらない" do
    expect(eval("3")).to eq(3)
  end
end`),
  },
  {
    slug: "precedence",
    title: "演算子の優先順位",
    body: [
      p("1. `main.rb` に次を書いて実行する。式がどんな括弧の付き方の木になるかを見てみる。"),
      rb(`
def tree(n) = n.type == :call_node && n.arguments ? "(#{tree(n.receiver)} #{n.name} #{tree(n.arguments.arguments[0])})" : n.slice
p tree(Ruby::Prism.parse("1 + 2 * 3").value.statements.body[0])
p tree(Ruby::Prism.parse("1 - 2 - 3").value.statements.body[0])
p tree(Ruby::Prism.parse("2 ** 3 ** 2").value.statements.body[0])`),
      p("2. `+` の結びつく強さは {{prism.c:12785|[PM_TOKEN_PLUS] = LEFT_ASSOCIATIVE(PM_BINDING_POWER_TERM),}} の行で決まっている。`PM_BINDING_POWER_TERM` を `*` と同じ `PM_BINDING_POWER_FACTOR` に変えて `make` し、以下を実行する。どれの結果が変わるかを確認する。"),
      rb(`
p 1 + 2 * 3
p 2 * 3 + 1
p 1 - 2 * 3`),
    ],
    refs: [
      { title: "Pratt Parsers: Expression Parsing Made Easy（Bob Nystrom）", url: "https://journal.stuffwithstuff.com/2011/03/19/pratt-parsers-expression-parsing-made-easy/" },
      { title: "演算子式（るりま）", url: "https://docs.ruby-lang.org/ja/latest/doc/spec=2foperator.html" },
      { title: "第 10 章「パーサ」（Ruby ソースコード完全解説）", url: "https://i.loveruby.net/ja/rhg/book/parser.html" },
    ],
    task: [
      p("`**` を、`*` と同じ優先順位の左結合にする。"),
      rb(`
p 2 ** 3 ** 2 #=> 64（(2 ** 3) ** 2）
p 2 * 3 ** 2  #=> 36（(2 * 3) ** 2）
p 1 + 2 ** 2  #=> 5`),
    ],
    hints: [note("`pm_binding_powers` の `LEFT_ASSOCIATIVE` と `RIGHT_ASSOCIATIVE` の定義を見比べてください。")],
    answer: [
      diff("ruby/prism/prism.c", `
@@ -12795,7 +12795,7 @@
     [PM_TOKEN_UMINUS_NUM] = { PM_BINDING_POWER_UMINUS, PM_BINDING_POWER_MAX, false, false },
 
     // **
-    [PM_TOKEN_STAR_STAR] = RIGHT_ASSOCIATIVE(PM_BINDING_POWER_EXPONENT),
+    [PM_TOKEN_STAR_STAR] = LEFT_ASSOCIATIVE(PM_BINDING_POWER_FACTOR),
     [PM_TOKEN_USTAR_STAR] = RIGHT_ASSOCIATIVE_UNARY(PM_BINDING_POWER_UNARY),
 
     // ! ~ +@`),
    ],
    spec: spec(`
RSpec.describe "** の優先順位" do
  it "左結合になる" do
    expect(eval("2 ** 3 ** 2")).to eq(64)
  end

  it "* と同じ優先順位になる" do
    expect(eval("2 * 3 ** 2")).to eq(36)
    expect(eval("2 ** 3 * 2")).to eq(16)
  end

  it "+ よりは先に計算する" do
    expect(eval("1 + 2 ** 2")).to eq(5)
  end
end`),
  },
  {
    slug: "var-or-call",
    title: "変数か、メソッド呼び出しか",
    body: [
      p("1. `main.rb` に次を書いて実行する。同じ `foo` が、どの書き方のときに変数として読まれるかを見てみる。"),
      rb(`
def kind(code) = puts "#{code.ljust(22)} #{Ruby::Prism.parse(code).value.statements.body.last.type}"
kind "foo"
kind "foo()"
kind "self.foo"
kind "foo = 1; foo"
kind "foo = 1 if false; foo"
foo = 1 if false
p foo`),
      p("2. `main.rb` に次を書いて実行する。代入していないブロックの中の `it` がどう読まれるかを見てみる。"),
      rb(`p Ruby::Prism.parse("[1].map { it }").value.statements.body[0].block.body.body[0].type`),
      p("3. 識別子を変数として読むかは `parse_variable` が決めている。その中で、名前が `it` かを {{prism.c:16772|pm_token_is_it(parser->previous.start, parser->previous.end)) {}} の行で確かめている。この行を `} else if (0) {` に変えて `make` する。"),
      p("以下を実行し、`it` がどう読まれるようになったかを確認する。"),
      rb(`
p [1, 2].map { |x| x * 2 }
p [1, 2].map { it * 2 }`),
    ],
    refs: [
      { title: "Advent of Prism: Part 3 - Reads（Kevin Newton）", url: "https://kddnewton.com/2023/12/03/advent-of-prism-part-3.html" },
      { title: "Advent of Prism: Part 17 - Scopes（Kevin Newton）", url: "https://kddnewton.com/2023/12/17/advent-of-prism-part-17.html" },
      { title: "第 12 章「構文木の構築」（Ruby ソースコード完全解説）", url: "https://i.loveruby.net/ja/rhg/book/syntree.html" },
    ],
    task: [
      p("ブロックの中の `that` を、`it` と同じ意味にする。"),
      rb(`
p [1, 2].map { that * 2 } #=> [2, 4]
that = 5
p that                    #=> 5`),
    ],
    hints: [note("3 で変えた行が、名前が `it` かどうかをどの関数で確かめているかを見てください。")],
    answer: [
      diff("ruby/prism/prism.c", `
@@ -5466,7 +5466,8 @@
  */
 static PRISM_INLINE bool
 pm_token_is_it(const uint8_t *start, const uint8_t *end) {
-    return (end - start == 2) && (start[0] == 'i') && (start[1] == 't');
+    return ((end - start == 2) && (start[0] == 'i') && (start[1] == 't')) ||
+           ((end - start == 4) && memcmp(start, "that", 4) == 0);
 }
 
 /**`),
    ],
    spec: spec(`
RSpec.describe "ブロックの that" do
  it "it と同じく、ブロックの引数になる" do
    expect(eval("[1, 2].map { that * 2 }")).to eq([2, 4])
  end

  it "代入したローカル変数の that はそのまま" do
    expect(eval("that = 5; that")).to eq(5)
  end

  it "ブロックの外ではメソッド呼び出しのまま" do
    expect { eval("that") }.to raise_error(NameError)
  end
end`),
  },
  {
    slug: "constant-fold",
    title: "定数畳み込み",
    body: [
      p("このまとまりの問い：同じ書き方が、なぜ違う命令になるのか。"),
      p("1. `main.rb` に次を書いて実行する。`1 + 2` がコンパイル時に計算されているかを見てみる。"),
      rb(`
puts RubyVM::InstructionSequence.compile("1 + 2").disasm
puts RubyVM::InstructionSequence.compile('"a".freeze').disasm`),
      p("2. `main.rb` に次を書いて実行する。`1 + 2` はどうなるか。"),
      rb(`
class Integer
  def +(other) = 42
end
p 1 + 2`),
      note("`Integer#+` は実行中に再定義できます。コンパイラが `1 + 2` を先に計算してよいかを考えてみてください。"),
    ],
    refs: [
      { title: "Prism（Kevin Newton）", url: "https://kddnewton.com/2024/01/23/prism.html" },
      { title: "Advent of Prism: Part 1 - Literals（Kevin Newton）", url: "https://kddnewton.com/2023/12/01/advent-of-prism-part-1.html" },
      { title: "Advent of Prism: Part 13 - Calls (part 1)（Kevin Newton）", url: "https://kddnewton.com/2023/12/13/advent-of-prism-part-13.html" },
      { title: "YARV Maniacs 【第 9 回】 特化命令（るびま）", url: "https://magazine.rubyist.net/articles/0017/0017-YarvManiacs.html" },
    ],
    task: [
      p("整数リテラルどうしの `+` を、コンパイル時に計算して `putobject` 1 つにする。"),
      rb(`
puts RubyVM::InstructionSequence.compile("1 + 2").disasm
# 0000 putobject                              3
# 0002 leave
x = 1
p x + 2 #=> 3（opt_plus のまま）`),
      p("できたら、2 のコードをもう一度実行する。結果は変わるか。"),
    ],
    hints: [
      note("1 の `opt_str_freeze` を出しているのは、`pm_compile_call_node` の `switch (method_id)` です。"),
      note("整数の足し算は `rb_int_plus(a, b)` でできます。"),
    ],
    answer: [
      diff("ruby/prism_compile.c", `
@@ -7571,6 +7571,16 @@ pm_compile_call_node(rb_iseq_t *iseq, co
         }
         break;
       }
+      case idPLUS: {
+        const pm_node_t *arg = node->arguments && node->arguments->arguments.size == 1 ? node->arguments->arguments.nodes[0] : NULL;
+        if (node->receiver && PM_NODE_TYPE_P(node->receiver, PM_INTEGER_NODE) && arg && PM_NODE_TYPE_P(arg, PM_INTEGER_NODE) && node->block == NULL) {
+            VALUE sum = rb_int_plus(parse_integer((const pm_integer_node_t *) node->receiver), parse_integer((const pm_integer_node_t *) arg));
+            if (!SPECIAL_CONST_P(sum)) RB_OBJ_SET_SHAREABLE(sum);
+            if (!popped) PUSH_INSN1(ret, location, putobject, sum);
+            return;
+        }
+        break;
+      }
     }
 
     if (PM_NODE_FLAG_P(node, PM_CALL_NODE_FLAGS_ATTRIBUTE_WRITE) && !popped) {`),
    ],
    spec: spec(`
RSpec.describe "整数リテラルどうしの +" do
  def insns(code) = RubyVM::InstructionSequence.compile(code).to_a.last.grep(Array).map(&:first)

  it "putobject 1 つにする" do
    expect(insns("1 + 2")).to eq([:putobject, :leave])
  end

  it "計算した値になる" do
    expect(eval("1 + 2")).to eq(3)
  end

  it "Fixnum に収まらない値でも畳む" do
    expect(insns("#{2**64} + 1")).to eq([:putobject, :leave])
    expect(eval("#{2**64} + 1")).to eq(2**64 + 1)
  end

  it "変数を含む式は畳まない" do
    expect(insns("x = 1; x + 2")).to include(:opt_plus)
  end
end`),
  },
  {
    slug: "branch-nil",
    title: "条件分岐のコンパイル",
    body: [
      p("1. `main.rb` に次を書いて実行する。条件の書き方によって、分岐の前の命令がどう変わるかを見てみる。"),
      rb(`
puts RubyVM::InstructionSequence.compile("x = 1; x ? :true : :false").disasm
puts RubyVM::InstructionSequence.compile("x = 1; !x ? :true : :false").disasm
puts RubyVM::InstructionSequence.compile("x = 1; x.nil? ? :nil : :not_nil").disasm`),
      p("2. 条件分岐の命令は `pm_compile_branch_condition` が出していて、最後の {{prism_compile.c:1114|PUSH_INSNL(ret, location, branchunless, else_label);}} の行が `branchunless` を出している。同じ関数の `switch` で、`&&` や `||` の条件をどう分岐に直しているかを読む。"),
    ],
    refs: [
      { title: "Advent of YARV: Part 14 - Branching（Kevin Newton）", url: "https://kddnewton.com/2022/12/14/advent-of-yarv-part-14.html" },
      { title: "Advent of Prism: Part 7 - Control-flow（Kevin Newton）", url: "https://kddnewton.com/2023/12/07/advent-of-prism-part-7.html" },
      { title: "YARV Maniacs 【第 9 回】 特化命令（るびま）", url: "https://magazine.rubyist.net/articles/0017/0017-YarvManiacs.html" },
    ],
    task: [
      p("条件が `x.nil?` のときは、`opt_nil_p` を使わずに `branchnil` 命令で分岐する。"),
      rb(`
puts RubyVM::InstructionSequence.compile("x = nil; x.nil? ? :nil : :not_nil").disasm
# 0003 getlocal_WC_0    x@0
# 0005 branchnil        9
# …
x = nil
p(x.nil? ? :nil : :not_nil) #=> :nil`),
    ],
    hints: [
      note("`pm_compile_branch_condition` に `PM_CALL_NODE` の場合を足します。`branchnil` は、積まれた値が `nil` なら飛びます。"),
      note("メソッド名は `scope_node->constants[pm_constant_id_index(call->name)]` で ID になります。`nil?` は `idNilP` です。"),
    ],
    answer: [
      diff("ruby/prism_compile.c", `
@@ -1048,6 +1048,16 @@
     const pm_node_location_t location = PM_NODE_START_LOCATION(cond);
 
 again:
+    if (PM_NODE_TYPE_P(cond, PM_CALL_NODE)) {
+        const pm_call_node_t *call = (const pm_call_node_t *) cond;
+        if (call->receiver && !call->arguments && !call->block && scope_node->constants[pm_constant_id_index(call->name)] == idNilP) {
+            pm_compile_node(iseq, call->receiver, ret, false, scope_node);
+            PUSH_INSNL(ret, location, branchnil, then_label);
+            PUSH_INSNL(ret, location, jump, else_label);
+            return;
+        }
+    }
+
     switch (PM_NODE_TYPE(cond)) {
       case PM_AND_NODE: {
         const pm_and_node_t *cast = (const pm_and_node_t *) cond;`),
    ],
    spec: spec(`
RSpec.describe "x.nil? の分岐" do
  def insns(code) = RubyVM::InstructionSequence.compile(code).to_a.last.grep(Array).map(&:first)

  it "branchnil で分岐する" do
    expect(insns("x = nil; x.nil? ? :nil : :not_nil")).to include(:branchnil)
    expect(insns("x = nil; x.nil? ? :nil : :not_nil")).not_to include(:opt_nil_p)
  end

  it "結果は変わらない" do
    expect(eval("x = nil; x.nil? ? :nil : :not_nil")).to eq(:nil)
    expect(eval("x = 1; x.nil? ? :nil : :not_nil")).to eq(:not_nil)
    expect(eval("x = false; x.nil? ? :nil : :not_nil")).to eq(:not_nil)
  end

  it "条件でない x.nil? はそのまま" do
    expect(insns("x = nil; x.nil?")).to include(:opt_nil_p)
  end
end`),
  },
  {
    slug: "stack-depth",
    title: "VM のスタック",
    body: [
      p("このまとまりの問い：値や変数は、実行中どこにあるのか。"),
      p("1. `main.rb` に次を書いて実行する。命令を 1 つずつ追い、スタックに積まれている値を書き出してみる。`newarray 3` の直前には、いくつ積まれているか。"),
      rb(`puts RubyVM::InstructionSequence.compile("a = 1; b = 2; p [a, b, a + b]").disasm`),
      note("`putself` は `p` を呼ぶ相手（`self`）を積みます。`setlocal` で値はスタックから下ろされ、ローカル変数の場所に入ります。"),
    ],
    refs: [
      { title: "Advent of YARV: Part 1 - Pushing onto the stack（Kevin Newton）", url: "https://kddnewton.com/2022/12/01/advent-of-yarv-part-1.html" },
      { title: "Advent of YARV: Part 2 - Manipulating the stack（Kevin Newton）", url: "https://kddnewton.com/2022/12/02/advent-of-yarv-part-2.html" },
    ],
    task: [
      p("呼び出し元のフレームで、スタックに積まれている値の数を返す `RubyVM.stack_depth` を作る（ローカル変数は数えない）。"),
      rb(`
x = [1, 2, RubyVM.stack_depth]
p x    #=> [1, 2, 2]
y = 1 + RubyVM.stack_depth
p y    #=> 2
def f(a, b) = RubyVM.stack_depth
p f(1, 2) #=> 0`),
    ],
    hints: [
      note("C の関数の中では、`GET_EC()->cfp` がその関数のフレームで、`RUBY_VM_PREVIOUS_CONTROL_FRAME` で呼び出し元のフレームになります。"),
      note("フレームの `sp` がスタックの先頭です。ローカル変数の後ろ（スタックの底）は `vm_base_ptr(cfp)` で取れます。"),
    ],
    answer: [
      diff("ruby/vm.c", `
@@ -710,6 +710,13 @@
 
 #include "vm_exec.c"
 
+static VALUE
+vm_stack_depth(VALUE self)
+{
+    const rb_control_frame_t *cfp = RUBY_VM_PREVIOUS_CONTROL_FRAME(GET_EC()->cfp);
+    return LONG2NUM(cfp->sp - vm_base_ptr(cfp));
+}
+
 #include "vm_method.c"
 #include "vm_eval.c"
 
@@ -4779,6 +4786,7 @@
      * This module is not portable between Ruby implementations.
      */
     rb_cRubyVM = rb_define_class("RubyVM", rb_cObject);
+    rb_define_singleton_method(rb_cRubyVM, "stack_depth", vm_stack_depth, 0);
     rb_undef_alloc_func(rb_cRubyVM);
     rb_undef_method(CLASS_OF(rb_cRubyVM), "new");
     rb_define_singleton_method(rb_cRubyVM, "stat", vm_stat, -1);`),
    ],
    spec: spec(`
RSpec.describe RubyVM do
  describe ".stack_depth" do
    it "配列の要素として積んだ値を数える" do
      x = [1, 2, RubyVM.stack_depth]
      expect(x).to eq([1, 2, 2])
    end

    it "+ の左の値を数える" do
      y = 1 + RubyVM.stack_depth
      expect(y).to eq(2)
    end

    it "ローカル変数は数えない" do
      a = 1
      b = 2
      z = [RubyVM.stack_depth]
      expect(z).to eq([0])
    end
  end
end`),
  },
  {
    slug: "putobject",
    title: "putobject 命令",
    body: [
      p("1. `main.rb` に次を書いて実行する。`5` と `1` を積む命令を見てみる。"),
      rb(`
puts RubyVM::InstructionSequence.compile("p 5").disasm
puts RubyVM::InstructionSequence.compile("p 1").disasm`),
      p("2. `putobject` が積む値は {{vm.inc:869|VALUE val = (VALUE)GET_OPERAND(1);}} の行で取り出している。この行の次に下の行を足して `make` し、以下を実行する。どれが 500 になるかを確認する。"),
      c(`if (val == INT2FIX(5)) val = INT2FIX(500);`),
      rb(`
p 5
x = 5
p x
p 2 + 3
p [5, 5]
p 1`),
      p("3. `main.rb` に次を書いて実行する。2 で 500 にならなかったものは、どの命令で積まれているか。"),
      rb(`
puts RubyVM::InstructionSequence.compile("p 2 + 3").disasm
puts RubyVM::InstructionSequence.compile("p [5, 5]").disasm`),
      note("`build/vm.inc` は、命令の定義（`insns.def`）から Ruby のビルド時に生成されたファイルです。命令の中身は書き換えられますが、命令を足すことはできません。"),
    ],
    refs: [
      { title: "Advent of YARV: Part 1 - Pushing onto the stack（Kevin Newton）", url: "https://kddnewton.com/2022/12/01/advent-of-yarv-part-1.html" },
      { title: "Advent of YARV: Part 4 - Creating objects from the stack（Kevin Newton）", url: "https://kddnewton.com/2022/12/04/advent-of-yarv-part-4.html" },
      { title: "Advent of YARV: Part 0 - Introduction（Kevin Newton）", url: "https://kddnewton.com/2022/11/30/advent-of-yarv-part-0.html" },
    ],
    task: [
      p("ブロックの中で `putobject` が積んだ値を、順に配列で返す `RubyVM.putobjects` を作る。"),
      rb(`
p RubyVM.putobjects { x = 5; y = :a } #=> [5, :a]
p RubyVM.putobjects { x = 0; y = 1 }  #=> [0, 1]`),
    ],
    hints: [
      note("値を入れる配列は `vm.c` の静的変数にします。`vm.inc` は `vm_exec.c` を通して `vm.c` に `#include` されているので、`#include \"vm_exec.c\"` より前で宣言すれば `vm.inc` から使えます。GC に回収されないよう、`Init_VM` で `rb_gc_register_address` に渡してください。"),
      note("`p 0` も disasm してみてください。"),
    ],
    answer: [
      diff("build/vm.inc", `
@@ -879,6 +879,7 @@ INSN_ENTRY(putobject)
     CHECK_VM_STACK_OVERFLOW_FOR_INSN(VM_REG_CFP, INSN_ATTR(retn));
     INC_SP(INSN_ATTR(sp_inc));
     TOPN(0) = val;
+    if (!NIL_P(putobject_log)) rb_ary_push(putobject_log, val);
     VM_ASSERT(!RB_TYPE_P(TOPN(0), T_NONE));
     VM_ASSERT(!RB_TYPE_P(TOPN(0), T_MOVED));
 #   undef INSN_ATTR
@@ -5026,6 +5027,7 @@ INSN_ENTRY(putobject_INT2FIX_0_)
     CHECK_VM_STACK_OVERFLOW_FOR_INSN(VM_REG_CFP, INSN_ATTR(retn));
     INC_SP(INSN_ATTR(sp_inc));
     TOPN(0) = val;
+    if (!NIL_P(putobject_log)) rb_ary_push(putobject_log, val);
     VM_ASSERT(!RB_TYPE_P(TOPN(0), T_NONE));
     VM_ASSERT(!RB_TYPE_P(TOPN(0), T_MOVED));
 #   undef INSN_ATTR
@@ -5056,6 +5058,7 @@ INSN_ENTRY(putobject_INT2FIX_1_)
     CHECK_VM_STACK_OVERFLOW_FOR_INSN(VM_REG_CFP, INSN_ATTR(retn));
     INC_SP(INSN_ATTR(sp_inc));
     TOPN(0) = val;
+    if (!NIL_P(putobject_log)) rb_ary_push(putobject_log, val);
     VM_ASSERT(!RB_TYPE_P(TOPN(0), T_NONE));
     VM_ASSERT(!RB_TYPE_P(TOPN(0), T_MOVED));
 #   undef INSN_ATTR`),
      diff("ruby/vm.c", `
@@ -708,6 +708,18 @@
 
 #include "vm_insnhelper.c"
 
+static VALUE putobject_log = Qnil;
+
+static VALUE
+vm_putobjects(VALUE self)
+{
+    VALUE log = rb_ary_new();
+    putobject_log = log;
+    rb_yield(Qnil);
+    putobject_log = Qnil;
+    return log;
+}
+
 #include "vm_exec.c"
 
 #include "vm_method.c"
@@ -4779,6 +4791,8 @@
      * This module is not portable between Ruby implementations.
      */
     rb_cRubyVM = rb_define_class("RubyVM", rb_cObject);
+    rb_gc_register_address(&putobject_log);
+    rb_define_singleton_method(rb_cRubyVM, "putobjects", vm_putobjects, 0);
     rb_undef_alloc_func(rb_cRubyVM);
     rb_undef_method(CLASS_OF(rb_cRubyVM), "new");
     rb_define_singleton_method(rb_cRubyVM, "stat", vm_stat, -1);`),
    ],
    spec: spec(`
RSpec.describe RubyVM do
  describe ".putobjects" do
    it "ブロックの中で積んだ値を順に返す" do
      expect(RubyVM.putobjects { x = 5; y = :a }).to eq([5, :a])
    end

    it "0 と 1 も返す" do
      expect(RubyVM.putobjects { x = 0; y = 1 }).to eq([0, 1])
    end

    it "ブロックの外で積んだ値は返さない" do
      RubyVM.putobjects { x = 5 }
      y = 7
      expect(RubyVM.putobjects { z = 9 }).to eq([9])
    end
  end
end`),
  },
  {
    slug: "outer-locals",
    title: "getlocal 命令",
    body: [
      p("1. `main.rb` に次を書いて実行する。同じ `x` を読む命令が、ブロックの深さでどう変わるかを見てみる。"),
      rb(`
puts RubyVM::InstructionSequence.compile("x = 1; p x").disasm
puts RubyVM::InstructionSequence.compile("x = 1; [1].each { p x }").disasm
puts RubyVM::InstructionSequence.compile("x = 1; [1].each { [2].each { p x } }").disasm`),
      p("2. {{vm.inc:4901|val = *(vm_get_ep(GET_EP(), level) - idx);}} の行は、1 つ外のスコープの変数を読む `getlocal_WC_1` の中身。この行の次に下の行を足して `make` し、以下を実行する。どれが 100 になるかを確認する。"),
      c(`if (val == INT2FIX(1)) val = INT2FIX(100);`),
      rb(`
x = 1
p x
[1].each { p x }
[1].each { [2].each { p x } }`),
    ],
    refs: [
      { title: "Advent of YARV: Part 8 - Local variables (1)（Kevin Newton）", url: "https://kddnewton.com/2022/12/08/advent-of-yarv-part-8.html" },
      { title: "Advent of YARV: Part 9 - Local variables (2)（Kevin Newton）", url: "https://kddnewton.com/2022/12/09/advent-of-yarv-part-9.html" },
      { title: "Advent of YARV: Part 10 - Local variables (3)（Kevin Newton）", url: "https://kddnewton.com/2022/12/10/advent-of-yarv-part-10.html" },
      { title: "第 16 章「ブロック」（Ruby ソースコード完全解説）", url: "https://i.loveruby.net/ja/rhg/book/iterator.html" },
    ],
    task: [
      p("ブロックの中で、外側のスコープのローカル変数を読んだ回数を返す `RubyVM.outer_reads` を作る。"),
      rb(`
x = 1
p RubyVM.outer_reads { x + x }          #=> 2
p RubyVM.outer_reads { y = 1; y }       #=> 0
p RubyVM.outer_reads { [1].each { x } } #=> 1`),
    ],
    hints: [
      note("回数は `vm.c` の静的変数で数えます。`vm.inc` は `vm_exec.c` を通して `vm.c` に `#include` されているので、`#include \"vm_exec.c\"` より前で宣言すれば `vm.inc` から使えます。"),
    ],
    answer: [
      diff("build/vm.inc", `
@@ -88,6 +88,7 @@ INSN_ENTRY(getlocal)
 #   line 81 "../ruby/insns.def"
 {
     val = *(vm_get_ep(GET_EP(), level) - idx);
+    if (level > 0) outer_reads++;
     RB_DEBUG_COUNTER_INC(lvar_get);
     (void)RB_DEBUG_COUNTER_INC_IF(lvar_get_dynamic, level > 0);
 }
@@ -4899,6 +4900,7 @@ INSN_ENTRY(getlocal_WC_1)
 #   line 81 "../ruby/insns.def"
 {
     val = *(vm_get_ep(GET_EP(), level) - idx);
+    if (level > 0) outer_reads++;
     RB_DEBUG_COUNTER_INC(lvar_get);
     (void)RB_DEBUG_COUNTER_INC_IF(lvar_get_dynamic, level > 0);
 }`),
      diff("ruby/vm.c", `
@@ -708,6 +708,16 @@
 
 #include "vm_insnhelper.c"
 
+static unsigned long outer_reads;
+
+static VALUE
+vm_outer_reads(VALUE self)
+{
+    unsigned long before = outer_reads;
+    rb_yield(Qnil);
+    return ULONG2NUM(outer_reads - before);
+}
+
 #include "vm_exec.c"
 
 #include "vm_method.c"
@@ -4779,6 +4789,7 @@
      * This module is not portable between Ruby implementations.
      */
     rb_cRubyVM = rb_define_class("RubyVM", rb_cObject);
+    rb_define_singleton_method(rb_cRubyVM, "outer_reads", vm_outer_reads, 0);
     rb_undef_alloc_func(rb_cRubyVM);
     rb_undef_method(CLASS_OF(rb_cRubyVM), "new");
     rb_define_singleton_method(rb_cRubyVM, "stat", vm_stat, -1);`),
    ],
    spec: spec(`
RSpec.describe RubyVM do
  describe ".outer_reads" do
    it "1 つ外のスコープの変数を読んだ回数を返す" do
      x = 1
      expect(RubyVM.outer_reads { x + x }).to eq(2)
    end

    it "ブロックの中の変数は数えない" do
      expect(RubyVM.outer_reads { y = 1; y }).to eq(0)
    end

    it "2 つ外のスコープの変数も数える" do
      x = 1
      expect(RubyVM.outer_reads { [1].each { x } }).to eq(1)
    end
  end
end`),
  },
  {
    slug: "frame-depth",
    title: "フレーム",
    body: [
      p("1. `main.rb` に次を書いて実行する。メソッドやブロックを呼ぶとフレームがどう積まれるかを見てみる。"),
      rb(`
def f(n) = n == 0 ? caller(0).size : f(n - 1)
p f(0), f(3)
puts [1].map { caller(0) }`),
      p("2. `main.rb` に次を書いて実行する。引数 `n` が命令列のどこにあるかを見てみる。"),
      rb(`puts RubyVM::InstructionSequence.compile("def f(n) = n").disasm`),
    ],
    refs: [
      { title: "Advent of YARV: Part 3 - Frames and events（Kevin Newton）", url: "https://kddnewton.com/2022/12/03/advent-of-yarv-part-3.html" },
      { title: "第 14 章「コンテキスト」（Ruby ソースコード完全解説）", url: "https://i.loveruby.net/ja/rhg/book/module.html" },
    ],
    task: [
      p("呼び出し元のフレームより古いフレームの数を返す `RubyVM.frame_depth` を作る。"),
      rb(`
def f(n) = n == 0 ? RubyVM.frame_depth : f(n - 1)
p f(3) - f(0)                           #=> 3
base = RubyVM.frame_depth
p [1].map { RubyVM.frame_depth - base } #=> [2]`),
    ],
    hints: [note("フレームは配列のように並んでいて、`RUBY_VM_PREVIOUS_CONTROL_FRAME(cfp)` は `cfp + 1` です。いちばん古いフレームの次は `RUBY_VM_END_CONTROL_FRAME(ec)` です。")],
    answer: [
      diff("ruby/vm.c", `
@@ -710,6 +710,13 @@
 
 #include "vm_exec.c"
 
+static VALUE
+vm_frame_depth(VALUE self)
+{
+    const rb_execution_context_t *ec = GET_EC();
+    return LONG2NUM(RUBY_VM_END_CONTROL_FRAME(ec) - RUBY_VM_PREVIOUS_CONTROL_FRAME(ec->cfp));
+}
+
 #include "vm_method.c"
 #include "vm_eval.c"
 
@@ -4779,6 +4786,7 @@
      * This module is not portable between Ruby implementations.
      */
     rb_cRubyVM = rb_define_class("RubyVM", rb_cObject);
+    rb_define_singleton_method(rb_cRubyVM, "frame_depth", vm_frame_depth, 0);
     rb_undef_alloc_func(rb_cRubyVM);
     rb_undef_method(CLASS_OF(rb_cRubyVM), "new");
     rb_define_singleton_method(rb_cRubyVM, "stat", vm_stat, -1);`),
    ],
    spec: spec(`
RSpec.describe RubyVM do
  describe ".frame_depth" do
    def f(n) = n == 0 ? RubyVM.frame_depth : f(n - 1)

    it "メソッドを 1 段呼ぶごとに 1 増える" do
      expect(f(3) - f(0)).to eq(3)
    end

    it "ブロックの中では、map と ブロックの 2 つ増える" do
      base = RubyVM.frame_depth
      expect([1].map { RubyVM.frame_depth - base }).to eq([2])
    end

    it "同じフレームなら同じ値" do
      expect(RubyVM.frame_depth).to eq(RubyVM.frame_depth)
    end
  end
end`),
  },
  {
    slug: "branch",
    title: "branchif・branchunless 命令",
    body: [
      p("1. `main.rb` に次を書いて実行する。`? :` と `||` がどの命令で分岐するかを見てみる。"),
      rb(`
puts RubyVM::InstructionSequence.compile("x = 0; x ? :true : :false").disasm
puts RubyVM::InstructionSequence.compile("x = 0; x || :or").disasm`),
      p("2. 真偽は `RTEST`（`nil` と `false` だけが偽）で判定していて、{{vm.inc:3355|if (!RTEST(val)) {}} の行は `branchunless` の中身。この行を下に変えて `make` し、以下を実行する。どれの結果が変わるかを確認する。"),
      c(`if (!RTEST(val) || val == INT2FIX(0)) {`),
      rb(`
x = 0
p(x ? :true : :false)
p(x && :and)
p(x || :or)
p(0 ? :true : :false)`),
      p("3. `main.rb` に次を書いて実行する。2 で `0 ? :true : :false` が変わらなかったのはなぜか。"),
      rb(`puts RubyVM::InstructionSequence.compile("0 ? :true : :false").disasm`),
    ],
    refs: [
      { title: "Advent of YARV: Part 14 - Branching（Kevin Newton）", url: "https://kddnewton.com/2022/12/14/advent-of-yarv-part-14.html" },
      { title: "Advent of YARV: Part 2 - Manipulating the stack（Kevin Newton）", url: "https://kddnewton.com/2022/12/02/advent-of-yarv-part-2.html" },
    ],
    task: [
      p("`RubyVM.falsy_zero = true` の間だけ、0 を偽として扱う。"),
      rb(`
x = 0
RubyVM.falsy_zero = true
p(x ? :true : :false) #=> :false
p(x || :or)           #=> :or
RubyVM.falsy_zero = false
p(x ? :true : :false) #=> :true`),
    ],
    hints: [
      note("切り替えの値は `vm.c` の静的変数にします。`#include \"vm_exec.c\"` より前で宣言すれば `vm.inc` から使えます。"),
    ],
    answer: [
      diff("build/vm.inc", `
@@ -3311,7 +3311,7 @@ INSN_ENTRY(branchif)
 #   define NAME_OF_CURRENT_INSN branchif
 #   line 1277 "../ruby/insns.def"
 {
-    if (RTEST(val)) {
+    if (RTEST(val) && !(falsy_zero && val == INT2FIX(0))) {
         RUBY_VM_CHECK_INTS(ec);
         JUMP(dst);
     }
@@ -3352,7 +3352,7 @@ INSN_ENTRY(branchunless)
 #   define NAME_OF_CURRENT_INSN branchunless
 #   line 1292 "../ruby/insns.def"
 {
-    if (!RTEST(val)) {
+    if (!RTEST(val) || (falsy_zero && val == INT2FIX(0))) {
         RUBY_VM_CHECK_INTS(ec);
         JUMP(dst);
     }`),
      diff("ruby/vm.c", `
@@ -708,6 +708,15 @@
 
 #include "vm_insnhelper.c"
 
+static bool falsy_zero;
+
+static VALUE
+vm_set_falsy_zero(VALUE self, VALUE flag)
+{
+    falsy_zero = RTEST(flag);
+    return flag;
+}
+
 #include "vm_exec.c"
 
 #include "vm_method.c"
@@ -4779,6 +4788,7 @@
      * This module is not portable between Ruby implementations.
      */
     rb_cRubyVM = rb_define_class("RubyVM", rb_cObject);
+    rb_define_singleton_method(rb_cRubyVM, "falsy_zero=", vm_set_falsy_zero, 1);
     rb_undef_alloc_func(rb_cRubyVM);
     rb_undef_method(CLASS_OF(rb_cRubyVM), "new");
     rb_define_singleton_method(rb_cRubyVM, "stat", vm_stat, -1);`),
    ],
    spec: spec(`
RSpec.describe RubyVM do
  describe ".falsy_zero=" do
    let(:zero) { 0 }

    it "true の間は、条件の 0 が偽になる" do
      x = zero
      RubyVM.falsy_zero = true
      r = x ? :true : :false
      RubyVM.falsy_zero = false
      expect(r).to eq(:false)
    end

    it "true の間は、|| の左の 0 が偽になる" do
      x = zero
      RubyVM.falsy_zero = true
      r = x || :or
      RubyVM.falsy_zero = false
      expect(r).to eq(:or)
    end

    it "false に戻すと、0 は真になる" do
      x = zero
      RubyVM.falsy_zero = true
      RubyVM.falsy_zero = false
      r = x ? :true : :false
      expect(r).to eq(:true)
    end
  end
end`),
  },
  {
    slug: "opt-plus",
    title: "opt_plus 命令",
    body: [
      p("このまとまりの問い：`+` や `foo.bar` は、どの経路で C の関数に届くのか。"),
      p("1. `main.rb` に次を書いて実行する。`+` と書いたときと `send` を使ったときの、命令の違いを見てみる。"),
      rb(`
puts RubyVM::InstructionSequence.compile("x = 1; y = 2; p x + y").disasm
puts RubyVM::InstructionSequence.compile("x = 1; y = 2; p x.send(:+, y)").disasm`),
      p("2. `opt_plus` の近道（`vm_opt_plus`）と、C の関数を呼ぶところの両方に印を付ける。{{vm_insnhelper.c:7064|return rb_fix_plus_fix(recv, obj);}} の前に下の 1 行目を、{{vm_insnhelper.c:3936|val = (*cfunc->invoker)(recv, argc, argv, cfunc->func);}} の前に下の 2 行目を足す。"),
      c(`
fprintf(stderr, "fast path\\n");
if (me->def->original_id == idPLUS) fprintf(stderr, "cfunc +\\n");`),
      p("3. `make` し、以下を実行する。それぞれ、どちらの印が出るかを確認する。"),
      rb(`
x = 1
y = 2
p x + y
p x.send(:+, y)
p 1.5 + 2
Integer.prepend(Module.new { def +(other) = super })
p x + y`),
      note("`1.5 + 2` も `opt_plus` の命令です。近道を通れないときに何が呼ばれるかに注目してください。"),
    ],
    refs: [
      { title: "Advent of YARV: Part 0 - Introduction（Kevin Newton）", url: "https://kddnewton.com/2022/11/30/advent-of-yarv-part-0.html" },
      { title: "Advent of YARV: Part 7 - Calling methods (2)（Kevin Newton）", url: "https://kddnewton.com/2022/12/07/advent-of-yarv-part-7.html" },
      { title: "YARV Maniacs 【第 9 回】 特化命令（るびま）", url: "https://magazine.rubyist.net/articles/0017/0017-YarvManiacs.html" },
    ],
    task: [
      p("2 の `fast path` の行を通った回数を返す `RubyVM.opt_plus_count` を作る。"),
      rb(`
a = 1
b = 2
before = RubyVM.opt_plus_count
a + b
p RubyVM.opt_plus_count - before #=> 1
a.send(:+, b)
p RubyVM.opt_plus_count - before #=> 1`),
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
    slug: "cfunc-call",
    title: "C の関数の呼び出し",
    body: [
      p("1. `main.rb` に次を書いて実行する。`size` と `at` の呼び出しの命令の違いを見てみる。"),
      rb(`
puts RubyVM::InstructionSequence.compile("[1].size").disasm
puts RubyVM::InstructionSequence.compile("[1].at(0)").disasm`),
      p("2. 前の章と同じ場所（{{vm_insnhelper.c:3936|val = (*cfunc->invoker)(recv, argc, argv, cfunc->func);}} の前）に、今度はどのメソッドでも名前を出す下の行を足す。`make` し、以下を実行する。どれで出力されるかを確認する。"),
      c(`fprintf(stderr, "cfunc %s\\n", rb_id2name(me->def->original_id));`),
      rb(`
p 1 + 2
[1, 2].at(0)
[1, 2].first
[1].size
"a".upcase`),
      p("3. `main.rb` に次を書いて実行する。2 で `first` が出なかったのはなぜか。"),
      rb(`p Array.instance_method(:first).source_location`),
      p("4. {{vm_insnhelper.c:2313|vm_search_method_slowpath0(VALUE cd_owner, struct rb_call_data *cd, VALUE klass)}} は、呼び出しの場所ごとのキャッシュが外れたときに呼ばれる。この関数の先頭に下の行を足して `make` し、以下を実行する。`miss at` は何回出るか。"),
      c(`fprintf(stderr, "miss %s\\n", rb_id2name(vm_ci_mid(cd->ci)));`),
      rb(`3.times { [1, 2].at(0) }`),
    ],
    refs: [
      { title: "Advent of YARV: Part 6 - Calling methods (1)（Kevin Newton）", url: "https://kddnewton.com/2022/12/06/advent-of-yarv-part-6.html" },
      { title: "Advent of YARV: Part 7 - Calling methods (2)（Kevin Newton）", url: "https://kddnewton.com/2022/12/07/advent-of-yarv-part-7.html" },
      { title: "YARV Maniacs 【第 6 回】 YARV 命令セット (3) メソッドディスパッチ（るびま）", url: "https://magazine.rubyist.net/articles/0012/0012-YarvManiacs.html" },
      { title: "第 15 章「メソッド」（Ruby ソースコード完全解説）", url: "https://i.loveruby.net/ja/rhg/book/method.html" },
    ],
    task: [
      p("ブロックの中で、2 の行を通って呼ばれた C の関数のメソッド名を、順に配列で返す `RubyVM.cfunc_calls` を作る。"),
      rb(`
p RubyVM.cfunc_calls { [1, 2].at(0); "a".upcase } #=> [:at, :upcase]
p RubyVM.cfunc_calls { [1].size }                 #=> []`),
    ],
    hints: [
      note("値を入れる配列は `vm.c` の静的変数にします。`vm_insnhelper.c` は `vm.c` に `#include` されているので、`#include \"vm_insnhelper.c\"` より前で宣言すれば使えます。GC に回収されないよう、`Init_VM` で `rb_gc_register_address` に渡してください。"),
    ],
    answer: [
      diff("ruby/vm_insnhelper.c", `
@@ -3933,6 +3933,7 @@
     if (len >= 0) rb_check_arity(argc, len, len);
 
     reg_cfp->sp = stack_bottom;
+    if (!NIL_P(cfunc_log)) rb_ary_push(cfunc_log, ID2SYM(me->def->original_id));
     val = (*cfunc->invoker)(recv, argc, argv, cfunc->func);
 
     CHECK_CFP_CONSISTENCY("vm_call_cfunc");`),
      diff("ruby/vm.c", `
@@ -706,8 +706,20 @@
 
 static const rb_box_t * current_box_on_cfp(const rb_execution_context_t *ec, const rb_control_frame_t *cfp);
 
+static VALUE cfunc_log = Qnil;
+
 #include "vm_insnhelper.c"
 
+static VALUE
+vm_cfunc_calls(VALUE self)
+{
+    VALUE log = rb_ary_new();
+    cfunc_log = log;
+    rb_yield(Qnil);
+    cfunc_log = Qnil;
+    return log;
+}
+
 #include "vm_exec.c"
 
 #include "vm_method.c"
@@ -4779,6 +4791,8 @@
      * This module is not portable between Ruby implementations.
      */
     rb_cRubyVM = rb_define_class("RubyVM", rb_cObject);
+    rb_gc_register_address(&cfunc_log);
+    rb_define_singleton_method(rb_cRubyVM, "cfunc_calls", vm_cfunc_calls, 0);
     rb_undef_alloc_func(rb_cRubyVM);
     rb_undef_method(CLASS_OF(rb_cRubyVM), "new");
     rb_define_singleton_method(rb_cRubyVM, "stat", vm_stat, -1);`),
    ],
    spec: spec(`
RSpec.describe RubyVM do
  describe ".cfunc_calls" do
    it "C の関数で書かれたメソッドを順に返す" do
      expect(RubyVM.cfunc_calls { [1, 2].at(0); "a".upcase }).to eq([:at, :upcase])
    end

    it "Ruby で書かれたメソッドは返さない" do
      expect(RubyVM.cfunc_calls { [1, 2].first }).to eq([])
    end

    it "特化命令で処理されたメソッドは返さない" do
      expect(RubyVM.cfunc_calls { [1].size }).to eq([])
    end

    it "send で呼んだときは返す" do
      expect(RubyVM.cfunc_calls { [1].send(:size) }).to eq([:size])
    end
  end
end`),
  },
  {
    slug: "module-mixins",
    title: "メソッド探索",
    body: [
      p("1. `main.rb` に次を書いて実行する。include と prepend したモジュールが `ancestors` のどこに入るかを見てみる。"),
      rb(`
module A; end
module B; end

class C
  include A
  prepend B
end

p C.ancestors`),
      p("2. メソッドの探索は `search_method0` で、クラスを 1 つずつ親（`RCLASS_SUPER`）へたどりながらメソッドの表を引いている。{{vm_method.c:1926|RB_DEBUG_COUNTER_INC(mc_search_super);}} の次に下の行を足して `make` し、以下を実行する。"),
      c(`if (id == rb_intern("hello")) fprintf(stderr, "search %s\\n", rb_class2name(BUILTIN_TYPE(klass) == T_ICLASS ? RBASIC_CLASS(klass) : klass));`),
      rb(`
module A; end
module B; end

class C
  include A
  prepend B
end

class Object
  def hello = :hello
end

o = C.new
warn "-- 1 回目"
p o.hello
warn "-- 2 回目"
p o.hello`),
      list(
        "1 回目は、どの順でたどったか。`C` が 2 回出るのはなぜか",
        "2 回目に探さないのはなぜか（前の章の手順 4 で見たキャッシュ）",
      ),
      note("include したモジュールは、そのモジュールを指す `T_ICLASS` という内部のクラスとして親の列に挟まります。prepend すると、`C` のメソッドの表は `C` の後ろに作られる origin（これも `T_ICLASS`）に移ります。"),
      p("3. 2 の行を消し、{{class.c:2167|if (p != RCLASS_ORIGIN(p)) continue;}} の行を消して `make` し、1 と同じコードを実行する。"),
    ],
    refs: [
      { title: "Better Know A Ruby Thing: Method Lookup（Noel Rappin）", url: "https://buttondown.com/noelrap/archive/better-know-a-ruby-thing-method-lookup" },
      { title: "Module#prepend（るりま）", url: "https://docs.ruby-lang.org/ja/latest/method/Module/i/prepend.html" },
      { title: "第 4 章「クラス」（Ruby ソースコード完全解説）", url: "https://i.loveruby.net/ja/rhg/book/class.html" },
    ],
    task: [
      p("`ancestors` のうちモジュールだけを、同じ順に返す `Module#mixins` を作る。"),
      rb(`
module A; end
module B; end

class C
  include A
  prepend B
end

p C.ancestors #=> [B, C, A, Object, Kernel, BasicObject]
p C.mixins    #=> [B, A, Kernel]`),
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
    slug: "method-missing",
    title: "メソッドが見つからないとき",
    body: [
      p("1. `main.rb` に次を書いて実行する。private のメソッドを外から呼んだ `foo.baz` がどうなるかを見てみる。"),
      rb(`
class Foo
  def bar = :bar
  def method_missing(name, *args) = [:missing, name]
  private def baz = :baz
end

foo = Foo.new
p foo.bar
p foo.unknown
p foo.baz`),
      p("2. VM が `method_missing` を呼ぶところへ印を付ける。{{vm_insnhelper.c:4599|RB_DEBUG_COUNTER_INC(ccf_method_missing);}} の次に下の行を足して `make` し、以下を実行する。どの呼び出しで、どの印が出るかを確認する。"),
      c(`fprintf(stderr, "method_missing %s%s\\n", rb_id2name(vm_ci_mid(orig_ci)), reason & MISSING_PRIVATE ? " (private)" : "");`),
      rb(`
class Foo
  def bar = :bar
  def method_missing(name, *args) = [:missing, name]
  private def baz = :baz
end

foo = Foo.new
p foo.bar
p foo.unknown
p foo.baz
begin; Object.new.qux; rescue NoMethodError => e; p e; end`),
      note("`method_missing` を定義していないクラスでも、`BasicObject#method_missing` があります。`Object.new.qux` の印と例外の関係を考えてみてください。"),
    ],
    refs: [
      { title: "Advent of YARV: Part 6 - Calling methods (1)（Kevin Newton）", url: "https://kddnewton.com/2022/12/06/advent-of-yarv-part-6.html" },
      { title: "BasicObject#method_missing（るりま）", url: "https://docs.ruby-lang.org/ja/latest/method/BasicObject/i/method_missing.html" },
      { title: "YARV Maniacs 【第 6 回】 YARV 命令セット (3) メソッドディスパッチ（るびま）", url: "https://magazine.rubyist.net/articles/0012/0012-YarvManiacs.html" },
    ],
    task: [
      p("private のメソッドを外から呼んだときは、`method_missing` に回さず、すぐに `NoMethodError` を投げる。"),
      rb(`
class Foo
  def method_missing(name, *args) = [:missing, name]
  private def baz = :baz
end

foo = Foo.new
p foo.unknown #=> [:missing, :unknown]
p foo.baz     #=> private method 'baz' called for Foo (NoMethodError)`),
    ],
    hints: [
      note("呼び出す相手の可視性（public・private・protected）は、`vm_call_method` で確かめています。"),
      note("例外は `rb_raise(rb_eNoMethodError, \"private method '%s' called for %\"PRIsVALUE, …)` のように投げます。`%\"PRIsVALUE` には Ruby のオブジェクト（ここでは `rb_obj_class(calling->recv)`）を渡せます。"),
    ],
    answer: [
      diff("ruby/vm_insnhelper.c", `
@@ -5170,6 +5170,7 @@
             if (!(vm_ci_flag(ci) & VM_CALL_FCALL)) {
                 enum method_missing_reason stat = MISSING_PRIVATE;
                 if (vm_ci_flag(ci) & VM_CALL_VCALL) stat |= MISSING_VCALL;
+                rb_raise(rb_eNoMethodError, "private method '%s' called for %"PRIsVALUE, rb_id2name(vm_ci_mid(ci)), rb_obj_class(calling->recv));

                 vm_cc_method_missing_reason_set(cc, stat);
                 CC_SET_FASTPATH(cc, vm_call_method_missing, TRUE);`),
    ],
    spec: spec(`
RSpec.describe "private のメソッドの呼び出し" do
  let(:klass) do
    Class.new do
      def method_missing(name, *) = [:missing, name]
      def respond_to_missing?(*) = true
      def call_baz = baz
      private def baz = :baz
    end
  end

  it "外から呼ぶと、method_missing に回さず NoMethodError を投げる" do
    expect { klass.new.baz }.to raise_error(NoMethodError, /private method 'baz'/)
  end

  it "見つからないメソッドは、今まで通り method_missing に回す" do
    expect(klass.new.unknown).to eq([:missing, :unknown])
  end

  it "中からは呼べる" do
    expect(klass.new.call_baz).to eq(:baz)
  end
end`),
  },
  {
    slug: "ivar-cache",
    title: "インスタンス変数とキャッシュ",
    body: [
      p("1. `main.rb` に次を書いて実行する。`getinstancevariable` 命令に付いているものを見てみる。"),
      rb(`puts RubyVM::InstructionSequence.compile("@a = 1; @a").disasm`),
      p("2. インスタンス変数の場所は、オブジェクトの形（shape、インスタンス変数を足した順）で決まる。{{vm_insnhelper.c:1312|else { // cache miss case}} の次に下の 1 行目を足して `make` し、以下を実行する。`miss @a` は何回出るかを確認する。"),
      c(`if (id == rb_intern("@a")) fprintf(stderr, "miss @a\\n");`),
      rb(`
class R
  def initialize(first) = first ? (@a = 1; @b = 2) : (@b = 2; @a = 1)
  def a = @a
end
s1 = R.new(true)
s2 = R.new(false)
3.times { s1.a }
[s1, s2, s1, s2].each { |r| r.a }`),
    ],
    refs: [
      { title: "Advent of YARV: Part 11 - Class and instance variables（Kevin Newton）", url: "https://kddnewton.com/2022/12/11/advent-of-yarv-part-11.html" },
      { title: "Performance impact of the memoization idiom on modern Ruby（Rails at Scale）", url: "https://railsatscale.com/2023-10-24-memoization-pattern-and-object-shapes/" },
      { title: "Feature #18776: Object Shapes（Ruby Issue Tracking System）", url: "https://bugs.ruby-lang.org/issues/18776" },
    ],
    task: [
      p("ブロックの中で、インスタンス変数を読むときのキャッシュが外れた回数を返す `RubyVM.ivar_misses` を作る。"),
      rb(`
class R
  def initialize(first) = first ? (@a = 1; @b = 2) : (@b = 2; @a = 1)
  def a = @a
end

s1 = R.new(true)
s2 = R.new(false)
s1.a
p RubyVM.ivar_misses { 3.times { s1.a } }                 #=> 0
p RubyVM.ivar_misses { [s1, s2, s1, s2].each { |r| r.a } } #=> 3`),
    ],
    hints: [note("回数は `vm.c` の静的変数で数えます。`vm_insnhelper.c` から使うので、`#include \"vm_insnhelper.c\"` より前で宣言します。")],
    answer: [
      diff("ruby/vm_insnhelper.c", `
@@ -1310,6 +1310,7 @@
         RUBY_ASSERT(!UNDEF_P(val));
     }
     else { // cache miss case
+        ivar_misses++;
 #if USE_DEBUG_COUNTER
         if (is_attr) {
             if (cache.shape_offset != INVALID_SHAPE_ID) {`),
      diff("ruby/vm.c", `
@@ -706,10 +706,20 @@
 
 static const rb_box_t * current_box_on_cfp(const rb_execution_context_t *ec, const rb_control_frame_t *cfp);
 
+static unsigned long ivar_misses;
+
 #include "vm_insnhelper.c"
 
 #include "vm_exec.c"
 
+static VALUE
+vm_ivar_misses(VALUE self)
+{
+    unsigned long before = ivar_misses;
+    rb_yield(Qnil);
+    return ULONG2NUM(ivar_misses - before);
+}
+
 #include "vm_method.c"
 #include "vm_eval.c"
 
@@ -4779,6 +4789,7 @@
      * This module is not portable between Ruby implementations.
      */
     rb_cRubyVM = rb_define_class("RubyVM", rb_cObject);
+    rb_define_singleton_method(rb_cRubyVM, "ivar_misses", vm_ivar_misses, 0);
     rb_undef_alloc_func(rb_cRubyVM);
     rb_undef_method(CLASS_OF(rb_cRubyVM), "new");
     rb_define_singleton_method(rb_cRubyVM, "stat", vm_stat, -1);`),
    ],
    spec: spec(`
RSpec.describe RubyVM do
  describe ".ivar_misses" do
    let(:klass) do
      Class.new do
        def initialize(first) = first ? (@a = 1; @b = 2) : (@b = 2; @a = 1)
        def a = @a
      end
    end

    it "同じ形のオブジェクトなら外れない" do
      s1 = klass.new(true)
      s3 = klass.new(true)
      s1.a
      expect(RubyVM.ivar_misses { [s1, s3, s1].each { |r| r.a } }).to eq(0)
    end

    it "インスタンス変数を足した順が違うと外れる" do
      s1 = klass.new(true)
      s2 = klass.new(false)
      s1.a
      expect(RubyVM.ivar_misses { [s1, s2, s1, s2].each { |r| r.a } }).to eq(3)
    end
  end
end`),
  },
  {
    slug: "bmethod-proc",
    title: "proc と lambda",
    body: [
      p("このまとまりの問い：ブロックは、なぜ外の変数や `self` を見られるのか。"),
      p("1. `main.rb` に次を書いて実行する。proc と lambda で、足りない引数の扱いがどう違うかを見てみる。"),
      rb(`
pr = proc { |a, b| [a, b] }
l = lambda { |a, b| [a, b] }
p pr.lambda?, l.lambda?
p pr.call(1)
p((l.call(1) rescue $!))`),
      p("2. proc と lambda の違いは、Proc オブジェクトの `is_lambda` という 1 ビットだけ。`define_method` に proc を渡して、以下を実行する。proc と lambda のどちらの動きになるか。"),
      rb(`
pr = proc { |a, b| [a, b] }
class Foo; end
Foo.define_method(:m, pr)
p((Foo.new.m(1) rescue $!))`),
      p("3. `define_method` は、渡された proc を {{proc.c:3211|proc->header.is_lambda = TRUE;}} の行で lambda にしている。この行を消して `make` し、2 と同じコードを実行する。結果は変わるか。"),
      note("変わらないときは、メソッドとして呼ぶ VM の経路も見てください（課題のヒント）。"),
    ],
    refs: [
      { title: "Feature #16499: define_method(non_lambda) should not change the semantics of the given Proc（Ruby Issue Tracking System）", url: "https://bugs.ruby-lang.org/issues/16499" },
      { title: "手続きオブジェクトの挙動の詳細（るりま）", url: "https://docs.ruby-lang.org/ja/latest/doc/spec=2flambda_proc.html" },
      { title: "第 16 章「ブロック」（Ruby ソースコード完全解説）", url: "https://i.loveruby.net/ja/rhg/book/iterator.html" },
    ],
    task: [
      p("ブロックで定義したメソッドを proc として扱い、足りない引数を `nil` で埋めるようにする。lambda を渡したときは、今まで通り引数の数を確かめる。"),
      rb(`
class Foo
  define_method(:pair) { |a, b| [a, b] }
  define_method(:strict, ->(a, b) { [a, b] })
end

p Foo.new.pair(1)   #=> [1, nil]
p Foo.new.strict(1) #=> ArgumentError`),
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
    slug: "block-splat",
    title: "ブロック引数の自動展開",
    body: [
      p("1. `main.rb` に次を書いて実行する。配列を 1 つ渡したとき、ブロックの引数がどう受け取られるかを見てみる。"),
      rb(`
p [[1, 2]].map { |a, b| [a, b] }
p [[1, 2]].map { |a| a }
p [[1, 2]].map { |a, | a }
p proc { |a, b| [a, b] }.call([1, 2])
p((lambda { |a, b| [a, b] }.call([1, 2]) rescue $!))`),
      p("2. 配列を 1 つだけ受けたブロックは、{{vm_insnhelper.c:5544|calling->argc = vm_callee_setup_block_arg_arg0_splat(cfp, iseq, argv, arg0);}} の行で引数を展開している。この行の前に下の行を足して `make` し、1 と同じコードを実行する。どれで出力されるかを確認する。"),
      c(`fprintf(stderr, "splat\\n");`),
    ],
    refs: [
      { title: "手続きオブジェクトの挙動の詳細（るりま）", url: "https://docs.ruby-lang.org/ja/latest/doc/spec=2flambda_proc.html" },
      { title: "Advent of YARV: Part 17 - Method parameters（Kevin Newton）", url: "https://kddnewton.com/2022/12/17/advent-of-yarv-part-17.html" },
      { title: "第 16 章「ブロック」（Ruby ソースコード完全解説）", url: "https://i.loveruby.net/ja/rhg/book/iterator.html" },
    ],
    task: [
      p("`RubyVM.block_autosplat = false` の間だけ、ブロックの引数を自動で展開しない。"),
      rb(`
RubyVM.block_autosplat = false
p [[1, 2]].map { |a, b| [a, b] } #=> [[[1, 2], nil]]
RubyVM.block_autosplat = true
p [[1, 2]].map { |a, b| [a, b] } #=> [[1, 2]]`),
    ],
    hints: [note("切り替えの値は `vm.c` の静的変数にします。`vm_insnhelper.c` から使うので、`#include \"vm_insnhelper.c\"` より前で宣言します。")],
    answer: [
      diff("ruby/vm_insnhelper.c", `
@@ -5536,7 +5536,8 @@
 
         CALLER_SETUP_ARG(cfp, calling, ci, ISEQ_BODY(iseq)->param.lead_num);
 
-        if (arg_setup_type == arg_setup_block &&
+        if (block_autosplat &&
+            arg_setup_type == arg_setup_block &&
             calling->argc == 1 &&
             ISEQ_BODY(iseq)->param.flags.has_lead &&
             !ISEQ_BODY(iseq)->param.flags.ambiguous_param0 &&`),
      diff("ruby/vm.c", `
@@ -706,10 +706,19 @@
 
 static const rb_box_t * current_box_on_cfp(const rb_execution_context_t *ec, const rb_control_frame_t *cfp);
 
+static bool block_autosplat = true;
+
 #include "vm_insnhelper.c"
 
 #include "vm_exec.c"
 
+static VALUE
+vm_set_block_autosplat(VALUE self, VALUE flag)
+{
+    block_autosplat = RTEST(flag);
+    return flag;
+}
+
 #include "vm_method.c"
 #include "vm_eval.c"
 
@@ -4779,6 +4788,7 @@
      * This module is not portable between Ruby implementations.
      */
     rb_cRubyVM = rb_define_class("RubyVM", rb_cObject);
+    rb_define_singleton_method(rb_cRubyVM, "block_autosplat=", vm_set_block_autosplat, 1);
     rb_undef_alloc_func(rb_cRubyVM);
     rb_undef_method(CLASS_OF(rb_cRubyVM), "new");
     rb_define_singleton_method(rb_cRubyVM, "stat", vm_stat, -1);`),
    ],
    spec: spec(`
RSpec.describe RubyVM do
  describe ".block_autosplat=" do
    let(:pairs) { [[1, 2]] }

    it "false の間は展開しない" do
      RubyVM.block_autosplat = false
      r = pairs.map { |a, b| [a, b] }
      RubyVM.block_autosplat = true
      expect(r).to eq([[[1, 2], nil]])
    end

    it "true に戻すと展開する" do
      RubyVM.block_autosplat = false
      RubyVM.block_autosplat = true
      expect(pairs.map { |a, b| [a, b] }).to eq([[1, 2]])
    end
  end
end`),
  },
  {
    slug: "tap-eval",
    title: "ブロックと self",
    body: [
      p("1. `main.rb` に次を書いて実行する。`instance_exec` のブロックの中で、`self` と外の変数 `x` がどう見えるかを見てみる。"),
      rb(`
x = 10
o = Object.new
p o.instance_exec { [equal?(o), x] }`),
      p("2. ブロックは、作られた場所の環境（ローカル変数）と `self` を組にして持っている。`instance_exec` は、{{vm_eval.c:2282|new_captured.self = self;}} の行でその組の `self` だけを差し替えて呼ぶ。この行を消して `make` し、1 と同じコードを実行する。"),
    ],
    refs: [
      { title: "Understanding instance exec in ruby（BigBinary）", url: "https://www.bigbinary.com/blog/understanding-instance-exec-in-ruby" },
      { title: "第 17 章「動的評価」（Ruby ソースコード完全解説）", url: "https://i.loveruby.net/ja/rhg/book/anyeval.html" },
    ],
    task: [
      p("ブロックの中の `self` をレシーバにして実行し、レシーバを返す `Kernel#tap_eval` を作る。"),
      rb(`
p [1, 2].tap_eval { push(3) } #=> [1, 2, 3]
p [1, 2].tap { push(3) }      #=> NoMethodError`),
    ],
    hints: [note("`instance_exec` の本体は `vm_eval.c` の `rb_obj_instance_exec` です。C の関数から呼ぶと、その関数に渡されたブロックがそのまま使われます。")],
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
    slug: "immediate",
    part: "第 3 部　組み込みメソッドを C で書く",
    title: "Object#immediate?",
    body: [
      p("このまとまりの問い：Ruby のオブジェクトは、C ではどう見えるのか。"),
      p("1. `main.rb` に次を書いて実行する。"),
      rb(`
p 1.equal?(1)
p "a".equal?("a")
p (2**40).equal?(2**40)
p 1.object_id, 2.object_id, 3.object_id
p Object.new.object_id`),
    ],
    refs: [
      { title: "How Ruby Encodes References - Ruby Tiny Objects Explained（AppFolio Engineering）", url: "https://engineering.appfolio.com/appfolio-engineering/2019/6/25/how-ruby-encodes-references-ruby-tiny-objects-explained" },
      { title: "Rubyのobject_id（Masaki Hara）", url: "https://speakerdeck.com/qnighy/rubynoobject-id" },
      { title: "第 2 章「オブジェクト」（Ruby ソースコード完全解説）", url: "https://i.loveruby.net/ja/rhg/book/object.html" },
    ],
    task: [
      p("即値なら `true`、そうでなければ `false` を返す `Object#immediate?` を作る。"),
      rb(`
p 1.immediate?         #=> true
p :sym.immediate?      #=> true
p nil.immediate?       #=> true
p((2**30).immediate?)  #=> false
p 1.5.immediate?       #=> false
p "str".immediate?     #=> false`),
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
    slug: "array-second",
    title: "Array#at はどこにある？",
    body: [
      p("1. `main.rb` に次を書いて実行する。"),
      rb(`
p Array.instance_method(:first).source_location
p Array.instance_method(:at).source_location`),
      p("2. {{array.c:2028|rb_ary_at(VALUE ary, VALUE pos)}} の関数の先頭に次の行を足して `make` し、`main.rb` に下を書いて実行する。どれで出力されるか。"),
      c(`fprintf(stderr, "rb_ary_at called\\n");`),
      rb(`
p [1, 2, 3].at(1)
p [1, 2, 3][1]
p [1, 2, 3].dig(1)`),
      p("3. 2 の行は残したまま、{{vm_insnhelper.c:3936|val = (*cfunc->invoker)(recv, argc, argv, cfunc->func);}} の `val = (*cfunc->invoker)(recv, argc, argv, cfunc->func);` の前に次の行を足して `make` し、2 と同じコードを実行する。"),
      c(`fprintf(stderr, "cfunc %s\\n", rb_id2name(me->def->original_id));`),
      p("4. {{array.c:9044|rb_define_method(rb_cArray, \"at\", rb_ary_at, 1);}} の行を消し、`make` して 2 と同じコードを実行する。"),
    ],
    refs: [
      { title: "(3) 演習：メソッドの追加（Ruby Hack Challenge）", url: "https://github.com/ko1/rubyhackchallenge/blob/master/JA/3_practice.md" },
      { title: "rb_define_method（るりま）", url: "https://docs.ruby-lang.org/ja/latest/function/rb_define_method.html" },
      { title: "第 4 章「クラス」（Ruby ソースコード完全解説）", url: "https://i.loveruby.net/ja/rhg/book/class.html" },
    ],
    task: [
      p("`Array#second` を作る。"),
      rb(`
p [1, 2, 3].second #=> 2
p [1].second       #=> nil
p [].second        #=> nil`),
    ],
    hints: [
      note("メソッドの登録は `rb_define_method(クラス, \"名前\", 関数, 引数の数)` です。"),
      note("配列の要素は `rb_ary_entry(ary, i)` で取れます。範囲外なら `nil` を返します。"),
    ],
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
    slug: "integer-triple",
    title: "Integer#triple",
    body: [
      p("1. {{numeric.c:4304|rb_int_mul(VALUE x, VALUE y)}} の関数の先頭に次の行を足して `make` し、`main.rb` に下を書いて実行する。どれで何が出力されるか。"),
      c(`fprintf(stderr, "rb_int_mul: %s\\n", FIXNUM_P(x) ? "Fixnum" : "Bignum");`),
      rb(`
p 7 * 3
p (2**70) * 3
p 7.send(:*, 3)`),
    ],
    refs: [
      { title: "How Ruby Encodes References - Ruby Tiny Objects Explained（AppFolio Engineering）", url: "https://engineering.appfolio.com/appfolio-engineering/2019/6/25/how-ruby-encodes-references-ruby-tiny-objects-explained" },
      { title: "Advent of YARV: Part 7 - Calling methods (2)（Kevin Newton）", url: "https://kddnewton.com/2022/12/07/advent-of-yarv-part-7.html" },
      { title: "YARV Maniacs 【第 9 回】 特化命令（るびま）", url: "https://magazine.rubyist.net/articles/0017/0017-YarvManiacs.html" },
    ],
    task: [
      p("3 倍した値を返す `Integer#triple` を作る。"),
      rb(`
p 7.triple       #=> 21
p(-5.triple)     #=> -15
p((2**70).triple) #=> 3541774862152233910272`),
    ],
    hints: [
      note("`rb_int_mul(x, y)` は Integer の `x * y` を返します。"),
      note("C の整数から Ruby の Integer（Fixnum）を作るには `INT2FIX(42)` のように書きます。"),
    ],
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
    slug: "string-shout",
    title: "String#shout",
    body: [
      p("1. {{string.c:10087|rb_str_upcase(int argc, VALUE *argv, VALUE str)}} の関数の先頭に次の行を足して `make` し、`main.rb` に下を書いて実行する。どれで出力されるか。"),
      c(`fprintf(stderr, "rb_str_upcase called\\n");`),
      rb(`
p "a".upcase
p :a.upcase
p "a".capitalize`),
      p("2. {{vm_insnhelper.c:3936|val = (*cfunc->invoker)(recv, argc, argv, cfunc->func);}} と {{vm_eval.c:166|val = (*cfunc->invoker)(recv, argc, argv, cfunc->func);}} にある `val = (*cfunc->invoker)(recv, argc, argv, cfunc->func);` の前に、下の 1 行目と 2 行目をそれぞれ足す。`make` し、`main.rb` に下を書いて実行する。`inspect` はどちらで出力されるか。"),
      c(`
fprintf(stderr, "cfunc %s\\n", rb_id2name(me->def->original_id));
fprintf(stderr, "call0 %s\\n", rb_id2name(me->def->original_id));`),
      rb(`p "a"`),
    ],
    refs: [
      { title: "Advent of YARV: Part 6 - Calling methods (1)（Kevin Newton）", url: "https://kddnewton.com/2022/12/06/advent-of-yarv-part-6.html" },
      { title: "rb_funcall（るりま）", url: "https://docs.ruby-lang.org/ja/latest/function/rb_funcall.html" },
      { title: "第 15 章「メソッド」（Ruby ソースコード完全解説）", url: "https://i.loveruby.net/ja/rhg/book/method.html" },
    ],
    task: [
      p("大文字にして `!` を付けた文字列を返す `String#shout` を作る。レシーバは変えない。"),
      rb(`
s = "hello"
p s.shout #=> "HELLO!"
p s       #=> "hello"

class Loud < String
  def upcase = "LOUD"
end
p Loud.new("hello").shout #=> "LOUD!"`),
    ],
    hints: [
      note("C から Ruby のメソッドを呼ぶには `rb_funcall(recv, rb_intern(\"upcase\"), 0)` のように書きます。"),
      note("文字列の末尾に C の文字列をつなげるには `rb_str_cat_cstr(str, \"?\")` のように書きます。"),
    ],
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

    context "upcase を再定義したサブクラスのとき" do
      it "再定義した upcase を使う" do
        loud = Class.new(String) { def upcase = "LOUD" }
        expect(loud.new("hello").shout).to eq("LOUD!")
      end
    end
  end
end`),
  },
  {
    slug: "hash-sum-values",
    title: "Hash#sum_values",
    body: [
      p("1. {{hash.c:3342|return ST_CONTINUE;}} の `return ST_CONTINUE;` を `return ST_STOP;` に変えて `make` し、`main.rb` に次を書いて実行する。"),
      rb(`
{ a: 1, b: 2, c: 3 }.each_value { |v| p v }
p({ a: 1, b: 2, c: 3 }.values)`),
    ],
    refs: [
      { title: "第 3 章「名前と名前表」（Ruby ソースコード完全解説）", url: "https://i.loveruby.net/ja/rhg/book/name.html" },
      { title: "Hash#each_value（るりま）", url: "https://docs.ruby-lang.org/ja/latest/method/Hash/i/each_value.html" },
    ],
    task: [
      p("全ての value の合計を返す `Hash#sum_values` を作る。"),
      rb(`
p({ a: 1, b: 2, c: 3 }.sum_values) #=> 6
p({ x: 1, y: 0.5 }.sum_values)     #=> 1.5
p({}.sum_values)                   #=> 0`),
    ],
    hints: [note("`rb_hash_foreach(hash, func, arg)` は、要素ごとに `func(key, value, arg)` を呼びます。")],
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
    body: [
      p("1. `main.rb` に次を書いて実行する。"),
      rb(`
p nil.to_s.frozen?
p nil.to_s.equal?(nil.to_s)
p "".equal?("")`),
      p("2. {{object.c:1429|rb_nil_to_s(VALUE obj)}} の関数の先頭に次の行を足して `make` し、`main.rb` に下を書いて実行する。どれで出力されるか。"),
      c(`fprintf(stderr, "rb_nil_to_s called\\n");`),
      rb(`
p nil.to_s
p "#{nil}"
p [1, nil].join
p nil.inspect`),
    ],
    refs: [
      { title: "Advent of YARV: Part 5 - Changing object types on the stack（Kevin Newton）", url: "https://kddnewton.com/2022/12/05/advent-of-yarv-part-5.html" },
      { title: "rb_str_new_cstr（るりま）", url: "https://docs.ruby-lang.org/ja/latest/function/rb_str_new_cstr.html" },
      { title: "第 2 章「オブジェクト」（Ruby ソースコード完全解説）", url: "https://i.loveruby.net/ja/rhg/book/object.html" },
    ],
    task: [
      p("`nil.to_s` が `\"(nil)\"` を返すようにする。"),
      rb(`
p nil.to_s   #=> "(nil)"
p "x=#{nil}" #=> "x=(nil)"`),
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
    slug: "proc-kind",
    title: "Proc#kind",
    body: [
      p("1. `main.rb` に次を書いて実行する。"),
      rb(`
pr = proc { |a, b| [a, b] }
l = lambda { |a, b| [a, b] }
p pr.lambda?, l.lambda?
p pr.call(1)
p l.call(1)`),
      p("2. {{proc.c:827|return RBOOL(proc->header.is_lambda);}} の `return` の行を `return Qtrue;` に変えて `make` し、1 と同じコードを実行する。"),
    ],
    refs: [
      { title: "手続きオブジェクトの挙動の詳細（るりま）", url: "https://docs.ruby-lang.org/ja/latest/doc/spec=2flambda_proc.html" },
      { title: "How Ruby Borrowed a Decades Old Idea From Lisp（Pat Shaughnessy）", url: "https://patshaughnessy.net/2012/9/18/how-ruby-borrowed-a-decades-old-idea-from-lisp" },
      { title: "第 16 章「ブロック」（Ruby ソースコード完全解説）", url: "https://i.loveruby.net/ja/rhg/book/iterator.html" },
    ],
    task: [
      p("lambda なら `:lambda`、そうでなければ `:proc` を返す `Proc#kind` を作る。"),
      rb(`
p(-> {}.kind)                #=> :lambda
p proc {}.kind               #=> :proc
p method(:puts).to_proc.kind #=> :lambda`),
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
    slug: "attr-predicate",
    title: "Module#attr_predicate",
    body: [
      p("1. `main.rb` に次を書いて実行する。"),
      rb(`
class C
  attr_reader :x
  def y = @y
end

c = C.new
TracePoint.new(:call, :c_call) { |tp| p [tp.event, tp.method_id] }.enable { c.x; c.y }`),
    ],
    refs: [
      { title: "Understanding why attr_accessor in Ruby is faster than a regular method（Dmitry Tsepelev）", url: "https://dmitrytsepelev.dev/attr-accessor-in-ruby" },
      { title: "Feature #19708: Support attr_reader :foo?（Ruby Issue Tracking System）", url: "https://bugs.ruby-lang.org/issues/19708" },
      { title: "Advent of YARV: Part 6 - Calling methods (1)（Kevin Newton）", url: "https://kddnewton.com/2022/12/06/advent-of-yarv-part-6.html" },
    ],
    task: [
      p("インスタンス変数の値を返す `名前?` のメソッドを定義する `Module#attr_predicate` を作る。戻り値は、定義したメソッド名の配列。"),
      rb(`
class User
  p attr_predicate(:admin, :guest) #=> [:admin?, :guest?]

  def initialize(admin)
    @admin = admin
  end
end

p User.new(true).admin? #=> true
p User.new(true).guest? #=> nil`),
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
    slug: "define-method",
    title: "Module#define_private_method",
    body: [
      p("1. `main.rb` に次を書いて実行する。"),
      rb(`
class Foo
  private
  def a = 1
  define_method(:b) { 2 }
end
Foo.define_method(:c) { 3 }

p Foo.private_method_defined?(:a)
p Foo.private_method_defined?(:b)
p Foo.private_method_defined?(:c)`),
      p("2. {{proc.c:3271|scope_visi = CREF_SCOPE_VISI(cref);}} の行を消し、`make` して 1 と同じコードを実行する。"),
    ],
    refs: [
      { title: "Bug #19749: Confirm correct behaviour when attaching private method with #define_method（Ruby Issue Tracking System）", url: "https://bugs.ruby-lang.org/issues/19749" },
      { title: "Module#private（るりま）", url: "https://docs.ruby-lang.org/ja/latest/method/Module/i/private.html" },
      { title: "第 14 章「コンテキスト」（Ruby ソースコード完全解説）", url: "https://i.loveruby.net/ja/rhg/book/module.html" },
    ],
    task: [
      p("`define_method` と同じ引数を受け取り、いつも private のメソッドを定義する `Module#define_private_method` を作る。戻り値は、定義したメソッド名のシンボル。"),
      rb(`
class Vault
  p define_private_method(:secret) { 42 } #=> :secret

  def peek = secret
end

p Vault.new.peek   #=> 42
p Vault.new.secret #=> NoMethodError`),
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
    slug: "kernel-try",
    title: "Kernel#try",
    body: [
      p("1. `main.rb` に次を書いて実行する。"),
      rb(`
o = Object.new
def o.respond_to_missing?(name, include_private)
  puts "respond_to_missing? #{name}"
  false
end

p [o].flatten
p Array(o)`),
    ],
    refs: [
      { title: "Bug #11465: Array#flatten calls to_ary on objects with method_missing even if respond_to_missing?(:to_ary) returns false（Ruby Issue Tracking System）", url: "https://bugs.ruby-lang.org/issues/11465" },
      { title: "Implicit Conversions（Ruby 公式ドキュメント）", url: "https://docs.ruby-lang.org/en/4.0/language/implicit_conversion_rdoc.html" },
      { title: "Object#respond_to_missing?（るりま）", url: "https://docs.ruby-lang.org/ja/latest/method/Object/i/respond_to_missing=3f.html" },
    ],
    task: [
      p("メソッドがあれば呼んだ結果を、なければ `nil` を返す `Kernel#try` を作る。"),
      rb(`
p "ruby".try(:upcase)      #=> "RUBY"
p 1.try(:+, 2)             #=> 3
p nil.try(:no_such_method) #=> nil`),
    ],
    hints: [note("`vm_eval.c` の `rb_check_funcall(recv, mid, argc, argv)` は、呼べなければ `Qundef` を返します。`Qundef` かどうかは `UNDEF_P(v)` で確かめます。登録は `Init_vm_eval` の `\"public_send\"` の行の近くに書いてください。")],
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
    slug: "free",
    title: "Playground",
    body: [
      p("課題はありません。どのファイルも自由に書き換えて試せます。"),
    ],
  },
];

export const lessonBySlug = (slug: string) => lessons.find((l) => l.slug === slug);
