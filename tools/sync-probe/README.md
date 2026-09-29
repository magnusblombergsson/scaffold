# Sync probe (throwaway)

Checklist for [Hands-on test: sync clients vs rename-over saves and conflicts](https://github.com/magnusblombergsson/writing-tools/issues/22). It exercises our save pattern inside OneDrive (personal) on two Windows PCs and records what the client does.

- **A** is this PC (`DESKTOP-7LMMOCE`).
- **B** is the other PC. It needs Node 20+ and the same OneDrive account.

`P` is the probe folder, `%OneDrive%\sync-probe`. Every command writes a report to `P\_reports\`, and the reports sync back to A. Wait for the OneDrive tray icon to show "up to date" wherever a step says **settle**.

Run every command from a terminal opened in `P`: `cd /d "%OneDrive%\sync-probe"`, then `node _tool\sync-probe.mjs ...` (shortened to `probe ...` below). The run takes about 30 minutes.

## 0. Setup (A)

1. `node <repo>\tools\sync-probe\sync-probe.mjs setup "%OneDrive%\sync-probe"`
2. `probe snapshot . A-0`, then **settle**.
3. On B, wait until `P` has appeared, then run `probe snapshot . B-0`. This shows whether new files arrive on B as online-only placeholders.

## 1. Is a rename-over save an edit? (A saves, B watches)

1. On B, run `probe watch . 240 B-1`. Leave it running.
2. On A, run `probe save . scenes\scene.md edit-1`. Wait 60 s. Repeat as `edit-2`, wait 60 s, then `edit-3`.
3. When B's watch ends, run `probe snapshot . B-1` on B.
4. On onedrive.live.com, open `sync-probe/scenes/scene.md` → **Version history**.
   - Note how many versions are listed. 4 means each save was an edit; 1 means the history was lost.
   - Check the OneDrive **Recycle bin**. Deleted `scene.md` entries would mean delete + create.
   - Screenshot both.

## 2. Saves during an upload (A)

1. On A, run `probe burst . 20 500`. This writes 20 saves of a 20 MB file, 0.5 s apart.
2. **Settle** both machines.
3. On B, run `probe snapshot . B-2`.
   - Check that `scenes\big.md` starts with `burst-20`.
   - Check that no `.tmp` file or `big-<DEVICE>.md` copy appeared on either machine or on the web.
4. On A, run `probe snapshot . A-2`.

## 3. The forgotten app: conflict copies (both)

1. On A, open the OneDrive tray → **Pause syncing → 2 hours**. This simulates a laptop that went offline with the app still open.
2. On A, make the edits a stale app would make:
   - `probe save . scenes\scene.md A-stale`
   - `probe save . project.json A-stale`
   - `probe append . conversations\conv.jsonl A-stale`
3. On B, make the other computer's edits, then **settle** B:
   - `probe save . scenes\scene.md B-fresh`
   - `probe save . project.json B-fresh`
   - `probe append . conversations\conv.jsonl B-fresh`
4. On A, run `probe watch . 180 A-3`, then **Resume syncing** on A. **Settle** both machines.
5. Run `probe snapshot . A-3` on A and `probe snapshot . B-3` on B.
   - Write down every new file name. Which copy kept the original name: A's or B's?
   - Note any notification OneDrive showed.

## 4. Hand back

Tell the agent the run is done, and paste or attach:

- the screenshots from step 1.4;
- any OneDrive notifications you saw.

The agent reads `P\_reports\` on A itself. Delete `P` afterwards.
