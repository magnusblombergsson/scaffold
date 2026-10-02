import path from 'node:path';
import type { Clock } from '../project-store/clock';
import type { FileSystem } from '../project-store/file-system';
import type { ProjectLookup } from '../project-store/project-store';
import { safeWrite } from '../project-store/safe-write';
import type { PanelWidths, Tip } from '../../shared/api';
import { DEFAULT_MODEL, isModelId, type ModelId } from '../../shared/models';

export const SETTINGS_VERSION = 1;
const RECENT_LIMIT = 20;
const SAVE_DELAY_MS = 500;

/** One Project in the recent list, as `settings.json` keeps it. */
export type RecentRecord = {
  path: string;
  projectId: string;
  displayName: string;
  lastOpened: number;
};

export type WindowBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

/** What this computer remembers about one Project, keyed by its id. */
export type ProjectSettings = {
  windowBounds?: WindowBounds;
  panelWidths?: PanelWidths;
  lastSceneId?: string;
  /** Where the cursor was in the last Scene. */
  cursor?: number;
  outlineNotesOpen?: boolean;
  dismissedTips?: Tip[];
};

type SettingsFile = {
  version: number;
  global: {
    openAtQuit?: string[];
    highlightMentions?: boolean;
    /** Any string: one this app doesn't offer reads as the default. */
    model?: string;
    /** Set once the Author has added a key or skipped the welcome. */
    welcomed?: boolean;
  } & Record<string, unknown>;
  projects: Record<string, ProjectSettings & Record<string, unknown>>;
  recent: RecentRecord[];
};

export type SettingsDeps = {
  fs: FileSystem;
  clock: Clock;
  projects: ProjectLookup;
};

/**
 * Reads `settings.json`, or starts from defaults. An unreadable file is set
 * aside as `settings.corrupt-<ts>.json`; an invalid field gets its default.
 */
export async function loadAppSettings(
  file: string,
  deps: SettingsDeps,
): Promise<AppSettings> {
  if (!(await deps.fs.exists(file))) {
    return new AppSettings(file, defaults(), deps);
  }
  const data = parseSettings(await deps.fs.readFile(file));
  if (!data) {
    const aside = path.join(
      path.dirname(file),
      `settings.corrupt-${deps.clock.now()}.json`,
    );
    await deps.fs.rename(file, aside);
    console.error(`Unreadable settings set aside as ${aside}`);
    return new AppSettings(file, defaults(), deps);
  }
  return new AppSettings(file, data, deps);
}

function defaults(): SettingsFile {
  return { version: SETTINGS_VERSION, global: {}, projects: {}, recent: [] };
}

/** A JSON object as read, before its fields are checked. */
type JsonObject = Record<string, unknown>;

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Null when the text isn't a settings object at all. Fields it doesn't know
 * are kept, so a rewrite doesn't lose them.
 */
function parseSettings(text: string): SettingsFile | null {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isJsonObject(raw)) return null;
  const global = isJsonObject(raw.global) ? { ...raw.global } : {};
  if (!isStringArray(global.openAtQuit)) delete global.openAtQuit;
  if (typeof global.highlightMentions !== 'boolean') {
    delete global.highlightMentions;
  }
  if (typeof global.welcomed !== 'boolean') delete global.welcomed;
  const projects: SettingsFile['projects'] = {};
  if (isJsonObject(raw.projects)) {
    for (const [id, value] of Object.entries(raw.projects)) {
      if (isJsonObject(value)) projects[id] = parseProjectSettings(value);
    }
  }
  return {
    ...raw,
    // Any number above ours is a newer file, so never overwritten.
    version:
      typeof raw.version === 'number' && raw.version > SETTINGS_VERSION
        ? raw.version
        : SETTINGS_VERSION,
    global,
    projects,
    recent: Array.isArray(raw.recent)
      ? raw.recent.flatMap((item) => parseRecentRecord(item) ?? [])
      : [],
  };
}

function parseProjectSettings(raw: JsonObject): ProjectSettings & JsonObject {
  const settings = { ...raw };
  if (!isWindowBounds(settings.windowBounds)) delete settings.windowBounds;
  const widths = settings.panelWidths;
  if (!isJsonObject(widths) || !Object.values(widths).every(isFiniteNumber)) {
    delete settings.panelWidths;
  }
  if (typeof settings.lastSceneId !== 'string') delete settings.lastSceneId;
  if (!isFiniteNumber(settings.cursor)) delete settings.cursor;
  if (!isStringArray(settings.dismissedTips)) delete settings.dismissedTips;
  if (typeof settings.outlineNotesOpen !== 'boolean') {
    delete settings.outlineNotesOpen;
  }
  return settings;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((item) => typeof item === 'string')
  );
}

function isWindowBounds(value: unknown): value is WindowBounds {
  return (
    isJsonObject(value) &&
    ['x', 'y', 'width', 'height'].every((key) => isFiniteNumber(value[key]))
  );
}

/** Null without a path or id; a bad name or date gets its default. */
function parseRecentRecord(raw: unknown): RecentRecord | null {
  if (
    !isJsonObject(raw) ||
    typeof raw.path !== 'string' ||
    typeof raw.projectId !== 'string'
  ) {
    return null;
  }
  return {
    ...raw,
    path: raw.path,
    projectId: raw.projectId,
    displayName:
      typeof raw.displayName === 'string'
        ? raw.displayName
        : path.basename(raw.path),
    lastOpened: isFiniteNumber(raw.lastOpened) ? raw.lastOpened : 0,
  };
}

/** The Author's setup on this computer, kept in `userData/settings.json`. */
export class AppSettings {
  /** Changed since the last write. */
  private dirty = false;
  private saveScheduled = false;
  /** The write running last; the next one waits for it. */
  private writing: Promise<void> = Promise.resolve();

  constructor(
    private readonly file: string,
    private readonly data: SettingsFile,
    private readonly deps: SettingsDeps,
  ) {}

  /** Recently opened Projects, latest first. */
  recent(): RecentRecord[] {
    return structuredClone(this.data.recent);
  }

  /** The recent list, each Project marked by whether its folder is still there. */
  async recentWithStatus(): Promise<(RecentRecord & { found: boolean })[]> {
    return Promise.all(
      this.recent().map(async (record) => ({
        ...record,
        found: await this.deps.projects.isProject(record.path),
      })),
    );
  }

  /**
   * Records that the Project at `path` was opened: it goes first in the
   * recent list, with the id it holds now.
   */
  recordOpened(project: {
    path: string;
    id: string;
    displayName: string;
  }): void {
    const recent = this.data.recent.filter(
      (record) => !samePath(record.path, project.path),
    );
    recent.unshift({
      path: project.path,
      projectId: project.id,
      displayName: project.displayName,
      lastOpened: this.deps.clock.now(),
    });
    this.setRecent(recent.slice(0, RECENT_LIMIT));
  }

  /**
   * Another recent path whose folder still holds the Project with `id`: the
   * folder at `projectPath` may be a copy of it. Null once `projectPath` has
   * been opened as that Project, so the Author is asked only once per path.
   */
  async originalOf(projectPath: string, id: string): Promise<string | null> {
    const known = this.data.recent.find((record) =>
      samePath(record.path, projectPath),
    );
    if (known?.projectId === id) return null;
    for (const record of this.data.recent) {
      if (record.projectId !== id || samePath(record.path, projectPath)) {
        continue;
      }
      // The cached id may be stale; only the folder itself says.
      if ((await this.deps.projects.idAt(record.path)) === id) {
        return record.path;
      }
    }
    return null;
  }

  /** Takes a path off the recent list. */
  remove(projectPath: string): void {
    this.setRecent(
      this.data.recent.filter((record) => !samePath(record.path, projectPath)),
    );
  }

  /** A Project's settings leave with the last recent path that holds it. */
  private setRecent(recent: RecentRecord[]): void {
    this.data.recent = recent;
    const kept = new Set(recent.map((record) => record.projectId));
    for (const id of Object.keys(this.data.projects)) {
      if (!kept.has(id)) delete this.data.projects[id];
    }
    this.changed();
  }

  project(id: string): ProjectSettings {
    return structuredClone(this.data.projects[id] ?? {});
  }

  updateProject(id: string, change: ProjectSettings): void {
    this.data.projects[id] = { ...this.data.projects[id], ...change };
    this.changed();
  }

  /** The paths of the Projects to reopen at startup. */
  openAtQuit(): string[] {
    return [...(this.data.global.openAtQuit ?? [])];
  }

  setOpenAtQuit(paths: string[]): void {
    this.data.global.openAtQuit = [...paths];
    this.changed();
  }

  /** Whether Entry names are highlighted where they are mentioned; on by default. */
  highlightMentions(): boolean {
    return this.data.global.highlightMentions ?? true;
  }

  setHighlightMentions(on: boolean): void {
    this.data.global.highlightMentions = on;
    this.changed();
  }

  /** The Claude model for the next call, in every Project. */
  model(): ModelId {
    const model = this.data.global.model;
    return isModelId(model) ? model : DEFAULT_MODEL;
  }

  setModel(model: ModelId): void {
    this.data.global.model = model;
    this.changed();
  }

  /** Whether the Author has been welcomed on this computer. */
  welcomed(): boolean {
    return this.data.global.welcomed ?? false;
  }

  setWelcomed(): void {
    if (this.welcomed()) return;
    this.data.global.welcomed = true;
    this.changed();
  }

  /** Saves changes about 500 ms later, together with any made meanwhile. */
  private changed(): void {
    this.dirty = true;
    if (this.saveScheduled) return;
    this.saveScheduled = true;
    void this.deps.clock.sleep(SAVE_DELAY_MS).then(() => {
      this.saveScheduled = false;
      return this.flush();
    });
  }

  /** Writes any changes now; resolves once they are on disk or have failed to. */
  flush(): Promise<void> {
    this.writing = this.writing.then(async () => {
      // A newer app's file is read, never overwritten.
      if (!this.dirty || this.data.version > SETTINGS_VERSION) return;
      this.dirty = false;
      try {
        await safeWrite(
          this.deps.fs,
          this.deps.clock,
          this.file,
          `${JSON.stringify(this.data, null, 2)}\n`,
        );
      } catch (error) {
        // Kept in memory; the next change or flush tries again.
        this.dirty = true;
        console.error("Can't save settings:", error);
      }
    });
    return this.writing;
  }
}

/** Paths are compared as Windows and macOS do: ignoring case. */
export function samePath(a: string, b: string): boolean {
  const normal = (p: string) => {
    const resolved = path.resolve(p);
    return process.platform === 'linux' ? resolved : resolved.toLowerCase();
  };
  return normal(a) === normal(b);
}
