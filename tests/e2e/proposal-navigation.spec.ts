import { expect, test, type Page } from '@playwright/test';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { answerDialogs, launch, useTempDir } from './app';
import { useFakeAnthropic } from './fake-anthropic';

const tempDir = useTempDir();
const anthropic = useFakeAnthropic();

async function addKey(page: Page) {
  const assistant = page.getByRole('complementary', { name: 'Assistant' });
  await assistant.getByRole('button', { name: 'Add API key' }).click();
  await page
    .getByRole('textbox', { name: 'API key' })
    .fill('sk-ant-api03-good-abcd');
  await page.getByRole('button', { name: 'Check and save' }).click();
  const settings = page.getByRole('dialog', { name: 'Settings' });
  await expect(settings.getByLabel('Key in use')).toBeVisible();
  await settings.getByRole('button', { name: 'Done' }).click();
  return assistant;
}

/** Replaces the text of an editor field. */
async function fill(page: Page, label: string, text: string) {
  await page.getByLabel(label, { exact: true }).click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type(text);
}

const block = (json: object) =>
  `\`\`\`proposal\n${JSON.stringify(json)}\n\`\`\``;

/** Switches the window to a Mode at the top. */
async function switchTo(
  page: Page,
  mode: 'Writing' | 'Brainstorm' | 'Interview',
) {
  await page
    .getByRole('group', { name: 'Mode' })
    .getByRole('button', { name: mode })
    .click();
}

/**
 * Starts a Project with a Character, Anna, and an API key; the ids of Anna,
 * the first Chapter and its Scene.
 */
async function start() {
  const projectPath = path.join(tempDir(), 'My Novel');
  const app = await launch(tempDir(), { anthropicUrl: anthropic.url });
  await answerDialogs(app, projectPath);
  const page = await app.firstWindow();
  await page.getByRole('button', { name: 'New Project…' }).click();
  await expect(page.getByLabel('Prose')).toBeFocused();
  const assistant = await addKey(page);
  await page.getByRole('tab', { name: 'Story Bible' }).click();
  await page.getByRole('button', { name: 'New Entry' }).click();
  await page.getByRole('menuitem', { name: 'Character', exact: true }).click();
  await fill(page, 'Name', 'Anna');
  await fill(page, 'Description', 'Leaves the island.');
  await page.keyboard.press('ControlOrMeta+s');
  await expect(page.locator('.save-status.confirmed')).toBeVisible();
  const [entryFile] = await readdir(path.join(projectPath, 'bible'));
  const { tree } = JSON.parse(
    await readFile(path.join(projectPath, 'project.json'), 'utf8'),
  ) as { tree: { chapters: { id: string; scenes: { id: string }[] }[] } };
  return {
    app,
    page,
    assistant,
    annaId: path.basename(entryFile, '.md'),
    chapterId: tree.chapters[0].id,
    sceneId: tree.chapters[0].scenes[0].id,
  };
}

test('in Writing, a Proposal’s title goes to its target, focused, its ghost highlighted, and the Conversation stays open', async () => {
  const { app, page, assistant, annaId, chapterId, sceneId } = await start();

  anthropic.calls.push({
    reply: [
      'Some changes.\n\n',
      block({ entry: annaId, field: 'voice.traits', value: 'Clipped' }),
      '\n',
      block({ create: 'item', name: 'Key', description: 'Opens the shed.' }),
      '\n',
      block({ outline: sceneId, append: '- She waits.' }),
      '\n',
      block({ outline: chapterId, value: '- The wait.' }),
      '\n',
      block({ outline: 'project', value: '- A story of waiting.' }),
    ],
  });
  await assistant.getByRole('textbox', { name: 'Message' }).fill('Ideas?');
  await assistant.getByRole('button', { name: 'Send' }).click();
  const reply = assistant.getByRole('article', { name: 'Assistant' });
  await expect(reply.locator('.message-text')).toHaveText('Some changes.');

  // Start elsewhere: the Scene.
  await page.getByRole('tab', { name: 'Manuscript' }).click();
  await page.getByRole('button', { name: 'Scene 1', exact: true }).click();
  await expect(page.getByLabel('Prose')).toBeVisible();

  // An Entry's field.
  await reply.getByRole('button', { name: 'Anna › Voice traits' }).click();
  await expect(page.getByRole('tab', { name: 'Story Bible' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  const traits = page.getByLabel('Traits', { exact: true });
  await expect(traits).toBeFocused();
  await expect(traits).toBeInViewport();
  await expect(
    page
      .getByRole('list', { name: 'Proposed Voice traits' })
      .getByRole('listitem'),
  ).toHaveClass(/highlighted/);
  await expect(reply).toBeVisible();

  // A new Entry is a link only once accepted.
  const key = reply.getByRole('region', { name: 'Proposal: New Item · Key' });
  await expect(key.getByRole('button', { name: 'New Item · Key' })).toHaveCount(
    0,
  );
  await key.getByRole('button', { name: 'Accept' }).click();
  await expect(key).toContainText('✓ Accepted');
  // From the Scene again.
  await page.getByRole('tab', { name: 'Manuscript' }).click();
  await page.getByRole('button', { name: 'Scene 1', exact: true }).click();
  await key.getByRole('button', { name: 'New Item · Key' }).click();
  await expect(page.getByLabel('Name', { exact: true })).toBeFocused();
  await expect(page.getByLabel('Name', { exact: true })).toHaveText('Key');

  // A Scene's Outline, beside its Prose.
  await reply
    .getByRole('button', { name: 'Scene “Scene 1” › Outline' })
    .click();
  await expect(page.getByLabel('Prose')).toBeVisible();
  await expect(page.getByLabel('Outline', { exact: true })).toBeFocused();

  // Even with Outline & Notes folded away.
  await page.getByRole('button', { name: 'Outline & Notes' }).click();
  await expect(page.getByLabel('Outline', { exact: true })).toBeHidden();
  await page.getByRole('button', { name: 'Chapter 1', exact: true }).click();
  await reply
    .getByRole('button', { name: 'Scene “Scene 1” › Outline' })
    .click();
  await expect(page.getByLabel('Outline', { exact: true })).toBeFocused();

  // A Chapter's Outline, on its Corkboard card.
  await reply
    .getByRole('button', { name: 'Chapter “Chapter 1” › Outline' })
    .click();
  await expect(
    page
      .getByRole('article', { name: 'Chapter 1' })
      .getByLabel('Outline', { exact: true }),
  ).toBeFocused();

  // The Project's Outline, on its Corkboard card.
  await reply.getByRole('button', { name: 'The story › Outline' }).click();
  await expect(
    page
      .getByRole('article', { name: 'Project Outline' })
      .getByLabel('Outline', { exact: true }),
  ).toBeFocused();
  await expect(reply).toBeVisible();
  await app.close();
});

test('in Brainstorm, a Proposal’s title opens a Peek without a pin, whose Open in Writing goes to the target', async () => {
  const { app, page, annaId, sceneId } = await start();
  await switchTo(page, 'Brainstorm');

  anthropic.calls.push({
    reply: [
      'A sister.\n\n',
      block({ entry: annaId, field: 'aliases', add: 'Annie' }),
      '\n',
      block({ outline: sceneId, value: '- Anna waits for Mira.' }),
      '\n',
      block({ create: 'character', name: 'Mira', description: 'Her sister.' }),
    ],
  });
  const room = page.getByRole('main', { name: 'Brainstorm' });
  await room.getByRole('textbox', { name: 'Message' }).fill('A sister?');
  await room.getByRole('button', { name: 'Send' }).click();
  const reply = room.getByRole('article', { name: 'Assistant' });
  await expect(reply.locator('.message-text')).toHaveText('A sister.');

  // A new Entry is plain until accepted.
  await expect(
    reply.getByRole('button', { name: 'New Character · Mira' }),
  ).toHaveCount(0);

  const aliases = reply.getByRole('button', { name: 'Anna › Aliases' });
  // In view first: a scroll closes a Peek, as it does a mention's.
  await aliases.scrollIntoViewIfNeeded();
  await aliases.click();
  const peek = page.getByRole('dialog', { name: 'Story Bible peek' });
  await expect(peek.getByRole('heading', { name: 'Anna' })).toBeVisible();
  await expect(peek).toContainText('Leaves the island.');
  await expect(peek.getByRole('button', { name: /Pin/ })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(peek).toBeHidden();

  // An Outline target shows that Outline.
  const outline = reply.getByRole('region', {
    name: 'Proposal: Scene “Scene 1” › Outline',
  });
  await outline.getByRole('button', { name: 'Accept' }).click();
  await expect(outline).toContainText('✓ Accepted');
  await outline
    .getByRole('button', { name: 'Scene “Scene 1” › Outline' })
    .click();
  const outlinePeek = page.getByRole('dialog', { name: 'Outline peek' });
  await expect(outlinePeek).toContainText('- Anna waits for Mira.');
  await outlinePeek.getByRole('button', { name: 'Open in Writing' }).click();
  await expect(
    page.getByRole('group', { name: 'Mode' }).getByRole('button', {
      name: 'Writing',
    }),
  ).toHaveAttribute('aria-pressed', 'true');
  await expect(outlinePeek).toBeHidden();
  await expect(page.getByLabel('Outline', { exact: true })).toBeFocused();
  await expect(page.getByLabel('Outline', { exact: true })).toHaveText(
    '- Anna waits for Mira.',
  );

  // And an Entry's field, with its ghost highlighted.
  await switchTo(page, 'Brainstorm');
  await reply.getByRole('button', { name: 'Anna › Aliases' }).click();
  await peek.getByRole('button', { name: 'Open in Writing' }).click();
  await expect(page.getByLabel('Aliases', { exact: true })).toBeFocused();
  await expect(
    page.getByRole('list', { name: 'Proposed Aliases' }).getByRole('listitem'),
  ).toHaveClass(/highlighted/);
  await app.close();
});

test('in Interview, a Proposal’s title opens a Peek without a pin, whose Open in Writing goes to the target', async () => {
  const { app, page, annaId } = await start();
  await switchTo(page, 'Interview');
  const room = page.getByRole('main', { name: 'Interview' });
  await room
    .getByRole('combobox', { name: 'Focus' })
    .selectOption({ label: 'Anna' });

  anthropic.calls.push({
    reply: [
      'What does she fear?\n\n',
      block({ entry: annaId, field: 'role', value: 'protagonist' }),
    ],
  });
  await room.getByRole('button', { name: 'Ask me' }).click();
  const reply = room.getByRole('article', { name: 'Assistant' });
  await expect(reply.locator('.message-text')).toHaveText(
    'What does she fear?',
  );

  await reply.getByRole('button', { name: 'Anna › Role' }).click();
  const peek = page.getByRole('dialog', { name: 'Story Bible peek' });
  await expect(peek.getByRole('heading', { name: 'Anna' })).toBeVisible();
  await expect(peek.getByRole('button', { name: /Pin/ })).toHaveCount(0);
  await peek.getByRole('button', { name: 'Open in Writing' }).click();

  await expect(
    page.getByRole('group', { name: 'Role' }).getByRole('radio').first(),
  ).toBeFocused();
  await expect(
    page.getByRole('list', { name: 'Proposed Role' }).getByRole('listitem'),
  ).toHaveClass(/highlighted/);
  await app.close();
});
