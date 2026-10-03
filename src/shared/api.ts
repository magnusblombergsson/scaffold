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
import type { ModelId } from './models';
import type { PendingProposal, ProposedValue } from './proposal';

/**
 * How the Author accepts a Proposal: with the value they `edited` it to,
 * and `anyway` when they saw it was stale.
 */
export type AcceptOptions = { edited?: ProposedValue; anyway?: boolean };
import type {
  AskResult,
  Conversation,
  ConversationSummary,
  Mode,
} from './conversation';

// The preload exposes these four objects on `window`. Main registers a handler
// per method, and both sides are checked against these interfaces.

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
  /** Set when it changed because the Author accepted a Proposal, here. */
  byProposal?: true;
};

/**
 * A Proposal was made, accepted or rejected, in any Conversation, or an
 * Entry was written, which may make its Proposals stale or applied.
 */
export type ProposalsChanged = { type: 'proposalsChanged' };

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

/** A newer app upgraded the Project; `host` is the computer it did so on, when known. */
export type Upgrade = { host?: string };

/**
 * A newer app upgraded the Project on another computer: the window hands
 * over its pending edits, which are saved, and then nothing more is written.
 */
export type ReadOnly = { type: 'readOnly' } & Upgrade;

/** What main tells a window about its Project as it happens. */
export type ProjectEvent =
  | UnitSaveStatus
  | UnitReloaded
  | StructureChanged
  | ConflictsChanged
  | EntriesChanged
  | ProposalsChanged
  | ReadOnly;

/** Mirrors the main-process ProjectStore of this window's Project. */
export interface ProjectApi {
  manuscript(): Promise<Manuscript>;
  read<R extends UnitRef>(ref: R): Promise<ValueOf<R>>;
  /**
   * Resolves once main has the value, not once it is on disk; a failure to
   * save it shows only as a `unitSaveStatus` event.
   */
  write<R extends UnitRef>(ref: R, value: ValueOf<R>): Promise<void>;
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
}

/** Widths in CSS pixels of the panels the Author can resize. */
export type PanelWidths = { binder?: number };

/**
 * How the Author left a Project's window on this computer; `cursor` is where
 * it was in the last Scene, and `outlineNotesOpen` says whether the Outline &
 * Notes box above the Prose is open.
 */
export type ProjectView = {
  lastSceneId?: string;
  cursor?: number;
  panelWidths?: PanelWidths;
  outlineNotesOpen?: boolean;
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
 * What Anthropic said of a key when it was checked: `unreachable` when it
 * couldn't be asked, as when offline.
 */
export type KeyCheck = 'ok' | 'invalid' | 'no-credit' | 'unreachable';

/**
 * How the API key is kept: `encrypted` on disk, `unencrypted` on disk because
 * the Author said so, or in memory `untilQuit`.
 */
export type KeyKeeping = 'encrypted' | 'unencrypted' | 'untilQuit';

/**
 * The Author's Anthropic API key as a window may know it, which is never the
 * key itself: `masked` shows only its start and end, as `sk-ant-…abcd`.
 */
export type KeyStatus = {
  masked: string | null;
  kept: KeyKeeping | null;
  /** Whether this computer can encrypt a key it keeps, which Linux can't without a keyring. */
  canEncrypt: boolean;
};

/**
 * Whether to save a key unencrypted where it can't be encrypted; ignored where
 * it can.
 */
export type KeyOptions = { unencrypted: boolean };

/** A key the Author entered: what checking it said, and the key kept now. */
export type KeyResult = { check: KeyCheck; status: KeyStatus };

/** Settings that hold on this computer for every Project. */
export interface SettingsApi {
  /**
   * Whether to welcome the Author, as on the first launch; false once they
   * have added a key or skipped.
   */
  showWelcome(): Promise<boolean>;
  dismissWelcome(): void;
  keyStatus(): Promise<KeyStatus>;
  /**
   * Checks the key with Anthropic and keeps it unless it is invalid; the
   * next call to Claude uses it. Without encryption it is kept until the app
   * quits, unless `unencrypted` says to save it anyway.
   */
  setKey(key: string, options: KeyOptions): Promise<KeyResult>;
  removeKey(): Promise<KeyStatus>;
  /**
   * Calls `listener` when the key is added, replaced or removed, from any
   * window. Returns an unsubscribe function.
   */
  onKeyStatus(listener: (status: KeyStatus) => void): () => void;
  /** The Claude model the next call uses. */
  model(): Promise<ModelId>;
  setModel(model: ModelId): void;
}

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
  /** Whether Entry names and aliases are highlighted where mentioned, on this computer. */
  highlightMentions(): Promise<boolean>;
  /** Turns the highlighting on or off, in every window. */
  setHighlightMentions(on: boolean): void;
  /**
   * Calls `listener` when the highlighting is turned on or off, from any
   * window. Returns an unsubscribe function.
   */
  onHighlightMentions(listener: (on: boolean) => void): () => void;
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
  startConversation(mode: Mode, title: string): Promise<ConversationSummary>;
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
   * decided, an orphaned one, a stale one unless accepted anyway, and in a
   * read-only Project.
   */
  acceptProposal(
    conversationId: string,
    proposalId: string,
    options?: AcceptOptions,
  ): Promise<void>;
  rejectProposal(conversationId: string, proposalId: string): Promise<void>;
  /** The Proposals pending on an Entry, in any Conversation. */
  pendingProposals(entryId: string): Promise<PendingProposal[]>;
}

export const channel = {
  project: (method: keyof ProjectApi) => `project:${method}`,
  currentProject: 'shell:currentProject',
  createProject: 'shell:createProject',
  openProject: 'shell:openProject',
  openRecent: 'shell:openRecent',
  locateProject: 'shell:locateProject',
  recentProjects: 'shell:recentProjects',
  removeRecent: 'shell:removeRecent',
  saveView: 'shell:saveView',
  tips: 'shell:tips',
  dismissTip: 'shell:dismissTip',
  highlightMentions: 'shell:highlightMentions',
  setHighlightMentions: 'shell:setHighlightMentions',
  highlightMentionsChanged: 'shell:highlightMentionsChanged',
  flushRequest: 'shell:flushRequest',
  showWelcome: 'settings:showWelcome',
  dismissWelcome: 'settings:dismissWelcome',
  keyStatus: 'settings:keyStatus',
  setKey: 'settings:setKey',
  removeKey: 'settings:removeKey',
  keyStatusChanged: 'settings:keyStatusChanged',
  model: 'settings:model',
  setModel: 'settings:setModel',
  flushed: 'shell:flushed',
  projectEvent: 'project:event',
  listConversations: 'assistant:listConversations',
  readConversation: 'assistant:readConversation',
  startConversation: 'assistant:startConversation',
  ask: 'assistant:ask',
  retry: 'assistant:retry',
  acceptProposal: 'assistant:acceptProposal',
  rejectProposal: 'assistant:rejectProposal',
  pendingProposals: 'assistant:pendingProposals',
  replyText: 'assistant:replyText',
} as const;

declare global {
  interface Window {
    project: ProjectApi;
    shell: ShellApi;
    settings: SettingsApi;
    assistant: AssistantApi;
  }
}
