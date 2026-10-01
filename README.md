# Writing Tools

A desktop writing app for creative fiction. The Author writes Prose in an editor, and an AI Assistant beside it asks questions, comments, and proposes changes to the Story Bible and Outlines. The Assistant never writes the Prose itself.

**Status:** early development. You can create or open a Project, organise its Chapters and Scenes in the binder, and write Scenes, which autosave. The rest of the MVP is planned as tickets under [Spec: Writing Tools MVP (#30)](https://github.com/magnusblombergsson/writing-tools/issues/30).

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
| `npm run typecheck` | Type-check with `tsc` |
| `npm run lint` / `npm run lint:fix` | Lint with oxlint and check formatting with oxfmt, or fix both |
| `npm run package` | Build a runnable app into `out/` |
| `npm run make` | Build installers |

## How it fits together

An Electron app written in TypeScript, with React in the renderer and a TipTap editor (see [ADR 0001](docs/adr/0001-electron-and-tiptap.md)).

- **`src/main/`**: the main process. All file access happens here, in `project-store/`, which reads and writes the Project folder. `ipc.ts` connects the store to the window.
- **`src/preload/`**: exposes typed `window.project` and `window.shell` objects to the renderer.
- **`src/renderer/`**: the React UI. It never sees file paths or file formats. The editor hands the rest of the app restricted Markdown only.
- **`src/shared/`**: types and the IPC interface, used by all three.
- **`tests/e2e/`**: end-to-end tests that drive the built app.

A Project is a plain folder, usually kept in OneDrive or Dropbox: `project.json` holds the Chapter and Scene structure, and there is one Markdown file per Scene, named by its id (see [ADR 0002](docs/adr/0002-manifest-ordered-id-named-files.md)). Every write goes to a temp file first, which is then renamed over the target, so a crash never leaves a half-written file.

## Further reading

- [`CONTEXT.md`](CONTEXT.md): the domain glossary. Code, UI text and tickets use these terms (Project, Scene, Prose, Story Bible, Proposal, …).
- [`docs/adr/`](docs/adr/): architecture decisions and the reasons for them.
- [Spec: Writing Tools MVP (#30)](https://github.com/magnusblombergsson/writing-tools/issues/30) and [Spec: Project persistence (#25)](https://github.com/magnusblombergsson/writing-tools/issues/25): what the MVP will do.
- [`AGENTS.md`](AGENTS.md): conventions for AI coding agents working in this repo.
