// The library builds warning-free (build.sh uses -Wall -Wextra -Wpedantic
// -Werror and no floating-point flags), keeps src/ to the library, and fuses
// no multiply-add anywhere but in V8's math routines: JavaScript never fuses,
// so a fused instruction anywhere else would be a result the TypeScript can't
// produce.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { PACKAGE, build, noCompiler } from "./compare.ts";

test("the library builds without warnings and src/ is only the library", { skip: noCompiler }, () => {
  build();
  build("sanitize");
  for (const file of readdirSync(join(PACKAGE, "src"))) {
    assert.match(file, /\.(cpp|hpp)$/, file);
    assert.doesNotMatch(readFileSync(join(PACKAGE, "src", file), "utf8"), /\bint main\s*\(/, `${file} has a main`);
  }
});

const objdump = spawnSync("objdump", ["--version"]).status === 0;
const skip = noCompiler || (process.arch !== "arm64" ? "fused multiply-adds are checked on arm64" : objdump ? false : "no objdump");

test("nothing but V8's math routines fuses a multiply and an add", { skip }, () => {
  const dir = build();
  for (const object of readdirSync(join(dir, "obj"))) {
    const disassembly = spawnSync("objdump", ["-d", join(dir, "obj", object)], { encoding: "utf8", maxBuffer: 1 << 28 }).stdout;
    const fused = disassembly.match(/\bf(n?)m(add|sub)\b/g)?.length ?? 0;
    if (object === "fdlibm.o") assert.ok(fused > 0, "V8 itself fuses in these routines on arm64");
    else assert.equal(fused, 0, `${object} has ${fused} fused multiply-adds`);
  }
});
