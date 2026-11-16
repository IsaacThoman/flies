// Runs the fly's brain off the render thread: unpacks the connectome from the
// first "init" (as it travels, wire.ts) and builds the brain from it, the
// WebAssembly one when the page sent its module, decoding straight into the
// module's memory, or the TypeScript one; then answers each "tick" with
// exactly one "state", or an "error".

import { createBrain } from "@fly/brain";
import type { BrainResponse } from "@fly/brain";
import { WasmBrainModule } from "@fly/brain-native";
import { createBrainHost } from "./host.ts";
import { unpackConnectome } from "./wire.ts";

const post = (response: BrainResponse) => (self as unknown as Worker).postMessage(response);
const seed = (Math.random() * 0x7fffffff) | 0;
const handle = createBrainHost(async ({ data, module }) => {
  if (!module) return { brain: createBrain((await unpackConnectome(data)).buffer, { seed }), engine: "typescript" };
  const wasm = await WasmBrainModule.instantiate(module);
  await unpackConnectome(data, (bytes) => wasm.connectomeSpace(bytes));
  return { brain: wasm.create(seed), engine: "wasm" };
}, post);
self.onmessage = (event: MessageEvent) => handle(event.data);
