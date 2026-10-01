# Electron shell with a TipTap editor, Prose as restricted Markdown at the boundary

The MVP is an Electron app written entirely in TypeScript (React in the renderer), with a TipTap (ProseMirror) editor that edits one Scene at a time. We chose Electron over Tauri even though Tauri's bundles are about 100× smaller. For a single-Author tool the size doesn't matter. What matters is that Electron runs one Chromium everywhere, so the rich-text editor is only tested against one engine (Tauri uses WebKit on macOS and Linux). Electron also offers `safeStorage` for the API key, and it runs the official Anthropic SDK and mammoth natively in Node, with no Rust backend and no SSE-through-plugin spike.

## Considered Options

- **Tauri**: tiny installer, but a Rust backend, two rendering engines to test the editor in, no first-party keychain, and undocumented SSE streaming via `plugin-http`.
- **Lexical**: React-first and fast, but a thinner prose ecosystem and less proven anchored marks. TipTap gives ProseMirror decorations, which later Assistant comments anchored in the Prose will need, plus a Yjs path for sharing.
- **CodeMirror / Markdown source editing**: rejected because the Author wants WYSIWYG italics and bold, not visible markup.

## Consequences

- The editor hands the rest of the app restricted Markdown: paragraphs, `*italic*`, `**bold**`. Storage and Assistant context see only that. The editor's internal JSON stays inside the editor. Prose formatting beyond this (footnotes, block quotes) needs the boundary format extended first. A literal `*` or `\` in the Prose is escaped with a backslash. Every other character, `_` included, is plain Prose. Italic and bold come only from the keyboard, never from typed asterisks. The format is ours, not CommonMark: where marks cross (`*a **b* c**`), it reads back as written, and CommonMark would read it differently.
- Claude is called through a thin in-house provider interface over `@anthropic-ai/sdk`, running in the main process. The API key never reaches the renderer, and replies stream to the UI over IPC. We chose it over the Vercel AI SDK for full access to Claude's prompt caching.
- Spellchecking uses Electron's built-in spellchecker (`sv-SE`, `en-US`). On macOS the OS controls the language.
