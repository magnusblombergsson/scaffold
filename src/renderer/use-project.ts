import { useSyncExternalStore } from 'react';
import type { ProjectMirror, ProjectSnapshot } from './project-mirror';

/** The Project as main last told this window; renders again when it changes. */
export function useProject(mirror: ProjectMirror): ProjectSnapshot {
  return useSyncExternalStore(mirror.subscribe, mirror.getSnapshot);
}
