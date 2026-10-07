import type {
  EntrySummary,
  EntryType,
  Manuscript,
  ProseLanguage,
  TrashItem,
  UnitRef,
  UnitValue,
  ValueOf,
  Visibility,
} from './project-types';
import type { ExportUnticked } from './export-choice';
import type { Filter, FilterPlace, Filters } from './filter';
import type { ReviewCommand } from './finding';
import type { Status } from './status';
import type { TagUse } from './tags';
import type { Todo, TodoChange, TodoLink } from './todo';
import type { ImportBlock, ImportConvention } from './manuscript-import';
import type { ListedModel, Model, ProviderId, ProviderStatus } from './models';
import type { Command, DockedPanes } from './shortcuts';
import type { PendingProposal, ProposedValue } from './proposal';
import type { MeteredTurn } from './usage';
import type { ViewSettings } from './view-settings';
import { bridge, type MethodTable } from './bridge';

export type { CallFailure } from './bridge';

/**
 * How the Author accepts a Proposal: with the value they `edited` it to,
 * `anyway` when they saw it was stale, and `append` to add it to what its
 * target holds now rather than replace that.
 */
export type AcceptOptions = {
  edited?: ProposedValue;
  anyway?: boolean;
  append?: boolean;
};
import type {
  AskResult,
  AssistantFailure,
  Conversation,
  ConversationSummary,
  InterviewFocus,
  Mode,
} from './conversation';

// The preload exposes these four objects on `window`, built from the method
// table of each. Main registers a handler per method, and both sides are
// checked against these interfaces. A call that fails rejects with a
// `CallFailure`, not an Error.

/**
 * What a structure operation resolves with once it is on disk: the Manuscript,
 * and the step that `undo` reverts while it is still the latest one.
 */
export type Changed = { manuscript: Manuscript; step: number };

/** A structure operation that made a Chapter, Scene or Entry: its id, and the result. */
export type Created = Changed & { id: string };

/**
 * Where main is with saving a unit: `failed` keeps its value unsaved in
 * memory, and main tries it again, waiting longer each time.
 */
export type UnitSaveStatus =
  | { type: 'unitSaveStatus'; ref: UnitRef; state: 'saving' | 'saved' }
  | { type: 'unitSaveStatus'; ref: UnitRef; state: 'failed'; reason: string };

/** A unit that failed to save, and why. */
export type SaveFailure = { ref: UnitRef; reason: string };

/**
 * A unit that wasn't dirty changed on disk, as when a sync client brought
 * another computer's version: `value` is what it holds now.
 */
export type UnitReloaded = {
  type: 'unitReloaded';
  ref: UnitRef;
  value: UnitValue;
  /** Set when it changed because the Author accepted or undid a Proposal, here. */
  byProposal?: true;
};

/**
 * A Proposal was made, accepted, rejected or undone, in any Conversation, or
 * an Entry was written, which may make its Proposals stale or applied.
 */
export type ProposalsChanged = { type: 'proposalsChanged' };

/**
 * A Conversation was renamed, went to Trash or came back, or one forked from
 * a log saved on another computer appeared.
 */
export type ConversationsChanged = { type: 'conversationsChanged' };

/**
 * `project.json`, or the Scene and Trash files it orders, changed on disk;
 * nothing done before can be undone.
 */
export type StructureChanged = {
  type: 'structureChanged';
  manuscript: Manuscript;
  /** Set once, when versions of `project.json` from two computers met. */
  dropped?: Dropped[];
};

/**
 * What two versions of `project.json` saved on different computers lost when
 * one was kept: the Chapters only the other had, and the Scenes only it
 * placed, which are Unplaced now. `host` is where it came from, if known.
 */
export type Dropped = { host?: string; chapters: string[]; scenes: string[] };

/**
 * One version of a unit in Conflict. The `original` is the one the app works
 * with until the Author chooses; `host` is the computer that saved it, when
 * known, and `savedAt` when it was saved.
 */
export type ConflictVersion = {
  versionId: string;
  original: boolean;
  host?: string;
  savedAt: number;
};

/** A unit saved on different computers, or at the same moment: its versions, the original first. */
export type Conflict = { ref: UnitRef; versions: ConflictVersion[] };

/** The units in Conflict changed: `conflicts` is all of them now. */
export type ConflictsChanged = {
  type: 'conflictsChanged';
  conflicts: Conflict[];
};

/**
 * The Entries in the Story Bible changed, as when one was created, renamed,
 * given aliases, retyped, deleted or restored, here or on another computer:
 * `entries` is all of them now.
 */
export type EntriesChanged = {
  type: 'entriesChanged';
  entries: EntrySummary[];
};

/**
 * An Entry's image was set, replaced or removed here. The file can keep its
 * name, so its Entry's summary may not change.
 */
export type EntryImageChanged = { type: 'entryImageChanged'; id: string };

/**
 * A Scene's or Chapter's image was set, replaced or removed here, or came
 * back from Trash. The file can keep its name, so the Manuscript may not
 * change.
 */
export type UnitImageChanged = { type: 'unitImageChanged'; id: string };

/**
 * A Scene's or Chapter's unit details, such as its Status, changed, here or
 * on another computer: `manuscript` shows them now.
 */
export type UnitDetailsChanged = {
  type: 'unitDetailsChanged';
  manuscript: Manuscript;
};

/** One change to the Status list, made to it as saved. */
export type StatusEdit =
  | { type: 'add'; status: Status }
  | {
      type: 'change';
      statusId: string;
      change: Partial<Pick<Status, 'name' | 'colour'>>;
    }
  | { type: 'move'; statusId: string; index: number };

/** The Project's Status list changed, here or on another computer: `statuses` is it now. */
export type StatusesChanged = { type: 'statusesChanged'; statuses: Status[] };

/** The Todos changed, here or on another computer: `todos` is the list now. */
export type TodosChanged = { type: 'todosChanged'; todos: Todo[] };

/** A newer app upgraded the Project; `host` is the computer it did so on, when known. */
export type Upgrade = { host?: string };

/**
 * A newer app upgraded the Project on another computer: the window hands
 * over its pending edits, which are saved, and then nothing more is written.
 */
export type ReadOnly = { type: 'readOnly' } & Upgrade;

/** The Prose is now spellchecked and typeset in `language`. */
export type LanguageChanged = {
  type: 'languageChanged';
  language: ProseLanguage;
};

/** A folded Pinned note now shows its Entry's image, or doesn't. */
export type FoldedNoteImageChanged = {
  type: 'foldedNoteImageChanged';
  on: boolean;
};

/** What main tells a window about its Project as it happens. */
export type ProjectEvent =
  | UnitSaveStatus
  | UnitReloaded
  | StructureChanged
  | UnitDetailsChanged
  | StatusesChanged
  | TodosChanged
  | ConflictsChanged
  | EntriesChanged
  | EntryImageChanged
  | UnitImageChanged
  | ProposalsChanged
  | ConversationsChanged
  | ReadOnly
  | LanguageChanged
  | FoldedNoteImageChanged;

/** Mirrors the main-process ProjectStore of this window's Project. */
export interface ProjectApi {
  manuscript(): Promise<Manuscript>;
  read<R extends UnitRef>(ref: R): Promise<ValueOf<R>>;
  /**
   * Resolves once main has the value, not once it is on disk; a failure to
   * save it shows only as a `unitSaveStatus` event.
   */
  write<R extends UnitRef>(ref: R, value: ValueOf<R>): Promise<void>;
  /**
   * Says an editor shows the unit's latest `unitReloaded`: what it writes
   * from now on is made on that version. Until then, a write is taken as made
   * on the version before, and the reloaded one is set aside as a Conflict.
   */
  reloadTaken(ref: UnitRef): Promise<void>;
  /**
   * Says an editor kept its own edits over the unit's latest `unitReloaded`,
   * made on the version before it. Sent before those edits are written, so
   * the reloaded version is set aside as a Conflict, not written over.
   */
  keepEditsOverReload(ref: UnitRef): Promise<void>;
  /** Writes every accepted value now, trying failed ones again at once. */
  flush(): Promise<void>;
  hasUnsaved(): Promise<boolean>;
  /** The status of each unit that isn't saved, as of now. */
  saveStatuses(): Promise<UnitSaveStatus[]>;
  /** Calls `listener` with each event; returns an unsubscribe function. */
  subscribe(listener: (event: ProjectEvent) => void): () => void;

  // Structure operations change project.json, and move unit files in and out
  // of Trash. They resolve once the change is on disk.
  createChapter(index: number, title?: string): Promise<Created>;
  createScene(
    chapterId: string,
    index: number,
    title?: string,
  ): Promise<Created>;
  renameChapter(chapterId: string, title: string): Promise<Changed>;
  renameScene(sceneId: string, title: string): Promise<Changed>;
  moveChapter(chapterId: string, index: number): Promise<Changed>;
  moveScene(
    sceneId: string,
    chapterId: string,
    index: number,
  ): Promise<Changed>;
  /** Moves a Scene, placed or Unplaced, to Trash. */
  trashScene(sceneId: string): Promise<Changed>;
  /** Moves a Chapter and its Scenes to Trash; never the last Chapter. */
  trashChapter(chapterId: string): Promise<Changed>;
  /** The Entries in the Story Bible, by type, then by name. */
  listEntries(): Promise<EntrySummary[]>;
  createEntry(type: EntryType, name: string): Promise<Created>;
  /** Moves an Entry to Trash; its private notes stay until Trash is emptied. */
  trashEntry(entryId: string): Promise<Changed>;
  /** Sets when the Assistant sees an Entry, as a step that `undo` reverts. */
  setEntryVisibility(entryId: string, visibility: Visibility): Promise<Changed>;
  /**
   * Changes an Entry's type, as a step that `undo` reverts; the fields that
   * don't fit the new type are written at the end of its description.
   */
  setEntryType(entryId: string, type: EntryType): Promise<Changed>;
  /**
   * Asks the Author for a JPEG or PNG, then makes it the Entry's image,
   * scaled down, in place of any it had; false if they cancel or it can't be
   * read, which main has told them. There is no undo.
   */
  chooseEntryImage(entryId: string): Promise<boolean>;
  /** Removes an Entry's image; there is no undo. */
  removeEntryImage(entryId: string): Promise<void>;
  /** An Entry's image as a `data:` URL; null without one, or before it syncs. */
  entryImage(entryId: string): Promise<string | null>;
  /**
   * Asks the Author for a JPEG or PNG, then makes it a Scene's or Chapter's
   * image, as `chooseEntryImage` does an Entry's. There is no undo.
   */
  chooseUnitImage(unitId: string): Promise<boolean>;
  /** Removes a Scene's or Chapter's image; there is no undo. */
  removeUnitImage(unitId: string): Promise<void>;
  /** A Scene's or Chapter's image as a `data:` URL; null without one, or before it syncs. */
  unitImage(unitId: string): Promise<string | null>;
  /** Puts a Trash item back where it was, as near as the Manuscript allows. */
  restore(id: string): Promise<Changed>;
  /** Reverts `step` if it is still the latest structure operation. */
  undo(step: number): Promise<Manuscript>;

  /** Latest first. */
  listTrash(): Promise<TrashItem[]>;

  /** Each unit in Conflict, with its versions, the original first. */
  listConflicts(): Promise<Conflict[]>;
  readConflictVersion<R extends UnitRef>(
    ref: R,
    versionId: string,
  ): Promise<ValueOf<R>>;
  /**
   * Keeps `kept`, one of the versions or a merge, as the unit's value; the
   * other versions go to Trash.
   */
  resolveConflict<R extends UnitRef>(ref: R, kept: ValueOf<R>): Promise<void>;
  /** Asks the Author to confirm, then deletes Trash for good; false if not. */
  emptyTrash(): Promise<boolean>;
  /**
   * Spellchecks and typesets the Prose in `language` from now on, a Project
   * setting. False when it can't be saved, which main has told the Author.
   */
  setLanguage(language: ProseLanguage): Promise<boolean>;
  /**
   * Whether a folded Pinned note shows its Entry's image, a Project setting.
   * False when it can't be saved, which main has told the Author.
   */
  setFoldedNoteImage(on: boolean): Promise<boolean>;
  /**
   * Gives a Scene or Chapter the Status of `statusId`, or none with null;
   * there is no undo. The Manuscript showing it follows as a
   * `unitDetailsChanged`.
   */
  setStatus(unitId: string, statusId: string | null): Promise<void>;
  /**
   * Gives a Scene, a Chapter or, with `project`, the Manuscript a Word
   * target of `words`, or none with null; there is no undo. The Manuscript
   * showing it follows as a `unitDetailsChanged`.
   */
  setWordTarget(unitId: string, words: number | null): Promise<void>;
  /**
   * Adds, renames, recolours or moves a Status in the list, as now saved;
   * a Status leaves it only by `deleteStatus`. The list follows as a
   * `statusesChanged`. False when it can't be saved, which main has told
   * the Author.
   */
  editStatus(edit: StatusEdit): Promise<boolean>;
  /** How many Chapters and Scenes have the Status of `statusId`, those in Trash too. */
  statusUses(statusId: string): Promise<number>;
  /**
   * Deletes the Status of `statusId`, moving the units that have it to the
   * Status of `moveTo`, or to none with null. False when it can't be saved,
   * which main has told the Author.
   */
  deleteStatus(statusId: string, moveTo: string | null): Promise<boolean>;
  /**
   * The Tags in use on Chapters, Scenes and Entries, those in Trash too,
   * each once in its first spelling, sorted.
   */
  tags(): Promise<string[]>;
  /**
   * Gives a Scene, Chapter or Entry `tags`, each spelt as the Tag in use on
   * another unit, ignoring case, if there is one; there is no undo. The
   * Manuscript showing them follows as a `unitDetailsChanged`, the Entries
   * as an `entriesChanged`.
   */
  setTags(unitId: string, tags: string[]): Promise<void>;
  /**
   * The Tags in use, as `tags`, each with how many Chapters, Scenes and
   * Entries have it, those in Trash too.
   */
  tagUses(): Promise<TagUse[]>;
  /**
   * Renames `tag` on every Chapter, Scene and Entry that has it, those in
   * Trash too; onto another Tag in use, ignoring case, it merges them.
   * False when it can't be saved, which main has told the Author.
   */
  renameTag(tag: string, to: string): Promise<boolean>;
  /**
   * Takes `tag` off every Chapter, Scene and Entry that has it, those in
   * Trash too. False when it can't be saved, which main has told the Author.
   */
  deleteTag(tag: string): Promise<boolean>;
  /** The Todos: those not done, then the done, each in list order. */
  listTodos(): Promise<Todo[]>;
  /**
   * Adds a Todo on top, as one line, linked to a Scene, Chapter or Entry or
   * to nothing. Each change to the Todos follows as a `todosChanged`.
   */
  addTodo(text: string, link: TodoLink | null): Promise<void>;
  /** Sets a Todo's text, tick or link; null drops its link. */
  changeTodo(id: string, change: TodoChange): Promise<void>;
  /** Moves a Todo to `index` among the others that are done as it is, or not. */
  moveTodo(id: string, index: number): Promise<void>;
  /** Deletes a Todo; another computer's later edit to it brings it back. */
  deleteTodo(id: string): Promise<void>;
  /** Deletes every Todo that is done. */
  clearDoneTodos(): Promise<void>;
}

/**
 * Widths in CSS pixels of the panels the Author can resize: in Writing, the
 * Binder, the Overview pane and the Assistant panel; in the Brainstorm and
 * Interview rooms, their Conversations and the reference.
 */
export type PanelWidths = {
  binder?: number;
  overview?: number;
  assistant?: number;
  conversations?: number;
  reference?: number;
};

/**
 * A Pinned note: the Entry it shows, where its top left corner was left in
 * the window in CSS pixels, whether it is folded to its title, and whether it
 * shows the Entry's image rather than its text (text when not said).
 */
export type PinnedNote = {
  entryId: string;
  x: number;
  y: number;
  folded: boolean;
  image?: boolean;
};

/**
 * How the Author left a Project's window on this computer; `cursor` is where
 * it was in the last Scene, `outlineNotesOpen` says whether the Outline &
 * Notes box above the Prose is open, and `overviewOpen` whether the Overview
 * pane beside it is. `pinnedNotes` are the Pinned notes, the one on top last.
 * The Overview pane's state and the Pinned notes are never kept in the
 * Project.
 */
export type ProjectView = {
  lastSceneId?: string;
  cursor?: number;
  panelWidths?: PanelWidths;
  outlineNotesOpen?: boolean;
  overviewOpen?: boolean;
  pinnedNotes?: PinnedNote[];
};

/**
 * What the session markers in the Project said when it opened: the other
 * computers it was open on lately, and where the Author left off on another
 * computer, if they worked there after they last did here. A marker never
 * locks the Project.
 */
export type SessionNotice = {
  alsoOpen: { host: string; minutesAgo: number }[];
  continueAt?: { host: string; sceneId: string; cursor?: number };
};

export type OpenedProject = {
  displayName: string;
  language: ProseLanguage;
  /** Whether a folded Pinned note shows its Entry's image. */
  foldedNoteImage: boolean;
  /** The Project's Status list, in order. */
  statuses: Status[];
  manuscript: Manuscript;
  view: ProjectView;
  sessions: SessionNotice;
  /** What versions of `project.json` that met as it opened lost; told once. */
  dropped: Dropped[];
  /** Set once a newer app has upgraded the Project, as when the window reloads. */
  readOnly: Upgrade | null;
};

/**
 * A tip the Author sees once per Project on this computer, until dismissed:
 * `keep-on-device` suggests keeping an online-only Project downloaded.
 */
export type Tip = 'keep-on-device';

/**
 * Null when nothing changes in this window: the Author cancelled the dialog,
 * the Project opened in a window of its own, or it was already open and its
 * window was brought to the front.
 */
export type OpenResult =
  | { ok: true; project: OpenedProject }
  | { ok: false; message: string }
  | null;

/** A Project in the recent list; `found` is false when its folder is gone. */
export type RecentProject = {
  path: string;
  displayName: string;
  lastOpened: number;
  found: boolean;
};

/**
 * How a key or token is kept: `encrypted` on disk, `unencrypted` on disk
 * because the Author said so, or in memory `untilQuit`.
 */
export type KeyKeeping = 'encrypted' | 'unencrypted' | 'untilQuit';

/**
 * A Provider as a window may know it, which never holds its key or token:
 * `masked` shows only the start and end, as `sk-ant-…abcd`.
 */
export type ProviderView = {
  /** Whether the Author has added it: its key, or for LM Studio its address. */
  added: boolean;
  /** The key, or LM Studio's token, masked; null when there is none. */
  masked: string | null;
  kept: KeyKeeping | null;
  /** Where LM Studio's server is; null for the other Providers or before it is added. */
  address: string | null;
};

/** Every Provider as a window may know it. */
export type ProvidersView = {
  providers: Record<ProviderId, ProviderView>;
  /** Whether this computer can encrypt a key it keeps, which Linux can't without a keyring. */
  canEncrypt: boolean;
};

/**
 * What the Author entered to add a Provider: its key, or for LM Studio its
 * address and an optional token. `unencrypted` says to save the secret
 * unencrypted where it can't be encrypted; ignored where it can.
 */
export type ProviderEntry = {
  secret: string;
  address?: string;
  unencrypted: boolean;
};

/**
 * A Provider the Author entered: what checking it said, and every Provider
 * as kept now. One whose key was rejected isn't kept.
 */
export type ProviderResult = { status: ProviderStatus; view: ProvidersView };

/** A Provider's Models for the Author to shortlist, or why it can't list them. */
export type ModelListing =
  | { ok: true; models: ListedModel[] }
  | { ok: false; status: ProviderStatus };

/** Why the Author is welcomed: the first launch, or a saved key that couldn't be read. */
export type WelcomeReason = 'firstLaunch' | 'keyUnreadable';

/** Settings that hold on this computer for every Project. */
export interface SettingsApi {
  /**
   * Why to welcome the Author, if at all; none once they have added a
   * Provider or skipped.
   */
  showWelcome(): Promise<WelcomeReason | null>;
  dismissWelcome(): void;
  providers(): Promise<ProvidersView>;
  /** Asks the Provider whether it answers; null when it hasn't been added. */
  providerStatus(provider: ProviderId): Promise<ProviderStatus | null>;
  /**
   * Checks what the Author entered with the Provider and keeps it unless the
   * key is rejected; the next call uses it. Without encryption a secret is
   * kept until the app quits, unless `unencrypted` says to save it anyway.
   */
  addProvider(
    provider: ProviderId,
    entry: ProviderEntry,
  ): Promise<ProviderResult>;
  /** Forgets the Provider's key, or LM Studio's address and token. */
  removeProvider(provider: ProviderId): Promise<ProvidersView>;
  /**
   * Calls `listener` when a Provider is added, replaced or removed, or a
   * shortlist changes, from any window. Returns an unsubscribe function.
   */
  onProviders(listener: (view: ProvidersView) => void): () => void;
  /** The Models the Provider offers to shortlist. */
  listModels(provider: ProviderId): Promise<ModelListing>;
  /** The Author's Model shortlist of each Provider. */
  shortlists(): Promise<Record<ProviderId, ListedModel[]>>;
  setShortlist(provider: ProviderId, models: ListedModel[]): Promise<void>;
  /**
   * The Model a new Conversation starts on: the one chosen last, while it is
   * shortlisted, else the default Model, a tested one, or the first
   * shortlisted.
   */
  defaultModel(): Promise<Model>;
}

/** A Word or Markdown file read for an Import: its name without extension, and its blocks. */
export type ImportFile = { name: string; blocks: ImportBlock[] };

/** The file the Author chose to import, read; or why it can't be, or null when they cancelled. */
export type ImportChoice =
  | null
  | { ok: false; message: string }
  | ({ ok: true } & ImportFile);

/**
 * App-level actions outside any one Project. A window shows one Project, or
 * the start screen. Opening a Project from a window that shows one opens it in
 * a new window.
 */
export interface ShellApi {
  /** The Project this window shows, such as one reopened at startup. */
  currentProject(): Promise<OpenedProject | null>;
  /** Asks for a new folder and creates a Project in it. */
  createProject(): Promise<OpenResult>;
  /** Asks for a Project folder and opens it. */
  openProject(): Promise<OpenResult>;
  /** Asks for a Word or Markdown file and reads it, for the Author to preview its split. */
  chooseImport(): Promise<ImportChoice>;
  /**
   * Asks for a new folder and creates a Project in it holding `file` split
   * by `convention`; 'canceled' when the Author chose no folder.
   */
  importProject(
    file: ImportFile,
    convention: ImportConvention,
  ): Promise<OpenResult | 'canceled'>;
  /**
   * Calls `listener` with what the Author chose from the menu bar, or with
   * its shortcut. Returns an unsubscribe function.
   */
  onCommand(listener: (command: Command) => void): () => void;
  /**
   * Says which of Writing's side panes this window has docked, for the View
   * menu's check items. Kept in memory only.
   */
  showDocked(docked: DockedPanes): void;
  /** Says whether this window's Prose has focus, which enables the Format menu. */
  showProseFocus(focused: boolean): void;
  /**
   * Puts this window in zen mode, full screen and ticked in the View menu, or
   * takes it out, back to the full screen it had before. Kept in memory only.
   */
  setZen(on: boolean): void;
  /**
   * What the Author left unticked at this window's last Manuscript Export, on
   * this computer; a unit created since starts ticked.
   */
  exportChoice(): Promise<ExportUnticked>;
  /**
   * Remembers `unticked`, then exports the rest of the Manuscript where the
   * Author chooses, once they have agreed to export the main version of
   * ticked Scenes in Conflict. Resolves when done or cancelled.
   */
  exportManuscript(unticked: ExportUnticked): Promise<void>;
  /** Opens a Project from the recent list. */
  openRecent(path: string): Promise<OpenResult>;
  /** Asks where a recent Project that wasn't found is now, and opens it. */
  locateProject(path: string): Promise<OpenResult>;
  /** Latest first. */
  recentProjects(): Promise<RecentProject[]>;
  removeRecent(path: string): Promise<RecentProject[]>;
  /**
   * Remembers, on this computer, how the Author left this window's Project,
   * and tells other computers through its session marker.
   */
  saveView(view: ProjectView): void;
  /** The tips to show for this window's Project now. */
  tips(): Promise<Tip[]>;
  /** Never shows the tip again for this window's Project on this computer. */
  dismissTip(tip: Tip): void;
  /** The Filter at `place` for this window's Project, on this computer. */
  filter(place: FilterPlace): Promise<Filter>;
  /** Remembers the Filter at `place`; none chosen turns it off. */
  setFilter(place: FilterPlace, filter: Filter): void;
  /**
   * Calls `listener` with the Filters of this window's Project that main
   * changed, by place, as when they follow a renamed Tag. Returns an
   * unsubscribe function.
   */
  onFilter(listener: (filters: Filters) => void): () => void;
  /** Whether Entry names and aliases are highlighted where mentioned, on this computer. */
  highlightMentions(): Promise<boolean>;
  /** Turns the highlighting on or off, in every window. */
  setHighlightMentions(on: boolean): void;
  /**
   * Calls `listener` when the highlighting is turned on or off, from any
   * window. Returns an unsubscribe function.
   */
  onHighlightMentions(listener: (on: boolean) => void): () => void;
  /** The writing width, theme and spell check, on this computer. */
  viewSettings(): Promise<ViewSettings>;
  /** Changes them, in every window, as the View menu does. */
  setViewSettings(change: Partial<ViewSettings>): void;
  /**
   * Calls `listener` with all of them when any changes, from any window or
   * the menu. Returns an unsubscribe function.
   */
  onViewSettings(listener: (view: ViewSettings) => void): () => void;
  /**
   * Main asks the window to hand over pending edits before it closes. The
   * listener must push them with `project.write` before returning. Returns an
   * unsubscribe function.
   */
  onFlushRequest(listener: () => void): () => void;
}

/**
 * The Assistant of this window's Project. Main builds what is sent to the
 * model; the renderer only says what the Author wrote and which Scene is open.
 */
export interface AssistantApi {
  /** The Conversations in the Project, latest first. */
  listConversations(): Promise<ConversationSummary[]>;
  readConversation(id: string): Promise<Conversation>;
  /** Starts a Conversation on `model`, which becomes the Model chosen last. */
  startConversation(
    mode: Mode,
    title: string,
    model: Model,
  ): Promise<ConversationSummary>;
  /**
   * Puts a Conversation on `model` from its next message on, which becomes
   * the Model chosen last.
   */
  chooseModel(conversationId: string, model: Model): Promise<void>;
  /** Gives a Conversation a new title; refused for an empty one. */
  renameConversation(conversationId: string, title: string): Promise<void>;
  /**
   * Asks the Author to confirm, saying how many pending Proposals go with
   * it, then moves the whole Conversation to Trash; null if not. Single
   * messages can't be deleted.
   */
  trashConversation(conversationId: string): Promise<Changed | null>;
  /**
   * Sets an Interview's focus from its next message on, logged as an event.
   * Refused for a Conversation of another Mode.
   */
  setInterviewFocus(
    conversationId: string,
    focus: InterviewFocus,
  ): Promise<void>;
  /**
   * Sends the Author's message with the Scene open in the editor, if any:
   * calls `onText` with each piece of the reply as it streams, and resolves
   * with how it went once the reply, if any, is in the log.
   */
  ask(
    conversationId: string,
    message: string,
    sceneId: string | null,
    onText: (text: string) => void,
  ): Promise<AskResult>;
  /**
   * Asks for a Review of the Scene open in the editor, or of its Chapter,
   * as `ask` does; the reply holds the Review's Findings. Refused when no
   * Scene is open, or for a Chapter Review, when it is in no Chapter.
   */
  review(
    conversationId: string,
    command: ReviewCommand,
    sceneId: string | null,
    onText: (text: string) => void,
  ): Promise<AskResult>;
  /**
   * Asks again after a failed call, for the Author's last message, as `ask`
   * does; the answer is a new turn.
   */
  retry(
    conversationId: string,
    onText: (text: string) => void,
  ): Promise<AskResult>;
  /**
   * Accepts a pending Proposal, as proposed or as the Author edited it:
   * main writes its target, an Entry or Outline, then logs the accept. Refused for one already
   * decided, an orphaned one, a stale one unless accepted anyway or
   * appended, one appended that can't be, and in a read-only Project.
   */
  acceptProposal(
    conversationId: string,
    proposalId: string,
    options?: AcceptOptions,
  ): Promise<void>;
  rejectProposal(conversationId: string, proposalId: string): Promise<void>;
  /**
   * Undoes an accepted Proposal: main writes back what the accept replaced,
   * or moves its new Entry to Trash, then logs the undo. Refused while the
   * target no longer holds what the accept wrote, and in a read-only Project.
   */
  undoProposal(conversationId: string, proposalId: string): Promise<void>;
  /** The Proposals pending on an Entry, in any Conversation. */
  pendingProposals(entryId: string): Promise<PendingProposal[]>;
  /**
   * Has the Model chosen last write an Image prompt for an Entry, from its
   * description, Appearance and Senses, in a one-off request outside any
   * Conversation; a new one each time, and nothing of it is logged.
   */
  imagePrompt(entryId: string): Promise<ImagePromptResult>;
}

/**
 * Why an Image prompt couldn't be had: the call failed, as an Assistant
 * call fails; the reply came back `empty`; the Entry has `nothing` to
 * describe; or it is `hidden`, an Entry the Assistant never sees.
 */
export type ImagePromptFailure =
  | AssistantFailure
  | 'empty'
  | 'nothing'
  | 'hidden';

/**
 * An Image prompt, or why there is none, with the Model asked and what the
 * call used and cost, when known. It isn't kept, nor its cost logged.
 */
export type ImagePromptResult = MeteredTurn &
  (
    | { ok: true; text: string; cutShort: boolean }
    | { ok: false; failure: ImagePromptFailure }
  );

export const projectMethods = {
  manuscript: 'invoke',
  read: 'invoke',
  write: 'invoke',
  reloadTaken: 'invoke',
  keepEditsOverReload: 'invoke',
  flush: 'invoke',
  hasUnsaved: 'invoke',
  saveStatuses: 'invoke',
  subscribe: 'event',
  createChapter: 'invoke',
  createScene: 'invoke',
  renameChapter: 'invoke',
  renameScene: 'invoke',
  moveChapter: 'invoke',
  moveScene: 'invoke',
  trashScene: 'invoke',
  trashChapter: 'invoke',
  listEntries: 'invoke',
  createEntry: 'invoke',
  trashEntry: 'invoke',
  setEntryVisibility: 'invoke',
  setEntryType: 'invoke',
  chooseEntryImage: 'invoke',
  removeEntryImage: 'invoke',
  entryImage: 'invoke',
  chooseUnitImage: 'invoke',
  removeUnitImage: 'invoke',
  unitImage: 'invoke',
  restore: 'invoke',
  undo: 'invoke',
  listTrash: 'invoke',
  listConflicts: 'invoke',
  readConflictVersion: 'invoke',
  resolveConflict: 'invoke',
  emptyTrash: 'invoke',
  setLanguage: 'invoke',
  setFoldedNoteImage: 'invoke',
  setStatus: 'invoke',
  setWordTarget: 'invoke',
  editStatus: 'invoke',
  statusUses: 'invoke',
  deleteStatus: 'invoke',
  tags: 'invoke',
  setTags: 'invoke',
  tagUses: 'invoke',
  renameTag: 'invoke',
  deleteTag: 'invoke',
  listTodos: 'invoke',
  addTodo: 'invoke',
  changeTodo: 'invoke',
  moveTodo: 'invoke',
  deleteTodo: 'invoke',
  clearDoneTodos: 'invoke',
} as const satisfies MethodTable<ProjectApi>;

export const assistantMethods = {
  listConversations: 'invoke',
  readConversation: 'invoke',
  startConversation: 'invoke',
  chooseModel: 'invoke',
  renameConversation: 'invoke',
  trashConversation: 'invoke',
  setInterviewFocus: 'invoke',
  ask: 'stream',
  review: 'stream',
  retry: 'stream',
  acceptProposal: 'invoke',
  rejectProposal: 'invoke',
  undoProposal: 'invoke',
  pendingProposals: 'invoke',
  imagePrompt: 'invoke',
} as const satisfies MethodTable<AssistantApi>;

export const settingsMethods = {
  showWelcome: 'invoke',
  dismissWelcome: 'send',
  providers: 'invoke',
  providerStatus: 'invoke',
  addProvider: 'invoke',
  removeProvider: 'invoke',
  onProviders: 'event',
  listModels: 'invoke',
  shortlists: 'invoke',
  setShortlist: 'invoke',
  defaultModel: 'invoke',
} as const satisfies MethodTable<SettingsApi>;

export const shellMethods = {
  currentProject: 'invoke',
  createProject: 'invoke',
  openProject: 'invoke',
  chooseImport: 'invoke',
  importProject: 'invoke',
  onCommand: 'event',
  showDocked: 'send',
  showProseFocus: 'send',
  setZen: 'send',
  exportChoice: 'invoke',
  exportManuscript: 'invoke',
  openRecent: 'invoke',
  locateProject: 'invoke',
  recentProjects: 'invoke',
  removeRecent: 'invoke',
  saveView: 'send',
  tips: 'invoke',
  dismissTip: 'send',
  filter: 'invoke',
  setFilter: 'send',
  onFilter: 'event',
  highlightMentions: 'invoke',
  setHighlightMentions: 'send',
  onHighlightMentions: 'event',
  viewSettings: 'invoke',
  setViewSettings: 'send',
  onViewSettings: 'event',
  onFlushRequest: 'flush',
} as const satisfies MethodTable<ShellApi>;

/**
 * Where main streams the pieces of a reply, each with the `askId` its call
 * was given.
 */
export const replyTextChannel = 'assistant:replyText';

/**
 * Where main asks a window for its pending edits before it closes, and the
 * window answers once it has sent them.
 */
export const flushRequestChannel = 'shell:flushRequest';
export const flushedChannel = 'shell:flushed';

/** The APIs a window sees, by the name it sees each under. */
export type Apis = {
  project: ProjectApi;
  assistant: AssistantApi;
  settings: SettingsApi;
  shell: ShellApi;
};

/** Main and the preload both cross between them on this. */
export const appBridge = bridge<
  Apis,
  {
    project: typeof projectMethods;
    assistant: typeof assistantMethods;
    settings: typeof settingsMethods;
    shell: typeof shellMethods;
  }
>({
  project: projectMethods,
  assistant: assistantMethods,
  settings: settingsMethods,
  shell: shellMethods,
});

declare global {
  interface Window {
    project: ProjectApi;
    shell: ShellApi;
    settings: SettingsApi;
    assistant: AssistantApi;
  }
}
