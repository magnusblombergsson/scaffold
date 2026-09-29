# Safe writes and sync-folder behaviour in Electron

Research for [#17](https://github.com/magnusblombergsson/writing-tools/issues/17) (part of [#15](https://github.com/magnusblombergsson/writing-tools/issues/15)). Gathered 2026-09-29.

Versions checked:

- libuv v1.x (1.53.1)
- write-file-atomic 8.0.0
- atomically 2.1.1
- chokidar 5.0.0
- @parcel/watcher 2.6.0 (VS Code pins ^2.5.6)

**Question:** What does an Electron (Node) app need to do so that writes to a Project folder are crash-safe and behave well inside Dropbox, OneDrive and iCloud sync folders, on Windows and macOS? The scenario to keep in mind: the Author works on several computers one after another and may forget to close the app on one of them.

Claims are cited to primary sources. Anything marked **(inference)** is our reasoning, not a vendor statement. Anything marked **UNCONFIRMED** could not be traced to a first-party source.

## Summary

| Topic | Finding |
|---|---|
| Write pattern | Write a temp file in the same directory, `FileHandle.sync()`, close, then `rename` over the target. On Windows, retry the rename on EPERM/EBUSY/EACCES. On macOS, also fsync the parent directory. Windows cannot fsync a directory. |
| Library | `write-file-atomic` does the basics but refuses to retry on Windows (#227, closed as not planned). `atomically` retries every step. VS Code and graceful-fs use a hand-rolled retry: 10 ms steps up to 100 ms, 60 s budget. |
| Dropbox conflict | Makes a "conflicted copy" with the editor's name and the date. **The last-saved version becomes the conflicted copy.** Dropbox names "a file left open on another computer" with auto-save as a cause. |
| OneDrive conflict | Non-Office files: the online version keeps the name, and the local copy gets `-DEVICENAME` appended (e.g. `Report-JOHNS-SURFACE.txt`). Only Office files get merge UI. |
| iCloud conflict | Picks a winner automatically. Losing versions go through `NSFileVersion`. In Finder, copies kept by the user get " 2" suffixes. What a non-coordinating Node app sees is UNCONFIRMED. |
| Placeholders | All three clients hydrate transparently on read. Reads can be slow, and on Windows they can fail if the user blocked the app from hydrating. "Always keep on this device" / "Keep Downloaded" pins a folder. |
| Partial sync | No client offers multi-file transactions. Files arrive one by one, so a Project can be seen half-synced. |
| Watching | Watch the Project **directory** recursively, never single files. Treat events as hints: coalesce delete+create into a change, then re-stat. Use `@parcel/watcher` (VS Code's choice) or chokidar 5. Tell own writes from external ones with a recorded `{mtime, size, hash}` per file. |
| Lock files | Not viable as a real lock. They sync with delay, can go online-only, can become conflicted copies, and go stale when a machine sleeps. OneDrive refuses to sync a file named `.lock`. At most, use an advisory "last opened on X" marker, and base correctness on a stat/hash check before every save. |

## 1. Atomic write pattern

### Rename semantics

- **Node:** "In the case that `newPath` already exists, it will be overwritten." The docs make no platform distinction. [Node fs.rename](https://nodejs.org/api/fs.html#fsrenameoldpath-newpath-callback)
- **libuv on Windows** implements rename as `MoveFileExW(old, new, MOVEFILE_REPLACE_EXISTING)`. It adds no write-through flag and no retry. [libuv src/win/fs.c `fs__rename`](https://github.com/libuv/libuv/blob/v1.x/src/win/fs.c)
- **Microsoft never calls MoveFileEx "atomic".** Across volumes it falls back to copy+delete, so the temp file must be in the same directory as the target. [MoveFileExW](https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-movefileexw)
- **ReplaceFileW** keeps the original's ACLs and streams, but the result takes the replacement's file ID, and it has messy partial-failure codes (1175–1177). We see no reason to prefer it. [ReplaceFileW](https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-replacefilew)

### Durability

- **Windows:** `fsync`/`fdatasync` map to `FlushFileBuffers`, which needs a handle with `GENERIC_WRITE`.
  - Sources: [libuv win/fs.c](https://github.com/libuv/libuv/blob/v1.x/src/win/fs.c), [FlushFileBuffers](https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-flushfilebuffers)
  - As a result, fsync on a directory throws EPERM on Windows. [nodejs/node#3879](https://github.com/nodejs/node/issues/3879)
  - Skip directory fsync on win32.
- **macOS:** libuv's fsync tries `fcntl(F_FULLFSYNC)` first, then `F_BARRIERFSYNC`, then `fsync()`. The source notes that "Apple's fdatasync and fsync explicitly do NOT flush the drive write cache".
  - Sources: [libuv src/unix/fs.c](https://github.com/libuv/libuv/blob/v1.x/src/unix/fs.c), [fsync(2)](https://developer.apple.com/library/archive/documentation/System/Conceptual/ManPages_iPhoneOS/man2/fsync.2.html)
  - So `FileHandle.sync()` is a full flush. Opening the parent directory read-only and calling `sync()` makes the rename durable **(inference from source)**.

### Transient EPERM/EBUSY/EACCES on Windows

Antivirus software, the Search indexer and sync clients briefly hold files open, which makes rename fail on Windows.

- **graceful-fs** retries rename on win32 for these three codes for up to 60 s. Backoff grows by 10 ms per try, capped at 100 ms. [graceful-fs polyfills.js](https://github.com/isaacs/node-graceful-fs/blob/main/polyfills.js)
- **VS Code** has its own `renameWithRetry` with the same policy: "On Windows, a rename can fail when either source or target is locked by AV software." [vscode pfs.ts](https://github.com/microsoft/vscode/blob/main/src/vs/base/node/pfs.ts)
- **write-file-atomic** issue #227, "EPERM on Windows: fs.rename fails due to transient file locks (no retry)", was closed as NOT_PLANNED on 2026-03-04. [npm/write-file-atomic#227](https://github.com/npm/write-file-atomic/issues/227)

### Libraries

**write-file-atomic 8.0.0** ([lib/index.js](https://github.com/npm/write-file-atomic/blob/main/lib/index.js)):

- Temp file is named `file.<hash>`.
- Copies mode and owner from the existing file.
- fsyncs the temp file, but not the directory.
- Uses a plain `fs.rename` with no retry.
- Removes the temp file on failure and on process exit.
- Serialises writes per path inside one process only (multi-process EPERM: [#28](https://github.com/npm/write-file-atomic/issues/28)).

**atomically 2.1.1** ([repo](https://github.com/fabiospampinato/atomically)):

- Runs every step through `stubborn-fs`, which retries EMFILE/ENFILE/EAGAIN/EBUSY/EACCES/EPERM. The async default is a 7.5 s budget at 200 ms intervals. [stubborn-fs](https://github.com/fabiospampinato/stubborn-fs)
- Serialises writes per path.

**VS Code's `doWriteFileAtomic`:** writes a temp file, then renames it with the retry above, then deletes the temp file if the rename fails. [diskFileSystemProvider.ts](https://github.com/microsoft/vscode/blob/main/src/vs/platform/files/node/diskFileSystemProvider.ts)

### Temp-file naming in sync folders

- **Dropbox** never syncs temp files that "often start with a ~$… or .~". [Dropbox: files not syncing](https://help.dropbox.com/sync/files-not-syncing)
- **OneDrive:**
  - does not sync `.tmp` files;
  - blocks names that start with `~$`;
  - blocks the name `.lock`.

  [OneDrive restrictions](https://support.microsoft.com/en-us/office/restrictions-and-limitations-in-onedrive-and-sharepoint-64883a5d-228e-48f5-b3d2-eb39e07630fa)
- **Recommendation (inference):** give temp files a `.tmp` suffix (e.g. `.<name>.<rand>.tmp`) so neither client uploads a half-written file. Have the watcher ignore them, and sweep leftovers on open.

## 2. Sync clients: conflicts, placeholders, partial syncs

### Dropbox

- **When conflicts happen.** [Dropbox: conflicted copy](https://help.dropbox.com/organize/conflicted-copy) lists three causes: simultaneous edits; offline edits; and "A file is left open on another user's computer, which Dropbox saves as a new edit". The last is our forgotten-app case.
- **Naming.** "The editor's username, 'conflicted copy', and the save date will be added to the filename." The exact pattern, commonly `name (Author's conflicted copy YYYY-MM-DD).ext`, is **UNCONFIRMED**.
- **Which copy wins the name.** "The last version saved will always appear as the conflicted copy". So the version that synced first keeps the original name.
- **Placeholders.**
  - Online-only files download when opened. [Make files online-only](https://help.dropbox.com/sync/make-files-online-only)
  - On macOS, Dropbox now runs on File Provider under `~/Library/CloudStorage/`. Files not marked "available offline" may be made online-only automatically when disk space is low. [macOS File Provider changes](https://help.dropbox.com/installs/macos-support-for-expected-changes)
- **Ignoring files.** Set the `com.dropbox.ignored` stream/xattr on Windows. On File Provider, use `com.apple.fileprovider.ignore#P`. An ignored item is deleted from the server and other devices. [Ignored files](https://help.dropbox.com/sync/ignored-files)

### OneDrive

- **Conflicts** ([sync troubleshooting](https://learn.microsoft.com/en-us/troubleshoot/sharepoint/sync/troubleshoot-sync-issues)).
  - For non-Office files, "OneDrive automatically keeps both versions. The online version keeps the original file name… the copy on your computer has your device name appended… such as Report-JOHNS-SURFACE.txt."
  - The merge/"Save a Copy" UI applies to Office files only. The page is for work/school accounts; that personal accounts behave the same is **UNCONFIRMED**.
- **Files On-Demand, Windows.**
  - Uses the Cloud Files API. Placeholders "automatically hydrate… without additional code changes". [Build a cloud file sync engine](https://learn.microsoft.com/en-us/windows/win32/cfapi/build-a-cloud-file-sync-engine)
  - Slow hydration shows progress UI. The user can **block an app** from hydrating in the background, and then reads fail.
  - Detection attributes: `FILE_ATTRIBUTE_RECALL_ON_DATA_ACCESS` (0x00400000), `PINNED` (0x00080000), `UNPINNED` (0x00100000). [File attribute constants](https://learn.microsoft.com/en-us/windows/win32/fileio/file-attribute-constants)
  - Node's `fs.stat` does not expose these attributes **(inference)**.
  - "Always keep on this device" pins a folder, including new files in it. [Files On-Demand for Windows](https://support.microsoft.com/en-us/office/save-disk-space-with-onedrive-files-on-demand-for-windows-0e6860d3-d9f3-4971-b321-7092438fb38e)
- **Files On-Demand, macOS.**
  - Uses File Provider and cannot be turned off from macOS 12.1. [Fix Files On-Demand on macOS 12.1+](https://support.microsoft.com/en-us/office/fix-onedrive-files-on-demand-issues-on-macos-12-1-or-later-8c99b82e-bf6e-4bb1-a3df-d0cc5bcbff93)
  - "New files created online or on another device appear as online-only files." [Files On-Demand for Mac](https://support.microsoft.com/en-us/office/save-disk-space-with-onedrive-files-on-demand-for-mac-529f6d53-e572-4922-a585-e7a318c135f0)

### iCloud Drive

- **Conflicts.** iCloud "resolves them automatically by picking up a winning version and keeping the other changes in a losing version", reached through `NSFileVersion`. Apple wants all file access to go through `NSFileCoordinator`, which a Node app cannot do without native code. [TN2336](https://developer.apple.com/library/archive/technotes/tn2336/_index.html)
- **What the user sees.** A dialog to choose versions. Versions the user keeps get numbered names ("Seven Wonders 2"). [Mac Help: iCloud conflicts](https://support.apple.com/en-gb/guide/mac-help/mh40780/mac)
- **What a non-coordinating app sees is UNCONFIRMED.**
- **Evicted files.** "Dataless objects are fully transparent… Reads trigger downloads", and the read blocks until the download finishes. The system evicts files least-recently-used first when disk space is urgently needed. [WWDC21 10182](https://developer.apple.com/videos/play/wwdc2021/10182/)
- **Keep Downloaded** prevents eviction. [Mac Help](https://support.apple.com/en-gb/guide/mac-help/mchl1a02d711/mac)
- **Other UNCONFIRMED items:** the `.nosync` suffix, and details from TN3150 (`SF_DATALESS`).

### Partial and multi-file sync

- None of the vendors documents multi-file transactions. Dropbox's Nucleus engine promises per-mutation consistency and atomic moves only. [Dropbox tech blog: Nucleus](https://dropbox.tech/infrastructure/rewriting-the-heart-of-our-sync-engine)
- **Consequence (inference):** on machine B, a Project can briefly hold new Scene files next to an old index, or the reverse.
  - The app must tolerate references to files that are missing or not yet updated.
  - It must tolerate unparseable, half-arrived content; treat that as "still syncing, retry" rather than corruption.
  - A layout where each file is self-describing and there are few cross-file invariants makes this easier.
- **Rename-over changes the file's inode/ID.** No primary source says how the sync clients treat that. Test it on each client.

## 3. File watching

### Node `fs.watch`

[Node fs caveats](https://nodejs.org/api/fs.html#caveats):

- Backends: FSEvents on macOS and ReadDirectoryChangesW on Windows. `recursive` works on both.
- `filename` may be null.
- A per-file watch on macOS/Linux follows the **inode**. After the first atomic save it is watching a deleted file. [Node fs: inodes](https://nodejs.org/api/fs.html#inodes)
- Too low-level to use directly.

### chokidar 5

[chokidar](https://github.com/paulmillr/chokidar):

- ESM-only, Node 20+. v4 dropped globs and the bundled fsevents.
- `atomic` turns delete+re-add within 100 ms into a `change` event.
- `awaitWriteFinish` polls file size until it is stable. The README says "use with caution".

### @parcel/watcher 2.6

[@parcel/watcher](https://github.com/parcel-bundler/watcher):

- Native, recursive. Uses FSEvents on macOS and ReadDirectoryChangesW on Windows.
- Coalesces events per file; "renames cause two events".
- `writeSnapshot`/`getEventsSince` can report changes made while the app was closed. On Windows this is a brute-force scan, and there are open Windows unicode/snapshot bugs (#118, #211).
- **VS Code uses it** ([package.json](https://github.com/microsoft/vscode/blob/main/package.json), [v1.62 notes](https://code.visualstudio.com/updates/v1_62#_file-watching-changes)). VS Code adds on top:
  - a 75 ms collection delay;
  - coalescing that turns delete+create into a change;
  - automatic restart after errors.

  [parcelWatcher.ts](https://github.com/microsoft/vscode/blob/main/src/vs/platform/files/node/watcher/parcel/parcelWatcher.ts), [watcher.ts](https://github.com/microsoft/vscode/blob/main/src/vs/platform/files/common/watcher.ts)

### Telling own writes from external ones

VS Code's pattern, in [files.ts](https://github.com/microsoft/vscode/blob/main/src/vs/platform/files/common/files.ts) and [fileService.ts](https://github.com/microsoft/vscode/blob/main/src/vs/platform/files/common/fileService.ts):

- It computes an etag from mtime and size.
- Before a write, it checks whether the file on disk has a newer mtime and a different etag. If so, it compares content, and fails with `FILE_MODIFIED_SINCE` only if the content really differs. That failure drives its "file changed on disk" UI.
- It uses size as well as mtime because "relying only on the mtime check has proven to produce false positives… especially around remote file systems".

**Recommendation:**

- After each save, record `{mtime, size, sha}` per file.
- When a watcher event arrives, re-stat. If the stat matches the record, the event was our own write. Otherwise hash; if the hash still matches, ignore the event; if not, it is an external change.
- Run the same check before every save.
- On Project open, compare against a stored manifest. That catches changes made while the app was closed, with no dependency on `getEventsSince`.

## 4. Detecting "Project open on another machine": lock files

- **No lock-file guidance.** None of the three vendors gives first-party guidance on app lock files. They sync such files like any other file, except reserved names:
  - OneDrive will not sync `.lock` or `~$*`;
  - Dropbox skips `~$*` and `.~*`, so Office owner files never propagate;
  - Dropbox on File Provider cannot sync InDesign lock files ([macOS changes](https://help.dropbox.com/installs/macos-support-for-expected-changes)).
- **Why a synced lock fails as a mutex (inference):**
  - it arrives late, or not at all while machine A is asleep or offline;
  - it can itself become a conflicted or `-DEVICENAME` copy;
  - it goes stale when the app crashes or the laptop lid closes;
  - it can be made online-only.

  So in exactly our scenario, machine B cannot trust that a missing lock means "not open elsewhere". A present lock may be days old.
- **What is viable (inference):** an **advisory session marker**. This is a small per-machine file (e.g. `.writing-tools/sessions/<machineId>.json` holding host name, app start time and a heartbeat timestamp refreshed every few minutes).
  - Each machine writes only its own file, so the markers themselves never conflict.
  - On open, B can warn: "This Project was open on LAPTOP-A (last active 3 min ago)."
  - The marker is a warning only. Correctness must come from the stat/hash check before each save, plus not overwriting a file whose on-disk version changed since we loaded it.
- **The forgotten-app case.** A, still running, must never blindly autosave over edits that arrived from B. With the pre-save check, A sees that the file changed externally and does not overwrite it. A then reloads the file (if A had no unsaved edits to it) or flags a conflict. If A did write first, Dropbox and OneDrive would keep both versions as conflict copies. So the app should also look for conflict-copy files on open and surface them.

## Open gaps (needs an empirical spike)

- How Dropbox, OneDrive and iCloud treat rename-over (file-ID change) during an in-flight upload.
- The exact Dropbox conflicted-copy string, and iCloud's on-disk behaviour for non-coordinating apps.
- Reading Windows placeholder attributes from Node without a native addon (e.g. via a small N-API module or `fsutil`).
