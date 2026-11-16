#!/bin/sh
# Builds the native brain and its tools with clang++ (the Xcode command line
# tools are enough):
#
#   packages/brain-native/build.sh [release|sanitize]
#
# release (the default) is optimised as the app should build it; sanitize adds
# AddressSanitizer and UndefinedBehaviorSanitizer. Either goes to
# build/<mode>/: libflybrain.a, fly-brain-harness (the comparison harness the
# tests drive) and fly-brain-bench. Nothing is rebuilt when nothing changed.

set -eu
cd "$(dirname "$0")"

mode=${1:-release}
CXX=${CXX:-clang++}
# No floating-point flags: the sources set contraction themselves (see
# src/exact.hpp and src/fdlibm.cpp), as they must when the app compiles them
# with its own flags, and building without any shows that they do.
common="-std=c++20 -Wall -Wextra -Wpedantic -Werror -Iinclude -Isrc"
case "$mode" in
  release) flags="$common -O2 -DNDEBUG" ;;
  sanitize) flags="$common -O1 -g -fno-omit-frame-pointer -fsanitize=address,undefined -fno-sanitize-recover=all" ;;
  *) echo "usage: $0 [release|sanitize]" >&2; exit 2 ;;
esac

out=build/$mode
mkdir -p "$out/obj"
stamp="$out/.flags"

# One build at a time per mode (the tests run in parallel and all call this).
lock="$out/.lock"
tries=0
until mkdir "$lock" 2>/dev/null; do
  tries=$((tries + 1))
  if [ $tries -gt 600 ]; then
    echo "build.sh: $lock has been held for five minutes; remove it if no build is running" >&2
    exit 1
  fi
  sleep 0.5
done
trap 'rmdir "$lock"' EXIT INT TERM

# Any change to a source, a header or the flags rebuilds everything: it is small.
if [ -f "$out/fly-brain-harness" ] && [ -f "$stamp" ] && [ "$(cat "$stamp")" = "$CXX $flags" ] &&
  [ -z "$(find src include tools build.sh -newer "$out/fly-brain-harness" -print -quit)" ]; then
  exit 0
fi

pids=""
for source in src/*.cpp tools/*.cpp; do
  object="$out/obj/$(basename "$source" .cpp).o"
  # shellcheck disable=SC2086
  $CXX $flags -c "$source" -o "$object" &
  pids="$pids $!"
done
status=0
for pid in $pids; do wait "$pid" || status=1; done
[ $status -eq 0 ] || exit 1

library="$out/libflybrain.a"
rm -f "$library"
objects=""
for source in src/*.cpp; do objects="$objects $out/obj/$(basename "$source" .cpp).o"; done
# shellcheck disable=SC2086
ar rcs "$library" $objects
for tool in harness bench; do
  # shellcheck disable=SC2086
  $CXX $flags "$out/obj/$tool.o" "$library" -o "$out/fly-brain-$tool"
done
echo "$CXX $flags" > "$stamp"
