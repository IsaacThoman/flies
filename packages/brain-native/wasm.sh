#!/bin/sh
# Builds the brain as WebAssembly for browsers (npm run brain:wasm):
#
#   packages/brain-native/wasm.sh [--check]
#
# Writes wasm/fly-brain.wasm (the library behind include/fly_brain.h, what the
# web build ships) and wasm/fly-brain-harness.wasm (tools/harness.cpp, which
# the tests run in Node to hold the WebAssembly build to the TypeScript), and
# wasm/build.json, the digests of what they were built from. Both are
# committed, so installing, testing and building the site need no toolchain;
# tests/wasm.test.ts fails while the sources differ from what they were built
# from. --check builds into build/wasm/ instead and fails unless the result is
# byte for byte what is committed.
#
# The toolchain is wasi-sdk (clang, wasm-ld, wasi-libc and libc++ for
# wasm32-wasip1), one pinned release, downloaded once into build/ and checked
# against its digest; WASI_SDK_PATH uses another copy.

set -eu
cd "$(dirname "$0")"

SDK_VERSION=34
SDK_RELEASE=34.0
case "$(uname -s)-$(uname -m)" in
  Darwin-arm64) host=arm64-macos sha=9c59398106b417f8f14913380fdf0097a8cc0ff4af9eb3ce0065a859e88d49e9 ;;
  Darwin-x86_64) host=x86_64-macos sha=87d27fa8adc68dee59bfbf2e22a6d34ef717c34d6bf1d8af2a56fc929d9ce0eb ;;
  Linux-x86_64) host=x86_64-linux sha=b761e3a0721dbae9c09a0059e5fdb2bf917d1b4a8a7b430fb3b5aafb0984b2c4 ;;
  Linux-aarch64 | Linux-arm64) host=arm64-linux sha=f7e243dff54d60bcc576e94d6166b69f410f2500ae4a9ceef34315be10e77971 ;;
  *) echo "wasm.sh: no wasi-sdk $SDK_RELEASE for $(uname -s) $(uname -m); set WASI_SDK_PATH" >&2; exit 1 ;;
esac

sdk=${WASI_SDK_PATH:-build/wasi-sdk-$SDK_RELEASE-$host}
if [ ! -x "$sdk/bin/clang++" ]; then
  [ -z "${WASI_SDK_PATH:-}" ] || { echo "wasm.sh: no clang++ in $WASI_SDK_PATH/bin" >&2; exit 1; }
  mkdir -p build
  archive=build/wasi-sdk-$SDK_RELEASE-$host.tar.gz
  echo "Downloading wasi-sdk $SDK_RELEASE (about 180 MB, once)" >&2
  curl -fL --retry 3 -o "$archive" "https://github.com/WebAssembly/wasi-sdk/releases/download/wasi-sdk-$SDK_VERSION/wasi-sdk-$SDK_RELEASE-$host.tar.gz"
  got=$( (sha256sum "$archive" 2>/dev/null || shasum -a 256 "$archive") | cut -d' ' -f1)
  if [ "$got" != "$sha" ]; then
    rm -f "$archive"
    echo "wasm.sh: the wasi-sdk download isn't the release's (sha256 $got)" >&2
    exit 1
  fi
  tar -xzf "$archive" -C build
  rm -f "$archive"
fi

out=wasm
[ "${1:-}" = "--check" ] && out=build/wasm
obj=build/wasm/obj
mkdir -p "$out" "$obj"

# As build.sh's release build: -O2, no floating-point flags (the sources set
# contraction themselves). C++ exceptions are WebAssembly's own, in the
# standard form (exnref), which is what wasi-sdk's libc++ is built for.
cxx="$sdk/bin/clang++ --target=wasm32-wasip1"
flags="-std=c++20 -O2 -DNDEBUG -Wall -Wextra -Wpedantic -Werror -Iinclude -Isrc -fwasm-exceptions -mllvm -wasm-use-legacy-eh=false"

pids=""
for source in src/*.cpp tools/harness.cpp; do
  name=$(basename "$source" .cpp)
  [ "$name" = fdlibm ] && continue
  # shellcheck disable=SC2086
  $cxx $flags -c "$source" -o "$obj/$name.o" &
  pids="$pids $!"
done
# V8's math is compiled with contraction on, and on arm64 (Apple silicon, the
# Apple TV) every multiply-add it contracts is one fused instruction, so that
# is Node's Math and the native brain's (src/fdlibm.cpp). WebAssembly has no
# fused multiply-add, so clang would split each back into two roundings. In
# its place each is made a call to libc's fma, which wasi-libc computes in
# software, correctly rounded: the same single rounding as the instruction,
# so this build's exp, log, log1p, expm1, sin and cos are arm64's, bit for bit.
# shellcheck disable=SC2086
$cxx $flags -S -emit-llvm src/fdlibm.cpp -o "$obj/fdlibm.ll"
sed 's/@llvm\.fmuladd\.f64/@llvm.fma.f64/g' "$obj/fdlibm.ll" > "$obj/fdlibm-fused.ll"
grep -q '@llvm\.fmuladd' "$obj/fdlibm-fused.ll" && { echo "wasm.sh: a multiply-add in fdlibm.cpp wasn't made fused" >&2; exit 1; }
$cxx -O2 -c "$obj/fdlibm-fused.ll" -o "$obj/fdlibm.o"
status=0
for pid in $pids; do wait "$pid" || status=1; done
[ $status -eq 0 ] || exit 1

library=""
for source in src/*.cpp; do library="$library $obj/$(basename "$source" .cpp).o"; done
# A reactor: no main; _initialize runs the constructors, then the exports are called.
exports=""
for name in fly_brain_create fly_brain_destroy fly_brain_neurons fly_brain_connections fly_brain_facets fly_brain_eye_directions \
  fly_brain_eye_acceptance fly_brain_rate_count fly_brain_rate_name fly_brain_tick fly_brain_memory fly_brain_remember malloc free; do
  exports="$exports -Wl,--export=$name"
done
link="-O2 -fwasm-exceptions -lunwind -Wl,--strip-all -Wl,-z,stack-size=1048576"
# shellcheck disable=SC2086
$cxx $link -mexec-model=reactor $exports $library -o "$out/fly-brain.wasm"
# shellcheck disable=SC2086
$cxx $link $library "$obj/harness.o" -o "$out/fly-brain-harness.wasm"

digest() { (sha256sum "$@" 2>/dev/null || shasum -a 256 "$@") | cut -d' ' -f1; }
# What the modules are made from, as tests/wasm.test.ts reads it: each source's digest, in this order.
sources=$(for f in wasm.sh include/*.h src/*.cpp src/*.hpp tools/harness.cpp; do printf '    "%s": "%s",\n' "$f" "$(digest "$f")"; done | sed '$ s/,$//')
cat > "$out/build.json" <<EOF
{
  "toolchain": "wasi-sdk $SDK_RELEASE",
  "sources": {
$sources
  },
  "modules": {
    "fly-brain.wasm": "$(digest "$out/fly-brain.wasm")",
    "fly-brain-harness.wasm": "$(digest "$out/fly-brain-harness.wasm")"
  }
}
EOF

if [ "$out" = build/wasm ]; then
  for file in fly-brain.wasm fly-brain-harness.wasm build.json; do
    cmp -s "$out/$file" "wasm/$file" || { echo "wasm.sh: $file isn't what wasm/ holds: run npm run brain:wasm and commit it" >&2; exit 1; }
  done
fi
