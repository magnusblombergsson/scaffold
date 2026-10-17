import {
  expect,
  test,
  type ElectronApplication,
  type Page,
} from '@playwright/test';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  addAnthropicKey,
  answerDialogs,
  launch,
  roomButton,
  useTempDir,
} from './app';
import { useFakeAnthropic } from './fake-anthropic';

const tempDir = useTempDir();
const anthropic = useFakeAnthropic();

const block = (json: object) =>
  `\`\`\`proposal\n${JSON.stringify(json)}\n\`\`\``;

/** The theme the window sees, and a fixed size for the screenshots. */
async function setUp(
  app: ElectronApplication,
  page: Page,
  theme: 'light' | 'dark',
) {
  await page.emulateMedia({ colorScheme: theme });
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0].setContentSize(1400, 820);
  });
}

/**
 * A new Project with Prose in Scene 1 of Chapter 1, a second Chapter
 * “Storm”, and a key for the fake Anthropic; resolves with the ids of the
 * Chapters as `project.json` holds them.
 */
async function newProject(theme: 'light' | 'dark') {
  const projectPath = path.join(tempDir(), 'My Novel');
  const app = await launch(tempDir(), { anthropicUrl: anthropic.url });
  await answerDialogs(app, projectPath);
  const page = await app.firstWindow();
  await setUp(app, page, theme);
  await page.getByRole('button', { name: 'New Project…' }).click();
  await page.getByLabel('Prose').pressSequentially('Anna packed in the rain.');
  await page.getByRole('button', { name: 'New Chapter' }).click();
  await page.getByLabel('Title').fill('Storm');
  await page.keyboard.press('Enter');
  await addAnthropicKey(page);
  await page.keyboard.press('ControlOrMeta+s');
  const manifest = JSON.parse(
    await readFile(path.join(projectPath, 'project.json'), 'utf8'),
  ) as { tree: { chapters: { id: string }[] } };
  const [one, storm] = manifest.tree.chapters.map((c) => c.id);
  return { app, page, projectPath, chapters: { one, storm } };
}

for (const theme of ['light', 'dark'] as const) {
  test(`a Plan from Find a structure draws an Outline Proposal in the tree, decided there, and changes focus, ${theme}`, async () => {
    const { app, page, projectPath, chapters } = await newProject(theme);
    try {
      await page.keyboard.press('ControlOrMeta+5');
      await expect(roomButton(page, 'Plan')).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      const room = page.getByRole('main', { name: 'Plan' });
      const panel = page.getByRole('complementary', {
        name: 'Plan Conversation',
      });
      const tree = room.getByRole('region', { name: 'Outline tree' });
      const chapterOne = tree.getByRole('listitem', {
        name: 'Chapter “Chapter 1”',
      });
      await expect(room.getByRole('combobox', { name: 'Focus' })).toHaveValue(
        'open',
      );
      await expect(
        tree
          .getByRole('listitem', { name: 'Scene “Scene 1”' })
          .getByLabel('Holds Prose'),
      ).toBeVisible();
      await expect(
        tree.getByRole('listitem', { name: 'Chapter “Storm”' }),
      ).toBeVisible();

      anthropic.calls.push({
        reply: [
          'What is the turn at the end of the first Chapter?\n\n',
          block({ outline: chapters.one, value: '- Anna leaves the island.' }),
        ],
      });
      await panel.getByRole('button', { name: 'Find a structure' }).click();
      await expect(panel.getByRole('article', { name: 'You' })).toHaveText(
        'Find a structure',
      );
      const reply = panel.getByRole('article', { name: 'Assistant' });
      await expect(reply.locator('.message-text')).toHaveText(
        'What is the turn at the end of the first Chapter?',
      );
      const system = JSON.stringify(anthropic.sent[0].system);
      expect(system).toContain('In Plan');
      expect(system).toContain(
        'The Plan’s focus, as the Author set it: the whole story',
      );
      expect(system).not.toContain('Anna packed in the rain.');
      expect(JSON.stringify(anthropic.sent[0].messages)).toContain(
        'Help me find a structure',
      );

      // The reply lists its Proposal as a link that highlights its unit.
      const link = reply
        .getByRole('list', { name: 'Proposals' })
        .getByRole('button', { name: 'Chapter “Chapter 1” › Outline' });
      await link.click();
      await expect(chapterOne).toHaveAttribute('data-lit', 'true');
      const card = chapterOne.getByRole('region', {
        name: 'Proposal: Chapter “Chapter 1” › Outline',
      });
      await expect(card).toBeVisible();
      await expect(page).toHaveScreenshot(`plan-room-${theme}.png`, {
        mask: [page.locator('.save-status'), page.locator('.toasts')],
      });

      // Accepted in the tree, it offers Undo, which puts it back.
      await card.getByRole('button', { name: 'Accept' }).click();
      await expect(chapterOne.locator('> .plan-outline')).toHaveText(
        '- Anna leaves the island.',
      );
      await card.getByRole('button', { name: 'Undo' }).click();
      await expect(card.getByRole('button', { name: 'Accept' })).toBeVisible();
      await expect(chapterOne.locator('> .plan-outline')).toHaveText(
        'No Outline.',
      );

      // The focus changes within the Conversation.
      await room
        .getByRole('combobox', { name: 'Focus' })
        .selectOption({ label: ' Chapter “Storm”' });
      await expect(panel.getByRole('note')).toHaveText([
        'Focus: The whole story',
        'Focus: Chapter “Storm”',
      ]);
      anthropic.calls.push({ reply: ['What happens in the storm?'] });
      await panel.getByRole('textbox', { name: 'Message' }).fill('Go on.');
      await panel.getByRole('button', { name: 'Send' }).click();
      await expect(
        panel.getByRole('article', { name: 'Assistant' }),
      ).toHaveCount(2);
      expect(JSON.stringify(anthropic.sent[1].system)).toContain(
        `the Chapter “Storm”, Id: ${chapters.storm}`,
      );

      const dir = path.join(projectPath, 'conversations');
      const [log] = await readdir(dir);
      const events = (await readFile(path.join(dir, log), 'utf8'))
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line) as Record<string, unknown>);
      expect(events[0]).toMatchObject({ mode: 'plan' });
      expect(
        events.filter((e) => e.type === 'focusChanged').map((e) => e.focus),
      ).toEqual([{ kind: 'open' }, { kind: 'chapter', id: chapters.storm }]);
    } finally {
      await app.close();
    }
  });
}

for (const theme of ['light', 'dark'] as const) {
  test(`a Plan from Check my plan sends its fixed request, and the Plan Conversation is listed, ${theme}`, async () => {
    const { app, page } = await newProject(theme);
    try {
      await roomButton(page, 'Plan').click();
      const panel = page.getByRole('complementary', {
        name: 'Plan Conversation',
      });
      anthropic.calls.push({ reply: ['The second Chapter has no Outline.'] });
      await panel.getByRole('button', { name: 'Check my plan' }).click();
      await expect(
        panel.getByRole('article', { name: 'Assistant' }),
      ).toHaveCount(1);
      await expect(panel.getByRole('article', { name: 'You' })).toHaveText(
        'Check my plan',
      );
      expect(JSON.stringify(anthropic.sent[0].messages)).toContain(
        'Check the plan within the focus',
      );
      await expect(
        page
          .getByRole('navigation', { name: 'Plan Conversations' })
          .getByRole('button', { name: /^Check my plan/ }),
      ).toContainText('The whole story');
    } finally {
      await app.close();
    }
  });
}

for (const theme of ['light', 'dark'] as const) {
  test(`the Book details are set with a click, and the structure guide follows a Structure and a Genre convention, ${theme}`, async () => {
    const { app, page, projectPath } = await newProject(theme);
    try {
      await roomButton(page, 'Plan').click();
      const strip = page.getByRole('region', { name: 'Book details' });
      const guide = page.getByRole('region', { name: 'Structure guide' });
      const header = async () =>
        readFile(path.join(projectPath, 'outlines', 'project.md'), 'utf8');

      await strip.getByRole('button', { name: 'Literary' }).click();
      await strip
        .getByRole('combobox', { name: 'Format' })
        .selectOption('short-story');
      await expect(
        strip.getByRole('button', { name: 'Literary' }),
      ).toHaveAttribute('aria-pressed', 'true');
      await expect.poll(header).toContain('bookFormat: short-story');
      expect(await header()).toMatch(/genres:\s*(- |\[)literary/);

      // Fitting a literary short story: Freytag first, the rest less usual.
      await strip.getByRole('button', { name: 'About Structures…' }).click();
      await expect(guide).toBeInViewport();
      await expect(guide.locator('details > summary').first()).toHaveText(
        'Freytag’s pyramid',
      );
      await expect(guide).toContainText('Less usual for this Book');
      await guide.locator('summary', { hasText: 'Kishōtenketsu' }).click();
      await guide.getByRole('button', { name: 'Follow this' }).click();

      await expect(
        strip.getByRole('combobox', { name: 'Structure' }),
      ).toHaveValue('kishotenketsu');
      await expect(
        guide.getByRole('article', { name: 'Kishōtenketsu' }),
      ).toContainText('Not marked');
      await guide.locator('summary', { hasText: 'Fantasy' }).click();
      await guide.getByRole('button', { name: 'Follow too' }).click();
      await expect(
        strip.getByRole('button', { name: 'Fantasy (promises before payoff)' }),
      ).toHaveAttribute('aria-pressed', 'true');
      await expect.poll(header).toContain('structure: kishotenketsu');
      expect(await header()).toMatch(/genreConventions:\s*(- |\[)fantasy/);

      await strip
        .getByRole('combobox', { name: 'Structure' })
        .selectOption('none');
      await expect(guide).toContainText('This Book follows no set Structure.');
      await expect(page).toHaveScreenshot(`plan-book-details-${theme}.png`, {
        mask: [page.locator('.save-status'), page.locator('.toasts')],
      });
    } finally {
      await app.close();
    }
  });
}
