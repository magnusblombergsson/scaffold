import { expect, test, type ElectronApplication } from '@playwright/test';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { answerDialogs, chooseMenu, launch, useTempDir } from './app';

const tempDir = useTempDir();

/** The Scene file's restricted Markdown, after its frontmatter. */
async function sceneMarkdown(projectPath: string): Promise<string> {
  const scenes = path.join(projectPath, 'scenes');
  const [file] = await readdir(scenes);
  const text = await readFile(path.join(scenes, file), 'utf8');
  return text.replace(/^---\n[\s\S]*?\n---\n/, '').trim();
}

test('italic, bold, typographic quotes and pasted Prose survive a restart', async () => {
  const projectPath = path.join(tempDir(), 'My Novel');

  const first = await launch(tempDir());
  await answerDialogs(first, projectPath);
  const page = await first.firstWindow();
  await page.getByRole('button', { name: 'New Project…' }).click();
  await expect(page.getByLabel('Prose')).toBeFocused();

  await page.keyboard.type('"She ');
  await page.keyboard.press('ControlOrMeta+i');
  await page.keyboard.type('never');
  await page.keyboard.press('ControlOrMeta+i');
  await page.keyboard.type(' said ');
  await page.keyboard.press('ControlOrMeta+b');
  await page.keyboard.type('that');
  await page.keyboard.press('ControlOrMeta+b');
  await page.keyboard.type('," -- or so.');
  await page.keyboard.press('Enter');
  await first.evaluate(({ clipboard, ClipboardItem }) =>
    clipboard.write([
      new ClipboardItem({
        'text/html':
          '<h1>Heading</h1><p><u>Under</u> <a href="x">linked</a> <em>kept</em></p>',
        'text/plain': 'Heading Under linked kept',
      }),
    ]),
  );
  await page.keyboard.press('ControlOrMeta+v');
  await expect(page.getByLabel('Prose').locator('p')).toHaveCount(3);
  await first.close();

  expect(await sceneMarkdown(projectPath)).toBe(
    '“She *never* said **that**,” — or so.\n\nHeading\n\nUnder linked *kept*',
  );

  const second = await launch(tempDir());
  const reopened = await second.firstWindow();
  const prose = reopened.getByLabel('Prose');
  await expect(prose.locator('p')).toHaveText([
    '“She never said that,” — or so.',
    'Heading',
    'Under linked kept',
  ]);
  await expect(prose.locator('em')).toHaveText(['never', 'kept']);
  await expect(prose.locator('strong')).toHaveText(['that']);
  await second.close();
});

test('a Project made Swedish is spellchecked and typeset in Swedish, after a restart too', async () => {
  const projectPath = path.join(tempDir(), 'Min roman');

  const first = await launch(tempDir());
  await answerDialogs(first, projectPath);
  const page = await first.firstWindow();
  await page.getByRole('button', { name: 'New Project…' }).click();
  const prose = page.getByLabel('Prose');
  await expect(prose).toBeFocused();
  await page.keyboard.type(`"Late," she said.`);
  await expect(prose).toHaveAttribute('lang', 'en-US');

  await chooseMenu(first, ['Tools', 'Project Settings…']);
  const settings = page.getByRole('dialog');
  await settings.getByLabel('Prose language').selectOption('Swedish');
  await settings.getByRole('button', { name: 'Close' }).click();
  await expect(settings).toBeHidden();
  // The Scene's editor is made anew in Swedish, where the cursor was.
  const swedish = page.getByRole('main').getByLabel('Prose');
  await expect(swedish).toHaveAttribute('lang', 'sv-SE');
  await expect(swedish).toBeFocused();
  await page.keyboard.press('Enter');
  await page.keyboard.type(`"Det är sent," sa hon -- 'för sent.'`);
  const typed = ['“Late,” she said.', '”Det är sent,” sa hon – ’för sent.’'];
  await expect(swedish.locator('p')).toHaveText(typed);
  await expect
    .poll(async () => {
      const manifestPath = path.join(projectPath, 'project.json');
      return JSON.parse(await readFile(manifestPath, 'utf8')).language;
    })
    .toBe('sv-SE');
  await first.close();

  const second = await launch(tempDir());
  const reopened = await second
    .firstWindow()
    .then((p) => p.getByLabel('Prose'));
  await expect(reopened).toBeFocused();
  await expect(reopened).toHaveAttribute('lang', 'sv-SE');
  await expect(reopened.locator('p')).toHaveText(typed);
  if (process.platform !== 'darwin') {
    expect(
      await second.evaluate(({ session }) =>
        session.defaultSession.getSpellCheckerLanguages(),
      ),
      // Chromium keeps its Swedish dictionary as plain `sv`.
    ).toEqual([expect.stringMatching(/^sv\b/)]);
  }
  await second.close();
});

/** Whether an item of the menu bar, by its labels, can be chosen. */
function menuEnabled(app: ElectronApplication, labels: string[]) {
  return app.evaluate(({ Menu }, labels) => {
    let items = Menu.getApplicationMenu()?.items ?? [];
    let item: Electron.MenuItem | undefined;
    for (const label of labels) {
      item = items.find((i) => i.label === label);
      items = item?.submenu?.items ?? [];
    }
    return item?.enabled ?? false;
  }, labels);
}

test('the Author block quotes paragraphs with Ctrl+Shift+B and formats from the Format menu while in the Prose', async () => {
  const projectPath = path.join(tempDir(), 'My Novel');
  const app = await launch(tempDir());
  await answerDialogs(app, projectPath);
  const page = await app.firstWindow();
  await page.getByRole('button', { name: 'New Project…' }).click();
  const prose = page.getByLabel('Prose');
  await expect(prose).toBeFocused();

  await page.keyboard.type('She read:');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Come home.');
  await page.keyboard.press('ControlOrMeta+Shift+B');
  // A paragraph started within a quote is quoted too.
  await page.keyboard.press('Enter');
  await page.keyboard.type('Now.');
  await expect(prose.locator('p.block-quote')).toHaveText([
    'Come home.',
    'Now.',
  ]);

  await expect
    .poll(() => menuEnabled(app, ['Format', 'Block Quote']))
    .toBe(true);
  await chooseMenu(app, ['Format', 'Block Quote'], page);
  await expect(prose.locator('p.block-quote')).toHaveText(['Come home.']);
  // Selected by the editor itself: a selection the browser makes, as with
  // Shift+Home, reaches the editor only once the browser says it changed.
  await page.keyboard.press('ControlOrMeta+a');
  await chooseMenu(app, ['Format', 'Bold'], page);
  await expect(prose.locator('strong')).toHaveText([
    'She read:',
    'Come home.',
    'Now.',
  ]);

  // Elsewhere, the Format menu is off.
  await page.getByLabel('Outline', { exact: true }).click();
  await expect.poll(() => menuEnabled(app, ['Format', 'Bold'])).toBe(false);
  await app.close();

  expect(await sceneMarkdown(projectPath)).toBe(
    '**She read:**\n\n> **Come home.**\n\n**Now.**',
  );
});

test('the Author aligns paragraphs with Ctrl+Shift+E, R and L, Ctrl+Shift+R included in a packaged build, and from the Format menu', async () => {
  const projectPath = path.join(tempDir(), 'My Novel');
  const app = await launch(tempDir());
  await answerDialogs(app, projectPath);
  const page = await app.firstWindow();
  await page.getByRole('button', { name: 'New Project…' }).click();
  const prose = page.getByLabel('Prose');
  await expect(prose).toBeFocused();

  // A packaged build has no Reload to take Ctrl+Shift+R.
  expect(
    await app.evaluate(({ Menu }) =>
      Menu.getApplicationMenu()!
        .items.flatMap((item) => item.submenu?.items ?? [])
        .map((item) => item.role)
        .filter((role) => role && /reload|devtools/i.test(role)),
    ),
  ).toEqual([]);

  await page.keyboard.type('The End');
  await page.keyboard.press('ControlOrMeta+Shift+E');
  const centred = prose.locator('p[style*="text-align: center"]');
  const right = prose.locator('p[style*="text-align: right"]');
  await expect(centred).toHaveText(['The End']);
  await page.keyboard.press('ControlOrMeta+Shift+R');
  await expect(right).toHaveText(['The End']);
  await expect(centred).toHaveCount(0);
  // The current alignment again returns it to left.
  await page.keyboard.press('ControlOrMeta+Shift+R');
  await expect(right).toHaveCount(0);
  await page.keyboard.press('ControlOrMeta+Shift+E');
  await page.keyboard.press('ControlOrMeta+Shift+L');
  await expect(centred).toHaveCount(0);

  await page.keyboard.press('Enter');
  await page.keyboard.type('Signed.');
  await expect
    .poll(() => menuEnabled(app, ['Format', 'Align Right']))
    .toBe(true);
  await chooseMenu(app, ['Format', 'Align Right'], page);
  await expect(right).toHaveText(['Signed.']);
  await page.keyboard.press('ControlOrMeta+a');
  await chooseMenu(app, ['Format', 'Align Centre'], page);
  await expect(centred).toHaveText(['The End', 'Signed.']);
  await app.close();

  expect(await sceneMarkdown(projectPath)).toBe(
    '{.centre} The End\n\n{.centre} Signed.',
  );
});
