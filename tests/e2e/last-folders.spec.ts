import { expect, test, type ElectronApplication } from '@playwright/test';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  answerQuestions,
  chooseExport,
  chooseMenu,
  launch,
  useTempDir,
} from './app';

const tempDir = useTempDir();

/**
 * Answers the next open and save dialogs with `answer`, or cancels them with
 * null, and returns a function that lists where each one opened.
 */
async function recordDialogs(app: ElectronApplication, answer: string | null) {
  await app.evaluate(({ dialog }, answer) => {
    const opened: (string | null)[] = [];
    (globalThis as { opened?: (string | null)[] }).opened = opened;
    const record = (args: unknown[]) => {
      const options = args.at(-1) as { defaultPath?: string };
      opened.push(options.defaultPath ?? null);
    };
    dialog.showOpenDialog = (async (...args: unknown[]) => {
      record(args);
      return { canceled: answer === null, filePaths: answer ? [answer] : [] };
    }) as typeof dialog.showOpenDialog;
    dialog.showSaveDialog = (async (...args: unknown[]) => {
      record(args);
      return { canceled: answer === null, filePath: answer ?? '' };
    }) as typeof dialog.showSaveDialog;
  }, answer);
  return () =>
    app.evaluate(
      () => (globalThis as { opened?: (string | null)[] }).opened ?? [],
    );
}

/** Writes a small grey PNG at `imagePath`. */
async function writeImage(app: ElectronApplication, imagePath: string) {
  const png = await app.evaluate(({ nativeImage }) =>
    nativeImage
      .createFromBitmap(Buffer.alloc(8 * 8 * 4, 0x80), { width: 8, height: 8 })
      .toPNG()
      .toString('base64'),
  );
  await mkdir(path.dirname(imagePath), { recursive: true });
  await writeFile(imagePath, Buffer.from(png, 'base64'));
}

test('each kind of file dialog opens where one of its kind was last confirmed, after a restart too', async () => {
  const novels = path.join(tempDir(), 'Novels');
  const tavern = path.join(tempDir(), 'Pics', 'Tavern');
  const exports = path.join(tempDir(), 'Exports');
  await mkdir(novels);
  await mkdir(exports);
  const first = await launch(tempDir());
  const page = await first.firstWindow();
  await answerQuestions(first, 0);

  // Before any, the Project dialog opens wherever the OS chooses.
  let opened = await recordDialogs(first, path.join(novels, 'My Novel'));
  await page.getByRole('button', { name: 'New Project…' }).click();
  await expect(page.getByLabel('Prose')).toBeFocused();
  expect(await opened()).toEqual([null]);

  const binder = page.getByRole('navigation', { name: 'Manuscript' });
  const scene = binder.getByRole('button', { name: 'Scene 1', exact: true });
  await writeImage(first, path.join(tavern, 'x.png'));
  opened = await recordDialogs(first, path.join(tavern, 'x.png'));
  await scene.click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Add image…' }).click();
  await scene.click({ button: 'right' });
  await expect(
    page.getByRole('menuitem', { name: 'Replace image…' }),
  ).toBeVisible();
  await page.keyboard.press('Escape');

  // Cancelling leaves the folder as it was.
  opened = await recordDialogs(first, null);
  await scene.click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Replace image…' }).click();
  expect(await opened()).toEqual([tavern]);

  // The Export's file keeps its name, in the folder last exported to.
  opened = await recordDialogs(first, path.join(exports, 'Draft.docx'));
  await chooseExport(first, page);
  await expect
    .poll(() => existsSync(path.join(exports, 'Draft.docx')))
    .toBe(true);
  // Before any Export, in Documents.
  const [firstExport] = await opened();
  expect(path.basename(firstExport ?? '')).toBe('My Novel.docx');
  expect(path.dirname(firstExport ?? '')).not.toBe(exports);
  await first.close();

  const second = await launch(tempDir());
  const reopened = await second.firstWindow();
  await expect(reopened.getByLabel('Prose')).toBeVisible();
  await answerQuestions(second, 0);

  opened = await recordDialogs(second, null);
  const again = reopened
    .getByRole('navigation', { name: 'Manuscript' })
    .getByRole('button', { name: 'Scene 1', exact: true });
  await again.click({ button: 'right' });
  await reopened.getByRole('menuitem', { name: 'Replace image…' }).click();
  await expect.poll(opened).toEqual([tavern]);

  opened = await recordDialogs(second, null);
  await chooseExport(second, reopened);
  await expect.poll(opened).toEqual([path.join(exports, 'My Novel.docx')]);

  opened = await recordDialogs(second, null);
  await chooseMenu(second, ['File', 'Open Project…']);
  await expect.poll(opened).toEqual([novels]);
  await second.close();
});
