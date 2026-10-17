import type {
  EntrySummary,
  EntryType,
  ImageMatches,
  ImageRef,
  ImagesReplaced,
  ProjectImage,
  Manuscript,
  PartLabel,
  ProseLanguage,
  MovableKind,
  Place,
  TrashItem,
  UnitRef,
  UnitValue,
  ValueOf,
  Visibility,
} from './project-types';
import type {
  ExportBook,
  ExportUnticked,
  StoryBibleChoice,
} from './export-choice';
import type { CombineChoices } from './combine';
import type { BibleView } from './bible-view';
import type { CorkboardView } from './corkboard-view';
import type { Filter, FilterPlace, Filters } from './filter';
import type { ReviewCommand } from './finding';
import type { Status } from './status';
import type { NewEntry, StoryBibleImportChoice } from './story-bible-import';
import type { TagChange, TagUse } from './tags';
import type { Todo, TodoChange, TodoLink } from './todo';
import type { TodoDock } from './todo-dock';
import type { CustomField } from './custom-field';
import type { KeyFieldChoices, KeyFieldItem } from './key-fields';
import type { Relation, RelationChoice } from './relation';
import type { Snapshot } from './snapshot';
import type { ImportBlock, ImportConvention } from './manuscript-import';
import type { Cut } from './prose-split';
import type { ListedModel, Model, ProviderId, ProviderStatus } from './models';
import type { Command, DockedPanes } from './shortcuts';
import type { PendingProposal, ProposedValue } from './proposal';
import type { MeteredTurn } from './usage';
import type { ViewSettings } from './view-settings';
import { bridge, type MethodTable } from './bridge';

export type { CallFailure } from './bridge';

/**
 * How the Author accepts a Proposal: with the value they `edited` it to,
 * `anyway` when they saw it was stale, `append` to add it to what its
 * target holds now rather than replace that, and in a Series, `fromBook` to
 * make it an Evolution from the Book it was made on.
 */
export type AcceptOptions = {
  edited?: ProposedValue;
  anyway?: boolean;
  append?: boolean;
  fromBook?: boolean;
};
import type {
  AskResult,
  AssistantFailure,
  Conversation,
  ConversationSummary,
  InterviewFocus,
  PlanAsk,
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
 * Another Project added from a Backup: its name, its Books by their new
 * ids, in order, and each Entry added to the Story Bible by its new id and
 * the id it had in the Backup.
 */
export type AddedFromBackup = Changed & {
  name: string;
  books: string[];
  entries: { id: string; original: string }[];
};

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
  /**
   * Set when splitting a Scene here, or undoing that, wrote it: an editor
   * shows it, as what it sent before is in it.
   */
  bySplit?: true;
  /**
   * Set when restoring a Snapshot here wrote it: an editor shows it, as what
   * it sent before is in the Snapshot taken first.
   */
  byRestore?: true;
  /**
   * Set when combining two Entries here, or undoing that, wrote it: an
   * editor shows it, as what it sent before is in it.
   */
  byCombine?: true;
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
 * one was kept: the Books, Parts and Chapters only the other had, and the Scenes only it
 * placed, which are Unplaced now. `host` is where it came from, if known.
 */
export type Dropped = {
  host?: string;
  chapters: string[];
  scenes: string[];
  /** The Parts only the other had; absent when none. */
  parts?: string[];
  /** The Books only the other had; absent when none. */
  books?: string[];
};

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
 * A Scene's, Chapter's or Entry's image was set, replaced or removed here,
 * or came back from Trash. The file can keep its name, so the unit may not
 * change.
 */
export type ImageChanged = { type: 'imageChanged'; ref: ImageRef };

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

/**
 * The Custom fields changed, here or on another computer: `fields` is the
 * list now, those in Trash left out.
 */
export type CustomFieldsChanged = {
  type: 'customFieldsChanged';
  fields: CustomField[];
};

/**
 * The Key fields changed, here or on another computer: `choices` is what
 * the Author has chosen for each Entry type now.
 */
export type KeyFieldsChanged = {
  type: 'keyFieldsChanged';
  choices: KeyFieldChoices;
};

/**
 * The Relations changed, here or on another computer: `relations` is every
 * one held now, those `relationsView` hides too.
 */
export type RelationsChanged = {
  type: 'relationsChanged';
  relations: Relation[];
};

/**
 * A Snapshot was taken, renamed, moved to Trash or back, or deleted, here or
 * on another computer.
 */
export type SnapshotsChanged = { type: 'snapshotsChanged' };

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

/**
 * This computer's Pinned notes of the Project, as a Combine, its undo or
 * emptying Trash left them; already saved.
 */
export type PinnedNotesChanged = {
  type: 'pinnedNotesChanged';
  notes: PinnedNote[];
};

/** What main tells a window about its Project as it happens. */
export type ProjectEvent =
  | UnitSaveStatus
  | UnitReloaded
  | StructureChanged
  | UnitDetailsChanged
  | StatusesChanged
  | TodosChanged
  | CustomFieldsChanged
  | KeyFieldsChanged
  | RelationsChanged
  | SnapshotsChanged
  | ConflictsChanged
  | EntriesChanged
  | ImageChanged
  | ProposalsChanged
  | ConversationsChanged
  | ReadOnly
  | LanguageChanged
  | FoldedNoteImageChanged
  | PinnedNotesChanged;

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
  /**
   * Creates a Chapter at `index` in a Part, or with no `partId` among the
   * Parts and Loose Chapters of Book `bookId`, or of the first Book, which
   * without Parts are all its Chapters.
   */
  createChapter(
    index: number,
    title?: string,
    partId?: string,
    bookId?: string,
  ): Promise<Created>;
  /**
   * Creates a Part holding no Chapters at `index` among the Parts and Loose
   * Chapters of Book `bookId`, or of the first Book.
   */
  createPart(index: number, title?: string, bookId?: string): Promise<Created>;
  renamePart(partId: string, title: string): Promise<Changed>;
  /** Moves a Part to `index` among the Parts and Loose Chapters of Book `bookId`, or of its own. */
  movePart(partId: string, index: number, bookId?: string): Promise<Changed>;
  /** Moves a Part to Trash with its Chapters and their Scenes; never the last Chapter. */
  trashPart(partId: string): Promise<Changed>;
  /**
   * Adds an empty Book at `index` among the Books, or last; a Project of one
   * Book becomes a Series, its Manuscript Book 1.
   */
  createBook(index?: number, title?: string): Promise<Created>;
  /**
   * Adds a Book after the last holding `file`, split by `convention` and
   * titled as the file is named, as one step: `undo` moves it to Trash. A
   * Project of one Book becomes a Series, its Manuscript Book 1.
   */
  importBook(file: ImportFile, convention: ImportConvention): Promise<Created>;
  /**
   * Asks for a Backup of another Project and adds it after the last Book,
   * once a Backup of this one is made, the Author chose to go on when it
   * failed, or automatic Backups are off, as `onBackupNotice` then tells:
   * as one step, and `undo` moves the added Books and Entries to Trash.
   * Null when the Author cancels or it is refused, which they are told.
   */
  addBookFromBackup(): Promise<AddedFromBackup | null>;
  renameBook(bookId: string, title: string): Promise<Changed>;
  /** Moves a Book to `index` among the Books. */
  moveBook(bookId: string, index: number): Promise<Changed>;
  /** Moves a Book to Trash with its Parts, Chapters and Scenes; never the last Book or Chapter. */
  trashBook(bookId: string): Promise<Changed>;
  createScene(
    chapterId: string,
    index: number,
    title?: string,
  ): Promise<Created>;
  renameChapter(chapterId: string, title: string): Promise<Changed>;
  renameScene(sceneId: string, title: string): Promise<Changed>;
  /**
   * Moves a Chapter, placed or Unplaced, to `index` in a Part, or with no
   * `partId` among the Parts and Loose Chapters of Book `bookId`, or of its
   * own: into, out of or between Parts and Books.
   */
  moveChapter(
    chapterId: string,
    index: number,
    partId?: string,
    bookId?: string,
  ): Promise<Changed>;
  moveScene(
    sceneId: string,
    chapterId: string,
    index: number,
  ): Promise<Changed>;
  /**
   * Splits a placed Scene at a cut made in its Prose: the text after it
   * becomes a new Scene right after, or first in the next Chapter, which is
   * created if there is none. Undo joins it back.
   */
  splitScene(
    sceneId: string,
    cut: Cut,
    toNextChapter: boolean,
  ): Promise<Created>;
  /** Moves a Scene, placed or Unplaced, to Trash. */
  trashScene(sceneId: string): Promise<Changed>;
  /** Moves a Chapter and its Scenes to Trash; never the last Chapter. */
  trashChapter(chapterId: string): Promise<Changed>;
  /** The Entries in the Story Bible, by type, then by name. */
  listEntries(): Promise<EntrySummary[]>;
  createEntry(type: EntryType, name: string): Promise<Created>;
  /** Moves an Entry to Trash; its private notes stay until Trash is emptied. */
  trashEntry(entryId: string): Promise<Changed>;
  /**
   * Moves a Scene, Chapter, Part, Entry or Conversation to the Drawer, with
   * what would go with it to Trash; never the last Chapter.
   */
  moveToDrawer(kind: MovableKind, id: string): Promise<Changed>;
  /** Moves an item from Trash to the Drawer, or from the Drawer to Trash. */
  moveBetweenTrashAndDrawer(id: string, to: Place): Promise<Changed>;
  /**
   * Adds the Entries of a Story Bible Import beside those already there,
   * changing none, as one step: `undo` moves them all to Trash.
   */
  importEntries(entries: NewEntry[]): Promise<Changed & { ids: string[] }>;
  /**
   * Combines the Entry `otherId` into `keptId`, of one type, as the Author
   * chose, as one step: `undo` puts both back, and what pointed to the
   * other. `dropped` says which Relations broke a rule and were dropped.
   */
  combineEntries(
    keptId: string,
    otherId: string,
    choices: CombineChoices,
  ): Promise<Changed & { dropped: string[] }>;
  /** Sets when the Assistant sees an Entry, as a step that `undo` reverts. */
  setEntryVisibility(entryId: string, visibility: Visibility): Promise<Changed>;
  /**
   * Changes an Entry's type, as a step that `undo` reverts; the fields that
   * don't fit the new type are written at the end of its description.
   */
  setEntryType(entryId: string, type: EntryType): Promise<Changed>;
  /**
   * Asks the Author for a JPEG or PNG, then makes it the image of a Scene,
   * Chapter or Entry, scaled down, in place of any it had; false if they
   * cancel or it can't be read, which main has told them. There is no undo.
   * With a Book, an Entry's image from that Book on.
   */
  chooseImage(ref: ImageRef): Promise<boolean>;
  /** Removes a Scene's, Chapter's or Entry's image; there is no undo. */
  removeImage(ref: ImageRef): Promise<void>;
  /** A Scene's, Chapter's or Entry's image as a `data:` URL; null without one, or before it syncs. */
  image(ref: ImageRef): Promise<string | null>;
  /**
   * The images a Scene, Chapter, Part or Entry can take a copy of: those
   * other units hold, live or in the Drawer, identical files as one. With
   * `except`, without its own image, nor any identical to it.
   */
  projectImages(except?: ImageRef): Promise<ProjectImage[]>;
  /** An image `projectImages` offers, read from the unit holding it, as a `data:` URL; null without one. */
  projectImage(ref: ImageRef): Promise<string | null>;
  /**
   * Gives a unit a copy of the image `source` holds, unchanged, in place of
   * any it had; false if it can't, which main has told the Author. There is
   * no undo.
   */
  copyImage(ref: ImageRef, source: ImageRef): Promise<boolean>;
  /**
   * The other units holding an image identical to `ref`'s own: those live,
   * and how many in the Drawer or Trash, which Replace everywhere… leaves
   * alone.
   */
  imageMatches(ref: ImageRef): Promise<ImageMatches>;
  /**
   * Asks the Author for a JPEG or PNG, as `chooseImage` does, and keeps it,
   * scaled down, for `replaceImages`; it as a `data:` URL, or null if they
   * cancel or it can't be read, which main has told them.
   */
  pickImage(): Promise<string | null>;
  /**
   * Makes the image `pickImage` last kept the image of each of `refs`, each
   * in its own file, skipping those that can't take it, as one since moved
   * to Trash. There is no undo.
   */
  replaceImages(refs: ImageRef[]): Promise<ImagesReplaced>;
  /** Puts a Trash or Drawer item back where it was, as near as the Manuscript allows. */
  restore(id: string): Promise<Changed>;
  /** Reverts `step` if it is still the latest structure operation. */
  undo(step: number): Promise<Manuscript>;

  /** Latest first. */
  listTrash(): Promise<TrashItem[]>;
  /** What is in the Drawer, latest first. */
  listDrawer(): Promise<TrashItem[]>;

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
  /**
   * Asks the Author to confirm, then deletes Trash for good once a Backup
   * is made, as `addBookFromBackup` says; false if not.
   */
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
   * Calls the Project's Parts Part, Act or Episode, a Project setting that
   * changes nothing else; the Manuscript carrying it follows as a
   * `unitDetailsChanged`. False when it can't be saved, which main has told
   * the Author.
   */
  setPartLabel(label: PartLabel): Promise<boolean>;
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
   * In a Series, says which Book an Entry first appears in, or with null
   * that it isn't said; there is no undo. The Entries follow as an
   * `entriesChanged`.
   */
  setFirstAppears(entryId: string, bookId: string | null): Promise<void>;
  /**
   * Adds a Tag to an Entry, or takes one off, or both, ignoring case, as a
   * step that `undo` reverts. The Entries showing it follow as an
   * `entriesChanged`.
   */
  changeEntryTags(entryId: string, change: TagChange): Promise<Changed>;
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
  /** The Custom fields, by Entry type, each type's in their order; none in Trash. */
  listCustomFields(): Promise<CustomField[]>;
  /**
   * Adds a Custom field to every Entry of `type`; resolves with its id.
   * Refused with a label the type has already, built in or not, ignoring
   * case. Each change follows as a `customFieldsChanged`.
   */
  addCustomField(type: EntryType, label: string): Promise<string>;
  /** Renames a Custom field, refused as `addCustomField` is. */
  renameCustomField(id: string, label: string): Promise<void>;
  /** Moves a Custom field to `index` among its type's. */
  moveCustomField(id: string, index: number): Promise<void>;
  /**
   * Moves a Custom field to Trash with its values once the Author confirms,
   * told how many Entries hold one; false when they cancelled.
   */
  trashCustomField(id: string): Promise<boolean>;
  /**
   * What a Custom field suggests to the Entry `exceptEntry`: the values the
   * other Entries of its type hold in it, those in the Drawer too but not
   * those in Trash, grouped and ordered as `customSuggestions` does.
   */
  customFieldSuggestions(id: string, exceptEntry: string): Promise<string[]>;
  /**
   * What the Author has chosen as each Entry type's Key fields, item by
   * item; an item not in it is as its type's defaults have it.
   */
  listKeyFields(): Promise<KeyFieldChoices>;
  /**
   * Makes `item` a Key field of every Entry of `type`, or not; refused for
   * an item the type can't show. Follows as a `keyFieldsChanged`.
   */
  setKeyField(type: EntryType, item: KeyFieldItem, on: boolean): Promise<void>;
  /**
   * Every Relation held, those naming an Entry in Trash, in the Drawer or
   * not here too, which `relationsView` hides.
   */
  listRelations(): Promise<Relation[]>;
  /**
   * Relates the Entry `from` to `to`; resolves with the Relation's id.
   * Refused as `relationRefusal` refuses it. Each change to the Relations
   * follows as a `relationsChanged`.
   */
  addRelation(
    from: string,
    to: string,
    choice: RelationChoice,
  ): Promise<string>;
  /** Gives a free-text Relation another label. */
  relabelRelation(id: string, label: string): Promise<void>;
  /**
   * In a Series, has a Relation hold from a Book, or with null, in every
   * Book; a Same as group's is set on the whole group.
   */
  setRelationBook(id: string, book: string | null): Promise<void>;
  /** Removes a free-text or Part of Relation. */
  removeRelation(id: string): Promise<void>;
  /** Takes an Entry out of its Same as group, the others staying together. */
  leaveSameAs(entryId: string): Promise<void>;
  /** The Scene's Snapshots not in Trash, newest first. */
  listSnapshots(sceneId: string): Promise<Snapshot[]>;
  /**
   * Takes a Snapshot of a Scene's Prose as main has it, named `name`;
   * resolves with its id. Refused for a Missing Scene or one in Conflict.
   * Each change to the Snapshots follows as a `snapshotsChanged`.
   */
  takeSnapshot(sceneId: string, name: string): Promise<string>;
  /** Gives a Snapshot another name, which may not be empty. */
  renameSnapshot(id: string, name: string): Promise<void>;
  /** Moves a Snapshot to Trash, from which `restore` brings it back as other Trash items. */
  trashSnapshot(id: string): Promise<void>;
  /**
   * Replaces a Scene's Prose with a Snapshot's, first taking a Snapshot of
   * the Prose it replaces; refused as taking one is. Follows as a
   * `unitReloaded` by restore.
   */
  restoreSnapshot(id: string): Promise<void>;
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
 * The Floating image: whether it is on, where its top left corner was left in
 * the window in CSS pixels, how wide the Author made it, and whether it is
 * folded to its title. Kept while it is off, to float where it was again.
 */
export type FloatingImage = {
  on: boolean;
  x: number;
  y: number;
  width: number;
  folded: boolean;
};

/**
 * How the Author left a Project's window on this computer; `cursor` is where
 * it was in the last Scene, `outlineNotesOpen` says whether the Outline &
 * Notes box above the Prose is open, and `overviewOpen` whether the Overview
 * pane beside it is. `pinnedNotes` are the Pinned notes, the one on top last.
 * The Overview pane's state, the Pinned notes and the Floating image are
 * never kept in the Project.
 */
export type ProjectView = {
  lastSceneId?: string;
  cursor?: number;
  panelWidths?: PanelWidths;
  outlineNotesOpen?: boolean;
  overviewOpen?: boolean;
  pinnedNotes?: PinnedNote[];
  floatingImage?: FloatingImage;
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
  /** How Writing's Todos dock shows, on this computer, in every Project. */
  todoDock: TodoDock;
  /**
   * The height the Author dragged the Assistant's message box to, on this
   * computer, in every Mode and Project; null if never, or reset.
   */
  composerHeight: number | null;
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

/** How the app makes Backups on its own on this computer. */
export type BackupSettings = {
  /** Whether it makes them: once a day, and before Trash is emptied. */
  automatic: boolean;
  /** The folder they go in, one subfolder per Project. */
  folder: string;
};

/** Why an automatic Backup wasn't made, and what to tell the Author. */
export type BackupSkip = {
  reason: 'online-only' | 'folder-unavailable' | 'write-failed';
  message: string;
};

/**
 * An automatic Backup that wasn't made, told to the Author: after emptying
 * Trash or adding a Book with automatic Backups off, and once per Project
 * per session for a daily one that failed.
 */
export type BackupNotice = {
  message: string;
  /** Whether to offer Settings, as to choose another folder. */
  offerSettings: boolean;
};

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
  /** How the app makes Backups on its own on this computer. */
  backups(): Promise<BackupSettings>;
  /** Turns automatic Backups on or off, for every Project on this computer. */
  setAutoBackup(on: boolean): Promise<BackupSettings>;
  /**
   * Asks for a folder for automatic Backups and keeps it, unless it is
   * inside a Project, as the Author is then told. Resolves with the settings
   * as they are after.
   */
  chooseBackupFolder(): Promise<BackupSettings>;
  /** Shows the Backup folder in the file manager, making it if its parent is there. */
  showBackupFolder(): Promise<void>;
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
   * Asks for a Story Bible as Word or Markdown and reads its Entries, for the
   * Author to tick those to add to this window's Project.
   */
  chooseStoryBibleImport(): Promise<StoryBibleImportChoice>;
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
  /**
   * Says whether this window's Prose has focus, which enables the Format
   * menu, and whether its Scene can be split, which enables the Splits,
   * and to the next Chapter, which Split to Next Chapter needs too.
   */
  showProseFocus(focused: boolean, splittable: boolean, toNext: boolean): void;
  /**
   * Opens the Prose's right-click menu where the pointer is; what is chosen
   * comes back to this window by `onCommand`.
   */
  showProseMenu(splittable: boolean, toNext: boolean): void;
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
   * Remembers `unticked`, then exports the rest of the Manuscript, in a
   * Series of `book` alone, where the Author chooses, once they have agreed
   * to export the main version of ticked Scenes in Conflict. Resolves when
   * done or cancelled.
   */
  exportManuscript(unticked: ExportUnticked, book?: ExportBook): Promise<void>;
  /**
   * Whether the last Story Bible Export of this window's Project had
   * images, on this computer; they go in until the Author says otherwise.
   */
  storyBibleExportImages(): Promise<boolean>;
  /**
   * Remembers whether `choice` has images, then exports the Entries it
   * holds where the Author chooses, once they have agreed to export the main
   * version of those in Conflict. Resolves when done or cancelled.
   */
  exportStoryBible(choice: StoryBibleChoice): Promise<void>;
  /**
   * Has this window's edits written, then writes a Backup of its Project
   * where the Author chooses. Resolves with the file's name once written;
   * null when cancelled, or refused, as the Author is then told.
   */
  backUpProject(): Promise<string | null>;
  /**
   * Asks for a Backup and checks it, then asks for a new folder, restores
   * the Project there and opens it, as Open Project does. It asks in this
   * window's Project's automatic Backups, or without one, the Backup folder.
   */
  restoreBackup(): Promise<OpenResult>;
  /**
   * Calls `listener` with true as an automatic Backup before emptying Trash
   * or adding a Book from a Backup starts in this window, and false once it
   * is done. Returns an unsubscribe function.
   */
  onBackingUp(listener: (on: boolean) => void): () => void;
  /**
   * Calls `listener` when an automatic Backup of this window's Project
   * wasn't made, as BackupNotice says. Returns an unsubscribe function.
   */
  onBackupNotice(listener: (notice: BackupNotice) => void): () => void;
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
  /** How the Story Bible list shows for this window's Project, on this computer. */
  bibleView(): Promise<BibleView>;
  /** Remembers how the Story Bible list shows. */
  setBibleView(view: BibleView): void;
  /** What every Corkboard of this window's Project shows, on this computer. */
  corkboardView(): Promise<CorkboardView>;
  /** Remembers what every Corkboard shows. */
  setCorkboardView(view: CorkboardView): void;
  /** Remembers how Writing's Todos dock shows, in every Project. */
  setTodoDock(change: Partial<TodoDock>): void;
  /** Remembers the message box's height, in every Project; null resets it. */
  setComposerHeight(height: number | null): void;
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
  /**
   * In a Series, puts a Brainstorm or Interview on the Book `bookId` from
   * its next message on, logged as an event. Refused for a Writing
   * Conversation, and for what is no Book.
   */
  chooseBook(conversationId: string, bookId: string): Promise<void>;
  /** Gives a Conversation a new title; refused for an empty one. */
  renameConversation(conversationId: string, title: string): Promise<void>;
  /**
   * Stars or unstars a Conversation, which every computer then sees; never
   * written to its log.
   */
  starConversation(conversationId: string, starred: boolean): Promise<void>;
  /**
   * Asks the Author to confirm, saying how many pending Proposals go with
   * it, then moves the whole Conversation to Trash; null if not. Single
   * messages can't be deleted.
   */
  trashConversation(conversationId: string): Promise<Changed | null>;
  /**
   * Sets an Interview's or Plan's focus from its next message on, logged as
   * an event. Refused for a Conversation of another Mode, and in a Plan,
   * for a focus other than its Book, a Part or a Chapter.
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
   * Asks in a Plan Conversation what one of its start buttons asks, as
   * `ask` does: the Author's message is the button's label. Refused in
   * another Mode.
   */
  planAsk(
    conversationId: string,
    planAsk: PlanAsk,
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
  /**
   * Accept all: accepts Proposals of one reply as proposed, each after those
   * it needs; one that is stale or out of reach is left pending, and so is
   * every one that needs it.
   */
  acceptProposals(conversationId: string, proposalIds: string[]): Promise<void>;
  /** Rejects a pending Proposal, and those still pending that need it. */
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
  createPart: 'invoke',
  renamePart: 'invoke',
  movePart: 'invoke',
  trashPart: 'invoke',
  createBook: 'invoke',
  importBook: 'invoke',
  addBookFromBackup: 'invoke',
  renameBook: 'invoke',
  moveBook: 'invoke',
  trashBook: 'invoke',
  createScene: 'invoke',
  renameChapter: 'invoke',
  renameScene: 'invoke',
  moveChapter: 'invoke',
  moveScene: 'invoke',
  splitScene: 'invoke',
  trashScene: 'invoke',
  trashChapter: 'invoke',
  listEntries: 'invoke',
  createEntry: 'invoke',
  trashEntry: 'invoke',
  moveToDrawer: 'invoke',
  moveBetweenTrashAndDrawer: 'invoke',
  importEntries: 'invoke',
  combineEntries: 'invoke',
  setEntryVisibility: 'invoke',
  setEntryType: 'invoke',
  chooseImage: 'invoke',
  removeImage: 'invoke',
  image: 'invoke',
  projectImages: 'invoke',
  projectImage: 'invoke',
  copyImage: 'invoke',
  imageMatches: 'invoke',
  pickImage: 'invoke',
  replaceImages: 'invoke',
  restore: 'invoke',
  undo: 'invoke',
  listTrash: 'invoke',
  listDrawer: 'invoke',
  listConflicts: 'invoke',
  readConflictVersion: 'invoke',
  resolveConflict: 'invoke',
  emptyTrash: 'invoke',
  setLanguage: 'invoke',
  setFoldedNoteImage: 'invoke',
  setPartLabel: 'invoke',
  setStatus: 'invoke',
  setWordTarget: 'invoke',
  editStatus: 'invoke',
  statusUses: 'invoke',
  deleteStatus: 'invoke',
  tags: 'invoke',
  setTags: 'invoke',
  setFirstAppears: 'invoke',
  changeEntryTags: 'invoke',
  tagUses: 'invoke',
  renameTag: 'invoke',
  deleteTag: 'invoke',
  listTodos: 'invoke',
  addTodo: 'invoke',
  changeTodo: 'invoke',
  moveTodo: 'invoke',
  deleteTodo: 'invoke',
  clearDoneTodos: 'invoke',
  listCustomFields: 'invoke',
  addCustomField: 'invoke',
  renameCustomField: 'invoke',
  moveCustomField: 'invoke',
  trashCustomField: 'invoke',
  customFieldSuggestions: 'invoke',
  listKeyFields: 'invoke',
  setKeyField: 'invoke',
  listRelations: 'invoke',
  addRelation: 'invoke',
  relabelRelation: 'invoke',
  setRelationBook: 'invoke',
  removeRelation: 'invoke',
  leaveSameAs: 'invoke',
  listSnapshots: 'invoke',
  takeSnapshot: 'invoke',
  renameSnapshot: 'invoke',
  trashSnapshot: 'invoke',
  restoreSnapshot: 'invoke',
} as const satisfies MethodTable<ProjectApi>;

export const assistantMethods = {
  listConversations: 'invoke',
  readConversation: 'invoke',
  startConversation: 'invoke',
  chooseModel: 'invoke',
  chooseBook: 'invoke',
  renameConversation: 'invoke',
  starConversation: 'invoke',
  trashConversation: 'invoke',
  setInterviewFocus: 'invoke',
  ask: 'stream',
  review: 'stream',
  planAsk: 'stream',
  retry: 'stream',
  acceptProposal: 'invoke',
  acceptProposals: 'invoke',
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
  backups: 'invoke',
  setAutoBackup: 'invoke',
  chooseBackupFolder: 'invoke',
  showBackupFolder: 'invoke',
} as const satisfies MethodTable<SettingsApi>;

export const shellMethods = {
  currentProject: 'invoke',
  createProject: 'invoke',
  openProject: 'invoke',
  chooseImport: 'invoke',
  chooseStoryBibleImport: 'invoke',
  importProject: 'invoke',
  onCommand: 'event',
  showDocked: 'send',
  showProseFocus: 'send',
  showProseMenu: 'send',
  setZen: 'send',
  exportChoice: 'invoke',
  exportManuscript: 'invoke',
  storyBibleExportImages: 'invoke',
  exportStoryBible: 'invoke',
  backUpProject: 'invoke',
  restoreBackup: 'invoke',
  onBackingUp: 'event',
  onBackupNotice: 'event',
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
  bibleView: 'invoke',
  setBibleView: 'send',
  corkboardView: 'invoke',
  setCorkboardView: 'send',
  setTodoDock: 'send',
  setComposerHeight: 'send',
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
