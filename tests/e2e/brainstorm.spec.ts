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
async function switchTo(page: Page, mode: 'Writing' | 'Brainstorm') {
  await page
    .getByRole('group', { name: 'Mode' })
    .getByRole('button', { name: mode })
    .click();
}

test('the Author brainstorms in the Brainstorm room, decides its Proposals inline, and sees the Story Bible and Outlines change', async () => {
  const projectPath = path.join(tempDir(), 'My Novel');
  const app = await launch(tempDir(), { anthropicUrl: anthropic.url });
  await answerDialogs(app, projectPath);
  const page = await app.firstWindow();
  await page.getByRole('button', { name: 'New Project…' }).click();
  await page.getByLabel('Prose').pressSequentially('Anna packed in the rain.');
  await addKey(page);
  await page.getByRole('tab', { name: 'Story Bible' }).click();
  await page.getByRole('button', { name: 'New Entry' }).click();
  await page.getByRole('menuitem', { name: 'Character', exact: true }).click();
  await fill(page, 'Name', 'Anna');
  await fill(page, 'Description', 'Leaves the island.');
  await page.keyboard.press('ControlOrMeta+s');
  await expect(page.locator('.save-status.confirmed')).toBeVisible();
  const [entryFile] = await readdir(path.join(projectPath, 'bible'));
  const annaId = path.basename(entryFile, '.md');
  const [sceneFile] = await readdir(path.join(projectPath, 'scenes'));
  const sceneId = path.basename(sceneFile, '.md');

  await switchTo(page, 'Brainstorm');

  // No editor in the room.
  await expect(page.getByLabel('Prose')).toBeHidden();
  const reference = page.getByRole('complementary', { name: 'Reference' });
  await expect(
    reference.getByRole('tab', { name: 'Story Bible' }),
  ).toHaveAttribute('aria-selected', 'true');
  await expect(reference).toContainText('Leaves the island.');
  await reference.getByRole('tab', { name: 'Outline skeleton' }).click();
  await expect(reference).toContainText('Chapter 1');
  await expect(reference).toContainText('Scene 1');

  anthropic.calls.push({
    reply: [
      'A sister could pull her back.\n\n',
      block({
        create: 'character',
        name: 'Mira',
        description: 'Anna’s younger sister.',
      }),
      '\n',
      block({ outline: sceneId, value: '- Anna waits for Mira.' }),
      '\n',
      block({ entry: annaId, field: 'aliases', add: 'Annie' }),
    ],
  });
  const room = page.getByRole('main', { name: 'Brainstorm' });
  await room
    .getByRole('textbox', { name: 'Message' })
    .fill('What if Anna has a sister?');
  await room.getByRole('button', { name: 'Send' }).click();

  const reply = room.getByRole('article', { name: 'Assistant' });
  await expect(reply.locator('.message-text')).toHaveText(
    'A sister could pull her back.',
  );
  // Brainstorm sends the Story Bible and Outline skeleton, but no Prose.
  const sent = JSON.stringify(anthropic.sent[0].system);
  expect(sent).toContain('In Brainstorm');
  expect(sent).toContain('Leaves the island.');
  expect(sent).toContain('Scene 1');
  expect(sent).not.toContain('Anna packed in the rain.');
  const conversations = page.getByRole('navigation', {
    name: 'Brainstorm Conversations',
  });
  await expect(
    conversations.getByRole('button', {
      name: 'What if Anna has a sister?',
      exact: true,
    }),
  ).toHaveAttribute('aria-current', 'true');

  await reply
    .getByRole('region', { name: 'Proposal: New Character · Mira' })
    .getByRole('button', { name: 'Accept' })
    .click();
  await reply
    .getByRole('region', { name: 'Proposal: Scene “Scene 1” › Outline' })
    .getByRole('button', { name: 'Accept' })
    .click();
  // The reference shows them at once.
  await expect(reference).toContainText('- Anna waits for Mira.');
  await reference.getByRole('tab', { name: 'Story Bible' }).click();
  await expect(reference).toContainText('Anna’s younger sister.');

  const dir = path.join(projectPath, 'conversations');
  const [log] = await readdir(dir);
  const header = JSON.parse(
    (await readFile(path.join(dir, log), 'utf8')).split('\n')[0],
  );
  expect(header).toMatchObject({
    mode: 'brainstorm',
    title: 'What if Anna has a sister?',
  });

  // In Writing, the Brainstorm Conversation opens read-and-decide only.
  await switchTo(page, 'Writing');
  // Writing is as the Author left it, with Anna open.
  await expect(page.getByLabel('Description', { exact: true })).toHaveText(
    'Leaves the island.',
  );
  const assistant = page.getByRole('complementary', { name: 'Assistant' });
  const picker = assistant.getByRole('combobox', { name: 'Conversation' });
  await expect(picker.getByRole('option')).toHaveText(['New Conversation']);
  await assistant
    .getByRole('combobox', { name: 'Mode' })
    .selectOption('Brainstorm');
  await picker.selectOption({ label: 'What if Anna has a sister?' });
  const aliases = assistant.getByRole('region', {
    name: 'Proposal: Anna › Aliases',
  });
  await expect(aliases).toBeVisible();
  await expect(assistant.getByRole('textbox', { name: 'Message' })).toHaveCount(
    0,
  );
  await expect(assistant.getByRole('button', { name: 'Send' })).toHaveCount(0);
  await expect(
    assistant.getByRole('button', { name: 'Review Scene' }),
  ).toHaveCount(0);
  await expect(assistant).toContainText('from the Brainstorm room');
  await aliases.getByRole('button', { name: 'Accept' }).click();
  await expect(aliases).toContainText('✓ Accepted');

  // The room is as the Author left it, the decision made in Writing shown.
  await switchTo(page, 'Brainstorm');
  await expect(
    room.getByRole('region', { name: 'Proposal: Anna › Aliases' }),
  ).toContainText('✓ Accepted');
  await app.close();
});

test('every side pane can be resized, and keeps its width', async () => {
  const projectPath = path.join(tempDir(), 'My Novel');
  const first = await launch(tempDir());
  await answerDialogs(first, projectPath);
  const page = await first.firstWindow();
  await page.getByRole('button', { name: 'New Project…' }).click();
  await expect(page.getByLabel('Prose')).toBeFocused();

  const widen = async (name: string, key: 'ArrowLeft' | 'ArrowRight') => {
    const resizer = page.getByRole('separator', { name });
    const before = Number(await resizer.getAttribute('aria-valuenow'));
    await resizer.focus();
    await page.keyboard.press(key);
    await expect(resizer).toHaveAttribute('aria-valuenow', `${before + 16}`);
    return before + 16;
  };
  const binder = await widen('Binder width', 'ArrowRight');
  // A pane on the right grows to the left.
  const assistant = await widen('Assistant width', 'ArrowLeft');
  await switchTo(page, 'Brainstorm');
  const list = await widen('Conversations width', 'ArrowRight');
  const reference = await widen('Reference width', 'ArrowLeft');
  await first.close();

  const second = await launch(tempDir());
  const reopened = await second.firstWindow();
  const width = (name: string) => reopened.getByRole('separator', { name });
  await expect(width('Binder width')).toHaveAttribute(
    'aria-valuenow',
    `${binder}`,
  );
  await expect(width('Assistant width')).toHaveAttribute(
    'aria-valuenow',
    `${assistant}`,
  );
  await switchTo(reopened, 'Brainstorm');
  await expect(width('Conversations width')).toHaveAttribute(
    'aria-valuenow',
    `${list}`,
  );
  await expect(width('Reference width')).toHaveAttribute(
    'aria-valuenow',
    `${reference}`,
  );
  await second.close();
});
