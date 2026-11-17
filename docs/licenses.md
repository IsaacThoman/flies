# Licences and acknowledgements

Release draft. A lawyer should review these texts before release. No owner's personal contact details belong in notices; only upstream copyright notices retain their original authors' details.

## What ships

| Component | Actual licence source checked | Use and obligation |
| --- | --- | --- |
| three 0.186.1, including BufferGeometryUtils | installed `node_modules/three/LICENSE` | MIT; retain copyright, grant and disclaimer. No extra npm runtime dependencies. Geometry, materials, canvas UI and artwork are project code/assets. |
| Vite 8.3.8 module-preload helper | installed `node_modules/vite/LICENSE.md`, core licence | MIT; build tool itself is not shipped, but its injected browser helper is. Include the core licence. |
| ws 8.23.0 (server only; installed version is authoritative in generated notice) | installed `node_modules/ws/LICENSE` | MIT; not in browser/apps. Included for the distributed room server too. No optional native ws accelerators are installed. |
| fdlibm port via V8 14.6 | `packages/brain-native/src/fdlibm.cpp`, licence header | V8 BSD 3-clause plus SunSoft/Sun 1993 permission notice; both preserved verbatim. Modified mechanically for this C++ implementation. |
| FlyEM male CNS wiring, neuron annotations, eye mappings and anatomy shapes | [dataset's licence link](https://male-cns.janelia.org/) and [official downloads](https://male-cns.janelia.org/download/) | CC BY 4.0; credit all collaborating institutions, source and terms links, and state modifications. See the exact shipped credit in `docs/licenses/credits.json`. |
| Scientific neuron model | [Shiu et al., Nature 634, 210–219 (2024)](https://doi.org/10.1038/s41586-024-07763-9) | Scientific method citation, not a software licence grant. Our implementation follows the method; the paper and its code are not bundled. |
| wasi-sdk 34.0 linked runtime | pinned source-package licence files under `docs/licenses/` | wasi-libc (including musl, cloudlibc and allocation code); LLVM compiler-rt, libc++, libc++abi, libunwind. Apache 2.0 with LLVM exceptions, MIT and BSD notices, including legacy grants, retained in full. Tool executables are not shipped. |
| Fonts | `packages/ui/src/draw.ts`, `apps/tvos/src/Fonts.mm`, web public/assets inventory | No redistributed fonts or remote font requests. CSS names are system-font preferences, not bundled font packages. Native rendering uses system fonts. No font licence is needed for a font merely named as a local fallback. |
| Apple Weather | `apps/tvos/weather/WeatherKit/Service.swift`; `apps/web/src/ui/screens/about.ts` | Service-provided name, legal text and source URL shown in About where available. Explicitly identify transformed game weather as modified. This is a service attribution, not an open-source licence. Real weather is an optional tvOS build feature. |

Build-only dependencies such as TypeScript, ESLint, Playwright, semantic-release, Apache Arrow and lz4js do not enter the game bundle. Arrow/lz4 decode annotations during data preparation; they are not distributed in the resulting data. The Vite plugin inspects actual bundled module IDs as well as declared production dependency closure, so a future bundled development dependency cannot bypass the registry. Runtime platform frameworks are provided by the OS/browser, not copied into this repository.

## Runtime provenance

The toolchain is pinned by `packages/brain-native/wasm.sh` and `wasm/build.json`: wasi-sdk 34.0. The [SDK's source submodules](https://github.com/WebAssembly/wasi-sdk/tree/wasi-sdk-34/src) pin wasi-libc `2e6fb9d8ee0cdf9e431fbcabe8af3115de000a13` and LLVM `895aa2c896ada719451be2e3673c83da8ddf1141`. `docs/licenses/sources.json` records exact source-package URLs for every copied licence. These copies include the umbrella and third-party grants rather than assuming the compiler's licence covers libc. The SDK archive itself contains no separate licence inventory. The notice deliberately covers the runtime source set conservatively, even where dead stripping omits some functions. The native Apple runtime is supplied by Apple; the fdlibm notice applies there too.

## Generation and enforcement

Run `npm run notices` after changing dependencies, upstream licence copies or credits. It reads licences from the installed packages themselves and the fdlibm source header, and writes `THIRD_PARTY_NOTICES` and the in-engine reader's `apps/web/src/ui/notices.json`. `npm run notices:check` rejects drift. The build runs the same check and rejects unknown shipped package names. Tests include direct/transitive and missing-notice cases. New copied code, assets, fonts or runtime upgrades also require a human audit and registry/provenance updates; a dependency guard cannot discover arbitrary copied material.

Both Vite configurations emit `THIRD_PARTY_NOTICES` and a static `privacy/index.html`. The iOS packaging script bundles the web output; tvOS bundles its own Vite output. The same notice sections are compiled into the game for offline use through About → Acknowledgements. Licence URLs are attribution text, not network requests. Left/right changes notice, up/down scrolls, Back returns to About; phones have previous/next and Back targets.

The web host must serve `/privacy` as the directory's index (normally a redirect to `/privacy/`), not rewrite it to the game. Caddy and the local static server handle that explicitly. No external scripts, fonts or analytics are added to the policy page.

## Before submission

Confirm WeatherKit's live attribution on a signed device and the App Store build's bundled notice. Replace the privacy/operator and support/marketing/review-contact placeholders listed in the PR. Have counsel review the privacy policy, attribution coverage and store disclosures. Do not publish a draft with placeholders as the final policy.
