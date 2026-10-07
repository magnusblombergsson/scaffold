import { expect, test, type Locator, type Page } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { answerDialogs, answerQuestions, launch, useTempDir } from './app';

const tempDir = useTempDir();

async function newProject(projectPath: string) {
  const app = await launch(tempDir());
  await answerDialogs(app, projectPath);
  const page = await app.firstWindow();
  await page.getByRole('button', { name: 'New Project…' }).click();
  await expect(page.getByLabel('Prose')).toBeFocused();
  await page.keyboard.type('It was a dark night.');
  return { app, page };
}

function todos(page: Page) {
  return page.getByRole('region', { name: 'Todos' });
}

/** The Todos in a list, top to bottom, by their text. */
function textsIn(list: Locator) {
  return () =>
    list
      .locator('.todo-text')
      .evaluateAll((inputs) =>
        inputs.map((input) => (input as HTMLInputElement).value),
      );
}

function row(page: Page, text: string) {
  return todos(page)
    .locator('.todo')
    .filter({ has: page.locator(`.todo-text[value="${text}"]`) });
}

async function addTodo(page: Page, text: string) {
  await todos(page).getByLabel('New Todo').fill(text);
  await page.keyboard.press('Enter');
  await expect(row(page, text)).toHaveCount(1);
}

test('the Author adds, ticks, unticks, drags, deletes and clears Todos, and they survive reopening', async () => {
  const projectPath = path.join(tempDir(), 'My Novel');
  const { app, page } = await newProject(projectPath);

  await page.getByRole('tab', { name: 'Todos' }).click();
  await expect(todos(page).getByText('Nothing to do')).toBeVisible();
  for (const text of ['Name the ferry', 'Check Mara’s age', 'Fix the end']) {
    await addTodo(page, text);
  }
  const toDo = todos(page).getByRole('list', { name: 'To do' });
  await expect
    .poll(textsIn(toDo))
    .toEqual(['Fix the end', 'Check Mara’s age', 'Name the ferry']);

  // Ticked, it goes to the folded Done section; unticked, back.
  await page.getByRole('checkbox', { name: 'Done: Check Mara’s age' }).click();
  await expect.poll(textsIn(toDo)).toEqual(['Fix the end', 'Name the ferry']);
  const done = todos(page).getByRole('list', { name: 'Done' });
  await expect(done).toBeHidden();
  await todos(page).getByText('Done (1)').click();
  await expect.poll(textsIn(done)).toEqual(['Check Mara’s age']);
  // The tick follows from main, as the Todo moves.
  await page.getByRole('checkbox', { name: 'Done: Check Mara’s age' }).click();
  await expect
    .poll(textsIn(toDo))
    .toEqual(['Fix the end', 'Check Mara’s age', 'Name the ferry']);

  // Dragged by its grip above the top one.
  await row(page, 'Name the ferry')
    .locator('.todo-grip')
    .dragTo(row(page, 'Fix the end'), { targetPosition: { x: 10, y: 2 } });
  await expect
    .poll(textsIn(toDo))
    .toEqual(['Name the ferry', 'Fix the end', 'Check Mara’s age']);

  // Its text edited in place.
  await row(page, 'Fix the end').locator('.todo-text').fill('Fix the ending');
  await page.keyboard.press('Enter');
  await expect
    .poll(textsIn(toDo))
    .toEqual(['Name the ferry', 'Fix the ending', 'Check Mara’s age']);

  await row(page, 'Name the ferry').hover();
  await page.getByRole('button', { name: 'Delete “Name the ferry”' }).click();
  await page.getByRole('checkbox', { name: 'Done: Fix the ending' }).click();
  await todos(page).getByText('Done (1)').click();
  await todos(page).getByRole('button', { name: 'Clear done' }).click();
  await expect(todos(page).getByText(/^Done/)).toHaveCount(0);
  await page.getByRole('checkbox', { name: 'Done: Check Mara’s age' }).click();
  await addTodo(page, 'Read it aloud');
  await app.close();

  const second = await launch(tempDir());
  const reopened = await second.firstWindow();
  await reopened.getByRole('tab', { name: 'Todos' }).click();
  await expect
    .poll(textsIn(todos(reopened).getByRole('list', { name: 'To do' })))
    .toEqual(['Read it aloud']);
  await todos(reopened).getByText('Done (1)').click();
  await expect
    .poll(textsIn(todos(reopened).getByRole('list', { name: 'Done' })))
    .toEqual(['Check Mara’s age']);

  // Upgraded elsewhere, the Project shows its Todos, but takes no more.
  const manifest = path.join(projectPath, 'project.json');
  await writeFile(
    manifest,
    (await readFile(manifest, 'utf8')).replace('"format": 1', '"format": 2'),
  );
  await expect(reopened.locator('.read-only-banner')).toBeVisible();
  await expect(todos(reopened).getByLabel('New Todo')).toBeDisabled();
  await expect(
    reopened.getByRole('checkbox', { name: 'Done: Read it aloud' }),
  ).toBeDisabled();
  await expect(
    row(reopened, 'Read it aloud').locator('.todo-text'),
  ).not.toBeEditable();
  await expect(
    todos(reopened).getByRole('button', { name: 'Clear done' }),
  ).toBeDisabled();
  await second.close();
});

test('a new Todo is linked to the open unit, its link opens it, and follows it to Trash and back', async () => {
  const projectPath = path.join(tempDir(), 'My Novel');
  const { app, page } = await newProject(projectPath);

  // Pre-linked to the open Scene; one click unlinks.
  await page.getByRole('tab', { name: 'Todos' }).click();
  await expect(todos(page).locator('.new-todo-link')).toHaveText(/Scene 1/);
  await todos(page)
    .getByRole('button', { name: 'Unlink from “Scene 1”' })
    .click();
  await addTodo(page, 'Unlinked');
  await expect(row(page, 'Unlinked').locator('.todo-link')).toHaveCount(0);
  await addTodo(page, 'Fix the opening');
  await expect(row(page, 'Fix the opening').locator('.todo-link')).toHaveText(
    'Scene 1',
  );

  // With the Chapter open, a new Todo is linked to it; its link opens it.
  await page.getByRole('tab', { name: 'Manuscript' }).click();
  await page.getByRole('button', { name: 'Chapter 1', exact: true }).click();
  await page.getByRole('tab', { name: 'Todos' }).click();
  await addTodo(page, 'Tighten the chapter');
  await expect(
    row(page, 'Tighten the chapter').locator('.todo-link'),
  ).toHaveText('Chapter 1');
  await row(page, 'Fix the opening').locator('.todo-link').click();
  await expect(page.locator('.scene-title')).toHaveText('Chapter 1 · Scene 1');
  await row(page, 'Tighten the chapter').locator('.todo-link').click();
  await expect(page.locator('.scene-title')).toHaveText('Chapter 1');

  // In Trash, the link says so and opens the Trash item.
  await page.getByRole('tab', { name: 'Manuscript' }).click();
  await page
    .getByRole('button', { name: 'Scene actions: Scene 1', exact: true })
    .click();
  await page.getByRole('menuitem', { name: 'Move to Trash' }).click();
  await page.getByRole('tab', { name: 'Todos' }).click();
  const link = row(page, 'Fix the opening').locator('.todo-link');
  await expect(link).toHaveText('Scene 1 (in Trash)');
  await link.click();
  await expect(page.getByRole('tab', { name: 'Trash (1)' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  const trash = page.getByRole('region', { name: 'Trash' });
  await expect(trash.locator('[aria-current="true"]')).toContainText('Scene 1');
  await expect(
    trash.getByRole('button', { name: 'Restore Scene 1' }),
  ).toBeFocused();

  // Restored, the link works again.
  await page.keyboard.press('Enter');
  await page.getByRole('tab', { name: 'Todos' }).click();
  await expect(link).toHaveText('Scene 1');

  // Once Trash is emptied, the Todo stays as plain text.
  await page.getByRole('tab', { name: 'Manuscript' }).click();
  await page
    .getByRole('button', { name: 'Scene actions: Scene 1', exact: true })
    .click();
  await page.getByRole('menuitem', { name: 'Move to Trash' }).click();
  await page.getByRole('tab', { name: 'Trash (1)' }).click();
  await answerQuestions(app, 0);
  await page.getByRole('button', { name: 'Empty Trash…' }).click();
  await expect(page.getByText('Trash is empty')).toBeVisible();
  await page.getByRole('tab', { name: 'Todos' }).click();
  await expect(row(page, 'Fix the opening')).toHaveCount(1);
  await expect(row(page, 'Fix the opening').locator('.todo-link')).toHaveCount(
    0,
  );
  await app.close();
});
