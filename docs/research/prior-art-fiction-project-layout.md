# Prior art: on-disk layout of fiction projects

Research for #16 (child of map #15, "Project storage"). Researched 2026-09-29.

**Question:** How do existing fiction and long-form writing tools lay out a project on disk, and what went wrong for them? The survey covers Scrivener (.scriv), Ulysses, Obsidian Longform, Manuskript and bibisco. For each tool it looks at:

- file granularity
- how ordering is stored
- where metadata and character/world notes live
- stable identifiers
- format versioning
- known pain points, especially with Dropbox/OneDrive and editing outside the app

**Sources.** The main sources are vendor docs and knowledge bases, vendor staff posts on official forums, source code, and GitHub issues. Some sources are community reverse-engineering (open-source readers of a closed format); those are labelled *[community]*. Claims that could not be confirmed against a primary source are marked **unverified**. Where a point is my reasoning from the code rather than something a source states, it is marked *inference*. Vocabulary follows `CONTEXT.md` (Project, Manuscript, Chapter, Scene, Story Bible, Entry).

---

## 1. Summary table

| Tool | Granularity | Ordering stored in | Metadata / Story Bible-like notes | Stable IDs | Format version | Headline failure |
|---|---|---|---|---|---|---|
| **Scrivener 3** | One folder per binder item: `Files/Data/<UUID>/content.rtf`, `notes.rtf`, `synopsis.txt`, … | **Manifest**: nested `BinderItem`s in the `.scrivx` XML | Labels, status and keywords in `.scrivx`. Synopsis and notes in per-item files. Characters are ordinary binder documents | **UUID** per item (Scrivener 2 used integers) | In `.scrivx` and `Files/version.txt`. Upgrade is one-way | Many interdependent files break under sync. "Never open on two machines" |
| **Ulysses** | One `.ulysses` package per sheet (`Content.xml` + `Media/`), one `-ulgroup` folder per group *[community]* | **Manifest**: `childOrder` in each group's `Info.ulgroup` plist *[community]*. Sort mode is set per group | Attachments (notes, keywords, goals) stored with the sheet. No character model | **Unverified** | **Unverified** | External folders are not backed up. OneDrive not supported. Markdown mode drops features |
| **Obsidian Longform** | One `.md` note per scene plus one index note per draft | **Frontmatter** of the index note: a nested `scenes:` list of names | None of its own; characters are ordinary vault notes | **None**: a scene is its file name | In plugin `data.json`, not in the project | Order scrambled and scenes dropped across iCloud devices (#278) |
| **Manuskript** | Folder mode: one `.md` per scene, one `.txt` per character, but `plots.xml` and `world.opml` are single monolithic files | **Filename prefixes** (`0-`, `01-`, …) derived from row position | MultiMarkdown-style header at the top of each file | `ID:` header key inside each file | `MANUSKRIPT` marker file (`1`) | Reorder renames sibling files. Save can `rmtree` the whole folder. Writes are non-atomic |
| **bibisco 2+** | **One LokiJS JSON file for the whole novel**, including every scene revision | Integer `position` field, with a gap-repair routine | Character and location records in the same JSON | Project UUID. Items use per-collection auto-increment integers | `bibiscoVersion` + stepwise add-collection migrations | Crash zeroed the file, then the startup backup overwrote the good one (#240) |

---

## 2. Per tool

### 2.1 Scrivener 3 (`.scriv`)

- **Package.** On a Mac the project is a package; on Windows it is a folder. The whole folder "makes up the project" and "must move together" ([L&L KB: Storing and organising projects](https://scrivener.tenderapp.com/help/kb/general/storing-and-organising-projects)). Because Windows shows a plain folder, every internal file is exposed there.
- **Granularity.** "Each Binder item is assigned a folder with a unique ID. All of the files associated with that item will be in that folder" (L&L staff, [forum](https://forum.literatureandlatte.com/t/where-do-i-find-the-rtf-data-files-in-the-beta/48554)).
  - The folder holds `content.rtf`, `notes.rtf` and `synopsis.txt`.
  - It also holds `content.styles`, a sidecar that exists because "The RTF format … does not support styles, so we've had to extend it".
  - These files are created and deleted on demand ([staff, forum](https://forum.literatureandlatte.com/t/content-styles-and-notes-rtf-files/150180)).
  - Other package contents include `styles.xml`, `search.indexes`, `binder.autosave`/`binder.backup`, `docs.checksum`, `Settings/` and `QuickLook/`. Some of these are derived data and can be regenerated *[community: [scrivener-skills package-layout](https://github.com/donnfelker/scrivener-skills/blob/main/skills/scrivener-format/references/package-layout.md)]*.
- **Ordering.** The `.scrivx` XML is the authoritative binder tree: nested `BinderItem` elements with UUID, Type, Title, MetaData and Children. File names carry no order *[community: [scrivener-skills SKILL.md](https://github.com/donnfelker/scrivener-skills/blob/main/skills/scrivener-format/SKILL.md), [scrivener-mcp](https://github.com/zaphodsdad/scrivener-mcp)]*.
- **Metadata.** Per item, the `.scrivx` holds label, status and include-in-compile. Label, status, keyword and custom-metadata definitions are project-wide, also in `.scrivx`. Exact element names are **unverified**.
  - Synopsis and notes are stored in the per-item files, not in the XML. A third-party tool got this wrong ([scrivener-mcp PR #111](https://github.com/writerslogic/scrivener-mcp/pull/111)).
  - Characters and places are ordinary binder documents, built from templates.
- **IDs.** Scrivener 2 stored text as `Files/Docs/<n>.rtf`, keyed by an integer ID ([moderator, forum](https://forum.literatureandlatte.com/viewtopic.php?t=33651)). Scrivener 3 names each item's folder by UUID. L&L's reason for the change is **unverified**.
  - Importers must validate UUIDs as safe path segments ([kindling #321](https://github.com/smith-and-web/kindling/issues/321), path traversal).
  - They must also check that UUIDs are unique ([StoryCAD #1568](https://github.com/storybuilder-org/StoryCAD/issues/1568): a third-party re-export produced duplicate UUIDs).
- **Versioning.** Opening a 1.x/2.x project asks permission to "update the file format of the project" ([KB](https://scrivener.tenderapp.com/help/kb/general/will-i-lose-my-work-if-i-upgrade-or-uninstall-scrivener)).
  - The upgrade is one-way. The way back is an explicit export to Scrivener 2 format ([forum](https://forum.literatureandlatte.com/t/scrivener-3-common-file-format-with-earlier-versions/37570)).
  - The version marker's exact location (`.scrivx Version="2.0"`, `Files/version.txt`) is **unverified** / *[community]*.
- **Pain points (all from L&L's own KB unless noted):**
  - Projects are "many linked and interdependent files", and "no syncing solution is 100% reliable". "Never, *ever* open the same project on more than one computer at a time". Wait for sync to finish before closing the lid or opening the project ([KB: Using Scrivener with cloud-sync services](https://scrivener.tenderapp.com/help/kb/cloud-syncing/using-scrivener-with-cloud-sync-services)).
  - A lock file inside the package marks the project as open, and it is left behind after a crash. When it is stale, the fix is "Continue", which deletes it ([staff, forum](https://forum.literatureandlatte.com/t/fixing-a-project-that-is-saying-it-is-already-open/153528)). The lock syncs late, so it cannot stop two machines opening the project at once.
  - Dropbox "conflicted copy" files inside the package are detected and collected in a **Conflicts** binder folder, where the author merges them by hand ([KB](https://scrivener.tenderapp.com/help/kb/cloud-syncing/using-scrivener-with-cloud-sync-services), [iOS KB](https://scrivener.tenderapp.com/help/kb/ios/dropbox-syncing-with-ios)).
  - Online-only placeholders cause misleading errors. A partly downloaded package shows as "incompatible with this version" or "no binder … could be found". The fix is Dropbox "Make available offline" or OneDrive "Always keep on this device" ([Dropbox KB](https://scrivener.tenderapp.com/help/kb/cloud-syncing/errors-opening-projects-stored-on-dropbox), [OneDrive KB](https://scrivener.tenderapp.com/help/kb/cloud-syncing/onedrive-advisory-windows-8-and-11)). iCloud for Windows "is not an option", because it leaves "an empty container" ([KB](https://scrivener.tenderapp.com/help/kb/cloud-syncing/icloud-for-windows-advisory)).
  - Editing files from outside the app: "Please don't edit the contents of your project directly. You run a very high risk of corrupting the project" ([staff](https://forum.literatureandlatte.com/t/content-styles-and-notes-rtf-files/150180)).
    - "Sync with External Folder" exports numbered files for other editors. Renaming one breaks the round trip, and using the feature to sync two machines will "corrupt your project" ([staff](https://forum.literatureandlatte.com/t/sync-with-external-folder/23835)).
  - L&L's own fallback: zipped, date-stamped backups on close (on by default). Transferring a single zip "is more efficient and safer than transferring hundreds, if not thousands of internal project files" ([KB: alternative sync method](https://scrivener.tenderapp.com/help/kb/cloud-syncing/alternative-method-of-keeping-projects-synced)).

### 2.2 Ulysses

- **Library.** Everything lives in one library with three sections: iCloud (synced), On My Mac (local), and External Folders (local or cloud) ([help](https://help.ulysses.app/en_US/the-library/ulysses-library)). The iCloud library is hidden from the user ([sync help](https://help.ulysses.app/en_US/subscription-synchronization/synchronization-issues)).
- **Internal format.** This part is *[community]*, from a 2016 script ([ul_snapshot.py](https://raw.githubusercontent.com/goetzf/ulysses_snapshot/master/ul_snapshot.py)) that may be out of date.
  - Groups are folders named `*-ulgroup`. Each has an `Info.ulgroup` plist with `displayName` (the title is stored apart from the folder name) and `childOrder` (an order manifest).
  - Sheets are `*.ulysses` packages containing `Content.xml` and a `Media/` folder.
  - How sheets are ordered, whether names are UUIDs, and any format version are all **unverified**.
- **Ordering.** Each group is sorted Manually, By Title, By Modification Date or By Creation Date. Drag reordering works only in manual mode, and sort settings sync "seamlessly" only in the iCloud section ([help](https://help.ulysses.app/567894-sheets-groups)).
- **External folders** ([help](https://help.ulysses.app/en_US/the-library/external-folders)):
  - **Markdown mode** loses features: "you cannot attach notes, images or sheet-specific goals". Markdown XL markup is also lost.
  - **Native `.ulyz` mode** keeps all features, but other apps can't read the files.
  - The Dropbox guide recommends native mode ([help](https://help.ulysses.app/dropbox)).
- **Pain points:**
  - "Ulysses doesn't create automatic backups of external folders" ([help](https://help.ulysses.app/en_US/the-library/external-folders)).
  - OneDrive and Google Drive are not supported as external folders, because the provider must support iOS file-provider features.
  - Ulysses says iCloud Drive is "primarily a syncing mechanism rather than a reliable additional backup" ([backups](https://help.ulysses.app/en_US/the-library/backups)), and that it "cannot force a sync" ([sync issues](https://help.ulysses.app/en_US/subscription-synchronization/synchronization-issues)).
  - How Ulysses handles conflicts and outside edits is not documented (**unverified**).

### 2.3 Obsidian Longform plugin

- **Layout.** Each draft has one **index note**, marked by a `longform:` frontmatter key. A multi-scene project also has one `.md` note per scene in `sceneFolder` ([README](https://github.com/kevboh/longform/blob/main/README.md), [INDEX_FILE.md](https://github.com/kevboh/longform/blob/main/docs/INDEX_FILE.md)).
  - The index keys are `format: single|scenes`, `title`, `workflow` ("Do not edit"), `sceneFolder`, `scenes`, `sceneTemplate` and `ignoredFiles` (wildcards allowed).
  - A draft is a separate index with the same `title`.
- **Ordering.** The only record of order is the index's frontmatter `scenes:` array of scene names. Nesting is YAML list indentation and "does not need to correspond to actual file structure" ([MULTIPLE_SCENE_PROJECTS.md](https://github.com/kevboh/longform/blob/main/docs/MULTIPLE_SCENE_PROJECTS.md)).
- **IDs.** There are none. A scene is identified by its file name.
  - The rename handler rewrites the name in its slot with `processFrontMatter`.
  - New files in the scene folder become "unknown files" that the author must add or ignore ([store-vault-sync.ts](https://github.com/kevboh/longform/blob/main/src/model/store-vault-sync.ts)).
  - *Inference:* a rename that arrives through sync looks like a delete plus a create, so the scene loses its position.
- **Metadata.** Longform has no character or world model; those are ordinary vault notes. The README warns: "You should probably avoid editing the `longform` frontmatter in your index file directly" ([README](https://github.com/kevboh/longform/blob/main/README.md)).
- **Versioning.** 1.x tracked projects in plugin state (`.obsidian/plugins/longform/data.json`). That design caused "a class of bugs often filed and related to sync, multiple device use, etc." ([#35](https://github.com/kevboh/longform/issues/35)).
  - 2.0 moved to discovery by scanning index frontmatter, and a migration rewrote indexes and moved files ([migration doc](https://github.com/kevboh/longform/blob/main/docs/MIGRATING_FROM_VERSION_1_TO_2.md)).
  - The format version is still stored in plugin `data.json`, not in the project.
- **Pain point.** [#278](https://github.com/kevboh/longform/issues/278): the author edits a scene on an iPhone, iCloud syncs it, and on the desktop that scene drops out of the project and the whole order is scrambled. Reordering on the desktop is undone by the next mobile edit.
  - *Inference:* this is a single-manifest conflict between devices.
  - No fix appears in the thread.
- **Obsidian itself** ([sync help](https://obsidian.md/help/sync-notes), [Sync troubleshooting](https://obsidian.md/help/sync/troubleshoot)):
  - Don't sync one vault with two services at once.
  - Keep OneDrive and Google Drive files "Available Offline".
  - Obsidian Sync merges Markdown conflicts with diff-match-patch. Other files are last-writer-wins.
  - Per-vault app state is kept in a separate `.obsidian/` folder ([help](https://obsidian.md/help/configuration-folder)).

### 2.4 Manuskript

All claims here are from [load_save/version_1.py](https://github.com/olivierkes/manuskript/blob/develop/manuskript/load_save/version_1.py) unless noted.

- **Two modes.**
  - A single zip `.msk`.
  - Folder mode: a `.msk` file containing `1`, plus a sibling folder. The code's docstring says a zip "does not allow collaborative work, versioning, or third-party editing".
- **Folder layout.**
  - `MANUSKRIPT` (version marker), `infos.txt`, `summary.txt`, `labels.txt`, `status.txt`, `settings.txt` (JSON).
  - `characters/{ID}-{slug}.txt`.
  - An `outline/` tree of folders (each with a `folder.txt` for its metadata) and scene `.md` files.
  - `plots.xml` and `world.opml`, one monolithic file each.
  - An optional `revisions.xml`.
- **Ordering = filename prefix.** Each outline name is `"{ID}-{name}"`, where `ID = str(item.row()).zfill(len(str(siblings)))`. That is the row position zero-padded to the sibling count, not a stable ID. On load, paths are sorted as strings.
  - *Inference:* inserting, deleting or reordering renames every later sibling.
  - *Inference:* going from 9 to 10 siblings renames all of them (`0-` → `00-`).
  - Each rename is an `os.replace`, which means churn for a sync client.
  - [#1309](https://github.com/olivierkes/manuskript/issues/1309) reports a save crash after reorder or split: a locked file on Windows blocked "renaming prefixes".
- **IDs and metadata.** Each file starts with a MultiMarkdown-style header of `Key: value` lines, followed by the body. The header's `ID:` key survives across saves. Characters carry their ID in both the filename and the header.
- **Save.** An in-memory cache maps each path to the content last written there.
  - If the cache is empty, save runs `shutil.rmtree` on the project folder ("we wipe folder, just to be sure").
  - Otherwise it writes the changed files in place with `open(..., "wt")`. There is **no temp file and no rename**.
  - It deletes cached paths that are no longer in the project.
  - *Inference:* edits made outside the app are silently overwritten.
- **Versioning.** [loadSave.py](https://github.com/olivierkes/manuskript/blob/develop/manuskript/loadSave.py) routes a project to the v0 or v1 loader. There is no migration within v1.
- **Issues:**
  - Silent save failure after a backend crash, with edits lost ([#274](https://github.com/olivierkes/manuskript/issues/274)).
  - A crash mid-save corrupted the project permanently ([#352](https://github.com/olivierkes/manuskript/issues/352)).
  - Opening the same project on two machines via Syncthing broke it ([#472](https://github.com/olivierkes/manuskript/issues/472)).
  - No issue was found that directly ties Dropbox or OneDrive to the rename churn (**unverified** link).

### 2.5 bibisco (v2+, Electron)

- **Storage.** Each project is one LokiJS database saved as a single JSON file, `<projectsDir>/…/<projectUUID>/<projectUUID>.json`, with an `images/` folder beside it ([ProjectDbConnectionService.js](https://raw.githubusercontent.com/andreafeccomandi/bibisco/master/bibisco/app/services/ProjectDbConnectionService.js)).
  - The file's collections include chapters, scenes, main/secondary characters, locations, objects, strands, notes and more ([ProjectService.js](https://raw.githubusercontent.com/andreafeccomandi/bibisco/master/bibisco/app/services/ProjectService.js)).
  - An app-level `bibisco.json` in userData caches the list of projects ([BibiscoDbConnectionService.js](https://raw.githubusercontent.com/andreafeccomandi/bibisco/master/bibisco/app/services/BibiscoDbConnectionService.js)).
- **Revisions.** Each scene holds a `revisions[]` array and an active `revision` index, with the full text of every revision stored in the same file ([ChapterService.js](https://raw.githubusercontent.com/andreafeccomandi/bibisco/master/bibisco/app/services/ChapterService.js)).
- **Ordering.** Each item has an integer `position`, and moving an item shifts its neighbours. `checkCollectionPositions`/`fixCollectionPositions` detect and repair gaps ([CollectionUtilService.js](https://raw.githubusercontent.com/andreafeccomandi/bibisco/master/bibisco/app/services/CollectionUtilService.js)). *Inference:* positions have drifted in practice.
- **IDs.** The project gets a UUID v4. Items use LokiJS `$loki` integers, which are unique only within one collection.
- **Versioning.** The project records `bibiscoVersion`, and `checkProjectDbVersion()` adds new collections one release at a time.
  - v1 (Java/H2) is incompatible with v2 ([wiki FAQ](https://github.com/andreafeccomandi/bibisco/wiki/bibisco-version-2.X-FAQ:-Frequently-Asked-Question)).
  - A `.bibisco2` archive is a zip, and every project is exported as one at each start.
- **Pain points:**
  - The save is `fs.writeFileSync(dbname, dbstring)`, a non-atomic overwrite ([adapter](https://raw.githubusercontent.com/andreafeccomandi/bibisco/master/bibisco/app/adapters/lokijs/loki-fs-sync-adapter.js)). In [#240](https://github.com/andreafeccomandi/bibisco/issues/240) a crash zeroed the file, and the next start then "saved a NEW backup of BAD data overwriting the GOOD backup".
  - In [#358](https://github.com/andreafeccomandi/bibisco/issues/358), the cached project list in userData went stale across synced devices.
  - In v1, a Google Drive sync corrupted the H2 database ([#105](https://github.com/andreafeccomandi/bibisco/issues/105)), and a OneDrive folder broke project creation ([#116](https://github.com/andreafeccomandi/bibisco/issues/116)).
  - Cloud sync is left entirely to the user, who puts the projects directory inside Dropbox or a similar folder ([wiki FAQ](https://github.com/andreafeccomandi/bibisco/wiki/bibisco-version-2.X-FAQ:-Frequently-Asked-Question)).

---

## 3. What the sync services themselves do

These facts come from vendor docs and shape the failure modes above.

- **Dropbox conflicted copies.** Dropbox creates one when two edits race, when a file is edited offline, or when "a file is left open on another user's computer, which Dropbox saves as a new edit". "The editor's username, 'conflicted copy', and the save date will be added to the filename", and "The last version saved will always appear as the conflicted copy" ([Dropbox help](https://help.dropbox.com/organize/conflicted-copy)).
  - The "left open" case is exactly our forgotten-app-on-machine-A scenario.
- **OneDrive conflicts.** For files that are not Office documents, OneDrive keeps both copies and appends the **computer name**, e.g. `Scene-LAPTOP.md` (third-party descriptions only; **unverified** against Microsoft's own docs).
- **Online-only placeholders.** Dropbox online-only files and OneDrive Files On-Demand files are stubs until they are opened. Opening one triggers a download. OneDrive Storage Sense can turn files back into online-only files automatically ([Dropbox](https://help.dropbox.com/sync/make-files-online-only), [Microsoft](https://support.microsoft.com/en-us/office/save-disk-space-with-onedrive-files-on-demand-for-windows-0e6860d3-d9f3-4971-b321-7092438fb38e)).
  - Scrivener's misleading "incompatible version" errors come from this.
- **Names that won't sync.**
  - OneDrive rejects `" * : < > ? / \ |` in names, leading or trailing spaces, `.lock`, `CON`/`PRN`/`AUX`/`NUL`/`COM0-9`/`LPT0-9`, `desktop.ini`, `_vti_` anywhere in a name, and names starting with `~$` ([Microsoft](https://support.microsoft.com/en-us/office/restrictions-and-limitations-in-onedrive-and-sharepoint-64883a5d-228e-48f5-b3d2-eb39e07630fa)).
  - Dropbox ignores `desktop.ini`, `thumbs.db`, `.ds_store`, `~$`/`.~` temp files and symlinks ([Dropbox](https://help.dropbox.com/sync/files-not-syncing)).
  - Windows names are case-insensitive, may not end in a space or period, and have a 260-character path limit unless long paths are enabled ([Microsoft Learn](https://learn.microsoft.com/en-us/windows/win32/fileio/naming-a-file)).
  - A file named `.lock` would never sync to OneDrive.

---

## 4. Cross-cutting patterns

**Ordering**

| Approach | Used by | What went wrong |
|---|---|---|
| Filename prefixes | Manuskript | A reorder renames many files. Variable-width padding renames everything. Renames fail on Windows file locks and cause sync churn |
| Frontmatter list in one note | Longform | Stored by name, so a rename or a partial sync drops or scrambles scenes (#278) |
| Integer position field | bibisco | Positions drift, and a repair routine was needed |
| Manifest of IDs | Scrivener `.scrivx`, Ulysses `childOrder` *[community]* | Works well. The manifest is a single hotspot and must be written atomically and backed up (Scrivener keeps `binder.backup`/`autosave`) |

The manifest-of-IDs approach is the one that has held up. For us, a manifest that orders Chapters and Scenes by ID is the proven shape. It should be small, deterministic and line-oriented, so that a conflicted copy can be diffed by eye.

**Stable identifiers.** Every tool that lacks stable IDs (Longform) or uses positional or per-collection counters (Manuskript prefixes, bibisco `$loki`, Scrivener 2 integers) paid for it. The pattern to copy is Scrivener 3's UUID per item, plus two checks when loading a project:

- validate each UUID as a safe path segment
- check that no UUID appears twice

Putting the ID inside the file too (Manuskript's `ID:` header) means a moved or renamed file can still be matched to its item.

**Format versioning.**

- Keep the version marker **in the Project folder**, not in app or plugin state. Longform 1.x's plugin-state tracking caused a whole class of sync bugs.
- Migrate forward in steps (bibisco's per-version steps).
- Treat an upgrade as a one-way step that keeps the original (Scrivener).
- Refuse to open a newer format rather than risk damaging it.

**Crash safety.** Both open-source tools write in place (Manuskript `open("wt")`, bibisco `writeFileSync`), and both have data-loss issues.

- Write a temp file in the same folder, then rename it over the original.
- Never blanket-delete (`rmtree`) on save.
- Rotate backups: a backup made at startup must not overwrite the last good one (bibisco #240).

**Sync and editing outside the app.**

- A lock file that travels through Dropbox or OneDrive only gives advice, and it arrives late (Scrivener). What matters is detecting a conflict when it happens:
  - notice files changed on disk
  - recognise `conflicted copy` and `-<COMPUTERNAME>` siblings
  - surface them to the Author instead of dropping them (Scrivener's Conflicts folder)
- Fine granularity keeps a conflict local to one Scene or one Entry. bibisco's single file makes every conflict a conflict over the whole book. Manuskript's monolithic `world.opml` and `plots.xml` do the same for the world and plot notes.
- Keep per-machine state (window layout, recent Projects, caches, search indexes) **out of the synced folder**, or in a clearly separate subfolder that the app can regenerate:
  - Obsidian keeps its per-vault state in `.obsidian/`.
  - bibisco #358 shows the opposite failure: cached project metadata in userData went stale across devices.
- Detect placeholder or partly downloaded files and report them accurately.

---

## 5. Pitfalls to avoid (checklist for the layout decision)

1. Don't encode order in file names, and don't use file names or titles as identity.
2. Don't keep the whole Manuscript or Story Bible in one file (bibisco), or in one XML/OPML file per kind (Manuskript).
3. Don't write in place, don't `rmtree` on save, and don't let a startup backup overwrite the last good one.
4. Don't store project facts (the format version, the project list as truth) outside the Project folder.
5. Don't rely on a lock file to prevent conflicts across Dropbox or OneDrive. Detect conflicts instead.
6. Don't create names OneDrive or Windows reject: reserved names, `.lock`, `~$…`, trailing dots or spaces, names differing only by case, long paths. Name files by ID or a safe slug.
7. Don't show "incompatible format" when the real problem is an online-only placeholder or a partial sync.
8. Don't silently overwrite a file that changed on disk since the app last read it.
