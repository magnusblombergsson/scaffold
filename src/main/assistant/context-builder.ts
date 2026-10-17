import {
  OPEN_FOCUS,
  planFocus,
  type Compaction,
  type ConversationMessage,
  type InterviewFocus,
  type Mode,
  type PlanFocus,
  type Saw,
  type SawUnit,
} from '../../shared/conversation';
import { findingBlock, type ReviewCommand } from '../../shared/finding';
import { roleText } from '../../shared/entry';
import {
  customValues,
  fieldsOfType,
  type CustomField,
} from '../../shared/custom-field';
import { mentionMatcher } from '../../shared/mentions';
import { relationPhrase } from '../../shared/relation';
import { statusOf } from '../../shared/status';
import {
  storyBibleAsOf,
  type StoryBibleLens,
} from '../../shared/story-bible-as-of';
import {
  bookManuscript,
  bookOf,
  conversationBook,
  partOf,
  topLevel,
} from '../../shared/manuscript-order';
import { hasTag, tagged, tagSpelling } from '../../shared/tags';
import {
  customFieldKey,
  mayPropose,
  proposalBlock,
  type ProposalView,
} from '../../shared/proposal';
import {
  ENTRY_GROUP_TITLES,
  ENTRY_TYPE_LABELS,
  ENTRY_TYPES,
  partName,
  PROJECT_OUTLINE,
  STATUS_LABELS,
  unitKey,
  unitText,
  type EntrySummary,
  type EntryType,
  type BookDetails,
  type EntryValue,
  type Manuscript,
  type ManuscriptBook,
  type ManuscriptChapter,
  type ManuscriptPart,
  type ManuscriptScene,
} from '../../shared/project-types';
import type { AssistantView } from '../project-store/project-store';
import type { PromptBlock, PromptMessage } from './provider';
import { MODE_PROMPTS, PLAN_REQUESTS, REVIEW_ASKS } from './system-prompts';
import { spanText } from '../../shared/beat-measure';
import { formatBand } from '../../shared/book-details';
import {
  conventionOf,
  CONVENTIONS,
  FORMATS,
  GENRES,
  NO_STRUCTURE,
  qualifiedBeatId,
  shortlist,
  shownIds,
  structureOf,
  type Beat,
} from '../../shared/structure-catalogue';

// The context builder (MVP spec §10): what the Assistant is sent for one
// turn, built afresh every turn from the Project as it is now. It reads
// through the Assistant's view, which has no private notes.

/** What the Author asks for in Writing: a free question, or a Review. */
export type Command = 'question' | ReviewCommand;

export type { InterviewFocus, PlanFocus };

/**
 * One turn: the Conversation's Mode and what it is about, and its messages
 * so far, ending with the Author's new one, with the latest `summary` of
 * the older ones once it is long. In Writing, `sceneId` is the Scene in
 * focus, and a Review Chapter reviews its Chapter. In a Series, a Brainstorm
 * Interview or Plan is about the `book` it is on, as `conversationBook`
 * says, and Writing about the Book holding the Scene in focus. A Plan is
 * about its `focus` within that Book.
 */
export type ContextRequest = (
  | { mode: 'brainstorm'; book?: string }
  | { mode: 'interview'; focus: InterviewFocus; book?: string }
  | { mode: 'plan'; focus: PlanFocus; book?: string }
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
 * message. `saw` lists what was sent, by id. In a Series, `book` is the Book
 * the turn is about, by id, as of which the Entries were sent.
 */
export type AssistantContext = {
  system: PromptBlock[];
  messages: PromptMessage[];
  saw: Saw;
  book?: string;
};

export async function buildContext(
  view: AssistantView,
  request: ContextRequest,
): Promise<AssistantContext> {
  const manuscript = view.manuscript();
  const book = bookAbout(manuscript, request);
  const lens = storyBibleOf(view, book);
  const plan =
    request.mode === 'plan'
      ? await planDetail(view, manuscript, book, request.focus)
      : undefined;
  const skeleton = await outlineSkeleton(view, manuscript, book, plan);
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
    lens,
    mayPropose(request.mode, 'relation'),
  );

  const system: PromptBlock[] = [
    { text: MODE_PROMPTS[request.mode] },
    { text: bible.text },
    { text: skeleton.text, cache: true },
  ];
  if (request.mode === 'interview') {
    system.push({
      text: interviewFocusText(view, manuscript, request.focus, lens),
    });
  }
  if (request.mode === 'plan') {
    system.push({ text: planFocusText(manuscript, book, request.focus) });
    system.push({
      text: bookDetailsText(
        view.bookDetails(book),
        request.messages.filter((m) => m.role === 'author').map((m) => m.text),
      ),
    });
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
      units: [...(plan?.notes ?? []), ...focus.map((unit) => unit.unit)],
      messages: Math.max(0, sent.length - 1),
      ...(summary && {
        summarised: covered.filter((m) => !m.interrupted).length,
      }),
    },
    ...(book !== undefined && { book }),
  };
}

/** The Story Bible as the Assistant sees it as of `book`, or of the whole Project without one. */
export function storyBibleOf(
  view: AssistantView,
  book: string | undefined,
): StoryBibleLens {
  return storyBibleAsOf(
    {
      manuscript: view.manuscript(),
      entries: view.listEntries(),
      relations: view.listRelations(),
    },
    book,
  );
}

/**
 * A message as it is sent: its text, the Review or Plan start button it
 * asked for, the Findings it made unless left out, and the Proposals made
 * in it.
 */
export function messageContent(
  m: ConversationMessage,
  { findings }: { findings: boolean },
): string {
  return [
    m.text,
    m.command && REVIEW_ASKS[m.command],
    m.ask && PLAN_REQUESTS[m.ask],
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
 * doesn't count, and an Entry seen never is never sent. In a Series, each
 * is as `lens` sees it, as of the Book the turn is about: a mention is by
 * any name or alias it has had up to it, and one that first appears in a
 * later Book is never sent. Where the Assistant
 * may `relate` Entries, it is told how, once there are two.
 */
async function storyBible(
  view: AssistantView,
  texts: string[],
  interview: InterviewFocus | null,
  lens: StoryBibleLens,
  relate: boolean,
): Promise<{ text: string; ids: string[] }> {
  const summaries = lens.entries;
  const mentioned = mentionMatcher(
    summaries
      .filter((e) => e.visibility === 'mentioned')
      .flatMap((e) => lens.names(e.id) ?? []),
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
    seen.map(
      async (e) =>
        lens.read(await view.read({ kind: 'entry', id: e.id })).entry,
    ),
  );
  const fields = view.customFields();
  const heading =
    'The Story Bible: what the Author has written down about the story, as far as it concerns this turn.';
  return {
    text: [
      heading,
      ...customFieldsText(fields),
      ...(entries.length === 0
        ? ['(No Entries for this turn.)']
        : entries.map((entry) => entryText(entry, fields))),
      ...relationsText(lens, entries),
      ...(relate && entries.length > 1 ? [RELATION_PROPOSALS] : []),
    ].join('\n\n'),
    ids: seen.map((e) => e.id),
  };
}

/**
 * How the Assistant proposes a Relation, in Brainstorm and Interview. It is
 * told with the Story Bible rather than in the Mode's prompt, which the
 * never-Prose eval checks, as it proposes no text of the story.
 */
const RELATION_PROPOSALS = `You may propose a Relation between two of these Entries, naming each by its Id, when what the Author said, the Story Bible or the Prose shows how they relate. "part-of" puts a Place inside another Place, or an Item inside another Item; "same-as" says two Entries of one type are one and the same person or thing; otherwise give a few words as "label", read from the first Entry to the second:

\`\`\`proposal
{"from": "<Id>", "to": "<Id>", "label": "mother of"}
\`\`\`

Write "relation": "part-of" or "relation": "same-as" in place of the label for those. Propose "same-as" only when the Story Bible or the Prose clearly supports it, never as a guess. Relate only Entries already in the Story Bible: for one you propose as new, propose the Relation in a later message, once the Author has accepted it.`;

/**
 * The Relations among the `sent` Entries, each a sentence by their names as
 * sent; nothing when there are none. One naming an Entry not sent is left
 * out, as the Assistant doesn't see it, and in a Series, one not in effect
 * in the Book the turn is about.
 */
function relationsText(
  lens: StoryBibleLens,
  sent: readonly EntryValue[],
): string[] {
  const names = new Map(sent.map((e) => [e.id, e.name]));
  const name = (id: string) => `“${names.get(id)}”`;
  const { pairs, groups } = lens.relations;
  const sentences = [
    ...groups.flatMap(({ faces }) => {
      const seen = faces.filter((face) => names.has(face)).map(name);
      if (seen.length < 2) return [];
      const listed = `${seen.slice(0, -1).join(', ')} and ${seen.at(-1)}`;
      return [
        `- ${listed} are one person or thing under different faces. Keep each Entry’s facts, fields and Voice to that Entry: never let one face’s details leak into another’s, in replies or in Proposals.`,
      ];
    }),
    ...pairs
      .filter((r) => names.has(r.from) && names.has(r.to))
      .map((r) => `- ${name(r.from)} is ${relationPhrase(r)} ${name(r.to)}.`),
  ];
  if (sentences.length === 0) return [];
  return [
    ['How the Author has said these Entries relate:', ...sentences].join('\n'),
  ];
}

/**
 * The Custom fields the Author added, by type, with the field name a
 * Proposal gives each; nothing for a Project without any.
 */
function customFieldsText(fields: readonly CustomField[]): string[] {
  const types = ENTRY_TYPES.filter((type) =>
    fields.some((field) => field.type === type),
  );
  if (types.length === 0) return [];
  return [
    [
      'Fields the Author added to every Entry of a type. Each is free text, shown by its label in an Entry that has it. To propose a change to one, give its field name as "field": "append" a line, or "value" to replace it all.',
      ...types.map(
        (type) =>
          `- ${ENTRY_GROUP_TITLES[type]}: ${fieldsOfType(fields, type)
            .map((f) => `${f.label} ("${customFieldKey(f.id)}")`)
            .join(', ')}`,
      ),
    ].join('\n'),
  ];
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

function entryText(entry: EntryValue, fields: readonly CustomField[]): string {
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
  for (const { field, value } of customValues(entry, fields)) {
    lines.push(`${field.label}: ${value.trim()}`);
  }
  return lines.join('\n');
}

/**
 * In a Series, the Book a turn is about: in Writing, the one holding the
 * Scene in focus, if any; otherwise the Conversation's. None in a Project
 * that is no Series.
 */
function bookAbout(
  manuscript: Manuscript,
  request: ContextRequest,
): string | undefined {
  if (request.mode !== 'writing') {
    return conversationBook(manuscript, request.book);
  }
  const { sceneId } = request;
  return sceneId
    ? bookOf(manuscript, { kind: 'scene', id: sceneId })
    : undefined;
}

/**
 * Every Outline in Manuscript order, the Project's first, under the titles
 * of its Parts, Chapters and Scenes, a Chapter in a Part nested under it,
 * with the Status of each that has one in the list, and its Tags; no Prose.
 * In a Series, each Book's Outline under the Series', and the Parts,
 * Chapters and Scenes of the Book `book` alone, nested under it; never the
 * Unplaced Chapters, which are in no Book. `texts` holds the Outlines.
 *
 * In Plan, the `plan`: each unit in its focus with its Status, whether it
 * holds Prose and its Notes, and the rest with only their titles and
 * Outlines; never Tags. `texts` holds the Notes sent too.
 */
async function outlineSkeleton(
  view: AssistantView,
  manuscript: Manuscript,
  book: string | undefined,
  plan?: PlanDetail,
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
    node: ManuscriptBook | ManuscriptPart | ManuscriptChapter | ManuscriptScene,
  ): Promise<string> {
    if (plan) return planUnit(heading, node, plan);
    const status = statusOf(statuses, node.status);
    return [
      heading,
      `Id: ${node.id}`,
      ...(status ? [`Status: ${status.name}`] : []),
      ...(node.tags ? [`Tags: ${node.tags.join(', ')}`] : []),
      await outline(node.id),
    ].join('\n');
  }
  /** A unit of the plan: in full in its focus, else its title and Outline. */
  async function planUnit(
    heading: string,
    node: ManuscriptBook | ManuscriptPart | ManuscriptChapter | ManuscriptScene,
    { inFocus, prose }: PlanDetail,
  ): Promise<string> {
    if (!inFocus.has(node.id)) {
      return [heading, `Id: ${node.id}`, await outline(node.id)].join('\n');
    }
    const status = statusOf(statuses, node.status);
    const { body: notes } = await view.read({ kind: 'notes', id: node.id });
    texts.push(notes);
    return [
      heading,
      `Id: ${node.id}`,
      ...(status ? [`Status: ${status.name}`] : []),
      prose.has(node.id) ? 'Holds Prose' : 'No Prose yet',
      await outline(node.id),
      ...(notes.trim() ? [`Notes:\n${notes.trim()}`] : []),
    ].join('\n');
  }
  const label = partName(manuscript.partLabel);
  const { books } = manuscript;
  const about = books?.find((b) => b.id === book);
  const hasParts = books
    ? !!manuscript.parts?.some((p) => p.book === about?.id)
    : !!manuscript.parts;
  const listed = hasParts
    ? `each ${label}, Chapter and Scene in Manuscript order with its Outline, a Chapter in ${withArticle(label)} under it`
    : 'each Chapter and Scene in Manuscript order with its Outline';
  const blocks = [
    plan
      ? planHeading(listed, books ? (about?.title ?? null) : undefined)
      : !books
        ? `The Outline skeleton: the Outline of the whole story, then ${listed}, each under its Id and, if the Author gave them, its Status and Tags. It holds no Prose.`
        : about
          ? `The Outline skeleton: the Outline of the whole Series, then each Book's in reading order, and under the Book this turn is about, “${about.title}”, ${listed}; the other Books' are not sent. Each is under its Id and, if the Author gave them, its Status and Tags. It holds no Prose.`
          : "The Outline skeleton: the Outline of the whole Series, then each Book's in reading order, each under its Id and, if the Author gave them, its Status and Tags. No Book's Parts, Chapters and Scenes are sent, as this turn is about none. It holds no Prose.",
    `## The ${books ? 'Series' : 'story'}\nId: ${PROJECT_OUTLINE}\n${await outline(PROJECT_OUTLINE)}`,
  ];
  async function chapter(node: ManuscriptChapter, level: string) {
    const name = node.unplaced ? 'Unplaced Chapter' : 'Chapter';
    blocks.push(await unit(`${level} ${name} “${node.title}”`, node));
    for (const scene of node.scenes) {
      blocks.push(await unit(`${level}# Scene “${scene.title}”`, scene));
    }
  }
  /** The top level of `of`, its headings `level` deep. */
  async function tree(of: Manuscript, level: string) {
    for (const item of topLevel(of)) {
      if (item.kind === 'chapter') {
        await chapter(item.chapter, level);
        continue;
      }
      blocks.push(
        await unit(`${level} ${label} “${item.part.title}”`, item.part),
      );
      for (const c of item.chapters) await chapter(c, `${level}#`);
    }
  }
  if (!books) {
    await tree(manuscript, '##');
    return { text: blocks.join('\n\n'), texts };
  }
  for (const each of books) {
    blocks.push(await unit(`## Book “${each.title}”`, each));
    if (each.id === about?.id) {
      await tree(bookManuscript(manuscript, each.id), '###');
    }
  }
  return { text: blocks.join('\n\n'), texts };
}

/**
 * What Plan sends in full: the units in its focus, by id, which of them
 * hold Prose, and the Notes of each, as the Assistant saw them.
 */
type PlanDetail = {
  inFocus: Set<string>;
  prose: Set<string>;
  notes: SawUnit[];
};

/**
 * The units of a Plan's `focus` within its Book, `book` in a Series: the
 * Book itself and all it holds, or a Part or Chapter of it and what it
 * holds; none for a focus no longer in the Book. Never an Unplaced Chapter
 * or Scene, which is in no Book. A unit holds Prose when a Scene in it has
 * any; the Prose is read only to tell, and never sent.
 */
async function planDetail(
  view: AssistantView,
  manuscript: Manuscript,
  book: string | undefined,
  focus: PlanFocus,
): Promise<PlanDetail> {
  const ofBook = bookManuscript(manuscript, book);
  const placed = ofBook.chapters.filter((c) => !c.unplaced);
  const units: { id: string; scenes: ManuscriptScene[] }[] = [];
  const chapter = (c: ManuscriptChapter) => {
    units.push({ id: c.id, scenes: c.scenes });
    for (const s of c.scenes) units.push({ id: s.id, scenes: [s] });
  };
  /** A Part, and with `within`, its Chapters and their Scenes. */
  const part = (p: ManuscriptPart, within: boolean) => {
    const held = placed.filter((c) => c.part === p.id);
    units.push({ id: p.id, scenes: held.flatMap((c) => c.scenes) });
    if (within) held.forEach(chapter);
  };
  if (focus.kind === 'open') {
    if (book !== undefined) {
      units.push({ id: book, scenes: placed.flatMap((c) => c.scenes) });
    }
    for (const p of ofBook.parts ?? []) part(p, false);
    placed.forEach(chapter);
  } else if (focus.kind === 'part') {
    const found = ofBook.parts?.find((p) => p.id === focus.id);
    if (found) part(found, true);
  } else {
    const found = placed.find((c) => c.id === focus.id);
    if (found) chapter(found);
  }
  const withProse = new Set<string>();
  for (const { scenes } of units) {
    for (const s of scenes) {
      if (s.missing || withProse.has(s.id)) continue;
      const { markdown } = await view.read({ kind: 'scene', id: s.id });
      if (markdown.trim() !== '') withProse.add(s.id);
    }
  }
  return {
    inFocus: new Set(units.map((u) => u.id)),
    prose: new Set(
      units
        .filter((u) => u.scenes.some((s) => withProse.has(s.id)))
        .map((u) => u.id),
    ),
    notes: units.map((u) => ({ kind: 'notes', id: u.id })),
  };
}

/**
 * What the plan holds, which stands in for the Outline skeleton in Plan:
 * `listed` says what of the Book is listed, and in a Series, `book` names
 * the Book planned.
 */
function planHeading(listed: string, book: string | null | undefined): string {
  const full =
    'Within the focus, each is sent in full: its Status, if the Author gave one, whether it holds Prose, and its Notes, the Author’s own. Outside it, only its title and Outline. It holds no Prose.';
  if (book === undefined) {
    return `The plan: the Outline of the whole story, then ${listed}, each under its Id. ${full}`;
  }
  return `The plan: the Outline of the whole Series, then each Book's in reading order, and under the Book you are planning, “${book ?? ''}”, ${listed}, each under its Id. ${full}`;
}

/**
 * What a Plan is about within its Book, by name and id as the Project has
 * it now; a Part or Chapter no longer in the Book is named as gone.
 */
function planFocusText(
  manuscript: Manuscript,
  book: string | undefined,
  focus: PlanFocus,
): string {
  const heading = 'The Plan’s focus, as the Author set it:';
  const ofBook = bookManuscript(manuscript, book);
  const gone =
    'which is no longer in this Book. Tell the Author, and suggest a new focus.';
  const title = manuscript.books?.find((b) => b.id === book)?.title;
  const label = partName(manuscript.partLabel);
  switch (focus.kind) {
    case 'open':
      return `${heading} ${title === undefined ? 'the whole story' : `the Book “${title}”, Id: ${book}`}. Plan its shape as a whole.`;
    case 'part': {
      const part = ofBook.parts?.find((p) => p.id === focus.id);
      if (!part) return `${heading} ${withArticle(label)} ${gone}`;
      return `${heading} the ${label} “${part.title}”, Id: ${part.id}. Plan its shape; the rest of the Book is there for reference.`;
    }
    case 'chapter': {
      const chapter = ofBook.chapters.find(
        (c) => c.id === focus.id && !c.unplaced,
      );
      if (!chapter) return `${heading} a Chapter ${gone}`;
      return `${heading} the Chapter “${chapter.title}”, Id: ${chapter.id}. Plan its shape; the rest of the Book is there for reference.`;
    }
  }
}

/**
 * The Book's details as Plan is sent them, and the catalogue shortlisted
 * for it (spec: Outline planner §2, §12): the Structures and Genre
 * conventions that fit, those it follows and those the Author `asked`
 * about by name in full, the rest by name only. Whether a Structure is
 * chosen says whether to offer to find one; one this version doesn't know
 * is said to be so. Ids the catalogue doesn't know are left out otherwise.
 */
function bookDetailsText(details: BookDetails, asked: string[]): string {
  const named = (entry: { id: string; name: string }) =>
    `${entry.name} (${entry.id})`;
  const genres = shownIds(details.genres, GENRES).map(
    (id) => GENRES.find((g) => g.id === id)!,
  );
  const format = FORMATS.find((f) => f.id === details.bookFormat);
  const conventions = shownIds(details.genreConventions, CONVENTIONS).map(
    (id) => conventionOf(id)!,
  );
  const { structures, conventions: shortlisted } = shortlist(details, asked);
  return [
    'The Book’s details, as the Author set or accepted them, and the structure catalogue this app knows. Name a Structure, Genre convention, Genre or Format by its Id when you propose one.',
    `Genres: ${genres.length > 0 ? genres.map(named).join(', ') : 'none chosen.'}`,
    `Format: ${
      format
        ? `${format.name}, ${formatBand(format)} (${format.id})`
        : details.bookFormat !== undefined
          ? 'one this version of the app doesn’t know.'
          : 'none chosen.'
    }`,
    `Structure: ${structureText(details.structure)}`,
    `Genre conventions: ${conventions.length > 0 ? conventions.map(named).join(', ') : 'none.'}`,
    '## Structures in full: those fitting the Book’s Genres and Format, the one it follows, and any the Author asked about',
    ...structures.full.map((s) =>
      [
        `### ${s.name}`,
        `Id: ${s.id}`,
        s.credit,
        s.description,
        `Fits: ${GENRES.filter((g) => s.fits.genres.includes(g.id))
          .map((g) => g.name)
          .join(', ')}; ${FORMATS.filter((f) => s.fits.formats.includes(f.id))
          .map((f) => f.name)
          .join(', ')}`,
        'Beats, in order, each under the Id a Scene’s marks name it by:',
        ...s.beats.map((b) => beatLine(s, b)),
      ].join('\n'),
    ),
    ...(structures.byName.length > 0
      ? [
          `Other Structures, less usual for this Book, by name only: ${structures.byName.map(named).join(', ')}.`,
        ]
      : []),
    '## Genre conventions in full: those of the Book’s Genres, those it follows, and any the Author asked about',
    ...shortlisted.full.map((c) =>
      [
        `### ${c.name}`,
        `Id: ${c.id}`,
        c.credit,
        c.description,
        'Required Scenes, each under the Id a Scene’s marks name it by:',
        ...c.beats.map((b) => beatLine(c, b)),
        'Rules:',
        ...c.rules.map((rule) => `- ${rule}`),
      ].join('\n'),
    ),
    ...(shortlisted.byName.length > 0
      ? [
          `Other Genre conventions, by name only: ${shortlisted.byName.map(named).join(', ')}.`,
        ]
      : []),
  ].join('\n\n');
}

/** What Plan is told of the Book's Structure, and so whether to offer to find one. */
function structureText(structure: string | undefined): string {
  if (structure === undefined) {
    return 'none chosen yet. When it would help, offer to find one.';
  }
  if (structure === NO_STRUCTURE) {
    return 'No set Structure. Read any pattern the Author wrote in the Outlines or Notes as their intent, and judge against it in words. Never nudge toward a Structure; you may name the nearest without pressing it.';
  }
  const known = structureOf(structure);
  return known
    ? `${known.name} (${known.id})`
    : `one this version of the app doesn’t know (${structure}). Tell the Author so, and check no Beats.`;
}

/** A Beat of a Structure or Genre convention, as in the catalogue sent. */
function beatLine(source: { id: string }, beat: Beat): string {
  const where = beat.at ? `At ${spanText(beat.at)}` : 'By order only';
  return `- ${beat.name}, Id: ${qualifiedBeatId(source, beat)}: ${beat.purpose} ${where}; ${
    beat.span === 'scene' ? 'one Scene' : 'a run of Scenes'
  }${beat.opensPart ? '; opens a Part' : ''}.`;
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
  const label = partName(manuscript.partLabel);

  async function add(unit: SawUnit, heading: string): Promise<void> {
    const key = unitKey(unit);
    if (units.has(key)) return;
    const text = unitText(await view.read(unit));
    units.set(key, { unit, heading, text });
  }
  /** The Outline of the Part `chapter` is in, if any. */
  async function partOutline(chapter: ManuscriptChapter): Promise<void> {
    const part = partOf(manuscript, chapter.id);
    if (part) {
      await add(
        { kind: 'outline', id: part.id },
        `Outline of ${label} “${part.title}”`,
      );
    }
  }
  /**
   * A Scene's Prose, unless it is Missing, and with `context`, its Outline
   * and Notes and its Chapter's Outline, after its Part's, if it has one.
   */
  async function scene(id: string, context: boolean): Promise<void> {
    const place = where.scenes.get(id);
    if (!place) return;
    const name = `Scene “${place.scene.title}”`;
    if (context) {
      if (place.chapter) {
        await partOutline(place.chapter);
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
  /**
   * Each Scene's Prose in a Chapter, and with `context`, the Outlines, its
   * Part's first, if it has one, and the Chapter's Notes.
   */
  async function chapter(id: string, context: boolean): Promise<void> {
    const found = where.chapters.get(id);
    if (!found) return;
    if (context) {
      await partOutline(found);
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
  /**
   * A Part's Outline and Notes, and its Chapters' Outlines; never their
   * Prose, which may be much of the story.
   */
  async function part(id: string): Promise<void> {
    const found = where.parts.get(id);
    if (!found) return;
    const name = `${label} “${found.title}”`;
    await add({ kind: 'outline', id }, `Outline of ${name}`);
    await add({ kind: 'notes', id }, `Notes on ${name}`);
    for (const c of found.chapters) {
      const title = where.chapters.get(c)?.title;
      if (title !== undefined) {
        await add({ kind: 'outline', id: c }, `Outline of Chapter “${title}”`);
      }
    }
  }

  /**
   * A Book's Outline and Notes, and the Outlines of its Parts and Loose
   * Chapters; never their Prose, which may be much of the story.
   */
  async function book(id: string): Promise<void> {
    const found = manuscript.books?.find((b) => b.id === id);
    if (!found) return;
    await add({ kind: 'outline', id }, `Outline of Book “${found.title}”`);
    await add({ kind: 'notes', id }, `Notes on Book “${found.title}”`);
    for (const { id: unit, name } of bookHoldings(manuscript, id)) {
      await add({ kind: 'outline', id: unit }, `Outline of ${name}`);
    }
  }

  if (request.mode === 'interview') {
    const { focus } = request;
    if (focus.kind === 'book') await book(focus.id);
    if (focus.kind === 'scene') await scene(focus.id, false);
    if (focus.kind === 'chapter') await chapter(focus.id, false);
    if (focus.kind === 'part') await part(focus.id);
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
        if (where.parts.has(id)) await part(id);
        else if (where.chapters.has(id)) await chapter(id, true);
        else await scene(id, true);
      }
    }
  }
  return [...units.values()];
}

/**
 * That the Interview asks about the Custom fields of `type` too, those left
 * empty; nothing when the type has none.
 */
function customFieldsAsk(view: AssistantView, type: EntryType): string {
  const labels = fieldsOfType(view.customFields(), type).map((f) => f.label);
  if (labels.length === 0) return '';
  return ` The Author added ${labels.length === 1 ? 'a field' : 'fields'} to every ${ENTRY_TYPE_LABELS[type]}: ${labels.join(', ')}; ask about ${labels.length === 1 ? 'it' : 'those'} when empty too, as about any field.`;
}

/**
 * What an Interview is about, by name and id as the Project has it now, an
 * Entry's as of the Book the turn is about. An Entry the Assistant never
 * sees isn't named, nor one no longer there or first appearing later.
 */
function interviewFocusText(
  view: AssistantView,
  manuscript: Manuscript,
  focus: InterviewFocus,
  lens: StoryBibleLens,
): string {
  const heading = 'The Interview’s focus, as the Author set it:';
  const gone =
    'which is no longer in the Project. Tell the Author, and suggest a new focus.';
  const where = placesOf(manuscript);
  switch (focus.kind) {
    case 'open':
      return `${heading} open. Choose the gap in the Story Bible or the Outlines most worth filling now. When you choose a gap, first say which gap you chose and why, then ask.`;
    case 'entry': {
      const entry = lens.summary(focus.id);
      if (!entry) return `${heading} an Entry ${gone}`;
      if (entry.visibility === 'never' || !lens.visible(entry.id)) {
        return `${heading} an Entry the Author has kept from you. Say you can't see it, and suggest the Author lets you see it or picks another focus.`;
      }
      return `${heading} the Entry “${entry.name}” (${ENTRY_TYPE_LABELS[entry.type]}), Id: ${entry.id}. Ask about what it lacks.${customFieldsAsk(view, entry.type)}`;
    }
    case 'entry-type':
      return `${heading} every ${ENTRY_TYPE_LABELS[focus.type]} in the Story Bible, and any the story names that has no Entry yet. Ask about what they lack.${customFieldsAsk(view, focus.type)}`;
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
    case 'book': {
      const book = manuscript.books?.find((b) => b.id === focus.id);
      if (!book) return `${heading} a Book ${gone}`;
      const held = bookHoldings(manuscript, book.id).map(({ name }) => name);
      const holds =
        held.length > 0
          ? `which holds ${held.join(', ')}`
          : 'which holds nothing yet';
      return `${heading} the Book “${book.title}”, Id: ${book.id}, ${holds}. Interview out its Outline: what happens, who and why.`;
    }
    case 'part': {
      const label = partName(manuscript.partLabel);
      const part = where.parts.get(focus.id);
      if (!part) return `${heading} ${withArticle(label)} ${gone}`;
      const chapters = part.chapters
        .flatMap((id) => where.chapters.get(id) ?? [])
        .map((c) => `Chapter “${c.title}”`);
      const holds =
        chapters.length > 0
          ? `which holds ${chapters.join(', ')}`
          : 'which holds no Chapters yet';
      return `${heading} the ${label} “${part.title}”, Id: ${part.id}, ${holds}. Interview out its Outline: what happens, who and why.`;
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

/**
 * The Parts and Loose Chapters of a Book, in order, each by id and named as
 * the Assistant is told them, a Part by the Project's label.
 */
function bookHoldings(
  manuscript: Manuscript,
  bookId: string,
): { id: string; name: string }[] {
  const label = partName(manuscript.partLabel);
  return topLevel(bookManuscript(manuscript, bookId)).map((item) =>
    item.kind === 'part'
      ? { id: item.part.id, name: `${label} “${item.part.title}”` }
      : { id: item.chapter.id, name: `Chapter “${item.chapter.title}”` },
  );
}

function focusBlock(units: UnitInFocus[]): string {
  const prose = units.some(({ unit }) => unit.kind === 'scene');
  const notes = units.some(({ unit }) => unit.kind === 'notes');
  return [
    prose
      ? 'In focus: the Author’s own Prose, with the Outlines and Notes that go with it. Quote it; never rewrite it.'
      : notes
        ? 'In focus: the Author’s own Outlines and Notes. Quote them; never rewrite them.'
        : 'In focus: the Author’s own Outlines. Quote them; never rewrite them.',
    ...units.map(
      ({ heading, text }) => `## ${heading}\n${text.trim() || '(Empty.)'}`,
    ),
  ].join('\n\n');
}

type Places = {
  parts: Map<string, ManuscriptPart>;
  chapters: Map<string, ManuscriptChapter>;
  scenes: Map<
    string,
    { scene: ManuscriptScene; chapter: ManuscriptChapter | null }
  >;
};

function placesOf(manuscript: Manuscript): Places {
  const places: Places = {
    parts: new Map((manuscript.parts ?? []).map((p) => [p.id, p])),
    chapters: new Map(),
    scenes: new Map(),
  };
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

/** `name` after “a” or “an”, as in “an Act”. */
function withArticle(name: string): string {
  return `${/^[AEIOU]/.test(name) ? 'an' : 'a'} ${name}`;
}

/**
 * The Parts, Chapters and Scenes the Author @-mentions in `text` by title,
 * ignoring case, in the order mentioned. Where titles overlap, the longest
 * wins; a title more than one unit has mentions them all.
 */
function atMentioned(text: string, manuscript: Manuscript): string[] {
  const byTitle = new Map<string, string[]>();
  const units = [
    ...(manuscript.parts ?? []),
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
 * about the focus it was last set to; in a Brainstorm or Interview, about
 * the `book` it was last put on, if any; in a Plan, about the focus it was
 * last set to within that Book, or the whole Book.
 */
export function defaultRequest(
  mode: Mode,
  sceneId: string | null,
  messages: ConversationMessage[],
  interviewFocus: InterviewFocus = OPEN_FOCUS,
  book?: string,
): ContextRequest {
  const onBook = book !== undefined ? { book } : {};
  if (mode === 'brainstorm') return { mode, messages, ...onBook };
  if (mode === 'interview') {
    return { mode, focus: interviewFocus, messages, ...onBook };
  }
  if (mode === 'plan') {
    return { mode, focus: planFocus(interviewFocus), messages, ...onBook };
  }
  const command = messages.findLast((m) => !m.interrupted)?.command;
  return { mode, command: command ?? 'question', sceneId, messages };
}
