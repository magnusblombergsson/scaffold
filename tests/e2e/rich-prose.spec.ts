import { expect, test } from '@playwright/test';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { answerDialogs, chooseProseLanguage, launch, useTempDir } from './app';

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

  await chooseProseLanguage(first, 'Swedish');

  // The Scene's editor is made anew in Swedish, where the cursor was.
  const swedish = page.getByLabel('Prose');
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
