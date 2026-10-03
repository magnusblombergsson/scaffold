import { expect, test, type Page } from '@playwright/test';
import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { answerDialogs, chooseExport, launch, useTempDir } from './app';
import { useFakeAnthropic } from './fake-anthropic';

const tempDir = useTempDir();
const anthropic = useFakeAnthropic();

/** Replaces the text of an editor field. */
async function fill(page: Page, label: string, text: string) {
  await page.getByLabel(label, { exact: true }).click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type(text);
}

const block = (kind: 'proposal' | 'finding', json: object) =>
  `\n\`\`\`${kind}\n${JSON.stringify(json)}\n\`\`\`\n`;

test('the MVP hangs together: welcome, key, Project, Prose, Review Scene, a Proposal accepted, and Export', async () => {
  const projectPath = path.join(tempDir(), 'My Novel');
  const exportPath = path.join(tempDir(), 'For Readers.md');
  const app = await launch(tempDir(), {
    firstRun: true,
    anthropicUrl: anthropic.url,
  });
  const page = await app.firstWindow();

  // First run, without a key: the welcome, where one is added. The
  // fake Anthropic takes any key.
  await expect(
    page.getByRole('heading', { name: 'Welcome to Writing Tools' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Add API key' }).click();
  await page
    .getByRole('textbox', { name: 'API key' })
    .fill('sk-ant-api03-good-abcd');
  await page.getByRole('button', { name: 'Check and save' }).click();
  await expect(page.getByText('Welcome to Writing Tools')).toHaveCount(0);

  // A new Project, and Prose in its first Scene.
  await answerDialogs(app, projectPath);
  await page.getByRole('button', { name: 'New Project…' }).click();
  await expect(page.getByLabel('Prose')).toBeFocused();
  await page.keyboard.type('Anna packed in the rain. Mira watched.');
  await page.keyboard.press('ControlOrMeta+s');
  await expect(page.locator('.save-status.confirmed')).toBeVisible();
  const [sceneFile] = await readdir(path.join(projectPath, 'scenes'));
  const sceneId = path.basename(sceneFile, '.md');

  // An Entry for the Assistant to propose to.
  await page.getByRole('tab', { name: 'Story Bible' }).click();
  await page.getByRole('button', { name: 'New Entry' }).click();
  await page.getByRole('menuitem', { name: 'Character', exact: true }).click();
  await fill(page, 'Name', 'Anna');
  await fill(page, 'Description', 'Leaves the island.');
  await page.keyboard.press('ControlOrMeta+s');
  await expect(page.locator('.save-status.confirmed')).toBeVisible();
  const [entryFile] = await readdir(path.join(projectPath, 'bible'));
  const annaId = path.basename(entryFile, '.md');

  // Back to the Scene, and a Review of it.
  await page.getByRole('tab', { name: 'Manuscript' }).click();
  await page.getByRole('button', { name: 'Scene 1', exact: true }).click();
  await expect(page.getByLabel('Prose')).toHaveText(
    'Anna packed in the rain. Mira watched.',
  );
  anthropic.calls.push({
    reply: [
      'One thing.',
      block('finding', {
        type: 'missing',
        scene: sceneId,
        quote: 'packed in the rain',
        comment: 'We never learn why Anna leaves.',
        question: 'What drives her off the island?',
      }),
    ],
  });
  const assistant = page.getByRole('complementary', { name: 'Assistant' });
  await assistant.getByRole('button', { name: 'Review Scene' }).click();
  const messages = assistant.getByRole('log', { name: 'Messages' });
  const findings = messages.getByRole('list', { name: 'Findings' });
  await expect(findings.getByRole('listitem')).toHaveCount(1);
  await expect(findings.getByRole('listitem')).toContainText(
    'We never learn why Anna leaves.',
  );
  expect(JSON.stringify(anthropic.sent[0])).toContain(
    'Anna packed in the rain.',
  );

  // The Author answers; the Assistant proposes, and the Author accepts.
  anthropic.calls.push({
    reply: [
      'Then the Story Bible should say so.',
      block('proposal', {
        entry: annaId,
        field: 'description',
        append: 'Fears her sister.',
      }),
    ],
  });
  await assistant
    .getByRole('textbox', { name: 'Message' })
    .fill('She is afraid of Mira.');
  await assistant.getByRole('button', { name: 'Send' }).click();
  const proposal = messages.getByRole('region', {
    name: 'Proposal: Anna › Description',
  });
  await proposal.getByRole('button', { name: 'Accept' }).click();
  await expect(proposal).toContainText('✓ Accepted');

  // The Entry changed, on screen and on disk.
  await page.getByRole('tab', { name: 'Story Bible' }).click();
  await page.getByRole('button', { name: 'Anna', exact: true }).click();
  await expect(page.getByLabel('Description', { exact: true })).toHaveText(
    /Leaves the island\.\s*Fears her sister\./,
  );
  await expect
    .poll(() => readFile(path.join(projectPath, 'bible', entryFile), 'utf8'))
    .toContain('Fears her sister.');

  // Export writes the Manuscript, and nothing the Assistant wrote.
  await answerDialogs(app, exportPath);
  await chooseExport(app);
  await expect
    .poll(() => existsSync(exportPath) && readFile(exportPath, 'utf8'))
    .toBe('# Chapter 1\n\nAnna packed in the rain. Mira watched.\n');
  await app.close();
});
