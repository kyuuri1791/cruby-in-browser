CC = clang
CFLAGS = --target=wasm32-wasip1 -D_WASI_EMULATED_SIGNAL -D_WASI_EMULATED_MMAN -D_WASI_EMULATED_GETPID \
	-D_WASI_EMULATED_PROCESS_CLOCKS -DRUBY_EXPORT -DPRISM_XALLOCATOR -fno-strict-overflow -fdeclspec \
	-std=gnu23 -fPIC -fvisibility=default -O1 -Wall -Wextra -Wextra-tokens -Wdeprecated-declarations \
	-Wdivision-by-zero -Wimplicit-function-declaration -Wimplicit-int -Wpointer-arith -Wwrite-strings \
	-Wold-style-definition -Wmissing-noreturn -Wno-cast-function-type -Wno-long-long \
	-Wno-missing-field-initializers -Wno-overlength-strings -Wno-tautological-compare \
	-Wno-unused-parameter -Wno-unused-value -Wunused-variable -Wno-constant-logical-operand \
	-Wno-parentheses-equality -Wno-self-assign -Wmisleading-indentation -Wshorten-64-to-32 -Wundef \
	-fno-color-diagnostics
INCFLAGS = -Ibuild -Ibuild/.ext/include/wasm32-wasi -Ibuild/.ext/include -Iruby/include -Iruby -Iruby/prism \
	-Iruby/enc/unicode/17.0.0
IRFLAGS = --target=wasm32-wasip1 -fPIC -O1 -Xclang -disable-llvm-passes
LDFLAGS = --target=wasm32-wasip1 -shared -Wl,--experimental-pic -Wl,--unresolved-symbols=import-dynamic
WASMOPT = wasm-opt
WASMOPTFLAGS = --asyncify --pass-arg=asyncify-import-globals -g

OBJS = out/version.o out/array.o out/string.o out/numeric.o out/hash.o out/object.o out/range.o out/time.o out/proc.o out/class.o
VM_LIBS = out/libruby-vm.0.so out/libruby-vm.1.so out/libruby-vm.2.so out/libruby-vm.3.so

MAKEFLAGS += -j4

.PHONY: all
.SECONDARY:

all: out/libruby-edit.so $(VM_LIBS)

out/libruby-edit.so: $(OBJS)
	$(CC) $(LDFLAGS) $^ -o $@
	$(WASMOPT) $(WASMOPTFLAGS) $@ -o $@

out/libruby-vm.%.so: out/vm.bc.%.o
	$(CC) $(LDFLAGS) $< -o $@
	$(WASMOPT) -O1 $(WASMOPTFLAGS) $@ -o $@

out/vm.bc: ruby/vm_eval.c ruby/vm_method.c ruby/vm_insnhelper.c build/vm.inc

out/%.o: ruby/%.c
	$(CC) $(CFLAGS) $(INCFLAGS) -c $< -o $@

# 大きなソースは、最適化まで済ませた bitcode を llvm-split で分けて、並列に機械語にする。
# 分けたものは別々の共有ライブラリにする。そのため llvm-split は、外に出したシンボルを hidden にしない（--default-visibility）
out/%.bc: ruby/%.c
	$(CC) $(CFLAGS) $(INCFLAGS) -emit-llvm -c $< -o $@

out/%.bc.0 out/%.bc.1 out/%.bc.2 out/%.bc.3: out/%.bc
	llvm-split --default-visibility -j 4 -o out/$*.bc. $<

out/%.o: out/%
	$(CC) $(IRFLAGS) -c -x ir $< -o $@
