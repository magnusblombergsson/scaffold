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

async function switchTo(page: Page, mode: 'Writing' | 'Interview') {
  await page
    .getByRole('group', { name: 'Mode' })
    .getByRole('button', { name: mode })
    .click();
}

test('the Author is interviewed about a focus they pick and change, and sees the Entry in focus fill in as they accept', async () => {
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

  await switchTo(page, 'Interview');
  await expect(page.getByLabel('Prose')).toBeHidden();
  const room = page.getByRole('main', { name: 'Interview' });
  const inFocus = page.getByRole('complementary', { name: 'In focus' });
  const focus = room.getByRole('combobox', { name: 'Focus' });
  await expect(focus).toHaveValue('open');
  await focus.selectOption({ label: 'Anna' });
  await expect(inFocus.getByRole('heading', { name: 'Anna' })).toBeVisible();
  await expect(
    inFocus.getByRole('region', { name: 'Description' }),
  ).toContainText('Leaves the island.');

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
  const sent = JSON.stringify(anthropic.sent[0].system);
  expect(sent).toContain('In Interview');
  expect(sent).toContain(`the Entry “Anna” (Character), Id: ${annaId}`);
  expect(sent).not.toContain('Anna packed in the rain.');
  await expect(room.getByRole('note')).toHaveText('Focus: Anna');

  // The pending Proposal shows as a ghost value on its field.
  const role = inFocus.getByRole('region', { name: 'Role' });
  await expect(role.getByRole('list', { name: 'Proposed Role' })).toHaveText(
    /Protagonist/,
  );
  await reply
    .getByRole('region', { name: 'Proposal: Anna › Role' })
    .getByRole('button', { name: 'Accept' })
    .click();
  await expect(role.locator('.focus-value')).toHaveText('Protagonist');
  await expect(role.getByRole('list', { name: 'Proposed Role' })).toHaveCount(
    0,
  );

  // The focus changes within the Conversation; a Scene's Prose is then sent.
  await focus.selectOption({ label: ' Scene “Scene 1”' });
  await expect(room.getByRole('note')).toHaveText([
    'Focus: Anna',
    'Focus: Scene “Scene 1”',
  ]);
  await expect(inFocus).toContainText('Anna packed in the rain.');
  anthropic.calls.push({ reply: ['Who is she waiting for?'] });
  await room.getByRole('textbox', { name: 'Message' }).fill('Go on.');
  await room.getByRole('button', { name: 'Send' }).click();
  await expect(room.getByRole('article', { name: 'Assistant' })).toHaveCount(2);
  expect(JSON.stringify(anthropic.sent[1].system)).toContain(
    'Anna packed in the rain.',
  );
  const conversations = page.getByRole('navigation', {
    name: 'Interview Conversations',
  });
  await expect(
    conversations.getByRole('button', { name: /Ask me about Anna/ }),
  ).toContainText('Scene “Scene 1”');

  const dir = path.join(projectPath, 'conversations');
  const [log] = await readdir(dir);
  const events = (await readFile(path.join(dir, log), 'utf8'))
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  expect(events[0]).toMatchObject({ mode: 'interview' });
  expect(
    events.filter((e) => e.type === 'focusChanged').map((e) => e.focus),
  ).toEqual([
    { kind: 'entry', id: annaId },
    { kind: 'scene', id: expect.any(String) },
  ]);

  // In Writing, the Interview opens read-and-decide only.
  await switchTo(page, 'Writing');
  const assistant = page.getByRole('complementary', { name: 'Assistant' });
  await assistant
    .getByRole('combobox', { name: 'Mode' })
    .selectOption('Interview');
  await assistant
    .getByRole('combobox', { name: 'Conversation' })
    .selectOption({ label: 'Ask me about Anna.' });
  await expect(
    assistant.getByRole('region', { name: 'Proposal: Anna › Role' }),
  ).toContainText('✓ Accepted');
  await expect(assistant.getByRole('note')).toHaveCount(2);
  await expect(assistant.getByRole('textbox', { name: 'Message' })).toHaveCount(
    0,
  );
  await expect(assistant).toContainText('from the Interview room');
  await app.close();
});

test('with open focus, the Assistant is asked to say first which gap it chose and why', async () => {
  const projectPath = path.join(tempDir(), 'My Novel');
  const app = await launch(tempDir(), { anthropicUrl: anthropic.url });
  await answerDialogs(app, projectPath);
  const page = await app.firstWindow();
  await page.getByRole('button', { name: 'New Project…' }).click();
  await addKey(page);
  await switchTo(page, 'Interview');

  anthropic.calls.push({
    reply: ['Anna has no Entry yet, and she leads the Outline. Who is she?'],
  });
  const room = page.getByRole('main', { name: 'Interview' });
  await room.getByRole('button', { name: 'Ask me' }).click();
  await expect(room.getByRole('article', { name: 'Assistant' })).toBeVisible();

  expect(JSON.stringify(anthropic.sent[0].system)).toMatch(
    /first say which gap you chose and why/,
  );
  await expect(room.getByRole('note')).toHaveText('Focus: Open');
  await expect(
    page
      .getByRole('navigation', { name: 'Interview Conversations' })
      .getByRole('button', { name: /Ask me about what is missing/ }),
  ).toContainText('Open');
  await app.close();
});
