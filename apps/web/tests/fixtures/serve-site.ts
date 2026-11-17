import { serveSite } from "../../../../scripts/serve.ts";
const site = await serveSite({ dir: process.argv[2], base: process.argv[3] });
process.send?.(site.url);
process.on("message", () => void site.close().then(() => process.disconnect?.()));
