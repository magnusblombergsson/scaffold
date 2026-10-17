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
      await expect.poll(header).toContain('structure: none');
      await expect(page).toHaveScreenshot(`plan-book-details-${theme}.png`, {
        mask: [page.locator('.save-status'), page.locator('.toasts')],
      });
    } finally {
      await app.close();
    }
  });
}

for (const theme of ['light', 'dark'] as const) {
  test(`a Scene is marked with Beats in its details, shown as chips and pins on the Beat rail, and set aside when the Book stops following them, ${theme}`, async () => {
    const { app, page, projectPath } = await newProject(theme);
    try {
      const manifest = JSON.parse(
        await readFile(path.join(projectPath, 'project.json'), 'utf8'),
      ) as { tree: { chapters: { scenes: { id: string }[] }[] } };
      const sceneId = manifest.tree.chapters[0].scenes[0].id;
      const header = async () =>
        readFile(path.join(projectPath, 'outlines', `${sceneId}.md`), 'utf8');
      await roomButton(page, 'Plan').click();
      const strip = page.getByRole('region', { name: 'Book details' });
      const tree = page.getByRole('region', { name: 'Outline tree' });
      const details = page.getByRole('complementary', { name: 'Details' });
      const rail = page.getByRole('region', { name: 'Beat rail' });
      const guide = page.getByRole('region', { name: 'Structure guide' });
      const scene = tree
        .getByRole('listitem', { name: 'Chapter “Chapter 1”' })
        .getByRole('listitem', { name: 'Scene “Scene 1”' });

      await strip
        .getByRole('combobox', { name: 'Structure' })
        .selectOption('three-act');
      await strip.getByRole('button', { name: 'Mystery (fair play)' }).click();
      await scene.locator('.plan-row').click();
      const beats = details.getByRole('region', { name: 'Beats' });
      await expect(beats).toContainText(
        /Falls at 0–\d+% of the Book, by Scene order/,
      );
      // Each box shows the mark as saved, once it is.
      await beats.getByRole('checkbox', { name: /^Setup/ }).click();
      await expect(
        beats.getByRole('checkbox', { name: /^Setup/ }),
      ).toBeChecked();
      await beats.getByRole('checkbox', { name: /^The crime/ }).click();
      await expect(
        beats.getByRole('checkbox', { name: /^The crime/ }),
      ).toBeChecked();

      await expect.poll(header).toMatch(/beats:\s*(- |\[)three-act\/setup/);
      expect(await header()).toContain('mystery/crime');
      await expect(
        scene.getByRole('list', { name: 'Beats' }).getByRole('listitem'),
      ).toHaveText(['Setup', 'The crime']);
      await expect(rail).toContainText('Measured by Scene order');
      await expect(
        rail
          .getByRole('list', { name: 'Structure' })
          .getByRole('listitem', { name: 'Setup' })
          .getByRole('button', { name: 'Scene “Scene 1”' }),
      ).toBeVisible();
      await expect(
        rail
          .getByRole('list', { name: 'Genre conventions' })
          .getByRole('listitem', { name: 'The crime' })
          .getByRole('button', { name: 'Scene “Scene 1”' }),
      ).toBeVisible();
      await expect(
        guide.getByRole('article', { name: 'Three-act' }),
      ).toContainText('Marked on “Scene 1”');
      await expect(page).toHaveScreenshot(`plan-beats-${theme}.png`, {
        mask: [page.locator('.save-status'), page.locator('.toasts')],
      });

      // Following another Structure sets the Three-act mark aside, unseen
      // and unwritten; following it again brings it back.
      await strip
        .getByRole('combobox', { name: 'Structure' })
        .selectOption('save-the-cat');
      await expect(
        scene.getByRole('list', { name: 'Beats' }).getByRole('listitem'),
      ).toHaveText(['The crime']);
      await expect(
        beats.getByRole('checkbox', { name: /^Setup/ }),
      ).not.toBeChecked();
      expect(await header()).toContain('three-act/setup');
      await strip
        .getByRole('combobox', { name: 'Structure' })
        .selectOption('three-act');
      await expect(
        scene.getByRole('list', { name: 'Beats' }).getByRole('listitem'),
      ).toHaveText(['Setup', 'The crime']);

      await beats.getByRole('checkbox', { name: /^The crime/ }).click();
      await expect.poll(header).not.toContain('mystery/crime');
      expect(await header()).toContain('three-act/setup');
    } finally {
      await app.close();
    }
  });
}

for (const theme of ['light', 'dark'] as const) {
  test(`a Scene's Beats show as chips on its Corkboard card and Overview row, never in the Binder, and choosing one opens Plan on it, ${theme}`, async () => {
    const { app, page, chapters } = await newProject(theme);
    try {
      await roomButton(page, 'Plan').click();
      const room = page.getByRole('main', { name: 'Plan' });
      const strip = room.getByRole('region', { name: 'Book details' });
      const tree = room.getByRole('region', { name: 'Outline tree' });
      const details = page.getByRole('complementary', { name: 'Details' });
      const sceneRow = tree
        .getByRole('listitem', { name: 'Chapter “Chapter 1”' })
        .getByRole('listitem', { name: 'Scene “Scene 1”' })
        .locator('.plan-row');
      await strip
        .getByRole('combobox', { name: 'Structure' })
        .selectOption('three-act');
      await strip.getByRole('button', { name: 'Mystery (fair play)' }).click();
      await sceneRow.click();
      const beats = details.getByRole('region', { name: 'Beats' });
      for (const beat of [/^Setup/, /^The crime/]) {
        await beats.getByRole('checkbox', { name: beat }).click();
        await expect(beats.getByRole('checkbox', { name: beat })).toBeChecked();
      }
      // Leaving the Scene unselected shows that Writing selects it.
      await tree
        .getByRole('listitem', { name: 'Chapter “Storm”' })
        .locator('.plan-row')
        .first()
        .click();
      await expect(sceneRow).toHaveAttribute('aria-pressed', 'false');
      // A Plan about the whole story is open; opening Plan on the Scene
      // shows a new one instead, the other kept in the list.
      const panel = page.getByRole('complementary', {
        name: 'Plan Conversation',
      });
      anthropic.calls.push({ reply: ['Where does it turn?'] });
      await panel
        .getByRole('textbox', { name: 'Message' })
        .fill('Look at the whole story.');
      await panel.getByRole('button', { name: 'Send' }).click();
      await expect(panel).toContainText('Where does it turn?');

      // On the Chapter's Corkboard, the Scene's card shows its Beats, to
      // choose and nothing to set; the Binder stays plain.
      await roomButton(page, 'Writing').click();
      await page
        .getByRole('button', { name: 'Chapter 1', exact: true })
        .click();
      const card = page.getByRole('article', { name: 'Scene 1' });
      const chips = card.getByRole('list', { name: 'Beats' });
      await expect(chips.getByRole('listitem')).toHaveText([
        'Setup',
        'The crime',
      ]);
      await expect(card.getByRole('checkbox')).toHaveCount(0);
      await expect(
        page.locator('.left-pane').getByRole('list', { name: 'Beats' }),
      ).toHaveCount(0);
      await expect(page).toHaveScreenshot(
        `writing-beats-corkboard-${theme}.png`,
        { mask: [page.locator('.save-status'), page.locator('.toasts')] },
      );

      // Choosing one opens Plan, the Scene's Chapter the focus and the
      // Scene selected.
      await chips.getByRole('button', { name: 'Setup' }).click();
      await expect(room).toBeVisible();
      await expect(room.getByRole('combobox', { name: 'Focus' })).toHaveValue(
        `chapter:${chapters.one}`,
      );
      await expect(sceneRow).toHaveAttribute('aria-pressed', 'true');
      await expect(panel).not.toContainText('Where does it turn?');
      await expect(
        page
          .getByRole('navigation', { name: 'Plan Conversations' })
          .getByRole('button', { name: /^Look at the whole story/ }),
      ).toBeVisible();

      // The Scene's row in the Overview pane shows them too, and opens Plan
      // the same way.
      await tree
        .getByRole('listitem', { name: 'Chapter “Storm”' })
        .locator('.plan-row')
        .first()
        .click();
      await roomButton(page, 'Writing').click();
      await page.getByRole('button', { name: 'Scene 1', exact: true }).click();
      await page.getByRole('button', { name: 'Overview', exact: true }).click();
      const overview = page.getByRole('complementary', {
        name: 'Overview',
        exact: true,
      });
      const row = overview.getByRole('region', {
        name: 'Scene 1',
        exact: true,
      });
      await expect(
        row.getByRole('list', { name: 'Beats' }).getByRole('listitem'),
      ).toHaveText(['Setup', 'The crime']);
      await expect(page).toHaveScreenshot(
        `writing-beats-overview-${theme}.png`,
        { mask: [page.locator('.save-status'), page.locator('.toasts')] },
      );
      await row.getByRole('button', { name: 'The crime' }).click();
      await expect(room).toBeVisible();
      await expect(room.getByRole('combobox', { name: 'Focus' })).toHaveValue(
        `chapter:${chapters.one}`,
      );
      await expect(sceneRow).toHaveAttribute('aria-pressed', 'true');
    } finally {
      await app.close();
    }
  });
}

for (const theme of ['light', 'dark'] as const) {
  test(`Plan is sent the Book's details and the shortlisted catalogue, proposes a Structure and Genre conventions as cards with ghost values in the strip, and is asked about an entry in full, ${theme}`, async () => {
    const { app, page } = await newProject(theme);
    try {
      await roomButton(page, 'Plan').click();
      const strip = page.getByRole('region', { name: 'Book details' });
      const guide = page.getByRole('region', { name: 'Structure guide' });
      const panel = page.getByRole('complementary', {
        name: 'Plan Conversation',
      });
      const structure = strip.getByRole('combobox', { name: 'Structure' });
      await strip.getByRole('button', { name: 'Literary' }).click();
      await strip
        .getByRole('combobox', { name: 'Format' })
        .selectOption('short-story');
      await expect(
        strip.getByRole('button', { name: 'Literary' }),
      ).toHaveAttribute('aria-pressed', 'true');

      anthropic.calls.push({
        reply: [
          'Freytag’s pyramid suits a literary short story, with Horror’s rules if it turns dark.\n\n',
          block({ structure: 'freytag' }),
          '\n\n',
          block({ genreConventions: ['horror'] }),
        ],
      });
      await panel.getByRole('button', { name: 'Find a structure' }).click();
      const reply = panel.getByRole('article', { name: 'Assistant' });
      await expect(reply.locator('.message-text')).toContainText(
        'Freytag’s pyramid suits',
      );
      const system = JSON.stringify(anthropic.sent[0].system);
      expect(system).toContain('Genres: Literary (literary)');
      expect(system).toContain('Id: freytag');
      expect(system).toContain('Hero’s Journey (heros-journey)');
      expect(system).not.toContain('Joseph Campbell');

      const structureCard = reply.getByRole('region', {
        name: 'Proposal: The Book › Structure',
      });
      const conventionsCard = reply.getByRole('region', {
        name: 'Proposal: The Book › Genre conventions',
      });
      await expect(structureCard).toContainText('Freytag’s pyramid');
      await expect(conventionsCard).toContainText('Horror');
      await expect(
        strip.getByRole('button', { name: 'Proposed: Freytag’s pyramid' }),
      ).toBeVisible();
      await expect(
        strip.getByRole('button', { name: 'Proposed: Horror' }),
      ).toBeVisible();
      await expect(page).toHaveScreenshot(
        `plan-book-detail-proposals-${theme}.png`,
        { mask: [page.locator('.save-status'), page.locator('.toasts')] },
      );

      // Accepted, the Book follows it and the ghost goes; Undo brings both back.
      await structureCard.getByRole('button', { name: 'Accept' }).click();
      await expect(structure).toHaveValue('freytag');
      await expect(
        strip.getByRole('button', { name: 'Proposed: Freytag’s pyramid' }),
      ).toHaveCount(0);
      await structureCard.getByRole('button', { name: 'Undo' }).click();
      await expect(structure).toHaveValue('');
      await expect(
        strip.getByRole('button', { name: 'Proposed: Freytag’s pyramid' }),
      ).toBeVisible();

      // Changed since, it is stale: accepted anyway, it replaces the value.
      await structure.selectOption('fichtean');
      await expect(structureCard).toContainText(
        'Structure has changed since this was proposed.',
      );
      await structureCard
        .getByRole('button', { name: 'Accept anyway' })
        .click();
      await expect(structure).toHaveValue('freytag');

      await conventionsCard.getByRole('button', { name: 'Reject' }).click();
      await expect(conventionsCard).toContainText('Rejected');
      await expect(
        strip.getByRole('button', { name: 'Proposed: Horror' }),
      ).toHaveCount(0);

      // Asked about in the guide, a less usual Structure is sent in full.
      anthropic.calls.push({ reply: ['It is long for a short story.'] });
      await guide.locator('summary', { hasText: 'Hero’s Journey' }).click();
      await guide
        .locator('details[open]')
        .getByRole('button', { name: 'Ask Plan about it' })
        .click();
      await expect(
        panel.getByRole('article', { name: 'Assistant' }),
      ).toHaveCount(2);
      expect(JSON.stringify(anthropic.sent[1].messages)).toContain(
        'Tell me about Hero’s Journey for this Book.',
      );
      expect(JSON.stringify(anthropic.sent[1].system)).toContain(
        'Joseph Campbell',
      );
    } finally {
      await app.close();
    }
  });
}

for (const theme of ['light', 'dark'] as const) {
  test(`Plan sees a Scene's Beats and proposes its whole list, drawn as dashed chips in the tree and in its details, decided under the Scene, ${theme}`, async () => {
    const { app, page, projectPath } = await newProject(theme);
    try {
      const manifest = JSON.parse(
        await readFile(path.join(projectPath, 'project.json'), 'utf8'),
      ) as { tree: { chapters: { scenes: { id: string }[] }[] } };
      const sceneId = manifest.tree.chapters[0].scenes[0].id;
      const header = async () =>
        readFile(path.join(projectPath, 'outlines', `${sceneId}.md`), 'utf8');
      await roomButton(page, 'Plan').click();
      const strip = page.getByRole('region', { name: 'Book details' });
      const tree = page.getByRole('region', { name: 'Outline tree' });
      const details = page.getByRole('complementary', { name: 'Details' });
      const panel = page.getByRole('complementary', {
        name: 'Plan Conversation',
      });
      const scene = tree
        .getByRole('listitem', { name: 'Chapter “Chapter 1”' })
        .getByRole('listitem', { name: 'Scene “Scene 1”' });
      await strip
        .getByRole('combobox', { name: 'Structure' })
        .selectOption('three-act');
      await expect(
        strip.getByRole('combobox', { name: 'Structure' }),
      ).toHaveValue('three-act');

      anthropic.calls.push({
        reply: [
          'Scene 1 sets up Anna’s world.\n\n',
          block({ scene: sceneId, beats: ['three-act/setup'] }),
        ],
      });
      await panel.getByRole('textbox', { name: 'Message' }).fill('Mark it.');
      await panel.getByRole('button', { name: 'Send' }).click();
      const reply = panel.getByRole('article', { name: 'Assistant' });
      await expect(reply.locator('.message-text')).toContainText('sets up');
      expect(JSON.stringify(anthropic.sent[0].system)).toContain(
        'Beats: none marked',
      );

      const chips = scene.getByRole('list', { name: 'Beats' });
      await expect(chips.locator('.beat-chip-added')).toHaveText(['Setup']);
      const card = scene.getByRole('region', {
        name: 'Proposal: Scene “Scene 1” › Beats',
      });
      await expect(card).toContainText('Setup');
      await scene.locator('.plan-row').click();
      const beats = details.getByRole('region', { name: 'Beats' });
      await expect(beats.locator('.scene-beat-proposed')).toHaveText([
        'Proposed',
      ]);
      await expect(page).toHaveScreenshot(`plan-beats-proposal-${theme}.png`, {
        mask: [page.locator('.save-status'), page.locator('.toasts')],
      });

      // Accepted, the mark is the Scene's; Undo takes it away again.
      await card.getByRole('button', { name: 'Accept' }).click();
      await expect(
        beats.getByRole('checkbox', { name: /^Setup/ }),
      ).toBeChecked();
      await expect(chips.locator('.beat-chip-added')).toHaveCount(0);
      await expect.poll(header).toContain('three-act/setup');
      await card.getByRole('button', { name: 'Undo' }).click();
      await expect(
        beats.getByRole('checkbox', { name: /^Setup/ }),
      ).not.toBeChecked();
      await expect(chips.locator('.beat-chip-added')).toHaveText(['Setup']);
    } finally {
      await app.close();
    }
  });
}

for (const theme of ['light', 'dark'] as const) {
  test(`a Brainstorm of the Book is brought into a new Plan from the picker, marked in the thread with its size, sent with each request, and removed, ${theme}`, async () => {
    const { app, page } = await newProject(theme);
    try {
      await roomButton(page, 'Brainstorm').click();
      const brainstormRoom = page.getByRole('main', { name: 'Brainstorm' });
      anthropic.calls.push({ reply: ['Rob the lighthouse at low tide.'] });
      await brainstormRoom
        .getByRole('textbox', { name: 'Message' })
        .fill('A heist on the island?');
      await brainstormRoom
        .getByRole('textbox', { name: 'Message' })
        .press('Enter');
      await expect(
        brainstormRoom.getByRole('article', { name: 'Assistant' }),
      ).toHaveCount(1);

      await roomButton(page, 'Plan').click();
      const panel = page.getByRole('complementary', {
        name: 'Plan Conversation',
      });
      await panel
        .getByRole('button', { name: /Bring in a Brainstorm/ })
        .click();
      const choice = panel
        .getByRole('menu', { name: 'Brainstorms' })
        .getByRole('menuitem', { name: /A heist on the island\?/ });
      await expect(choice).toContainText(/≈ \d+ tokens/);
      await choice.click();

      const marker = panel.getByRole('note').filter({ hasText: 'Brought in' });
      await expect(marker).toContainText(
        /Brought in: A heist on the island\? · ≈ \d+ tokens/,
      );
      await expect(
        page
          .getByRole('navigation', { name: 'Plan Conversations' })
          .getByRole('button', {
            name: /^Plan from “A heist on the island\?”/,
          }),
      ).toBeVisible();
      // Brought in all the way, it is offered no more until it goes on.
      await panel
        .getByRole('button', { name: /Bring in a Brainstorm/ })
        .click();
      await expect(choice).toBeDisabled();
      await expect(choice).toContainText('Brought in');
      await page.keyboard.press('Escape');
      await expect(page).toHaveScreenshot(`plan-bring-in-${theme}.png`, {
        mask: [page.locator('.save-status'), page.locator('.toasts')],
      });

      anthropic.calls.push({ reply: ['The heist could be the midpoint.'] });
      await panel.getByRole('button', { name: 'Check my plan' }).click();
      await expect(
        panel.getByRole('article', { name: 'Assistant' }),
      ).toHaveCount(1);
      const sent = JSON.stringify(anthropic.sent.at(-1)!.system);
      expect(sent).toContain('## Brainstorm “A heist on the island?”');
      expect(sent).toContain('Rob the lighthouse at low tide.');

      await marker.getByRole('button', { name: 'Remove' }).click();
      await expect(
        panel.getByRole('note').filter({ hasText: 'Removed' }),
      ).toContainText('Removed: A heist on the island?');
      anthropic.calls.push({ reply: ['Fine.'] });
      await panel.getByRole('textbox', { name: 'Message' }).fill('And now?');
      await panel.getByRole('textbox', { name: 'Message' }).press('Enter');
      await expect(
        panel.getByRole('article', { name: 'Assistant' }),
      ).toHaveCount(2);
      expect(JSON.stringify(anthropic.sent.at(-1)!.system)).not.toContain(
        'Rob the lighthouse',
      );
    } finally {
      await app.close();
    }
  });
}

for (const theme of ['light', 'dark'] as const) {
  test(`Plan is sent Word targets, and its Word target and Notes Proposals show inline in the tree, decided there, ${theme}`, async () => {
    const { app, page, projectPath, chapters } = await newProject(theme);
    try {
      await page.keyboard.press('ControlOrMeta+5');
      const room = page.getByRole('main', { name: 'Plan' });
      const panel = page.getByRole('complementary', {
        name: 'Plan Conversation',
      });
      const tree = room.getByRole('region', { name: 'Outline tree' });
      const story = tree.getByRole('listitem', { name: 'My Novel' });
      const storm = tree.getByRole('listitem', { name: 'Chapter “Storm”' });

      anthropic.calls.push({
        reply: [
          'About 80,000 words, then; I noted why the storm comes first.\n\n',
          block({ wordTarget: 'project', words: 80_000 }),
          '\n\n',
          block({ wordTarget: chapters.storm, words: 4_000 }),
          '\n\n',
          block({
            notes: chapters.storm,
            append: '- The storm comes first: the Author wants Anna trapped.',
          }),
        ],
      });
      await panel
        .getByRole('textbox', { name: 'Message' })
        .fill(
          'About 80,000 words. The storm comes first: I want Anna trapped.',
        );
      await panel.getByRole('button', { name: 'Send' }).click();
      await expect(
        panel.getByRole('article', { name: 'Assistant' }),
      ).toBeVisible();

      // Drawn in place: the Word target beside the one it replaces, the Notes under the Outline.
      await expect(
        story.locator('> .plan-row').getByLabel('Word target, proposed'),
      ).toHaveText('None 80,000 words');
      await expect(
        room
          .getByRole('region', { name: 'Book details' })
          .getByRole('button', { name: 'Proposed: 80,000 words' }),
      ).toBeVisible();
      await expect(storm.getByLabel('Notes, proposed')).toHaveText(
        '- The storm comes first: the Author wants Anna trapped.',
      );
      await expect(page).toHaveScreenshot(
        `plan-word-target-notes-${theme}.png`,
        { mask: [page.locator('.save-status'), page.locator('.toasts')] },
      );

      const targetCard = story.getByRole('region', {
        name: 'Proposal: The Manuscript › Word target',
      });
      await targetCard.getByRole('button', { name: 'Accept' }).click();
      await expect(
        story.locator('> .plan-row').getByLabel('Word target'),
      ).toHaveText('80,000 words');

      const notesCard = storm.getByRole('region', {
        name: 'Proposal: Chapter “Storm” › Notes',
      });
      await notesCard.getByRole('button', { name: 'Edit…' }).click();
      await notesCard
        .getByLabel('Edited value')
        .fill('- The storm comes first: Anna is trapped.');
      await notesCard.getByRole('button', { name: 'Append edited' }).click();
      await expect(notesCard).toContainText('Appended (edited)');
      await notesCard.getByRole('button', { name: 'Undo' }).click();
      await expect(
        notesCard.getByRole('button', { name: 'Append' }),
      ).toBeVisible();

      // The next request sends the Word targets now held.
      anthropic.calls.push({ reply: ['Noted.'] });
      await panel.getByRole('textbox', { name: 'Message' }).fill('Go on.');
      await panel.getByRole('button', { name: 'Send' }).click();
      await expect(
        panel.getByRole('article', { name: 'Assistant' }),
      ).toHaveCount(2);
      expect(JSON.stringify(anthropic.sent[1].system)).toContain(
        'Word target of the Manuscript: 80,000 words',
      );
      const notes = await readFile(
        path.join(projectPath, 'notes', `${chapters.storm}.md`),
        'utf8',
      ).catch(() => '');
      expect(notes).not.toContain('Anna is trapped');
    } finally {
      await app.close();
    }
  });
}
