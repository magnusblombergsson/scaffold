import { expect, test, type Locator, type Page } from '@playwright/test';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { answerDialogs, launch, useTempDir } from './app';
import { useFakeAnthropic } from './fake-anthropic';

// The never-Prose guard (MVP spec §4): no UI path puts what the Assistant
// writes into the Manuscript. The fake Assistant here writes Prose on
// purpose, and tries Proposals aimed at it, in every Mode and room.

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

const block = (kind: 'proposal' | 'finding', json: object) =>
  `\n\n\`\`\`${kind}\n${JSON.stringify(json)}\n\`\`\``;

/** What the Author wrote, and all the Prose stays. */
const AUTHORED = 'Anna packed in the rain.';

/** Prose the fake Assistant writes, which must never reach the Manuscript. */
const LEAKS = {
  writing: '“Stay,” Mira whispered. “Please stay.”',
  review: 'Anna stuffed her coat into the case.',
  brainstorm: 'The ferry horn split the fog in two.',
  interview: '“Fine. Go, then,” Anna said.',
};

/**
 * The only controls a message may have: deciding Proposals, editing one's
 * value first, and retrying a call.
 */
const ALLOWED_CONTROLS = [
  'Accept',
  'Accept anyway',
  'Append',
  'Add',
  'Edit…',
  'Accept edited',
  'Append edited',
  'Add edited',
  'Cancel',
  'Edited value',
  'Reject',
  'Undo',
  'Retry',
  'Open Settings',
];

/**
 * Every control in a Conversation's messages, by what it says; anything the
 * Author could drag or type in counts as one.
 */
function controlsIn(messages: Locator): Promise<string[]> {
  return messages
    .locator(
      'button, a, input, select, textarea, [role="button"], [role="link"], [role="menuitem"], [contenteditable]:not([contenteditable="false"]), [draggable="true"]',
    )
    .evaluateAll((elements) =>
      elements.map(
        (e) =>
          e.getAttribute('aria-label') ?? e.textContent?.trim() ?? e.tagName,
      ),
    );
}

/**
 * Checks the messages have no control but deciding Proposals, retrying,
 * Finding quotes, which only show a line in its Scene, and Proposal titles,
 * which only go to their target, then accepts every Proposal.
 */
async function decideAll(messages: Locator) {
  /** The controls not allowed, by what they say. */
  const disallowed = async () => {
    const goes = await messages
      .locator('button.finding-quote, button.proposal-title-link')
      .allTextContents();
    return (await controlsIn(messages)).filter(
      (c) => !ALLOWED_CONTROLS.includes(c) && !goes.includes(c),
    );
  };
  expect(await disallowed()).toEqual([]);

  // A card's first of these: Accept, or the one button of an Append or an Add.
  const decide = { name: /^(Accept|Append|Add)$/ };
  for (const card of await messages
    .getByRole('region', { name: /^Proposal:/ })
    .all()) {
    const button = card.getByRole('button', decide).first();
    if ((await button.count()) > 0) await button.click();
  }
  await expect(messages.getByRole('button', decide)).toHaveCount(0);
  // Undo, and a new Entry's title, are the only controls an accepted
  // Proposal adds.
  expect(await disallowed()).toEqual([]);
}

test('nothing the Assistant writes reaches the Manuscript, in any Mode or room', async () => {
  const projectPath = path.join(tempDir(), 'My Novel');
  const app = await launch(tempDir(), { anthropicUrl: anthropic.url });
  await answerDialogs(app, projectPath);
  const page = await app.firstWindow();
  await page.getByRole('button', { name: 'New Project…' }).click();
  await page.getByLabel('Prose').pressSequentially(AUTHORED);
  const assistant = await addKey(page);
  const [sceneFile] = await readdir(path.join(projectPath, 'scenes'));
  const sceneId = path.basename(sceneFile, '.md');

  // No menu inserts or applies anything: Insert only makes empty units.
  const labels = await app.evaluate(({ Menu }) => {
    const walk = (menu: Electron.Menu | null): string[] =>
      (menu?.items ?? []).flatMap((item) => [
        item.label,
        ...walk(item.submenu ?? null),
      ]);
    return walk(Menu.getApplicationMenu());
  });
  expect(
    labels.filter((label) => label !== 'Insert' && /insert|apply/i.test(label)),
  ).toEqual([]);
  const inserts = await app.evaluate(({ Menu }) =>
    Menu.getApplicationMenu()
      ?.items.find((item) => item.label === 'Insert')
      ?.submenu?.items.flatMap((item) =>
        item.type === 'separator' ? [] : [item.label],
      ),
  );
  expect(inserts).toEqual([
    'New Scene',
    'New Scene Above',
    'New Chapter',
    'New Chapter Above',
    'New Entry',
  ]);

  // Writing, beside the editor: a question, with Proposals aimed at the Prose.
  anthropic.calls.push({
    reply: [
      `I won’t write her lines. ${LEAKS.writing}`,
      block('proposal', { outline: sceneId, value: '- Mira begs Anna.' }),
      block('proposal', { scene: sceneId, value: LEAKS.writing }),
      block('proposal', { prose: sceneId, insert: LEAKS.writing }),
      block('proposal', {
        create: 'scene',
        name: 'Goodbye',
        description: LEAKS.writing,
      }),
    ],
  });
  await assistant
    .getByRole('textbox', { name: 'Message' })
    .fill('Write what Mira says.');
  await assistant.getByRole('button', { name: 'Send' }).click();
  const messages = assistant.getByRole('log', { name: 'Messages' });
  await expect(messages.getByRole('article', { name: 'Assistant' })).toHaveText(
    /Please stay/,
  );
  // Only the Outline Proposal is taken; none can name the Prose.
  await expect(messages.getByRole('region', { name: /^Proposal:/ })).toHaveText(
    [/Scene “Scene 1” › Outline/],
  );
  await decideAll(messages);

  // A Review: a Finding's quote only shows a line, even one the Author
  // never wrote.
  anthropic.calls.push({
    reply: [
      'One thing.',
      block('finding', {
        type: 'too-much',
        scene: sceneId,
        quote: 'packed in the rain',
        comment: `Perhaps: ${LEAKS.review}`,
        question: 'What does the rain do here?',
      }),
      block('finding', {
        type: 'voice',
        scene: sceneId,
        quote: LEAKS.review,
        comment: 'Not how Anna talks.',
      }),
    ],
  });
  await assistant.getByRole('button', { name: 'Review Scene' }).click();
  await expect(messages.getByRole('list', { name: 'Findings' })).toBeVisible();
  await decideAll(messages);
  for (const quote of await messages.locator('button.finding-quote').all()) {
    await quote.click();
  }
  await expect(page.getByLabel('Prose')).toBeFocused();
  await expect(page.getByLabel('Prose')).toHaveText(AUTHORED);

  // An Entry for the other rooms to propose to.
  await page.getByRole('tab', { name: 'Story Bible' }).click();
  await page.getByRole('button', { name: 'New Entry' }).click();
  await page.getByRole('menuitem', { name: 'Character', exact: true }).click();
  await fill(page, 'Name', 'Anna');
  await fill(page, 'Description', 'Leaves the island.');
  await page.keyboard.press('ControlOrMeta+s');
  await expect(page.locator('.save-status.confirmed')).toBeVisible();
  const [entryFile] = await readdir(path.join(projectPath, 'bible'));
  const annaId = path.basename(entryFile, '.md');

  // The Brainstorm room.
  await switchTo(page, 'Brainstorm');
  const brainstorm = page.getByRole('main', { name: 'Brainstorm' });
  anthropic.calls.push({
    reply: [
      LEAKS.brainstorm,
      block('proposal', {
        entry: annaId,
        field: 'description',
        append: 'Hates goodbyes.',
      }),
      block('proposal', { outline: sceneId, prose: LEAKS.brainstorm }),
    ],
  });
  await brainstorm
    .getByRole('textbox', { name: 'Message' })
    .fill('Give me an opening line.');
  await brainstorm.getByRole('button', { name: 'Send' }).click();
  const brainstormed = brainstorm.getByRole('log', { name: 'Messages' });
  await expect(brainstormed).toContainText(LEAKS.brainstorm);
  await expect(
    brainstormed.getByRole('region', { name: /^Proposal:/ }),
  ).toHaveText([/Anna › Description/]);
  // Editing a Proposal first adds nothing that reaches the Prose either.
  const description = brainstormed.getByRole('region', {
    name: 'Proposal: Anna › Description',
  });
  await description.getByRole('button', { name: 'Edit…' }).click();
  await description
    .getByRole('textbox', { name: 'Edited value' })
    .fill('Hates long goodbyes.');
  await decideAll(brainstormed);
  await description.getByRole('button', { name: 'Append edited' }).click();
  await expect(description).toContainText('✓ Appended (edited)');
  await decideAll(brainstormed);

  // The Interview room, about Anna: never an example line of her Voice.
  await switchTo(page, 'Interview');
  const interview = page.getByRole('main', { name: 'Interview' });
  await interview
    .getByRole('combobox', { name: 'Focus' })
    .selectOption({ label: 'Anna' });
  anthropic.calls.push({
    reply: [
      `What does she sound like? ${LEAKS.interview}`,
      block('proposal', { entry: annaId, field: 'voice.says', add: 'fine' }),
      block('proposal', {
        entry: annaId,
        field: 'voice.examples',
        add: LEAKS.interview,
      }),
    ],
  });
  await interview.getByRole('button', { name: 'Ask me' }).click();
  const interviewed = interview.getByRole('log', { name: 'Messages' });
  await expect(interviewed).toContainText(LEAKS.interview);
  await expect(
    interviewed.getByRole('region', { name: /^Proposal:/ }),
  ).toHaveText([/Anna › Says/]);
  await decideAll(interviewed);

  // The Prose is the Author's alone, in the editor and on disk.
  await switchTo(page, 'Writing');
  await page.getByRole('tab', { name: 'Manuscript' }).click();
  await page.getByRole('button', { name: 'Scene 1', exact: true }).click();
  await expect(page.getByLabel('Prose')).toHaveText(AUTHORED);
  await page.keyboard.press('ControlOrMeta+s');
  await expect(page.locator('.save-status.confirmed')).toBeVisible();
  const scenes = path.join(projectPath, 'scenes');
  const files = await readdir(scenes);
  expect(files).toEqual([sceneFile]);
  const prose = await readFile(path.join(scenes, sceneFile), 'utf8');
  expect(prose).toContain(AUTHORED);
  for (const leak of Object.values(LEAKS)) {
    expect(prose).not.toContain(leak);
    // Nor the start of one, as a partial insert would leave.
    expect(prose).not.toContain(leak.slice(0, 12));
  }
  // The Proposals did land where they belong.
  const outline = await readFile(
    path.join(projectPath, 'outlines', `${sceneId}.md`),
    'utf8',
  );
  expect(outline).toContain('- Mira begs Anna.');
  const anna = await readFile(
    path.join(projectPath, 'bible', entryFile),
    'utf8',
  );
  expect(anna).toContain('Hates long goodbyes.');
  expect(anna).not.toContain(LEAKS.interview);
  await app.close();
});
