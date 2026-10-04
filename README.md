# Scaffold

A desktop writing app for creative fiction. The Author writes Prose in an editor, and an AI Assistant beside it asks questions, comments, and proposes changes to the Story Bible and Outlines. The Assistant never writes the Prose itself.

**Status:** early development. You can create or open a Project, organise its Chapters and Scenes in the binder, undo the latest change from its toast, delete Scenes and Chapters to Trash and restore them, and write Scenes, which autosave. The window says whether everything is saved, and Ctrl+S saves at once; a save that fails is reported, retried, and keeps the app open until it succeeds. Each Scene and Chapter has an Outline and Notes, and the Project has an Outline of its own; undo in each one keeps its own history for the session. Each Project opens in its own window, and the app reopens the Projects you had open when you quit it. Changes that a sync client brings from another computer show up while the Project is open, and opening it says when it is also open on another computer, and offers to continue where you left off there. When two computers saved the same Scene, Outline or Notes, the versions wait side by side under Conflicts until you keep one or a merge; the others go to Trash. Two versions of `project.json` are settled without asking, and you are told what was dropped. A Project saved by a newer version of the app is refused, and one upgraded by a newer version on another computer while it is open here becomes read-only, once pending edits are saved. Scaffold was called Writing Tools until v2: at its first start it copies Writing Tools' settings and saved key once, and asks for the key again if it can't decrypt the copy. v2 is planned as tickets under [Spec: Scaffold v2 (#76)](https://github.com/magnusblombergsson/scaffold/issues/76), on top of [Spec: Writing Tools MVP (#30)](https://github.com/magnusblombergsson/scaffold/issues/30).

## Getting started

You need Node.js 24 or later.

```sh
npm install
npm start
```

`npm start` runs the app in development mode with hot reload. The Electron binary downloads on first use.

> **Running from a VS Code terminal?** VS Code sets `ELECTRON_RUN_AS_NODE=1`, which starts Electron as plain Node instead of as an app. Unset it first (`unset ELECTRON_RUN_AS_NODE` in Bash, `Remove-Item Env:ELECTRON_RUN_AS_NODE` in PowerShell).

## Scripts

| Command | What it does |
|---|---|
| `npm start` | Run the app in development mode |
| `npm test` | Unit tests (Vitest) |
| `npm run test:e2e` | Build the app, then run the end-to-end tests (Playwright for Electron) |
| `npm run eval:never-prose` | Ask Claude the never-Prose eval set in every Mode and write a review sheet (needs `ANTHROPIC_API_KEY`; see [docs/evals/never-prose](docs/evals/never-prose/README.md)) |
| `npm run typecheck` | Type-check with `tsc` |
| `npm run lint` / `npm run lint:fix` | Lint with oxlint and check formatting with oxfmt, or fix both |
| `npm run package` | Build a runnable app into `out/` |
| `npm run make` | Build installers |

## How it fits together

An Electron app written in TypeScript, with React in the renderer and a TipTap editor (see [ADR 0001](docs/adr/0001-electron-and-tiptap.md)).

- **`src/main/`**: the main process. All file access happens here. `project-store/` reads and writes the Project folder. `app-settings/` keeps this computer's settings and recent Projects in `userData/settings.json`. `user-data/` copies the old app's `userData` files at the first start under the name Scaffold. The copied key is expected to decrypt on Windows, where `safeStorage`'s key comes along in `Local State`, but not on macOS or Linux, where the keychain entry is named after the app; then the welcome asks for the key again, and the copy waits as `api-key.json` until the Author adds, removes or skips it (skipping sets it aside as `api-key.corrupt-<ts>.json`). `shell.ts` manages the windows, the Project each one shows, and the start-up reopen. `ipc.ts` connects the store of each window to its renderer.
- **`src/preload/`**: exposes typed `window.project` and `window.shell` objects to the renderer.
- **`src/renderer/`**: the React UI. It never sees file formats, and sees paths only as the recent list shows them. The editor hands the rest of the app restricted Markdown only.
- **`src/shared/`**: types and the IPC interface, used by all three.
- **`tests/e2e/`**: end-to-end tests that drive the built app.

A Project is a plain folder, usually kept in OneDrive or Dropbox: `project.json` holds the Chapter and Scene structure, and there is one Markdown file per Scene, named by its id, with Outlines in `outlines/` and Notes in `notes/`; deleted Scenes and Chapters, and the versions left over when a Conflict is resolved, wait in `trash/` until it is emptied. A conflict copy that a sync client leaves beside a file is matched to its unit by the id inside it, never by its name (see [ADR 0002](docs/adr/0002-manifest-ordered-id-named-files.md)). Each computer leaves a session marker in `.sessions/<HOST>.json`, which warns other computers but never locks the Project. Every write goes to a temp file first, which is then renamed over the target, so a crash never leaves a half-written file. Every file records the `format` it was written in, and keys the app doesn't know are kept when it rewrites a file; `format` in `project.json` decides whether this app may open the Project, and is checked before every write (see [ADR 0004](docs/adr/0004-one-format-version-gate-first.md)). Other than the session markers, nothing about a single computer goes in the Project folder; that lives in `settings.json`. While a Project is open, `@parcel/watcher` hints that files changed, and the store then compares the files with what it holds; Vite leaves this native module out of the bundle, and `forge.config.mts` packages it. End-to-end tests point the app at their own settings folder with `SCAFFOLD_USER_DATA`, which also skips the copy from Writing Tools.

## Further reading

- [`CONTEXT.md`](CONTEXT.md): the domain glossary. Code, UI text and tickets use these terms (Project, Scene, Prose, Story Bible, Proposal, …).
- [`docs/adr/`](docs/adr/): architecture decisions and the reasons for them.
- [Spec: Writing Tools MVP (#30)](https://github.com/magnusblombergsson/scaffold/issues/30) and [Spec: Project persistence (#25)](https://github.com/magnusblombergsson/scaffold/issues/25): what the MVP will do.
- [`AGENTS.md`](AGENTS.md): conventions for AI coding agents working in this repo.
