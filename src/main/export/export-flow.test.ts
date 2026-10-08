import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  runExport,
  type ExportDialogs,
  type ExportFs,
  type ExportJob,
} from './export-flow';
import type { ExportFormat, ExportQuestion } from './manuscript-export';

const PROJECT = path.resolve('/books/My Novel');
const OUT = path.resolve('/out');
const QUESTION: ExportQuestion = { message: 'Conflict', detail: 'Scene' };

type Answer = boolean | string | null;

/** Dialogs that answer in the order queued, and record what they were asked. */
function scripted(...answers: Answer[]): ExportDialogs & { asked: string[] } {
  const queue = [...answers];
  const asked: string[] = [];
  const next = (step: string): Answer => {
    asked.push(step);
    if (queue.length === 0) throw new Error(`Unexpected dialog: ${step}`);
    return queue.shift() as Answer;
  };
  return {
    asked,
    askConflicts: async () => next('conflicts') as boolean,
    chooseSaveTarget: async () => next('save') as string | null,
    confirmReplace: async () => next('replace') as boolean,
    report: async (problem) => {
      asked.push(`report: ${problem.message}`);
    },
  };
}

function memoryFs(files: string[] = []) {
  const written = new Map<string, Uint8Array>();
  const existing = new Set(files);
  const fs: ExportFs & { written: typeof written; failWith?: Error } = {
    written,
    realpath: async (target) => target,
    exists: async (target) => existing.has(target),
    writeFile: async (target, data) => {
      if (fs.failWith) throw fs.failWith;
      written.set(target, data);
    },
  };
  return fs;
}

function setup(options: {
  answers: Answer[];
  files?: string[];
  conflict?: boolean;
}) {
  const dialogs = scripted(...options.answers);
  const fs = memoryFs(options.files);
  const log: string[] = [];
  const formats: ExportFormat[] = [];
  const job: ExportJob = {
    projectPath: PROJECT,
    projectName: 'My Novel',
    title: 'Export Manuscript',
    name: 'My Novel',
    conflictQuestion: () => {
      log.push('question');
      return options.conflict ? QUESTION : null;
    },
    write: async (format) => {
      formats.push(format);
      return new Uint8Array([1]);
    },
  };
  let remembered = 0;
  const run = () =>
    runExport(job, {
      dialogs,
      fs,
      flush: async () => {
        log.push('flush');
      },
      rememberChoices: () => {
        remembered += 1;
      },
    });
  return { run, dialogs, fs, log, formats, remembered: () => remembered };
}

describe('runExport', () => {
  it('flushes the renderer before the Conflict question', async () => {
    const t = setup({ answers: [null] });
    await t.run();
    expect(t.log).toEqual(['flush', 'question']);
  });

  it('writes nothing and remembers nothing when the Conflict question is cancelled', async () => {
    const t = setup({ answers: [false], conflict: true });
    await t.run();
    expect(t.dialogs.asked).toEqual(['conflicts']);
    expect(t.fs.written.size).toBe(0);
    expect(t.remembered()).toBe(0);
  });

  it('writes nothing and remembers nothing when the save dialog is cancelled', async () => {
    const t = setup({ answers: [true, null], conflict: true });
    await t.run();
    expect(t.dialogs.asked).toEqual(['conflicts', 'save']);
    expect(t.fs.written.size).toBe(0);
    expect(t.remembered()).toBe(0);
  });

  it('refuses a target inside the Project', async () => {
    const t = setup({ answers: [path.join(PROJECT, 'out.docx')] });
    await t.run();
    expect(t.dialogs.asked).toEqual([
      'save',
      'report: Choose a place outside the Project folder',
    ]);
    expect(t.fs.written.size).toBe(0);
    expect(t.remembered()).toBe(0);
  });

  it('writes nothing when replacing the file with .docx added is declined', async () => {
    const chosen = path.join(OUT, 'My Novel');
    const t = setup({ answers: [chosen, false], files: [`${chosen}.docx`] });
    await t.run();
    expect(t.dialogs.asked).toEqual(['save', 'replace']);
    expect(t.fs.written.size).toBe(0);
    expect(t.remembered()).toBe(0);
  });

  it('writes the file when replacing is accepted', async () => {
    const chosen = path.join(OUT, 'My Novel');
    const t = setup({ answers: [chosen, true], files: [`${chosen}.docx`] });
    await t.run();
    expect([...t.fs.written.keys()]).toEqual([`${chosen}.docx`]);
    expect(t.formats).toEqual(['docx']);
  });

  it('does not ask again about a file the save dialog already asked about', async () => {
    const chosen = path.join(OUT, 'My Novel.md');
    const t = setup({ answers: [chosen], files: [chosen] });
    await t.run();
    expect([...t.fs.written.keys()]).toEqual([chosen]);
    expect(t.formats).toEqual(['markdown']);
  });

  it('reports a write failure and remembers nothing', async () => {
    const t = setup({ answers: [path.join(OUT, 'My Novel.docx')] });
    t.fs.failWith = new Error('disk full');
    await t.run();
    expect(t.dialogs.asked).toEqual([
      'save',
      "report: Can't export My Novel.docx",
    ]);
    expect(t.remembered()).toBe(0);
  });

  it('remembers the choices after a successful write', async () => {
    const t = setup({ answers: [path.join(OUT, 'My Novel.docx')] });
    await t.run();
    expect(t.fs.written.size).toBe(1);
    expect(t.remembered()).toBe(1);
  });
});
