import {
  OPEN_FOCUS,
  type Compaction,
  type ConversationMessage,
  type InterviewFocus,
  type Mode,
  type Saw,
  type SawUnit,
} from '../../shared/conversation';
import { findingBlock, type ReviewCommand } from '../../shared/finding';
import { roleText } from '../../shared/entry';
import { mentionMatcher } from '../../shared/mentions';
import { statusOf } from '../../shared/status';
import { hasTag, tagged, tagSpelling } from '../../shared/tags';
import { proposalBlock, type ProposalView } from '../../shared/proposal';
import {
  ENTRY_TYPE_LABELS,
  PROJECT_OUTLINE,
  STATUS_LABELS,
  unitKey,
  unitText,
  type EntrySummary,
  type EntryValue,
  type Manuscript,
  type ManuscriptChapter,
  type ManuscriptScene,
} from '../../shared/project-types';
import type { AssistantView } from '../project-store/project-store';
import type { PromptBlock, PromptMessage } from './provider';
import { MODE_PROMPTS, REVIEW_ASKS } from './system-prompts';

// The context builder (MVP spec §10): what the Assistant is sent for one
// turn, built afresh every turn from the Project as it is now. It reads
// through the Assistant's view, which has no private notes.

/** What the Author asks for in Writing: a free question, or a Review. */
export type Command = 'question' | ReviewCommand;

export type { InterviewFocus };

/**
 * One turn: the Conversation's Mode and what it is about, and its messages
 * so far, ending with the Author's new one, with the latest `summary` of
 * the older ones once it is long. In Writing, `sceneId` is the Scene in
 * focus, and a Review Chapter reviews its Chapter.
 */
export type ContextRequest = (
  | { mode: 'brainstorm' }
  | { mode: 'interview'; focus: InterviewFocus }
  | { mode: 'writing'; command: Command; sceneId: string | null }
) & {
  messages: ConversationMessage[];
  summary?: Pick<Compaction, 'text' | 'covers'>;
};

/**
 * What is sent, in order: system prompt, Story Bible, Outline skeleton,
 * Prose in focus and the summary of the older messages, if any, as system
 * blocks, then the Conversation's earlier messages and the new one.
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
  const { summary } = request;
  const covered = request.messages.slice(0, summary?.covers ?? 0);
  // A reply cut short isn't sent back: the model would take it as one to
  // continue, and a Retry answers the Author's message afresh.
  const sent = request.messages
    .slice(covered.length)
    .filter((m) => !m.interrupted);
  const bible = await storyBible(
    view,
    [
      ...skeleton.texts,
      ...focus.map((unit) => unit.text),
      ...(summary ? [summary.text] : []),
      ...sent.map((m) => m.text),
    ],
    request.mode === 'interview' ? request.focus : null,
  );

  const system: PromptBlock[] = [
    { text: MODE_PROMPTS[request.mode] },
    { text: bible.text },
    { text: skeleton.text, cache: true },
  ];
  if (request.mode === 'interview') {
    system.push({ text: interviewFocusText(view, manuscript, request.focus) });
  }
  if (focus.length > 0) system.push({ text: focusBlock(focus) });
  if (summary) system.push({ text: summaryBlock(summary.text, covered) });
  // Every Review starts fresh, without the Findings of earlier ones.
  const reviewing =
    request.mode === 'writing' && request.command !== 'question';
  const messages: PromptMessage[] = sent.map((m) => ({
    role: m.role === 'author' ? 'user' : 'assistant',
    content: messageContent(m, { findings: !reviewing }),
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
      ...(summary && {
        summarised: covered.filter((m) => !m.interrupted).length,
      }),
    },
  };
}

/**
 * A message as it is sent: its text, the Review it asked for, the Findings
 * it made unless left out, and the Proposals made in it.
 */
export function messageContent(
  m: ConversationMessage,
  { findings }: { findings: boolean },
): string {
  return [
    m.text,
    m.command && REVIEW_ASKS[m.command],
    ...(findings ? (m.findings ?? []).map(findingBlock) : []),
    ...(m.proposals ?? []).map(proposalText),
  ]
    .filter(Boolean)
    .join('\n\n');
}

/**
 * The summary that stands in for the `covered` messages, with the
 * Proposals made in them that the Author hasn't decided on, in full.
 */
function summaryBlock(text: string, covered: ConversationMessage[]): string {
  const undecided = covered
    .flatMap((m) => m.proposals ?? [])
    .filter((p) => p.state.kind === 'pending');
  return [
    'The earlier part of this Conversation, summarised; the messages it summarises are not sent.',
    text.trim(),
    ...(undecided.length > 0
      ? [
          'Proposals made in that part that the Author hasn’t decided on yet:',
          ...undecided.map(proposalText),
        ]
      : []),
  ].join('\n\n');
}

/**
 * The Entries the Assistant may see, as one block: those seen always, those
 * seen when mentioned whose name or an alias is in `texts`, and those an
 * Interview is about, by Entry, type or Tag. A mention in another Entry
 * doesn't count, and an Entry seen never is never sent.
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
    (interview?.kind === 'entry-type' && interview.type === e.type) ||
    (interview?.kind === 'tag' && hasTag(e.tags, interview.tag));
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
  if (entry.tags && entry.tags.length > 0) {
    lines.push(`Tags: ${entry.tags.join(', ')}`);
  }
  const { role, roleNote, appearance, voice, senses, status } = entry.fields;
  const roles = roleText(role, roleNote);
  if (roles) lines.push(`Role: ${roles}`);
  if (status) lines.push(`Status: ${STATUS_LABELS[status]}`);
  lines.push(entry.description.trim() || '(No description.)');
  if (appearance?.trim()) lines.push(`Appearance: ${appearance.trim()}`);
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
 * of its Chapters and Scenes, with the Status of each that has one in the
 * list, and its Tags; no Prose. `texts` holds the Outlines.
 */
async function outlineSkeleton(
  view: AssistantView,
  manuscript: Manuscript,
): Promise<{ text: string; texts: string[] }> {
  const texts: string[] = [];
  const statuses = view.statuses();
  async function outline(id: string): Promise<string> {
    const { body } = await view.read({ kind: 'outline', id });
    texts.push(body);
    return body.trim() || '(No Outline.)';
  }
  async function unit(
    heading: string,
    node: ManuscriptChapter | ManuscriptScene,
  ): Promise<string> {
    const status = statusOf(statuses, node.status);
    return [
      heading,
      `Id: ${node.id}`,
      ...(status ? [`Status: ${status.name}`] : []),
      ...(node.tags ? [`Tags: ${node.tags.join(', ')}`] : []),
      await outline(node.id),
    ].join('\n');
  }
  const parts = [
    'The Outline skeleton: the Outline of the whole story, then each Chapter and Scene in Manuscript order with its Outline, each under its Id and, if the Author gave them, its Status and Tags. It holds no Prose.',
    `## The story\nId: ${PROJECT_OUTLINE}\n${await outline(PROJECT_OUTLINE)}`,
  ];
  for (const chapter of manuscript.chapters) {
    parts.push(await unit(`## Chapter “${chapter.title}”`, chapter));
    for (const scene of chapter.scenes) {
      parts.push(await unit(`### Scene “${scene.title}”`, scene));
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
      await add({ kind: 'scene', id }, `Prose of ${name}${of}\nId: ${id}`);
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
    // A Tag adds the Outlines of what has it, never its Prose.
    if (focus.kind === 'tag') {
      for (const { unit, name } of tagged(manuscript, focus.tag)) {
        await add({ kind: 'outline', id: unit.id }, `Outline of ${name}`);
      }
    }
  } else if (request.mode === 'writing') {
    const { command, sceneId } = request;
    if (command === 'review-chapter') {
      const id = sceneId && where.scenes.get(sceneId)?.chapter?.id;
      if (id) await chapter(id, true);
    } else if (sceneId) {
      await scene(sceneId, true);
    }
    if (command === 'question') {
      // A question right after a Chapter Review, as for the rest of its
      // Findings, is about that Chapter too.
      const previous = request.messages
        .slice(0, -1)
        .findLast((m) => m.role === 'author');
      if (previous?.command === 'review-chapter') {
        const reviewed = previous.focus[0];
        const id = reviewed && where.scenes.get(reviewed)?.chapter?.id;
        if (id) await chapter(id, true);
      }
      const asked = request.messages.at(-1)?.text ?? '';
      for (const id of atMentioned(asked, manuscript)) {
        if (where.chapters.has(id)) await chapter(id, true);
        else await scene(id, true);
      }
    }
  }
  return [...units.values()];
}

/**
 * What an Interview is about, by name and id as the Project has it now. An
 * Entry the Assistant never sees isn't named, nor one no longer there.
 */
function interviewFocusText(
  view: AssistantView,
  manuscript: Manuscript,
  focus: InterviewFocus,
): string {
  const heading = 'The Interview’s focus, as the Author set it:';
  const gone =
    'which is no longer in the Project. Tell the Author, and suggest a new focus.';
  const where = placesOf(manuscript);
  switch (focus.kind) {
    case 'open':
      return `${heading} open. Choose the gap in the Story Bible or the Outlines most worth filling now. When you choose a gap, first say which gap you chose and why, then ask.`;
    case 'entry': {
      const entry = view.listEntries().find((e) => e.id === focus.id);
      if (!entry) return `${heading} an Entry ${gone}`;
      if (entry.visibility === 'never') {
        return `${heading} an Entry the Author has kept from you. Say you can't see it, and suggest the Author lets you see it or picks another focus.`;
      }
      return `${heading} the Entry “${entry.name}” (${ENTRY_TYPE_LABELS[entry.type]}), Id: ${entry.id}. Ask about what it lacks.`;
    }
    case 'entry-type':
      return `${heading} every ${ENTRY_TYPE_LABELS[focus.type]} in the Story Bible, and any the story names that has no Entry yet. Ask about what they lack.`;
    case 'tag': {
      // An Entry the Assistant never sees doesn't count as having it.
      const spelling = tagSpelling(focus.tag, [
        ...tagged(manuscript, focus.tag).map(({ unit }) => unit.tags ?? []),
        ...view
          .listEntries()
          .filter((e) => e.visibility !== 'never')
          .map((e) => e.tags ?? []),
      ]);
      if (!spelling) {
        return `${heading} the Tag “${focus.tag}”, which is no longer on anything in the Project. Tell the Author, and suggest a new focus.`;
      }
      return `${heading} the Entries, Chapters and Scenes tagged “${spelling}”. Ask about what is missing among them.`;
    }
    case 'chapter': {
      const chapter = where.chapters.get(focus.id);
      if (!chapter) return `${heading} a Chapter ${gone}`;
      return `${heading} the Chapter “${chapter.title}”, Id: ${chapter.id}. Interview out its Outline: what happens, who and why.`;
    }
    case 'scene': {
      const place = where.scenes.get(focus.id);
      if (!place) return `${heading} a Scene ${gone}`;
      return `${heading} the Scene “${place.scene.title}”, Id: ${focus.id}. Interview out its Outline: what happens, who and why.`;
    }
  }
}

function focusBlock(units: UnitInFocus[]): string {
  const prose = units.some(({ unit }) => unit.kind === 'scene');
  return [
    prose
      ? 'In focus: the Author’s own Prose, with the Outlines and Notes that go with it. Quote it; never rewrite it.'
      : 'In focus: the Author’s own Outlines. Quote them; never rewrite them.',
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

/**
 * For a log that names the Mode: the request a Mode's turn makes. In
 * Writing, a Review when the Author's message asks for one; in an Interview,
 * about the focus it was last set to.
 */
export function defaultRequest(
  mode: Mode,
  sceneId: string | null,
  messages: ConversationMessage[],
  interviewFocus: InterviewFocus = OPEN_FOCUS,
): ContextRequest {
  if (mode === 'brainstorm') return { mode, messages };
  if (mode === 'interview') return { mode, focus: interviewFocus, messages };
  const command = messages.findLast((m) => !m.interrupted)?.command;
  return { mode, command: command ?? 'question', sceneId, messages };
}
