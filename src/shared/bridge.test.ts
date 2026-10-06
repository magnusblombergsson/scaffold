import { describe, expect, it, vi } from 'vitest';
import { bridge, type Handlers, type MethodTable } from './bridge';
import { memoryTransport } from './memory-transport';

/** An error that says why, as main's ProjectError does. */
class NoteError extends Error {
  constructor(
    readonly reason: string,
    message: string,
  ) {
    super(message);
  }
}

/** A small API, as a window sees it, for the bridge to carry. */
interface NotesApi {
  read(id: string): Promise<string>;
  write(id: string, text: string): void;
  onChanged(listener: (id: string) => void): () => void;
  /** Built by hand, as a reply that streams is. */
  summarize(id: string, onText: (text: string) => void): Promise<string>;
}

const notesMethods = {
  read: 'invoke',
  write: 'send',
  onChanged: 'event',
  summarize: 'stream',
} as const satisfies MethodTable<NotesApi>;

const notesBridge = bridge<{ notes: NotesApi }, { notes: typeof notesMethods }>(
  { notes: notesMethods },
);

/** Main serving `notes` from `texts`, and a way to open windows on it. */
function setUp(texts: Record<string, string>) {
  const transport = memoryTransport();
  const main = notesBridge.main(transport.main);
  main.register(
    'notes',
    {
      read: async ({ owner }, id) => {
        if (id === 'trashed') throw new NoteError('trashed', 'It is in Trash');
        if (!(id in texts)) throw new Error(`No note ${id}`);
        return `${owner}: ${texts[id]}`;
      },
      write: (_ctx, id, text) => {
        if (id === 'trashed') throw new NoteError('trashed', 'It is in Trash');
        texts[id] = text;
      },
      summarize: async ({ owner }, askId, id) =>
        `${owner} summarized ${id} for ask ${askId}`,
    },
    (window) => ({ owner: `window ${window.id}` }),
  );
  return {
    main,
    open() {
      const { window, renderer } = transport.open();
      const { build, invoke } = notesBridge.renderer(renderer);
      const notes: NotesApi = {
        ...build('notes'),
        summarize: (id) => invoke('notes', 'summarize', [7, id]),
      };
      return { window, notes };
    },
  };
}

describe('bridge', () => {
  it('answers an invoke from the handler, with the context of the window that asked', async () => {
    const { open } = setUp({ a: 'Chapter one' });
    const { window, notes } = open();

    expect(await notes.read('a')).toBe(`window ${window.id}: Chapter one`);
  });

  it('answers a hand-built call to a method main handles', async () => {
    const { window, notes } = setUp({}).open();

    expect(await notes.summarize('a', () => {})).toBe(
      `window ${window.id} summarized a for ask 7`,
    );
  });

  // A plain object, since Electron's contextBridge passes on only the
  // message of an Error that crosses into the page.
  it('rejects with a plain object holding the message and reason of an error that says why', async () => {
    const { notes } = setUp({}).open();

    const failure = await notes
      .read('trashed')
      .catch((error: unknown) => error);

    expect(failure).toStrictEqual({
      message: 'It is in Trash',
      reason: 'trashed',
    });
  });

  it('rejects with a plain object holding the message of a plain Error', async () => {
    const { notes } = setUp({}).open();

    const failure = await notes.read('b').catch((error: unknown) => error);

    expect(failure).toStrictEqual({ message: 'No note b' });
  });

  it('passes a send on to its handler', async () => {
    const texts: Record<string, string> = {};
    const { notes } = setUp(texts).open();

    notes.write('a', 'Chapter one');

    expect(texts).toEqual({ a: 'Chapter one' });
  });

  it('logs in main a send whose handler throws', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { notes } = setUp({}).open();

    notes.write('trashed', 'Chapter one');

    expect(log).toHaveBeenCalledWith(
      expect.stringContaining('notes:write'),
      expect.objectContaining({ message: 'It is in Trash' }),
    );
    log.mockRestore();
  });

  it('emits an event to the window it is sent to, and no other', () => {
    const { main, open } = setUp({});
    const first = open();
    const second = open();
    const heard: string[] = [];
    first.notes.onChanged((id) => heard.push(`first heard ${id}`));
    second.notes.onChanged((id) => heard.push(`second heard ${id}`));

    main.emit(first.window, 'notes', 'onChanged', 'a');

    expect(heard).toEqual(['first heard a']);
  });

  it('stops passing on events once unsubscribed', () => {
    const { main, open } = setUp({});
    const { window, notes } = open();
    const heard: string[] = [];
    const unsubscribe = notes.onChanged((id) => heard.push(id));

    main.emit(window, 'notes', 'onChanged', 'a');
    unsubscribe();
    main.emit(window, 'notes', 'onChanged', 'b');

    expect(heard).toEqual(['a']);
  });

  it('holds a method table and a handler table to their API as it compiles', () => {
    // @ts-expect-error -- `write` is missing.
    const missing: MethodTable<NotesApi> = {
      read: 'invoke',
      onChanged: 'event',
    };
    const extra: MethodTable<NotesApi> = {
      read: 'invoke',
      write: 'send',
      onChanged: 'event',
      // @ts-expect-error -- NotesApi has no `delete`.
      delete: 'send',
    };
    const wrongKind: MethodTable<NotesApi> = {
      // @ts-expect-error -- `read` answers, so it can't be sent.
      read: 'send',
      write: 'send',
      onChanged: 'event',
    };

    type NotesHandlers = Handlers<NotesApi, typeof notesMethods, null>;
    // @ts-expect-error -- `write` has no handler.
    const unhandled: NotesHandlers = { read: async () => '' };
    const emitted: NotesHandlers = {
      read: async () => '',
      write: () => {},
      // @ts-expect-error -- `onChanged` is emitted, not handled.
      onChanged: () => () => {},
    };

    expect([missing, extra, wrongKind, unhandled, emitted]).toHaveLength(5);
  });
});
