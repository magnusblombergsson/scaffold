import type {
  ConversationMessage,
  Mode,
  Saw,
  SawUnit,
} from '../../shared/conversation';
import { mentionMatcher } from '../../shared/mentions';
import { proposalBlock, type ProposalView } from '../../shared/proposal';
import {
  ENTRY_TYPE_LABELS,
  PROJECT_OUTLINE,
  ROLE_LABELS,
  STATUS_LABELS,
  unitKey,
  unitText,
  type EntrySummary,
  type EntryType,
  type EntryValue,
  type Manuscript,
  type ManuscriptChapter,
  type ManuscriptScene,
} from '../../shared/project-types';
import type { AssistantView } from '../project-store/project-store';
import type { PromptBlock, PromptMessage } from './provider';
import { MODE_PROMPTS } from './system-prompts';

// The context builder (MVP spec §10): what the Assistant is sent for one
// turn, built afresh every turn from the Project as it is now. It reads
// through the Assistant's view, which has no private notes.

/** What the Author asks for in Writing: a free question, or a Review. */
export type Command = 'question' | 'review-scene' | 'review-chapter';

/** What an Interview is about: one Entry, one Entry type, a Chapter or Scene, or open. */
export type InterviewFocus =
  | { kind: 'open' }
  | { kind: 'entry'; id: string }
  | { kind: 'entry-type'; type: EntryType }
  | { kind: 'chapter'; id: string }
  | { kind: 'scene'; id: string };

/**
 * One turn: the Conversation's Mode and what it is about, and its messages
 * so far, ending with the Author's new one. In Writing, `sceneId` is the
 * Scene in focus, and a Review Chapter reviews its Chapter.
 */
export type ContextRequest = (
  | { mode: 'brainstorm' }
  | { mode: 'interview'; focus: InterviewFocus }
  | { mode: 'writing'; command: Command; sceneId: string | null }
) & { messages: ConversationMessage[] };

/**
 * What is sent, in order: system prompt, Story Bible, Outline skeleton and
 * Prose in focus as system blocks, then the Conversation's earlier messages
 * and the new one.
 * Cache breakpoints follow the skeleton and the last block before the new
 * message. `saw` lists what was sent, by id.
 */
export type AssistantContext = {
  system: PromptBlock[];
  messages: PromptMessage[];
  saw: Saw;
};

export async function buildContext(
  view: AssistantView,
  request: ContextRequest,
): Promise<AssistantContext> {
  const manuscript = view.manuscript();
  const skeleton = await outlineSkeleton(view, manuscript);
  const focus = await inFocus(view, manuscript, request);
  // A reply cut short isn't sent back: the model would take it as one to
  // continue, and a Retry answers the Author's message afresh.
  const sent = request.messages.filter((m) => !m.interrupted);
  const bible = await storyBible(
    view,
    [
      ...skeleton.texts,
      ...focus.map((unit) => unit.text),
      ...sent.map((m) => m.text),
    ],
    request.mode === 'interview' ? request.focus : null,
  );

  const system: PromptBlock[] = [
    { text: MODE_PROMPTS[request.mode] },
    { text: bible.text },
    { text: skeleton.text, cache: true },
  ];
  if (focus.length > 0) system.push({ text: focusBlock(focus) });
  const messages: PromptMessage[] = sent.map((m) => ({
    role: m.role === 'author' ? 'user' : 'assistant',
    content: [m.text, ...(m.proposals ?? []).map(proposalText)]
      .filter(Boolean)
      .join('\n\n'),
  }));
  // The second breakpoint: all before the new message, which the next turn
  // sends again unchanged as long as the Prose in focus is.
  const beforeNew = messages.length > 1 ? messages.at(-2)! : system.at(-1)!;
  beforeNew.cache = true;

  return {
    system,
    messages,
    saw: {
      entries: bible.ids,
      units: focus.map((unit) => unit.unit),
      messages: Math.max(0, sent.length - 1),
    },
  };
}

/**
 * The Entries the Assistant may see, as one block: those seen always, those
 * seen when mentioned whose name or an alias is in `texts`, and those an
 * Interview is about. A mention in another Entry doesn't count, and an Entry
 * seen never is never sent.
 */
async function storyBible(
  view: AssistantView,
  texts: string[],
  interview: InterviewFocus | null,
): Promise<{ text: string; ids: string[] }> {
  const summaries = view.listEntries();
  const mentioned = mentionMatcher(
    summaries.filter((e) => e.visibility === 'mentioned'),
  ).mentioned(texts);
  const inFocus = (e: EntrySummary) =>
    (interview?.kind === 'entry' && interview.id === e.id) ||
    (interview?.kind === 'entry-type' && interview.type === e.type);
  const seen = summaries.filter(
    (e) =>
      e.visibility === 'always' ||
      (e.visibility === 'mentioned' && (mentioned.has(e.id) || inFocus(e))),
  );
  const entries = await Promise.all(
    seen.map((e) => view.read({ kind: 'entry', id: e.id })),
  );
  const heading =
    'The Story Bible: what the Author has written down about the story, as far as it concerns this turn.';
  return {
    text:
      entries.length === 0
        ? `${heading}\n\n(No Entries for this turn.)`
        : [heading, ...entries.map(entryText)].join('\n\n'),
    ids: seen.map((e) => e.id),
  };
}

/**
 * A Proposal as the reply it was made in sent it, and what the Author made
 * of it; undecided ones are always sent in full.
 */
function proposalText(proposal: ProposalView): string {
  const { state } = proposal;
  const decided =
    state.kind === 'pending'
      ? "The Author hasn't decided on this Proposal yet."
      : state.kind === 'rejected'
        ? 'The Author rejected this Proposal.'
        : state.edited
          ? 'The Author edited this Proposal, then accepted it.'
          : 'The Author accepted this Proposal.';
  return `${proposalBlock(proposal)}\n(${decided})`;
}

function entryText(entry: EntryValue): string {
  const lines = [
    `## ${entry.name} (${ENTRY_TYPE_LABELS[entry.type]})`,
    `Id: ${entry.id}`,
  ];
  if (entry.aliases.length > 0) {
    lines.push(`Also called: ${entry.aliases.join(', ')}`);
  }
  const { role, voice, senses, status } = entry.fields;
  if (role) lines.push(`Role: ${ROLE_LABELS[role]}`);
  if (status) lines.push(`Status: ${STATUS_LABELS[status]}`);
  lines.push(entry.description.trim() || '(No description.)');
  if (voice) {
    const said = [
      ['Voice', voice.traits.trim()],
      ['Says', voice.says.join(', ')],
      ['Never says', voice.neverSays.join(', ')],
    ];
    for (const [label, value] of said) {
      if (value) lines.push(`${label}: ${value}`);
    }
    if (voice.examples.length > 0) {
      lines.push(
        'Example lines, written by the Author:',
        ...voice.examples.map((line) => `> ${line}`),
      );
    }
  }
  if (senses) {
    const sensed = [
      ['Smells', senses.smells],
      ['Sight', senses.sight],
      ['Sound', senses.sound],
      ['Touch', senses.touch],
      ['Atmosphere', senses.atmosphere],
    ];
    for (const [label, value] of sensed) {
      if (value.trim()) lines.push(`${label}: ${value.trim()}`);
    }
  }
  return lines.join('\n');
}

/**
 * Every Outline in Manuscript order, the Project's first, under the titles
 * of its Chapters and Scenes; no Prose. `texts` holds the Outlines.
 */
async function outlineSkeleton(
  view: AssistantView,
  manuscript: Manuscript,
): Promise<{ text: string; texts: string[] }> {
  const texts: string[] = [];
  async function outline(id: string): Promise<string> {
    const { body } = await view.read({ kind: 'outline', id });
    texts.push(body);
    return body.trim() || '(No Outline.)';
  }
  const parts = [
    'The Outline skeleton: the Outline of the whole story, then each Chapter and Scene in Manuscript order with its Outline. It holds no Prose.',
    `## The story\n${await outline(PROJECT_OUTLINE)}`,
  ];
  for (const chapter of manuscript.chapters) {
    parts.push(`## Chapter “${chapter.title}”\n${await outline(chapter.id)}`);
    for (const scene of chapter.scenes) {
      parts.push(`### Scene “${scene.title}”\n${await outline(scene.id)}`);
    }
  }
  return { text: parts.join('\n\n'), texts };
}

/** One unit's text in focus, under a heading that names it. */
type UnitInFocus = { unit: SawUnit; heading: string; text: string };

/** The units in focus for this turn, per Mode and command, each once. */
async function inFocus(
  view: AssistantView,
  manuscript: Manuscript,
  request: ContextRequest,
): Promise<UnitInFocus[]> {
  const units = new Map<string, UnitInFocus>();
  const where = placesOf(manuscript);

  async function add(unit: SawUnit, heading: string): Promise<void> {
    const key = unitKey(unit);
    if (units.has(key)) return;
    const text = unitText(await view.read(unit));
    units.set(key, { unit, heading, text });
  }
  /** A Scene's Prose, unless it is Missing, and with `context`, its Outline and Notes and its Chapter's Outline. */
  async function scene(id: string, context: boolean): Promise<void> {
    const place = where.scenes.get(id);
    if (!place) return;
    const name = `Scene “${place.scene.title}”`;
    if (context) {
      if (place.chapter) {
        await add(
          { kind: 'outline', id: place.chapter.id },
          `Outline of Chapter “${place.chapter.title}”`,
        );
      }
      await add({ kind: 'outline', id }, `Outline of ${name}`);
      await add({ kind: 'notes', id }, `Notes on ${name}`);
    }
    if (!place.scene.missing) {
      const of = place.chapter ? ` in Chapter “${place.chapter.title}”` : '';
      await add({ kind: 'scene', id }, `Prose of ${name}${of}`);
    }
  }
  /** Each Scene's Prose in a Chapter, and with `context`, the Outlines and the Chapter's Notes. */
  async function chapter(id: string, context: boolean): Promise<void> {
    const found = where.chapters.get(id);
    if (!found) return;
    if (context) {
      await add({ kind: 'outline', id }, `Outline of Chapter “${found.title}”`);
      await add({ kind: 'notes', id }, `Notes on Chapter “${found.title}”`);
    }
    for (const s of found.scenes) {
      if (context) {
        await add(
          { kind: 'outline', id: s.id },
          `Outline of Scene “${s.title}”`,
        );
      }
      await scene(s.id, false);
    }
  }

  if (request.mode === 'interview') {
    const { focus } = request;
    if (focus.kind === 'scene') await scene(focus.id, false);
    if (focus.kind === 'chapter') await chapter(focus.id, false);
  } else if (request.mode === 'writing') {
    const { command, sceneId } = request;
    if (command === 'review-chapter') {
      const id = sceneId && where.scenes.get(sceneId)?.chapter?.id;
      if (id) await chapter(id, true);
    } else if (sceneId) {
      await scene(sceneId, true);
    }
    if (command === 'question') {
      const asked = request.messages.at(-1)?.text ?? '';
      for (const id of atMentioned(asked, manuscript)) {
        if (where.chapters.has(id)) await chapter(id, true);
        else await scene(id, true);
      }
    }
  }
  return [...units.values()];
}

function focusBlock(units: UnitInFocus[]): string {
  return [
    'In focus: the Author’s own Prose, with the Outlines and Notes that go with it. Quote it; never rewrite it.',
    ...units.map(
      ({ heading, text }) => `## ${heading}\n${text.trim() || '(Empty.)'}`,
    ),
  ].join('\n\n');
}

type Places = {
  chapters: Map<string, ManuscriptChapter>;
  scenes: Map<
    string,
    { scene: ManuscriptScene; chapter: ManuscriptChapter | null }
  >;
};

function placesOf(manuscript: Manuscript): Places {
  const places: Places = { chapters: new Map(), scenes: new Map() };
  for (const chapter of manuscript.chapters) {
    places.chapters.set(chapter.id, chapter);
    for (const scene of chapter.scenes) {
      places.scenes.set(scene.id, { scene, chapter });
    }
  }
  for (const scene of manuscript.unplaced) {
    places.scenes.set(scene.id, { scene, chapter: null });
  }
  return places;
}

/**
 * The Chapters and Scenes the Author @-mentions in `text` by title, ignoring
 * case, in the order mentioned. Where titles overlap, the longest wins; a
 * title more than one unit has mentions them all.
 */
function atMentioned(text: string, manuscript: Manuscript): string[] {
  const byTitle = new Map<string, string[]>();
  const units = [
    ...manuscript.chapters.flatMap((c) => [c, ...c.scenes]),
    ...manuscript.unplaced,
  ];
  for (const { id, title } of units) {
    const key = title.trim().toLocaleLowerCase();
    if (key) byTitle.set(key, [...(byTitle.get(key) ?? []), id]);
  }
  if (byTitle.size === 0) return [];
  const titles = [...byTitle.keys()].sort((a, b) => b.length - a.length);
  const pattern = new RegExp(
    `@(${titles.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})(?![\\p{L}\\p{N}_])`,
    'giu',
  );
  const ids: string[] = [];
  for (const match of text.matchAll(pattern)) {
    for (const id of byTitle.get(match[1].toLocaleLowerCase()) ?? []) {
      if (!ids.includes(id)) ids.push(id);
    }
  }
  return ids;
}

/** Whether `sceneId` is a Scene whose Prose can be read: in the Project, and not Missing. */
export function readableScene(
  manuscript: Manuscript,
  sceneId: string,
): boolean {
  const place = placesOf(manuscript).scenes.get(sceneId);
  return !!place && !place.scene.missing;
}

/** For a log that names the Mode: the request a Mode's turn makes by default. */
export function defaultRequest(
  mode: Mode,
  sceneId: string | null,
  messages: ConversationMessage[],
): ContextRequest {
  if (mode === 'brainstorm') return { mode, messages };
  if (mode === 'interview') return { mode, focus: { kind: 'open' }, messages };
  return { mode, command: 'question', sceneId, messages };
}
