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

async function logLines(projectPath: string) {
  const dir = path.join(projectPath, 'conversations');
  const [name] = await readdir(dir);
  return (await readFile(path.join(dir, name), 'utf8'))
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

test('the Assistant proposes changes to an Entry, and the Author accepts, edits or rejects them', async () => {
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
  await fill(page, 'Description', 'Her sister.');
  await page.keyboard.press('ControlOrMeta+s');
  await expect(page.locator('.save-status.confirmed')).toBeVisible();
  const [file] = await readdir(path.join(projectPath, 'bible'));
  const annaId = path.basename(file, '.md');

  anthropic.calls.push({
    reply: [
      'Then the Story Bible should say so.\n\n',
      block({ entry: annaId, field: 'description', append: 'Older.' }),
      '\n',
      block({ entry: annaId, field: 'aliases', add: 'Nan' }),
      '\n',
      block({ entry: annaId, field: 'role', value: 'supporting' }),
    ],
  });
  await assistant
    .getByRole('textbox', { name: 'Message' })
    .fill('Anna is older than her sister.');
  await assistant.getByRole('button', { name: 'Send' }).click();

  const reply = assistant.getByRole('article', { name: 'Assistant' });
  await expect(reply.locator('.message-text')).toHaveText(
    'Then the Story Bible should say so.',
  );
  const description = reply.getByRole('region', {
    name: 'Proposal: Anna › Description',
  });
  await expect(description.getByLabel('Change')).toHaveText(
    'Her sister.\nOlder.',
  );
  await expect(description.locator('ins')).toHaveText('\nOlder.');

  // The open Entry shows the pending Proposals as ghost values.
  const ghost = page.getByRole('list', { name: 'Proposed Description' });
  await expect(ghost).toContainText('Her sister.\nOlder.');
  await expect(
    ghost.getByRole('button', { name: 'Show in Conversation' }),
  ).toBeVisible();

  await description.getByRole('button', { name: 'Accept' }).click();
  await expect(description).toContainText('✓ Accepted');
  await expect(page.getByLabel('Description', { exact: true })).toHaveText(
    /Her sister\.\s*Older\./,
  );
  await expect(ghost).toBeHidden();
  // An accept is not a change from another computer.
  await expect(page.locator('.toast')).not.toContainText('updated from');

  const aliases = reply.getByRole('region', {
    name: 'Proposal: Anna › Aliases',
  });
  await aliases.getByRole('button', { name: 'Edit…' }).click();
  await aliases.getByRole('textbox', { name: 'Edited value' }).fill('Nanna');
  await aliases.getByRole('button', { name: 'Accept edited' }).click();
  await expect(aliases).toContainText('✓ Accepted (edited)');
  await expect(page.getByLabel('Aliases', { exact: true })).toHaveText('Nanna');

  const role = reply.getByRole('region', { name: 'Proposal: Anna › Role' });
  await role.getByRole('button', { name: 'Reject' }).click();
  await expect(role).toContainText('✕ Rejected');

  const events = (await logLines(projectPath)).map((e) => e.type);
  expect(events.slice(-6)).toEqual([
    'proposal.proposed',
    'proposal.proposed',
    'proposal.proposed',
    'proposal.accepted',
    'proposal.accepted',
    'proposal.rejected',
  ]);
  await app.close();
});

test('the Assistant proposes a new Entry and a Scene’s Outline, and the Author accepts them', async () => {
  const projectPath = path.join(tempDir(), 'My Novel');
  const app = await launch(tempDir(), { anthropicUrl: anthropic.url });
  await answerDialogs(app, projectPath);
  const page = await app.firstWindow();
  await page.getByRole('button', { name: 'New Project…' }).click();
  await expect(page.getByLabel('Prose')).toBeFocused();
  await fill(page, 'Outline', '- She waits.');
  await page.keyboard.press('ControlOrMeta+s');
  await expect(page.locator('.save-status.confirmed')).toBeVisible();
  const assistant = await addKey(page);
  const { tree } = JSON.parse(
    await readFile(path.join(projectPath, 'project.json'), 'utf8'),
  ) as { tree: { chapters: { scenes: { id: string }[] }[] } };
  const sceneId = tree.chapters[0].scenes[0].id;

  anthropic.calls.push({
    reply: [
      'Then she needs an Entry, and the Scene an Outline.\n\n',
      block({
        create: 'character',
        name: 'Mira',
        description: 'Anna’s younger sister.',
      }),
      '\n',
      block({ outline: sceneId, value: '- She waits.\n- Mira does not come.' }),
    ],
  });
  await assistant
    .getByRole('textbox', { name: 'Message' })
    .fill('Anna waits for her sister Mira, who does not come.');
  await assistant.getByRole('button', { name: 'Send' }).click();

  const reply = assistant.getByRole('article', { name: 'Assistant' });
  const mira = reply.getByRole('region', {
    name: 'Proposal: New Character · Mira',
  });
  await expect(mira.getByLabel('Change')).toHaveText('Anna’s younger sister.');
  const outline = reply.getByRole('region', {
    name: 'Proposal: Scene “Scene 1” › Outline',
  });
  await expect(outline.getByRole('group', { name: 'Before' })).toContainText(
    '- She waits.',
  );
  await expect(outline.getByRole('group', { name: 'Proposed' })).toContainText(
    'Mira does not come.',
  );

  await mira.getByRole('button', { name: 'Edit…' }).click();
  await mira
    .getByRole('textbox', { name: 'Edited description' })
    .fill('Anna’s younger sister, who stayed.');
  await mira.getByRole('button', { name: 'Accept edited' }).click();
  await expect(mira).toContainText('✓ Accepted (edited)');
  await page.getByRole('tab', { name: 'Story Bible' }).click();
  await expect(
    page
      .getByRole('navigation', { name: 'Story Bible' })
      .getByRole('button', { name: 'Mira', exact: true }),
  ).toBeVisible();

  await outline.getByRole('button', { name: 'Accept' }).click();
  await expect(outline).toContainText('✓ Accepted');
  // The open Scene's Outline shows it.
  await expect(page.getByLabel('Outline', { exact: true })).toContainText(
    'Mira does not come.',
  );
  const [outlineFile] = await readdir(path.join(projectPath, 'outlines'));
  expect(
    await readFile(path.join(projectPath, 'outlines', outlineFile), 'utf8'),
  ).toContain('- She waits.\n- Mira does not come.');

  const events = (await logLines(projectPath)).map((e) => e.type);
  expect(events.slice(-4)).toEqual([
    'proposal.proposed',
    'proposal.proposed',
    'proposal.accepted',
    'proposal.accepted',
  ]);
  await app.close();
});

test('a Proposal shown from an Entry opens at its card in the Conversation', async () => {
  const projectPath = path.join(tempDir(), 'My Novel');
  const app = await launch(tempDir(), { anthropicUrl: anthropic.url });
  await answerDialogs(app, projectPath);
  const page = await app.firstWindow();
  await page.getByRole('button', { name: 'New Project…' }).click();
  await expect(page.getByLabel('Prose')).toBeFocused();
  const assistant = await addKey(page);
  await page.getByRole('tab', { name: 'Story Bible' }).click();
  await page.getByRole('button', { name: 'New Entry' }).click();
  await page.getByRole('menuitem', { name: 'Place', exact: true }).click();
  await fill(page, 'Name', 'The harbour');
  await page.keyboard.press('ControlOrMeta+s');
  await expect(page.locator('.save-status.confirmed')).toBeVisible();
  const [file] = await readdir(path.join(projectPath, 'bible'));
  const harbourId = path.basename(file, '.md');
  anthropic.calls.push({
    reply: [
      'Noted.\n',
      block({ entry: harbourId, field: 'senses.smells', value: 'tar, diesel' }),
    ],
  });
  await assistant
    .getByRole('textbox', { name: 'Message' })
    .fill('The harbour smells of tar.');
  await assistant.getByRole('button', { name: 'Send' }).click();
  await expect(
    assistant.getByRole('region', { name: 'Proposal: The harbour › Smells' }),
  ).toBeVisible();
  // Another Conversation is open now.
  await assistant
    .getByRole('combobox', { name: 'Conversation' })
    .selectOption('New Conversation');

  await page
    .getByRole('list', { name: 'Proposed Smells' })
    .getByRole('button', { name: 'Show in Conversation' })
    .click();

  const card = assistant.getByRole('region', {
    name: 'Proposal: The harbour › Smells',
  });
  await expect(card).toHaveClass(/highlighted/);
  await card.getByRole('button', { name: 'Accept' }).click();
  await expect(page.getByLabel('Smells', { exact: true })).toHaveText(
    'tar, diesel',
  );
  await app.close();
});
