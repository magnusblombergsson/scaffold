import path from 'node:path';
import {
  estimateGathering,
  gatheredBlocks,
  gatheredText,
  mergeGathered,
  planGathering,
  scopeChapters,
  type Candidate,
  type Gathering,
  type GatheringEstimate,
  type GatheringPlan,
  type GatheringProgress,
  type GatheringSettings,
  type KnownEntry,
  type PlannedChapter,
  type PlannedRequest,
} from '../../shared/gathering';
import {
  ENTRY_GROUP_TITLES,
  unitText,
  type Manuscript,
} from '../../shared/project-types';
import type { ModelWindow, Model, Price } from '../../shared/models';
import { tokens, type KnownWindow } from '../../shared/request-size';
import { withoutThinking } from '../../shared/reply';
import type { Clock } from '../project-store/clock';
import type { FileSystem } from '../project-store/file-system';
import type {
  AssistantView,
  ProjectStore,
} from '../project-store/project-store';
import { safeWrite } from '../project-store/safe-write';
import { gatheringStoryBible, storyBibleOf } from './context-builder';
import type { ProviderFor, ProviderRequest } from './provider';
import { finishedCall } from './reply-finishing';
import { GATHERING_PROMPT } from './system-prompts';

// A Gathering's run (ADR 0018): outside any Conversation, the Prose of its
// scope read Chapter by Chapter, each request with the Story Bible as of the
// Chapter's Book and what was gathered so far, the list kept on this
// computer after each, so closing the app loses no paid request.

/** Where each Project's Gathering is kept on this computer, by Project id. */
export type GatheringFiles = {
  read(projectId: string): Promise<Gathering | null>;
  write(projectId: string, gathering: Gathering): Promise<void>;
  remove(projectId: string): Promise<void>;
};

/** A Gathering kept as `<dir>/<project id>.json`. */
export function gatheringFiles(
  dir: string,
  fs: FileSystem,
  clock: Clock,
): GatheringFiles {
  const file = (projectId: string) => path.join(dir, `${projectId}.json`);
  return {
    async read(projectId) {
      if (!(await fs.exists(file(projectId)))) return null;
      try {
        return JSON.parse(await fs.readFile(file(projectId))) as Gathering;
      } catch {
        // One that can't be read is as good as none.
        return null;
      }
    },
    async write(projectId, gathering) {
      await fs.mkdir(dir);
      await safeWrite(fs, clock, file(projectId), JSON.stringify(gathering));
    },
    async remove(projectId) {
      if (await fs.exists(file(projectId))) await fs.unlink(file(projectId));
    },
  };
}

/** How much a Model takes in, and its price per million tokens, as far as either is known. */
export type ModelListing = { window: ModelWindow | null; price: Price | null };

export type GatheringDeps = {
  store: Pick<ProjectStore, 'flush' | 'assistantView' | 'id'>;
  /** The Provider each Model is reached through. */
  providerFor: ProviderFor;
  listingOf: (model: Model) => ModelListing;
  files: GatheringFiles;
  clock: Pick<Clock, 'now'>;
};

/** What a Gathering reads: through which view, its plan, and each Scene's Prose as sent, by id. */
type Scoped = {
  view: AssistantView;
  plan: GatheringPlan;
  prose: Map<string, string>;
};

/** The window a Model's listing says, when it says how much it takes in. */
function knownWindow(window: ModelWindow | null): KnownWindow | null {
  return window?.contextWindow != null
    ? { contextWindow: window.contextWindow, outputLimit: window.outputLimit }
    : null;
}

/** A Scene's Prose as a request sends it: under its title, its Chapter's and its Id. */
function sceneText(
  manuscript: Manuscript,
  sceneId: string,
  markdown: string,
): string {
  const chapter = manuscript.chapters.find((c) =>
    c.scenes.some((s) => s.id === sceneId),
  );
  const scene = chapter?.scenes.find((s) => s.id === sceneId);
  return `## Scene “${scene?.title ?? ''}” in Chapter “${chapter?.title ?? ''}”\nId: ${sceneId}\n\n${markdown}`;
}

/** What a request asks: the types looked for, what was gathered so far, and the Prose. */
function askText(
  settings: GatheringSettings,
  gathered: string,
  prose: string[],
): string {
  return [
    `Look for: ${settings.types.map((t) => ENTRY_GROUP_TITLES[t]).join(', ')}.`,
    `Gathered from earlier Chapters:\n${gathered}`,
    'The Chapter’s Prose:',
    ...prose,
  ].join('\n\n');
}

/**
 * The request reading `request`'s Scenes: the prompt, the Story Bible as of
 * the Chapter's Book, those Entries seen when mentioned if the Prose or
 * what was gathered names them; then what was gathered, and the Prose.
 */
export async function gatheringRequest(
  view: AssistantView,
  settings: GatheringSettings,
  request: Pick<PlannedRequest, 'book' | 'scenes'>,
  prose: ReadonlyMap<string, string>,
  candidates: readonly Candidate[],
): Promise<ProviderRequest> {
  const texts = request.scenes.map((id) => prose.get(id) ?? '');
  const gathered = gatheredText(candidates, view.listEntries());
  const bible = await gatheringStoryBible(
    view,
    storyBibleOf(view, request.book),
    [...texts, gathered],
  );
  return {
    model: settings.model,
    system: [{ text: GATHERING_PROMPT }, { text: bible, cache: true }],
    messages: [{ role: 'user', content: askText(settings, gathered, texts) }],
  };
}

/**
 * Every Entry of the Story Bible, as of `book`, that the Gathering adds to
 * rather than doubles: one that first appears in a later Book too, though
 * the request isn't sent it.
 */
async function knownEntries(
  view: AssistantView,
  book: string | undefined,
): Promise<KnownEntry[]> {
  const lens = storyBibleOf(view, book);
  return Promise.all(
    lens.all.map(
      async (e) =>
        lens.read(await view.read({ kind: 'entry', id: e.id })).entry,
    ),
  );
}

/** A Gathering stopped by the Author: its call is given up on. */
class Stopped extends Error {}

/**
 * The Gathering of one Project: its estimate, its run, and its result kept
 * on this computer until the Author reviews or discards it.
 */
export function createGathering({
  store,
  providerFor,
  listingOf,
  files,
  clock,
}: GatheringDeps) {
  /** The Gathering running, if any: aborted to stop it. */
  let running: AbortController | null = null;

  /** What `settings` would read, each Scene's Prose read, and how it is sent. */
  async function scoped(settings: GatheringSettings): Promise<Scoped> {
    // What the Author typed last is on disk before anything is read.
    await store.flush();
    const view = store.assistantView();
    const manuscript = view.manuscript();
    const prose = new Map<string, string>();
    const planned: PlannedChapter[] = [];
    for (const chapter of scopeChapters(manuscript, settings.scope)) {
      for (const id of chapter.scenes) {
        const markdown = unitText(await view.read({ kind: 'scene', id }));
        prose.set(id, sceneText(manuscript, id, markdown));
      }
      const whole = await gatheringRequest(
        view,
        settings,
        { book: chapter.book, scenes: chapter.scenes },
        prose,
        [],
      );
      const all = [
        ...whole.system.map((b) => b.text),
        whole.messages[0].content,
      ];
      const proseSize = chapter.scenes.reduce(
        (sum, id) => sum + tokens(prose.get(id)!),
        0,
      );
      planned.push({
        id: chapter.id,
        ...(chapter.book !== undefined && { book: chapter.book }),
        fixed: tokens(all.join('\n\n')) - proseSize,
        scenes: chapter.scenes.map((id) => ({
          id,
          size: tokens(prose.get(id)!),
        })),
      });
    }
    const window = knownWindow(listingOf(settings.model).window);
    return { view, plan: planGathering(planned, window), prose };
  }

  /** A Model's price, nothing for one on this computer. */
  const priceFor = (model: Model): Price | null =>
    model.provider === 'lmstudio'
      ? { input: 0, cached: 0, written: 0, output: 0 }
      : listingOf(model).price;

  return {
    /**
     * What a Gathering of `settings` would send and cost, before anything
     * is sent.
     */
    async estimate(settings: GatheringSettings): Promise<GatheringEstimate> {
      const { plan } = await scoped(settings);
      return estimateGathering(plan, priceFor(settings.model));
    },

    /**
     * Reads the Prose of `settings` Chapter by Chapter, one request each,
     * or more for a Chapter past the window, merging what each reply gives
     * into the list, and keeping it after each; calls `onProgress` after
     * each. Ends when every request is answered, when the Author stops it,
     * or when a call fails; what was gathered so far stays reviewable,
     * with the Chapters not read in full.
     */
    async gather(
      settings: GatheringSettings,
      onProgress: (progress: GatheringProgress) => void = () => {},
    ): Promise<Gathering> {
      if (running) throw new Error('A Gathering is running already');
      const stop = new AbortController();
      running = stop;
      // Stopped, a call under way is given up on at once, even one that
      // hasn't said a word yet; whatever it says after is never read.
      const stopped = new Promise<'stopped'>((resolve) =>
        stop.signal.addEventListener('abort', () => resolve('stopped')),
      );
      try {
        const { view, plan, prose } = await scoped(settings);
        const { requests } = plan;
        const gathering: Gathering = {
          settings,
          startedAt: clock.now(),
          state: 'running',
          unread: [...new Set(requests.map((r) => r.chapter))],
          tooBig: plan.tooBig,
          candidates: [],
        };
        const save = () => files.write(store.id, gathering);
        await save();
        for (const [i, request] of requests.entries()) {
          if (stop.signal.aborted) {
            gathering.state = 'stopped';
            break;
          }
          let raw = '';
          const finished = await Promise.race([
            stopped,
            finishedCall(
              providerFor(settings.model),
              await gatheringRequest(
                view,
                settings,
                request,
                prose,
                gathering.candidates,
              ),
              (text) => {
                if (stop.signal.aborted) throw new Stopped();
                raw += text;
              },
            ),
          ]);
          if (finished === 'stopped' || stop.signal.aborted) {
            gathering.state = 'stopped';
            break;
          }
          const { cost } = finished.metered;
          if (cost !== undefined) {
            gathering.cost = (gathering.cost ?? 0) + cost;
          }
          if (finished.failure) {
            gathering.state = 'failed';
            gathering.failure = finished.failure.kind;
            break;
          }
          gathering.candidates = mergeGathered(
            gathering.candidates,
            gatheredBlocks(withoutThinking(raw)),
            {
              entries: await knownEntries(view, request.book),
              scenes: request.scenes,
              types: settings.types,
            },
          );
          const lastOfChapter = requests[i + 1]?.chapter !== request.chapter;
          const cutShort =
            finished.kind === 'reply' && finished.ending !== 'complete';
          if (lastOfChapter && !cutShort) {
            gathering.unread = gathering.unread.filter(
              (c) => c !== request.chapter,
            );
          }
          await save();
          onProgress({ done: i + 1, total: requests.length, gathering });
        }
        if (gathering.state === 'running') gathering.state = 'done';
        await save();
        return gathering;
      } finally {
        running = null;
      }
    },

    /** Stops the Gathering running, if any: the call under way is given up on. */
    stop(): void {
      running?.abort();
    },

    /**
     * The Gathering kept on this computer, if any; one still running when
     * the app closed is stopped.
     */
    async saved(): Promise<Gathering | null> {
      const gathering = await files.read(store.id);
      if (gathering?.state === 'running' && !running) {
        return { ...gathering, state: 'stopped' };
      }
      return gathering;
    },

    /** Keeps the Author's edits and ticks to the list. */
    async review(candidates: Candidate[]): Promise<void> {
      const gathering = await files.read(store.id);
      if (gathering) await files.write(store.id, { ...gathering, candidates });
    },

    /** Forgets the Gathering kept, once accepted or discarded. */
    async discard(): Promise<void> {
      await files.remove(store.id);
    },
  };
}
