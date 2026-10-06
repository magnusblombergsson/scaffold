import { expect, test, type Page } from '@playwright/test';
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { answerDialogs, chooseMenu, launch, useTempDir } from './app';
import { useFakeAnthropic } from './fake-anthropic';

const tempDir = useTempDir();
const anthropic = useFakeAnthropic();

/**
 * Settings as on a computer where LM Studio was added at an address where
 * nothing runs, with one Model shortlisted.
 */
function lmStudioAdded(dir: string) {
  const userData = path.join(dir, 'user-data');
  mkdirSync(userData, { recursive: true });
  writeFileSync(
    path.join(userData, 'settings.json'),
    JSON.stringify({
      version: 1,
      global: {
        welcomed: true,
        providers: {
          lmstudio: { address: 'http://127.0.0.1:9' },
          shortlists: {
            lmstudio: [
              {
                id: 'qwen3-8b',
                name: 'Qwen3 8B',
                contextWindow: 32_768,
                outputLimit: null,
                price: { input: 0, cached: 0, written: 0, output: 0 },
              },
            ],
          },
        },
      },
      projects: {},
      recent: [],
    }),
  );
}

/** The events of the Project's one Conversation log. */
function events(projectPath: string): Record<string, unknown>[] {
  const dir = path.join(projectPath, 'conversations');
  const [name] = readdirSync(dir).sort(
    (a, b) =>
      JSON.parse(readFileSync(path.join(dir, a), 'utf8').split('\n')[0])
        .created -
      JSON.parse(readFileSync(path.join(dir, b), 'utf8').split('\n')[0])
        .created,
  );
  return readFileSync(path.join(dir, name), 'utf8')
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line));
}

async function openSettings(app: Parameters<typeof chooseMenu>[0], page: Page) {
  await chooseMenu(app, ['Tools', 'Settings…'], page);
  return page.getByRole('dialog', { name: 'Settings' });
}

/** Adds an Anthropic key in Settings, so its shortlist is offered. */
async function addAnthropicKey(
  app: Parameters<typeof chooseMenu>[0],
  page: Page,
) {
  const settings = await openSettings(app, page);
  const anthropicRow = settings.getByRole('region', { name: 'Anthropic' });
  await anthropicRow.getByRole('button', { name: 'Add key' }).click();
  await anthropicRow
    .getByRole('textbox', { name: 'Anthropic API key' })
    .fill('sk-ant-api03-good-abcd');
  await anthropicRow.getByRole('button', { name: 'Check and save' }).click();
  await expect(anthropicRow.getByLabel('Anthropic key in use')).toBeVisible();
  await settings.getByRole('button', { name: 'Done' }).click();
}

test('the Author switches Model mid-Conversation: each reply names its Model, an unreachable one fails inline with Retry and a switch, and a removed one shows greyed', async () => {
  const projectPath = path.join(tempDir(), 'My Novel');
  lmStudioAdded(tempDir());
  anthropic.calls.push(
    { reply: ['On Sonnet.'] },
    { reply: ['On Haiku.'] },
    { reply: ['Haiku again.'] },
  );
  const app = await launch(tempDir(), { anthropicUrl: anthropic.url });
  await answerDialogs(app, projectPath);
  const page = await app.firstWindow();
  await page.getByRole('button', { name: 'New Project…' }).click();

  await addAnthropicKey(app, page);

  const assistant = page.getByRole('complementary', { name: 'Assistant' });
  const picker = assistant.getByRole('button', { name: /^Model: / });
  const models = assistant.getByRole('menu', { name: 'Models' });
  // A new Conversation starts on the Model used last: none yet, so the default, Sonnet 5.5.
  await expect(picker).toHaveText('Anthropic · Sonnet 5.5 ▾');

  // The dropdown groups the shortlisted Models under their Provider, and
  // marks those not on the tested list.
  await picker.click();
  const claude = models.getByRole('group', { name: 'Anthropic' });
  await expect(claude.getByRole('menuitemradio')).toHaveText([
    'Opus 5.5 · 1M · $$$$ · Untested',
    'Sonnet 5.5 · 1M · $$$',
    'Haiku 4.5 · 200k · $$',
  ]);
  await expect(
    claude
      .getByRole('menuitemradio', { name: /Opus 5\.5/ })
      .getByText('Untested'),
  ).toHaveAttribute('title', /hasn't been checked against the rule/);
  await expect(
    claude.getByRole('menuitemradio', { name: /Sonnet 5\.5/ }),
  ).toHaveAttribute('title', '$2 in · $10 out per M');
  await expect(
    claude.getByRole('menuitemradio', { name: /Sonnet 5\.5/ }),
  ).toHaveAttribute('aria-checked', 'true');
  await expect(
    models.getByRole('group', { name: 'LM Studio' }).getByRole('menuitemradio'),
  ).toHaveText(['Qwen3 8B · 32k · local · free · Untested']);
  await page.keyboard.press('Escape');
  await expect(models).toBeHidden();

  const message = assistant.getByRole('textbox', { name: 'Message' });
  const send = async (text: string) => {
    await message.fill(text);
    await assistant.getByRole('button', { name: 'Send' }).click();
  };
  const log = assistant.getByRole('log', { name: 'Messages' });
  const replies = log.getByRole('article', { name: 'Assistant' });
  const modelOf = (index: number) =>
    replies.nth(index).getByLabel('Model', { exact: true });

  await send('Why does Anna leave?');
  await expect(replies.first()).toContainText('On Sonnet.');
  await expect(modelOf(0)).toHaveText('Sonnet 5.5');

  // Switched in the header, from the next message on.
  await picker.click();
  await models.getByRole('menuitemradio', { name: /Haiku 4\.5/ }).click();
  await expect(picker).toHaveText('Anthropic · Haiku 4.5 ▾');
  await send('And Mira?');
  await expect(replies).toHaveCount(2);
  await expect(replies.last()).toContainText('On Haiku.');
  await expect(modelOf(1)).toHaveText('Haiku 4.5');
  await expect(modelOf(0)).toHaveText('Sonnet 5.5');
  expect(anthropic.sent.map((body) => body.model)).toEqual([
    'claude-sonnet-5-5',
    'claude-haiku-4-5',
  ]);

  // LM Studio isn't running: the header keeps naming its Model, and the
  // reason shows inline with Retry and a switch.
  await picker.click();
  await models.getByRole('menuitemradio', { name: /Qwen3 8B/ }).click();
  await send('What does she fear?');
  const failed = log.getByRole('article', { name: 'System' });
  await expect(failed).toContainText("LM Studio isn't running at 127.0.0.1:9.");
  await expect(picker).toHaveText('LM Studio · Qwen3 8B · Untested ▾');
  await expect(picker.getByText('Untested')).toHaveAttribute(
    'title',
    /hasn't been checked against the rule/,
  );
  await failed.getByRole('button', { name: 'Choose another Model' }).click();
  await expect(models).toBeVisible();
  await models.getByRole('menuitemradio', { name: /Haiku 4\.5/ }).click();
  await failed.getByRole('button', { name: 'Retry' }).click();
  await expect(replies).toHaveCount(3);
  await expect(replies.last()).toContainText('Haiku again.');
  await expect(failed).toHaveCount(0);
  expect(anthropic.sent.at(-1)?.model).toBe('claude-haiku-4-5');

  expect(
    events(projectPath).flatMap((event) =>
      event.type === 'modelChosen'
        ? [`${event.provider}:${event.model}`]
        : event.role === 'assistant'
          ? [`reply ${event.provider}:${event.model}`]
          : [],
    ),
  ).toEqual([
    'anthropic:claude-sonnet-5-5',
    'reply anthropic:claude-sonnet-5-5',
    'anthropic:claude-haiku-4-5',
    'reply anthropic:claude-haiku-4-5',
    'lmstudio:qwen3-8b',
    'anthropic:claude-haiku-4-5',
    'reply anthropic:claude-haiku-4-5',
  ]);

  // A new Conversation starts on the Model used last.
  const conversation = assistant.getByRole('combobox', {
    name: 'Conversation',
  });
  await conversation.selectOption('New Conversation');
  await expect(picker).toHaveText('Anthropic · Haiku 4.5 ▾');

  // Haiku taken off the shortlist: a new Conversation starts on the first
  // shortlisted, and the one on Haiku still shows it, greyed.
  const again = await openSettings(app, page);
  await again
    .getByRole('region', { name: 'Anthropic' })
    .getByRole('button', { name: 'Choose models…' })
    .click();
  const choose = page.getByRole('dialog', { name: 'Choose Anthropic models' });
  await choose.getByRole('checkbox', { name: /Haiku 4\.5/ }).uncheck();
  await choose.getByRole('button', { name: 'Save' }).click();
  await again.getByRole('button', { name: 'Done' }).click();
  await expect(picker).toHaveText('Anthropic · Opus 5.5 · Untested ▾');

  await conversation.selectOption('Why does Anna leave?');
  await expect(picker).toHaveText('Anthropic · Haiku 4.5 ▾');
  await picker.click();
  const haiku = models.getByRole('menuitemradio', { name: /Haiku 4\.5/ });
  await expect(haiku).toBeDisabled();
  await expect(haiku).toHaveAttribute('aria-checked', 'true');
  await expect(
    models.getByRole('group', { name: 'Anthropic' }).getByRole('menuitemradio'),
  ).toHaveText([
    'Opus 5.5 · 1M · $$$$ · Untested',
    'Sonnet 5.5 · 1M · $$$',
    'Haiku 4.5',
  ]);
  await app.close();
});

test('an Untested Model warns in the header but is asked like any other', async () => {
  const projectPath = path.join(tempDir(), 'My Novel');
  anthropic.calls.push({ reply: ['On Opus.'] });
  const app = await launch(tempDir(), { anthropicUrl: anthropic.url });
  await answerDialogs(app, projectPath);
  const page = await app.firstWindow();
  await page.getByRole('button', { name: 'New Project…' }).click();

  await addAnthropicKey(app, page);

  const assistant = page.getByRole('complementary', { name: 'Assistant' });
  const picker = assistant.getByRole('button', { name: /^Model: / });
  await picker.click();
  await assistant
    .getByRole('menu', { name: 'Models' })
    .getByRole('menuitemradio', { name: /Opus 5\.5/ })
    .click();
  await expect(picker).toHaveText('Anthropic · Opus 5.5 · Untested ▾');
  await expect(picker).toHaveAccessibleName(
    'Model: Anthropic · Opus 5.5, Untested',
  );

  await assistant
    .getByRole('textbox', { name: 'Message' })
    .fill('Why does Anna leave?');
  await assistant.getByRole('button', { name: 'Send' }).click();
  const reply = assistant
    .getByRole('log', { name: 'Messages' })
    .getByRole('article', { name: 'Assistant' });
  await expect(reply).toContainText('On Opus.');
  expect(anthropic.sent.map((body) => body.model)).toEqual(['claude-opus-5-5']);
  await app.close();
});
