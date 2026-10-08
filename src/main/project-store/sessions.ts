import path from 'node:path';
import type { ProjectView, SessionNotice } from '../../shared/api';
import type { Clock } from './clock';
import type { FileSystem } from './file-system';
import { hostStem } from './layout';
import { safeWrite } from './safe-write';

export const SESSIONS = '.sessions';
const MINUTE_MS = 60_000;
const HEARTBEAT_MS = 5 * MINUTE_MS;
/** A marker whose heartbeat is older than this was left by a computer that stopped. */
const STALE_MS = 15 * MINUTE_MS;

/**
 * `.sessions/<HOST>.json`: when this computer last had the Project open, and
 * how it left it. Only a warning to other computers, never a lock. The
 * heartbeat goes on while the Project is open; `activeAt` is when the Author
 * last moved in it, so a computer merely left open doesn't seem worked on.
 */
export type SessionMarker = ProjectView & {
  host: string;
  /** The format of the app that wrote it; markers before it have none. */
  format?: number;
  heartbeat: number;
  activeAt?: number;
  open: boolean;
};

/** When the Author last worked on a marker's computer; old markers have only a heartbeat. */
function activeAt(marker: SessionMarker): number {
  return typeof marker.activeAt === 'number'
    ? marker.activeAt
    : marker.heartbeat;
}

/** A marker's file name: the host, with what a file name can't hold replaced. */
function markerName(host: string): string {
  return `${hostStem(host)}.json`;
}

/** Every marker that can be read, by file name; one that can't is skipped. */
export async function readSessionMarkers(
  projectPath: string,
  fs: FileSystem,
): Promise<Map<string, SessionMarker>> {
  const markers = new Map<string, SessionMarker>();
  const dir = path.join(projectPath, SESSIONS);
  for (const name of await fs.readdir(dir)) {
    if (!name.endsWith('.json')) continue;
    let marker: Partial<SessionMarker> | null;
    try {
      marker = JSON.parse(await fs.readFile(path.join(dir, name)));
    } catch {
      marker = null;
    }
    if (
      typeof marker?.host === 'string' &&
      typeof marker.heartbeat === 'number' &&
      typeof marker.open === 'boolean'
    ) {
      markers.set(name, marker as SessionMarker);
    }
  }
  return markers;
}

/** The computers whose session markers are in the Project. */
export async function markerHosts(
  projectPath: string,
  fs: FileSystem,
): Promise<string[]> {
  const markers = await readSessionMarkers(projectPath, fs);
  return [...markers.values()].map((marker) => marker.host);
}

export type SessionsDeps = {
  path: string;
  fs: FileSystem;
  clock: Clock;
  /** Names this computer in its marker. */
  host: string;
  /** The format of this app, written into the marker. */
  format: number;
};

/**
 * This computer's session marker and its heartbeat, and what the other
 * computers' markers say. Only a warning, so a marker that can't be written
 * is logged, never thrown.
 */
export class Sessions {
  private readonly noticeAtOpen: SessionNotice;
  /** How the Author leaves the Project, for this computer's marker. */
  private view: ProjectView;
  private stopBeating: (() => void) | null = null;
  private writes: Promise<void> = Promise.resolve();
  /** When the Author last opened or moved in the Project here. */
  private activeAt = 0;

  /**
   * `markers` are those read as the Project opened; `hasScene` tells whether
   * the Scene another computer left off at is still here.
   */
  constructor(
    private readonly deps: SessionsDeps,
    markers: Map<string, SessionMarker>,
    hasScene: (sceneId: string) => boolean,
  ) {
    const { host, clock } = deps;
    const now = clock.now();
    const own = markers.get(markerName(host)) ?? null;
    const others = [...markers]
      .filter(([name]) => name !== markerName(host))
      .map(([, marker]) => marker)
      .sort((a, b) => activeAt(b) - activeAt(a));
    const notice: SessionNotice = {
      alsoOpen: others
        .filter((m) => m.open && now - m.heartbeat < STALE_MS)
        .map((m) => ({
          host: m.host,
          minutesAgo: Math.max(0, Math.floor((now - m.heartbeat) / MINUTE_MS)),
        })),
    };
    const last = others[0];
    if (
      last &&
      activeAt(last) > (own ? activeAt(own) : -Infinity) &&
      typeof last.lastSceneId === 'string' &&
      hasScene(last.lastSceneId)
    ) {
      notice.continueAt = {
        host: last.host,
        sceneId: last.lastSceneId,
        ...(typeof last.cursor === 'number' && { cursor: last.cursor }),
      };
    }
    this.noticeAtOpen = notice;
    const {
      host: _,
      format: _f,
      heartbeat: _h,
      activeAt: _a,
      open: _o,
      ...view
    } = own ?? {};
    this.view = view;
  }

  /** What the markers said when the Project opened. */
  notice(): SessionNotice {
    return structuredClone(this.noticeAtOpen);
  }

  /** Whether this computer's session has begun and not yet stopped. */
  get active(): boolean {
    return this.stopBeating !== null;
  }

  /** Starts the heartbeat; the marker itself is written by `mark`. */
  begin(): void {
    if (this.stopBeating) return;
    this.activeAt = this.deps.clock.now();
    this.stopBeating = this.deps.clock.every(HEARTBEAT_MS, () => {
      void this.writeMarker(true);
    });
  }

  /** Writes the marker as open, as at the start and at every beat. */
  mark(): Promise<void> {
    return this.writeMarker(true);
  }

  /** Stops the heartbeat. */
  stop(): void {
    this.stopBeating?.();
    this.stopBeating = null;
  }

  /** Writes the marker as closed. */
  leave(): Promise<void> {
    return this.writeMarker(false);
  }

  /**
   * Records how the Author leaves the Project; a new Scene is written at
   * once. The Overview pane's state stays on this computer, out of the marker.
   */
  update(change: ProjectView): void {
    const view = { ...change };
    delete view.overviewOpen;
    delete view.pinnedNotes;
    if (view.panelWidths) {
      view.panelWidths = { ...view.panelWidths };
      delete view.panelWidths.overview;
    }
    const sceneChanged =
      view.lastSceneId !== undefined &&
      view.lastSceneId !== this.view.lastSceneId;
    this.view = { ...this.view, ...view };
    this.activeAt = this.deps.clock.now();
    if (sceneChanged && this.active) void this.writeMarker(true);
  }

  /** The computers whose markers are in the Project, this one included if it has one. */
  hosts(): Promise<string[]> {
    return markerHosts(this.deps.path, this.deps.fs);
  }

  /** The other computer whose marker says a newer app had the Project open, lately first. */
  async upgradedOn(): Promise<string | undefined> {
    try {
      const markers = await readSessionMarkers(this.deps.path, this.deps.fs);
      return [...markers.values()]
        .filter(
          (m) =>
            m.host !== this.deps.host &&
            typeof m.format === 'number' &&
            m.format > this.deps.format,
        )
        .sort((a, b) => b.heartbeat - a.heartbeat)[0]?.host;
    } catch {
      return undefined;
    }
  }

  /** Writes this computer's marker; it is advisory, so failing to is only logged. */
  private writeMarker(open: boolean): Promise<void> {
    const { path: projectPath, fs, clock, host, format } = this.deps;
    const marker: SessionMarker = {
      ...this.view,
      host,
      format,
      heartbeat: clock.now(),
      activeAt: this.activeAt,
      open,
    };
    const dir = path.join(projectPath, SESSIONS);
    this.writes = this.writes.then(async () => {
      try {
        await fs.mkdir(dir);
        await safeWrite(
          fs,
          clock,
          path.join(dir, markerName(host)),
          `${JSON.stringify(marker, null, 2)}\n`,
        );
      } catch (error) {
        console.error("Can't write the session marker:", error);
      }
    });
    return this.writes;
  }
}
