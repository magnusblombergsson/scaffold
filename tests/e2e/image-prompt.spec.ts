import { expect, test, type Page } from '@playwright/test';
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { addAnthropicKey, answerDialogs, launch, useTempDir } from './app';
import { useFakeAnthropic } from './fake-anthropic';

const tempDir = useTempDir();
const anthropic = useFakeAnthropic();

/** Replaces the text of an editor field. */
async function fill(page: Page, label: string, text: string) {
  await page.getByLabel(label, { exact: true }).click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type(text);
}

/** A new Project with an Anthropic key, and a Character “Anna” to describe. */
async function withAnna(projectPath: string) {
  const app = await launch(tempDir(), { anthropicUrl: anthropic.url });
  await answerDialogs(app, projectPath);
  const page = await app.firstWindow();
  await page.getByRole('button', { name: 'New Project…' }).click();
  await expect(page.getByLabel('Prose')).toBeFocused();
  await addAnthropicKey(page);
  await page.getByRole('tab', { name: 'Story Bible' }).click();
  await page.getByRole('button', { name: 'New Entry' }).click();
  await page.getByRole('menuitem', { name: 'Character', exact: true }).click();
  await fill(page, 'Name', 'Anna');
  await fill(page, 'Description', 'Mira’s older sister, a ferry pilot.');
  await fill(page, 'Appearance', 'Tall, grey wool coat, salt in her hair.');
  await fill(page, 'Private notes', 'She drowns in Chapter 9.');
  return { app, page };
}

test('Image prompt… on an Entry writes one to copy, again on Regenerate, and logs nothing', async () => {
  const projectPath = path.join(tempDir(), 'My Novel');
  const { app, page } = await withAnna(projectPath);
  anthropic.calls = [
    {
      reply: ['A tall woman in a grey ', 'wool coat on a windy quay.'],
      usage: { input: 400, output: 30 },
    },
    { reply: ['A ferry pilot at dusk, salt in her hair.'] },
  ];

  await page
    .getByRole('navigation', { name: 'Story Bible' })
    .getByRole('button', { name: 'Entry actions: Anna' })
    .click();
  await page.getByRole('menuitem', { name: 'Image prompt…' }).click();

  const dialog = page.getByRole('dialog', { name: 'Image prompt: Anna' });
  const prompt = dialog.getByLabel('Image prompt', { exact: true });
  await expect(prompt).toHaveText(
    'A tall woman in a grey wool coat on a windy quay.',
  );
  await expect(dialog.getByLabel('Model')).toHaveText('Anthropic · Sonnet 5.5');
  await expect(dialog.getByLabel('Usage')).toHaveText(
    '≈ 400 in · 30 out · < $0.01',
  );

  // Asked from the description and Appearance, never the private notes.
  const sent = JSON.stringify(anthropic.sent[0]);
  expect(sent).toContain('Mira’s older sister, a ferry pilot.');
  expect(sent).toContain('Tall, grey wool coat, salt in her hair.');
  expect(sent).not.toContain('Chapter 9');

  await dialog.getByRole('button', { name: 'Copy' }).click();
  await expect(dialog.getByRole('status')).toHaveText('Copied');
  expect(await app.evaluate(({ clipboard }) => clipboard.readText())).toBe(
    'A tall woman in a grey wool coat on a windy quay.',
  );

  await dialog.getByRole('button', { name: 'Regenerate' }).click();
  await expect(prompt).toHaveText('A ferry pilot at dusk, salt in her hair.');
  expect(anthropic.sent).toHaveLength(2);

  await dialog.getByRole('button', { name: 'Close' }).click();
  await expect(dialog).toBeHidden();
  const conversations = path.join(projectPath, 'conversations');
  expect(existsSync(conversations) ? readdirSync(conversations) : []).toEqual(
    [],
  );

  await app.close();
});

test('the Entry view asks for one too, and says when there is nothing to describe', async () => {
  const projectPath = path.join(tempDir(), 'My Novel');
  const { app, page } = await withAnna(projectPath);
  await page.getByRole('button', { name: 'New Entry' }).click();
  await page.getByRole('menuitem', { name: 'Place', exact: true }).click();

  await page.getByRole('button', { name: 'Image prompt…' }).click();

  const dialog = page.getByRole('dialog', { name: /^Image prompt:/ });
  await expect(dialog.getByRole('alert')).toHaveText(
    'There’s nothing to describe yet: write a description, Appearance or Senses first.',
  );
  await expect(dialog.getByRole('button', { name: 'Copy' })).toBeDisabled();
  await expect(
    dialog.getByRole('button', { name: 'Regenerate' }),
  ).toBeDisabled();
  expect(anthropic.sent).toEqual([]);

  await app.close();
});

for (const theme of ['light', 'dark'] as const) {
  test(`the Image prompt dialog in ${theme}`, async () => {
    const projectPath = path.join(tempDir(), 'My Novel');
    const { app, page } = await withAnna(projectPath);
    anthropic.calls = [
      {
        reply: [
          'A tall woman in her thirties in a grey wool coat, standing on a windy quay at dusk, salt in her hair, soft overcast light, muted blues and greys.',
        ],
        usage: { input: 400, output: 30 },
      },
    ];
    await page.emulateMedia({ colorScheme: theme });

    await page.getByRole('button', { name: 'Image prompt…' }).click();

    const dialog = page.getByRole('dialog', { name: 'Image prompt: Anna' });
    await expect(dialog.getByLabel('Usage')).toBeVisible();
    await expect(dialog).toHaveScreenshot(`image-prompt-${theme}.png`);

    await app.close();
  });
}
