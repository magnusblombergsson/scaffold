import {
  expect,
  test,
  type ElectronApplication,
  type Locator,
  type Page,
} from '@playwright/test';
import path from 'node:path';
import { answerDialogs, launch, useTempDir } from './app';
import { useFakeAnthropic } from './fake-anthropic';

const tempDir = useTempDir();
const anthropic = useFakeAnthropic();

/** Look B's colours, as the browser reports them. */
const LOOK = {
  light: {
    desk: 'rgb(233, 230, 223)',
    sheet: 'rgb(255, 254, 251)',
    accent: 'rgb(46, 107, 78)',
  },
  dark: {
    desk: 'rgb(21, 21, 23)',
    sheet: 'rgb(37, 37, 40)',
    accent: 'rgb(121, 194, 158)',
  },
};

type Theme = keyof typeof LOOK;

/**
 * Sets the system theme the window sees (Playwright's own colour scheme
 * stands in for the system's), and a fixed window size.
 */
async function setUp(app: ElectronApplication, page: Page, theme: Theme) {
  await page.emulateMedia({ colorScheme: theme });
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0].setContentSize(1200, 760);
  });
}

function style(locator: Locator, property: string) {
  return locator.evaluate(
    (element, property) => getComputedStyle(element).getPropertyValue(property),
    property,
  );
}

/** The pencil a field's label gets while the field is hovered or focused. */
function pencil(label: Locator) {
  return label.evaluate(
    (element) => getComputedStyle(element, '::after').content,
  );
}

/** Adds a key the fake Anthropic accepts, so the Assistant's actions show. */
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
}

/** Parts that change from run to run, hidden from the screenshots. */
const changing = (page: Page) => [page.locator('.save-status')];

for (const theme of ['light', 'dark'] as const) {
  const look = LOOK[theme];

  test(`Writing, Brainstorm and Settings are paper on a desk, ${theme}`, async () => {
    const projectPath = path.join(tempDir(), 'My Novel');
    const app = await launch(tempDir(), { anthropicUrl: anthropic.url });
    try {
      await answerDialogs(app, projectPath);
      const page = await app.firstWindow();
      await setUp(app, page, theme);
      await page.getByRole('button', { name: 'New Project…' }).click();
      await page
        .getByLabel('Prose')
        .pressSequentially('Anna packed in the rain.');
      await addKey(page);

      // Writing: the panes are the desk and the centre is the sheet.
      await expect(page.locator('body')).toHaveCSS(
        'background-color',
        look.desk,
      );
      await expect(page.locator('.project-view header')).toHaveCSS(
        'border-bottom-width',
        '0px',
      );
      const centre = page.locator('.room:not([hidden]) .centre');
      await expect(centre).toHaveCSS('background-color', look.sheet);
      expect(await style(centre, 'box-shadow')).not.toBe('none');

      // Primary actions take the accent; others are plain outlined pills.
      const reviewScene = page.getByRole('button', { name: 'Review Scene' });
      await expect(reviewScene).toHaveCSS('border-top-color', look.accent);
      await expect(reviewScene).toHaveCSS('font-weight', '600');
      await expect(reviewScene).toHaveCSS('border-top-left-radius', '999px');
      const newChapter = page.getByRole('button', {
        name: 'New Chapter',
        exact: true,
      });
      await expect(newChapter).toHaveCSS('border-top-style', 'dashed');

      // The current Mode is raised in the sheet colour.
      await expect(
        page.getByRole('group', { name: 'Mode' }).getByRole('button', {
          name: 'Writing',
        }),
      ).toHaveCSS('background-color', look.sheet);

      // The selected Scene sits on the sheet colour.
      await expect(
        page.getByRole('button', { name: 'Scene 1', exact: true }),
      ).toHaveCSS('background-color', look.sheet);

      // An editable field has a dashed rule, solid accent while hovered.
      const outline = page.getByLabel('Outline', { exact: true });
      const outlineLabel = page
        .locator('.plain-text-field')
        .filter({ has: outline })
        .locator('h3');
      await expect(outline).toHaveCSS('border-left-style', 'dashed');
      expect(await pencil(outlineLabel)).toBe('none');
      await outline.hover();
      await expect(outline).toHaveCSS('border-left-style', 'solid');
      await expect(outline).toHaveCSS('border-left-color', look.accent);
      await expect(outlineLabel).toHaveCSS('color', look.accent);
      expect(await pencil(outlineLabel)).toBe('" ✎"');
      // The Prose has none.
      await expect(page.getByLabel('Prose')).toHaveCSS(
        'border-left-width',
        '0px',
      );

      await page.getByLabel('Prose').click();
      await expect(page).toHaveScreenshot(`writing-${theme}.png`, {
        mask: changing(page),
      });

      // Brainstorm: the same desk and sheet.
      await page
        .getByRole('group', { name: 'Mode' })
        .getByRole('button', { name: 'Brainstorm' })
        .click();
      await expect(page.locator('.room:not([hidden]) .centre')).toHaveCSS(
        'background-color',
        look.sheet,
      );
      await expect(page).toHaveScreenshot(`brainstorm-${theme}.png`, {
        mask: changing(page),
      });

      // Settings: a dialog on the sheet colour, its dropdowns underlined.
      await page.getByRole('button', { name: 'Settings…' }).click();
      const settings = page.getByRole('dialog', { name: 'Settings' });
      await expect(settings).toHaveCSS('background-color', look.sheet);
      const dropdown = settings.locator('select').first();
      await expect(dropdown).toHaveCSS('border-top-width', '0px');
      await expect(dropdown).toHaveCSS('border-bottom-style', 'solid');
      await expect(settings).toHaveScreenshot(`settings-${theme}.png`);
    } finally {
      await app.close();
    }
  });
}
