#!/bin/sh -ex
# llvm-split を WASI（wasm32-wasip1）向けにビルドする。出力: $CRUBY_WORK/llvm-wasm/wasm-build/bin/llvm-split
#
# LLVM は、WASI でビルドできるよう YoWASP が直したもの（ブラウザの clang と同じ LLVM 22）を使い、
# default-visibility.patch（--default-visibility を足す）を当てる。
# コンパイラは手元の clang と、Ruby のビルドで使った sysroot（$CRUBY_WORK/fakesdk、ruby-build/README.md）。
WORK=${CRUBY_WORK:-$(cd "$(dirname "$0")/../../spike" && pwd)}
HERE=$(cd "$(dirname "$0")" && pwd)
D=$WORK/llvm-wasm
mkdir -p "$D" && cd "$D"

if ! [ -d src/llvm ]; then
  curl -sSLf -o fork.tar.gz "https://codeload.github.com/YoWASP/llvm-project/tar.gz/refs/heads/llvmorg-22.1.0%2Bwasm"
  mkdir -p src && tar -xzf fork.tar.gz -C src --strip-components=1
  (cd src && patch -p1 < "$HERE/default-visibility.patch")
fi

# 1. ネイティブの llvm-tblgen（同じ版のものが要る）
cmake -B tblgen-build -S src/llvm -DCMAKE_BUILD_TYPE=Release -DLLVM_TARGETS_TO_BUILD=WebAssembly \
  -DLLVM_INCLUDE_TESTS=OFF -DLLVM_INCLUDE_EXAMPLES=OFF -DLLVM_INCLUDE_BENCHMARKS=OFF -DLLVM_INCLUDE_DOCS=OFF \
  -DLLVM_BUILD_TOOLS=OFF -DCMAKE_C_COMPILER=clang -DCMAKE_CXX_COMPILER=clang++
cmake --build tblgen-build --target llvm-tblgen -j"$(nproc)"

# 2. WASI 向けの llvm-split（スレッドなし。LLVM の中の mmap は使われないが、リンクのために emulated-mman を入れる）
F=$WORK/fakesdk/bin
cat > Toolchain-WASI.cmake <<END
set(CMAKE_SYSTEM_NAME WASI)
set(CMAKE_SYSTEM_VERSION 1)
set(CMAKE_SYSTEM_PROCESSOR wasm32)
set(CMAKE_FIND_ROOT_PATH_MODE_PROGRAM NEVER)
set(CMAKE_FIND_ROOT_PATH_MODE_LIBRARY ONLY)
set(CMAKE_FIND_ROOT_PATH_MODE_INCLUDE ONLY)
set(CMAKE_FIND_ROOT_PATH_MODE_PACKAGE ONLY)
set(CMAKE_C_COMPILER $F/clang)
set(CMAKE_CXX_COMPILER $F/clang++)
set(CMAKE_AR $F/llvm-ar)
set(CMAKE_RANLIB $F/llvm-ranlib)
set(CMAKE_C_FLAGS "-D_WASI_EMULATED_MMAN")
set(CMAKE_CXX_FLAGS "-D_WASI_EMULATED_MMAN")
set(CMAKE_EXE_LINKER_FLAGS "-lwasi-emulated-mman -Wl,--max-memory=4294967296 -Wl,-z,stack-size=8388608,--stack-first")
END
cmake -B wasm-build -S src/llvm -DCMAKE_TOOLCHAIN_FILE="$D/Toolchain-WASI.cmake" \
  -DLLVM_NATIVE_TOOL_DIR="$D/tblgen-build/bin" -DLLVM_TABLEGEN="$D/tblgen-build/bin/llvm-tblgen" \
  -DCMAKE_BUILD_TYPE=Release -DLLVM_BUILD_SHARED_LIBS=OFF -DLLVM_ENABLE_PIC=OFF -DLLVM_BUILD_STATIC=ON \
  -DLLVM_ENABLE_THREADS=OFF -DLLVM_BUILD_RUNTIME=OFF -DLLVM_BUILD_TOOLS=OFF -DLLVM_INCLUDE_UTILS=OFF \
  -DLLVM_BUILD_UTILS=OFF -DLLVM_INCLUDE_RUNTIMES=OFF -DLLVM_INCLUDE_EXAMPLES=OFF -DLLVM_INCLUDE_TESTS=OFF \
  -DLLVM_INCLUDE_BENCHMARKS=OFF -DLLVM_INCLUDE_DOCS=OFF -DLLVM_TARGETS_TO_BUILD=WebAssembly \
  -DLLVM_DEFAULT_TARGET_TRIPLE=wasm32-wasip1 -DLLVM_ENABLE_ZLIB=OFF -DLLVM_ENABLE_ZSTD=OFF \
  -DLLVM_ENABLE_LIBXML2=OFF -DLLVM_ENABLE_TERMINFO=OFF -DLLVM_ENABLE_LIBEDIT=OFF -DLLVM_ENABLE_LIBPFM=OFF
cmake --build wasm-build --target llvm-split -j"$(nproc)"
