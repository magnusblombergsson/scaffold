# Tauri vs Electron for a local-first writing app with LLM calls

Research for [#2](https://github.com/magnusblombergsson/writing-tools/issues/2) (part of [#1](https://github.com/magnusblombergsson/writing-tools/issues/1)). Gathered 2026-09-28 against Tauri v2 and current Electron docs.

**Question:** For a single-user desktop writing app with a rich-text editor, LLM API calls (for the Assistant), and local Project storage, how do Tauri and Electron compare on the axes below? This file lists facts only. It does not make the decision.

## Summary table

| Axis | Tauri 2 | Electron |
|---|---|---|
| Runtime | Rust core process + OS webview (WebView2 / WKWebView / webkit2gtk) | Bundled Chromium + Node.js |
| Bundle size | "less than 600KB" minimal app; WebView2 not bundled by default | Zipped apps "usually around 80 to 100 Megabytes" |
| Rendering consistency | Differs per OS; WebKit on macOS/Linux tied to OS/distro | The same Chromium version on every OS |
| Filesystem | `fs` plugin, default-deny, path scopes set in capability files | Full Node `fs` in the main process; exposed to the renderer through preload/contextBridge |
| API key storage | No first-party keychain plugin; Stronghold slated for removal in v3; community `keyring` crate/plugins | Built-in `safeStorage` (Keychain / DPAPI / libsecret or kwallet) |
| LLM calls | `http` plugin: `fetch` runs in Rust, no CORS, URL scope, streamed body | Node `fetch` in the main process, streamed over IPC; or from the renderer |
| .docx parsing | JS libs in the webview (mammoth); Rust `docx-rs`; or a Node sidecar | The whole npm ecosystem in main or renderer |
| TS frontend | `create-tauri-app` `*-ts` templates; backend in Rust | Forge `vite`/`webpack` templates; the whole app can be TypeScript |
| Packaging | msi/nsis, app/dmg, deb/rpm/AppImage/flatpak/snap; msi builds only on Windows | Forge makers: squirrel, wix, msix, appx, dmg, pkg, zip, deb, rpm, flatpak, snap |

## 1. Bundle size and runtime

- **Tauri:** "A minimal Tauri app can be less than 600KB in size." It uses "the web view already available on every user's system" instead of bundling a browser. [Tauri: What is Tauri](https://v2.tauri.app/start/) The webview libraries are "not included in your final executable but dynamically linked at runtime". [Tauri: Process Model](https://v2.tauri.app/concept/process-model/)
- **Tauri on Windows:** By default the installer downloads a WebView2 bootstrapper, which adds 0 MB. The other options add weight: embed bootstrapper about 1.8 MB, offline installer about 127 MB, fixed-version runtime about 180 MB. [Tauri: Windows Installer](https://v2.tauri.app/distribute/windows-installer/) WebView2 is pre-installed on Windows 10 v1803 and later. [Tauri: Prerequisites](https://v2.tauri.app/start/prerequisites/)
- **Electron:** "Zipped Electron apps are usually around 80 to 100 Megabytes". Electron bundles "the latest version of Chromium, V8, and Node.js directly with the application binary", and the maintainers "accepted the increased disk size ... as a worthy trade-off". [Electron: Why Electron](https://www.electronjs.org/docs/latest/why-electron)

## 2. Rendering engine consistency (affects the rich-text editor)

- Tauri uses WebView2 (Chromium) on Windows, WebKit through WKWebView on macOS, and WebKit through webkit2gtk on Linux. WebView2 updates itself. On macOS the WebKit version is tied to OS updates. On Linux, "version availability varies" by distribution. [Tauri: Webview Versions](https://v2.tauri.app/reference/webview-versions/) The Tauri docs note that the dynamically linked webview "requires developers to account for platform differences". [Tauri: Process Model](https://v2.tauri.app/concept/process-model/)
- Electron ships the same Chromium on every platform. [Electron: Why Electron](https://www.electronjs.org/docs/latest/why-electron)
- Implication for the editor: in Tauri, a contenteditable-based editor runs on both the Chromium and WebKit engines, so it must be tested on each. In Electron it runs on Chromium only.

## 3. Filesystem access (local Project storage)

- **Tauri:** The `fs` plugin uses two layers. Permissions enable commands, and scopes restrict paths: "Permissions alone do not grant a scope ... Most `fs` commands also require a scope". Scope paths can use variables such as `$APPDATA`, `$APPLOCALDATA`, `$DOCUMENT` and `$HOME`, plus globs. Deny rules win over allow rules. The default permission set gives read access to the app-specific directories only. [Tauri: File System plugin](https://v2.tauri.app/plugin/file-system/) Capabilities grant permissions per window, and anything not declared is off. [Tauri: Capabilities](https://v2.tauri.app/security/capabilities/) Rust code in the core process can also use `std::fs` directly without a scope. The core process has "full OS access". [Tauri: Process Model](https://v2.tauri.app/concept/process-model/)
- **Electron:** The main process "runs in a Node.js environment, meaning it has the ability to `require` modules and use all of Node.js APIs". The renderer "has no direct access to `require` or other Node.js APIs". Filesystem access is exposed to the UI through a preload script and `contextBridge`. [Electron: Process Model](https://www.electronjs.org/docs/latest/tutorial/process-model) Node integration in renderers has been off by default since 5.0.0, context isolation has been on by default since 12.0.0, and sandboxing has been on by default since 20.0.0. [Electron: Security](https://www.electronjs.org/docs/latest/tutorial/security) Electron has no path-scope system. The app enforces its own restrictions in the IPC handlers.

## 4. Secure storage of an API key

- **Electron:** `safeStorage` is built in and available in the main process only. It encrypts strings with OS cryptography:
  - macOS uses the Keychain.
  - Windows uses DPAPI, which protects data from other users but "not other apps".
  - Linux uses kwallet or gnome-libsecret. If neither is available it falls back to an unprotected `basic_text` backend.

  On macOS the app must be code-signed for consistent behaviour. The async API is recommended. [Electron: safeStorage](https://www.electronjs.org/docs/latest/api/safe-storage)
- **Tauri:** There is no first-party OS-keychain plugin.
  - The official Stronghold plugin ("IOTA Stronghold secret management engine") is still documented. [Tauri: Stronghold](https://v2.tauri.app/plugin/stronghold/) However, Tauri maintainer FabianLars said: "stronghold is no longer recommended and will be deprecated and therefore removed in v3." [tauri-apps discussion #7846](https://github.com/orgs/tauri-apps/discussions/7846)
  - The common route is the Rust `keyring` crate (v4.2.0). It supports the macOS Keychain, the Windows Credential Manager, Linux Secret Service and keyutils, and iOS/Android. [docs.rs: keyring](https://docs.rs/keyring/latest/keyring/) It can be called from a custom Tauri command or through the community `tauri-plugin-keyring`. [crates.io: tauri-plugin-keyring](https://crates.io/crates/tauri-plugin-keyring)
- **Both frameworks:** If the key is read in the backend and the LLM call is made there, the key never has to reach the webview or renderer.

## 5. Calling LLM APIs (webview vs backend)

- **Tauri:** The `http` plugin exposes a `fetch` whose "request is performed by the Rust backend instead of the webview, so it is not subject to CORS, but the URL must be allowed by the plugin scope". [Tauri: JS http reference](https://v2.tauri.app/reference/javascript/http/) By default no origins are allowed. Allowed and denied URL patterns are set in capability files, and forbidden headers are filtered unless the `unsafe-headers` feature is enabled. [Tauri: HTTP client plugin](https://v2.tauri.app/plugin/http-client/) The response body is a `ReadableStream` that pulls chunks from Rust (`plugin:http|fetch_read_body`), so streamed (SSE) completions can be consumed incrementally. [plugins-workspace http/guest-js/index.ts](https://github.com/tauri-apps/plugins-workspace/blob/v2/plugins/http/guest-js/index.ts) Rust code can also use the re-exported `reqwest` directly. [Tauri: HTTP client plugin](https://v2.tauri.app/plugin/http-client/)
- **Electron:** The main process has full Node.js, including the global `fetch` and any npm LLM SDK. Results reach the renderer over IPC through the preload/contextBridge. [Electron: Process Model](https://www.electronjs.org/docs/latest/tutorial/process-model) Calling from the renderer is also possible, but the key would then be in renderer memory and the call would be subject to browser CORS rules.
- **Both frameworks:** Official TypeScript LLM SDKs run as-is in Electron's main process. In Tauri they run in the webview, where the key is exposed and they are subject to browser/CORS rules unless given a custom `fetch`. They could also run in a Node sidecar. The alternative is to call the HTTP API from Rust. (Inference from the process models above. Not tested.)

## 6. .docx parsing libraries

- **JavaScript:** mammoth.js converts .docx to HTML and runs in both Node and the browser (`mammoth.browser.js`). It deliberately ignores styling and maps semantics instead, such as Heading 1 to `<h1>`, and "the conversion is unlikely to be perfect for more complicated documents". [mammoth.js](https://github.com/mwilliamson/mammoth.js) It can be used in the Electron main or renderer process, and in the Tauri webview.
- **Rust:** `docx-rs` (0.4.22, July 2026) reads (`read_docx`) and writes .docx. Its tagline is "A .docx file writer with Rust/WebAssembly", which suggests it is mainly a writer. [docs.rs: docx-rs](https://docs.rs/docx-rs/latest/docx_rs/)
- **Tauri sidecar:** Tauri can bundle external binaries, including "Node.js as a sidecar", through `bundle.externalBin`, with one binary per target triple. This makes Node-only libraries usable, at the cost of a larger bundle. [Tauri: Sidecar](https://v2.tauri.app/develop/sidecar/)
- **Net:** Browser-compatible JS parsers work in both frameworks. Node-only parsers work natively only in Electron.

## 7. Dev ergonomics with a TypeScript frontend

- **Tauri:**
  - `create-tauri-app` offers `vanilla-ts`, `react-ts`, `vue-ts`, `svelte-ts`, `solid-ts`, `preact-ts` and `angular` templates. [create-tauri-app](https://github.com/tauri-apps/create-tauri-app) "Virtually any frontend framework is compatible". [Tauri: What is Tauri](https://v2.tauri.app/start/)
  - Backend logic is written in Rust and called through `invoke`. [Tauri: What is Tauri](https://v2.tauri.app/start/)
  - Every platform needs the Rust toolchain (rustup). Windows also needs the MSVC build tools, macOS needs Xcode command-line tools, and Linux needs webkit2gtk and related packages. Node.js is needed "only if you intend to use a JavaScript frontend framework". [Tauri: Prerequisites](https://v2.tauri.app/start/prerequisites/)
- **Electron:** Main, preload and renderer are all JavaScript/TypeScript. Electron Forge ships `vite` and `webpack` templates. [electron/forge templates](https://github.com/electron/forge/tree/main/packages/template) Security hygiene (contextIsolation, sandbox, CSP, validating IPC senders) is the app's responsibility, following a checklist of about 20 items. [Electron: Security](https://www.electronjs.org/docs/latest/tutorial/security)

## 8. Cross-platform packaging

- **Tauri:** The CLI's `tauri build` produces these formats:
  - Windows: MSI (WiX) and NSIS installers, plus the Microsoft Store.
  - macOS: `.app` and DMG, plus the App Store.
  - Linux: AppImage, deb, rpm, Flatpak, Snap and AUR.

  [Tauri: Distribute](https://v2.tauri.app/distribute/) "`.msi` installers can only be created on Windows". Cross-compiling NSIS installers from Linux/macOS "is possible with caveats ... not tested as much". [Tauri: Windows Installer](https://v2.tauri.app/distribute/windows-installer/) In practice, building on each OS (for example with a CI matrix) is the norm. Most platforms require code signing. [Tauri: Distribute](https://v2.tauri.app/distribute/)
- **Electron:** Electron Forge handles packaging, making and publishing. [Electron: Forge overview](https://www.electronjs.org/docs/latest/tutorial/forge-overview) Its maker packages are `appx`, `deb`, `dmg`, `flatpak`, `msix`, `pkg`, `rpm`, `snap`, `squirrel`, `wix` and `zip`. [electron/forge makers](https://github.com/electron/forge/tree/main/packages/maker) The Electron docs mention that the third-party Hydraulic Conveyor can cross-build and sign "from any OS without the need for multi-platform CI". [Electron: Forge overview](https://www.electronjs.org/docs/latest/tutorial/forge-overview) Host-OS limits for each Forge maker were not verified: electronforge.io could not be reached during this research.

## Implications for the decision

- **Size vs consistency:** Tauri gives installers of a few MB, but the editor must behave the same on Chromium (Windows) and WebKit (macOS/Linux). Electron costs about 80–100 MB zipped and gives the editor a single engine.
- **Language surface:** Electron keeps the whole app in TypeScript. With Tauri, any non-trivial backend work (keychain, LLM streaming, file I/O beyond the plugins) means writing Rust, or shipping a Node sidecar that gives back part of the size advantage.
- **API key handling:** Electron has a built-in, documented answer (`safeStorage`). Tauri's official option (Stronghold) is being phased out, so it relies on the `keyring` crate or a community plugin.
- **LLM calls:** Both frameworks can keep the key and the network call out of the UI layer. Tauri does it with a scoped, CORS-free, streaming `fetch` backed by Rust. Electron does it with main-process Node plus IPC. Official TS LLM SDKs work without changes only in Electron's main process.
- **.docx import:** This does not separate the two frameworks if a browser-capable JS parser such as mammoth is good enough. It tilts toward Electron if a Node-only parser is needed.
- **Filesystem security model:** Tauri enforces path scopes by default. In Electron, restrictions are whatever the app's IPC handlers enforce. For a single-user local app, this mainly affects how much defensive code is needed if the UI ever renders untrusted content, such as LLM output or imported documents.
- **Packaging:** Both frameworks cover Windows, macOS and Linux formats. Either way, plan for a CI matrix and code signing.
