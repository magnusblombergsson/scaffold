import { expect, test } from '@playwright/test';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { addAnthropicKey, answerDialogs, launch, useTempDir } from './app';
import { useFakeAnthropic } from './fake-anthropic';

const tempDir = useTempDir();
const anthropic = useFakeAnthropic();

async function logs(projectPath: string) {
  const dir = path.join(projectPath, 'conversations');
  const names = await readdir(dir);
  return Promise.all(
    names.map(async (name) =>
      (await readFile(path.join(dir, name), 'utf8'))
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line)),
    ),
  );
}

test('the Author asks about the Scene in focus, sees the reply stream in, and resumes the Conversation later', async () => {
  const projectPath = path.join(tempDir(), 'My Novel');
  anthropic.calls.push({
    reply: ['What does ', 'she fear?'],
    usage: { input: 18_000, cached: 12_000, output: 900 },
  });
  const first = await launch(tempDir(), { anthropicUrl: anthropic.url });
  await answerDialogs(first, projectPath);
  const page = await first.firstWindow();
  await page.getByRole('button', { name: 'New Project…' }).click();
  await page.getByLabel('Prose').pressSequentially('Anna packed in the rain.');
  const assistant = await addAnthropicKey(page);

  await assistant
    .getByRole('textbox', { name: 'Message' })
    .fill('Why does Anna leave?');
  await assistant.getByRole('button', { name: 'Send' }).click();

  const messages = assistant.getByRole('log', { name: 'Messages' });
  await expect(messages.getByRole('article', { name: 'You' })).toHaveText(
    'Why does Anna leave?',
  );
  const reply = messages.getByRole('article', { name: 'Assistant' });
  await expect(reply).toContainText('What does she fear?');
  await expect(reply.getByLabel('Usage')).toHaveText(
    '≈ 18k in (12k cached) · 900 out · ≈ $0.04',
  );
  await expect(assistant.getByLabel('Conversation usage')).toHaveText(
    '≈ 18k in (12k cached) · 900 out · ≈ $0.04',
  );
  // The reply says what the Assistant saw, once opened.
  const saw = reply.getByRole('list', { name: 'What the Assistant saw' });
  await expect(saw).toBeHidden();
  await reply.getByText('What the Assistant saw').click();
  await expect(saw.getByRole('listitem')).toHaveText([
    'Story Bible: no Entries',
    'Outline skeleton',
    'The Outline of “Chapter 1”',
    'The Outline of “Scene 1”',
    'The Notes on “Scene 1”',
    'The Prose of “Scene 1”',
    'No earlier messages',
  ]);
  // Claude was asked with the stored key's model and the Scene in focus.
  expect(anthropic.sent[0]).toMatchObject({ model: 'claude-opus-5-5' });
  expect(JSON.stringify(anthropic.sent[0].system)).toContain(
    'Anna packed in the rain.',
  );
  // Nothing puts a reply in the Manuscript: no buttons on messages.
  await expect(messages.getByRole('button')).toHaveCount(0);

  // The reply is logged once it has streamed in.
  await expect.poll(async () => (await logs(projectPath))[0].length).toBe(3);
  const [[header, asked, replied]] = await logs(projectPath);
  expect(header).toMatchObject({
    mode: 'writing',
    title: 'Why does Anna leave?',
    format: 1,
  });
  expect(asked).toMatchObject({ type: 'message', role: 'author' });
  expect(replied).toMatchObject({
    type: 'message',
    role: 'assistant',
    model: 'claude-opus-5-5',
    usage: { input: 18_000, cached: 12_000, written: 0, output: 900 },
    saw: { entries: [], messages: 0 },
  });
  // Money is never stored.
  expect(JSON.stringify(replied)).not.toMatch(/\$|cost|usd/i);
  expect(asked.focus).toHaveLength(1);
  // The Prose was on disk before the request was built.
  const prose = await readFile(
    path.join(projectPath, 'scenes', `${asked.focus[0]}.md`),
    'utf8',
  );
  expect(prose).toContain('Anna packed in the rain.');

  // A new Conversation starts empty and doesn't show the first.
  const picker = assistant.getByRole('combobox', { name: 'Conversation' });
  await picker.selectOption({ label: 'New Conversation' });
  await expect(messages.getByRole('article')).toHaveCount(0);
  await first.close();

  const second = await launch(tempDir());
  const again = await second.firstWindow();
  const resumed = again.getByRole('complementary', { name: 'Assistant' });
  await resumed
    .getByRole('combobox', { name: 'Conversation' })
    .selectOption({ label: 'Why does Anna leave?' });
  const history = resumed.getByRole('log', { name: 'Messages' });
  await expect(history.getByRole('article', { name: 'You' })).toHaveText(
    'Why does Anna leave?',
  );
  await expect(
    history.getByRole('article', { name: 'Assistant' }),
  ).toContainText('What does she fear?');
  await expect(resumed.getByLabel('Conversation usage')).toHaveText(
    '≈ 18k in (12k cached) · 900 out · ≈ $0.04',
  );
  await second.close();
});

test('a refused key shows inline with Retry and Open Settings, and logs no turn', async () => {
  const projectPath = path.join(tempDir(), 'My Novel');
  anthropic.calls.push(
    { status: 401, type: 'authentication_error' },
    { reply: ['Now ', 'it works.'] },
  );
  const app = await launch(tempDir(), { anthropicUrl: anthropic.url });
  await answerDialogs(app, projectPath);
  const page = await app.firstWindow();
  await page.getByRole('button', { name: 'New Project…' }).click();
  const assistant = await addAnthropicKey(page);
  await assistant.getByRole('textbox', { name: 'Message' }).fill('Why?');
  await assistant.getByRole('button', { name: 'Send' }).click();

  const messages = assistant.getByRole('log', { name: 'Messages' });
  const failed = messages.getByRole('article', { name: 'System' });
  await expect(failed).toContainText("didn't accept the API key");
  await expect(
    messages.getByRole('article', { name: 'Assistant' }),
  ).toHaveCount(0);
  expect((await logs(projectPath))[0]).toHaveLength(2);

  await failed.getByRole('button', { name: 'Open Settings' }).click();
  const settings = page.getByRole('dialog', { name: 'Settings' });
  await expect(settings).toBeVisible();
  await settings.getByRole('button', { name: 'Done' }).click();

  await failed.getByRole('button', { name: 'Retry' }).click();
  await expect(
    messages.getByRole('article', { name: 'Assistant' }),
  ).toContainText('Now it works.');
  await expect(failed).toHaveCount(0);
  const [log] = await logs(projectPath);
  expect(log.map((event) => event.role)).toEqual([
    undefined,
    'author',
    'assistant',
  ]);
  await app.close();
});

test('a reply cut short is kept as interrupted, and Retry adds a new turn', async () => {
  const projectPath = path.join(tempDir(), 'My Novel');
  anthropic.calls.push(
    { dropAfter: ['What does '] },
    { reply: ['Whole ', 'reply.'] },
  );
  const app = await launch(tempDir(), { anthropicUrl: anthropic.url });
  await answerDialogs(app, projectPath);
  const page = await app.firstWindow();
  await page.getByRole('button', { name: 'New Project…' }).click();
  const assistant = await addAnthropicKey(page);
  await assistant.getByRole('textbox', { name: 'Message' }).fill('Why?');
  await assistant.getByRole('button', { name: 'Send' }).click();

  const messages = assistant.getByRole('log', { name: 'Messages' });
  const failed = messages.getByRole('article', { name: 'System' });
  await expect(failed).toContainText("Can't reach the Provider");
  await expect(
    failed.getByRole('button', { name: 'Open Settings' }),
  ).toHaveCount(0);
  const replies = messages.getByRole('article', { name: 'Assistant' });
  await expect(replies).toHaveCount(1);
  await expect(replies.first()).toContainText('What does');
  await expect(replies.first()).toContainText('Interrupted');

  await failed.getByRole('button', { name: 'Retry' }).click();
  await expect(replies).toHaveCount(2);
  await expect(replies.last()).toContainText('Whole reply.');
  // The reply cut short isn't sent back to Claude.
  expect(anthropic.sent[1].messages).toEqual([
    { role: 'user', content: 'Why?' },
  ]);
  const [[, asked, cut, whole]] = await logs(projectPath);
  expect(asked).toMatchObject({ role: 'author' });
  expect(cut).toMatchObject({ text: 'What does ', interrupted: true });
  expect(whole).toMatchObject({ text: 'Whole reply.' });
  expect(whole.interrupted).toBeUndefined();
  await app.close();
});

test('a Claude reply ending on max_tokens shows Cut short and makes no Proposals; an empty one says so and offers Retry; unreadable Proposals are counted', async () => {
  const projectPath = path.join(tempDir(), 'My Novel');
  anthropic.calls.push(
    {
      reply: [
        'Mira, then.\n```proposal\n{"create": "character", "name": "Mira"}\n```\nAnd',
      ],
      stopReason: 'max_tokens',
    },
    { reply: ['Noted.\n```proposal\n{oops\n```'] },
    {
      reply: ['<think>Long ', 'thoughts'],
      usage: { input: 2_000, output: 4_096 },
      stopReason: 'max_tokens',
    },
    { reply: ['Because.'] },
  );
  const app = await launch(tempDir(), { anthropicUrl: anthropic.url });
  await answerDialogs(app, projectPath);
  const page = await app.firstWindow();
  await page.getByRole('button', { name: 'New Project…' }).click();
  const assistant = await addAnthropicKey(page);
  const messages = assistant.getByRole('log', { name: 'Messages' });
  const replies = messages.getByRole('article', { name: 'Assistant' });
  async function send(text: string, count: number) {
    await assistant.getByRole('textbox', { name: 'Message' }).fill(text);
    await assistant.getByRole('button', { name: 'Send' }).click();
    await expect(replies).toHaveCount(count);
  }

  await send('Who?', 1);
  const cut = replies.first();
  await expect(cut).toContainText('Mira, then.');
  await expect(cut).toContainText(
    'Cut short: the reply reached its length limit',
  );
  await expect(cut).not.toContainText('Interrupted');
  await expect(messages.getByRole('region', { name: /^Proposal/ })).toHaveCount(
    0,
  );

  await send('And?', 2);
  await expect(replies.nth(1)).toContainText('Noted.');
  await expect(replies.nth(1)).toContainText('1 Proposal couldn’t be read');
  await expect(replies.nth(1)).not.toContainText('oops');

  await send('Then?', 3);
  const empty = replies.nth(2);
  await expect(empty).toContainText(
    'No reply: the Model used its whole length limit thinking. Try again or choose another Model.',
  );
  await expect(empty).not.toContainText('thoughts');
  await expect(empty.getByLabel('Usage')).toContainText('4.1k out');

  await empty.getByRole('button', { name: 'Retry' }).click();
  await expect(replies).toHaveCount(4);
  await expect(replies.last()).toContainText('Because.');
  // Neither the reply cut short nor the empty one is sent back.
  const sent = JSON.stringify(anthropic.sent[3].messages);
  expect(sent).toContain('Noted.');
  expect(sent).not.toContain('Mira');
  expect(sent).not.toContain('thoughts');

  const [log] = await logs(projectPath);
  expect(log.find((e) => e.type === 'reply.empty')).toMatchObject({
    model: 'claude-opus-5-5',
    provider: 'anthropic',
    reason: 'length',
    usage: { input: 2_000, output: 4_096 },
  });
  expect(log.filter((e) => String(e.type).startsWith('proposal.'))).toEqual([]);
  await app.close();
});

test('the Author asks for a Review of the Chapter, sees its Findings in order, and a quote opens the Scene at the line', async () => {
  const projectPath = path.join(tempDir(), 'My Novel');
  const finding = (json: object) =>
    `\n\`\`\`finding\n${JSON.stringify(json)}\n\`\`\`\n`;
  anthropic.calls.push({
    reply: [
      'Two things across the Scenes.',
      finding({
        type: 'missing',
        quote: 'The letter came',
        comment: 'Nobody reads the letter.',
      }),
      finding({
        type: 'contradiction',
        quote: 'waited on the quay',
        comment: 'The Outline has her on the ferry.',
        question: 'Which holds?',
      }),
    ],
  });
  const app = await launch(tempDir(), { anthropicUrl: anthropic.url });
  await answerDialogs(app, projectPath);
  const page = await app.firstWindow();
  await page.getByRole('button', { name: 'New Project…' }).click();
  await page
    .getByLabel('Prose')
    .pressSequentially('Anna came down early. She waited on the quay.');
  await page
    .getByRole('button', { name: 'Chapter actions: Chapter 1' })
    .click();
  await page.getByRole('menuitem', { name: 'New Scene', exact: true }).click();
  await expect(page.getByLabel('Prose')).toBeFocused();
  await page.keyboard.type('The letter came on Tuesday.');
  const assistant = await addAnthropicKey(page);

  await assistant.getByRole('button', { name: 'Review Chapter' }).click();

  const messages = assistant.getByRole('log', { name: 'Messages' });
  await expect(messages.getByRole('article', { name: 'You' })).toHaveText(
    'Review Chapter “Chapter 1”',
  );
  const findings = messages.getByRole('list', { name: 'Findings' });
  await expect(findings.getByRole('listitem')).toHaveCount(2);
  const [contradiction, missing] = await findings.getByRole('listitem').all();
  await expect(contradiction).toContainText('Contradiction');
  await expect(contradiction).toContainText(
    'The Outline has her on the ferry.',
  );
  await expect(contradiction.locator('strong')).toHaveText('Which holds?');
  await expect(missing).toContainText('Missing');
  // Each Scene's Prose was sent, with what a Chapter Review is to do.
  const sent = JSON.stringify(anthropic.sent[0]);
  expect(sent).toContain('She waited on the quay.');
  expect(sent).toContain('The letter came on Tuesday.');
  expect(sent).toContain('Review the Chapter in focus');

  // The quote opens Scene 1, with the quoted words selected.
  await contradiction
    .getByRole('button', { name: 'waited on the quay' })
    .click();
  await expect(
    page.getByRole('button', { name: 'Scene 1', exact: true }),
  ).toHaveAttribute('aria-current', 'true');
  await expect(page.getByLabel('Prose')).toBeFocused();
  await expect
    .poll(() => page.evaluate(() => window.getSelection()?.toString()))
    .toBe('waited on the quay');
  await expect(page.getByLabel('Prose')).toHaveText(
    'Anna came down early. She waited on the quay.',
  );

  // The Findings are logged in the reply, the Review in the ask.
  await expect.poll(async () => (await logs(projectPath))[0].length).toBe(3);
  const [[, asked, replied]] = await logs(projectPath);
  expect(asked).toMatchObject({ command: 'review-chapter' });
  expect(replied.findings.map((f: { type: string }) => f.type)).toEqual([
    'contradiction',
    'missing',
  ]);
  await app.close();
});

test('the Author picks another Scene for a question by typing @, and its Prose is sent', async () => {
  const projectPath = path.join(tempDir(), 'My Novel');
  anthropic.calls.push({ reply: ['Is the letter from her sister?'] });
  const app = await launch(tempDir(), { anthropicUrl: anthropic.url });
  await answerDialogs(app, projectPath);
  const page = await app.firstWindow();
  await page.getByRole('button', { name: 'New Project…' }).click();
  await page
    .getByLabel('Prose')
    .pressSequentially('The letter came on Tuesday.');
  await page
    .getByRole('button', { name: 'Chapter actions: Chapter 1' })
    .click();
  await page.getByRole('menuitem', { name: 'New Scene', exact: true }).click();
  await expect(page.getByLabel('Prose')).toBeFocused();
  await page.keyboard.type('Anna burned it unread.');
  const assistant = await addAnthropicKey(page);

  const message = assistant.getByRole('textbox', { name: 'Message' });
  await message.pressSequentially('Does this follow from @sc');
  const options = assistant.getByRole('listbox', {
    name: 'Chapters and Scenes',
  });
  await expect(options.getByRole('option')).toHaveText([
    'Scene 1 Chapter 1',
    'Scene 2 Chapter 1',
  ]);
  // Enter picks the option, rather than sending.
  await message.press('Enter');
  await expect(message).toHaveValue('Does this follow from @Scene 1 ');
  await expect(options).toBeHidden();
  await message.pressSequentially('?');
  await message.press('Enter');

  const reply = assistant
    .getByRole('log', { name: 'Messages' })
    .getByRole('article', { name: 'Assistant' });
  await expect(reply).toContainText('Is the letter from her sister?');
  await reply.getByText('What the Assistant saw').click();
  await expect(
    reply
      .getByRole('list', { name: 'What the Assistant saw' })
      .getByRole('listitem'),
  ).toContainText(['The Prose of “Scene 2”', 'The Prose of “Scene 1”']);
  const sent = JSON.stringify(anthropic.sent[0]);
  expect(sent).toContain('The letter came on Tuesday.');
  expect(sent).toContain('Anna burned it unread.');
  await app.close();
});
