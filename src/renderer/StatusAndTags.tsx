import { createContext, useContext, type ReactNode } from 'react';
import type {
  ManuscriptChapter,
  ManuscriptScene,
} from '../shared/project-types';
import { statusOf, type Status } from '../shared/status';
import { Menu, statusChoices, StatusDot } from './Binder';
import { ReadOnlyContext } from './read-only';
import { TagInput } from './TagsDialog';

/**
 * The Project's Status list, and how to give a Scene or Chapter a Status or
 * Tags, for wherever they are shown laid out: the Corkboard, the Overview
 * pane and the Outline skeleton. What shows them follows from main.
 */
export type StatusAndTags = {
  statuses: Status[];
  setStatus(unitId: string, statusId: string | null): void;
  /** Resolves once main has saved them, or has told the Author it couldn't. */
  setTags(unitId: string, tags: string[]): Promise<void>;
};

const StatusAndTagsContext = createContext<StatusAndTags | null>(null);

/**
 * What every view of an open Project reads: whether it is read-only, and
 * its Status list with how to set Status and Tags.
 */
export function ProjectContexts({
  readOnly,
  statusAndTags,
  children,
}: {
  readOnly: boolean;
  statusAndTags: StatusAndTags;
  children: ReactNode;
}) {
  return (
    <ReadOnlyContext.Provider value={readOnly}>
      <StatusAndTagsContext.Provider value={statusAndTags}>
        {children}
      </StatusAndTagsContext.Provider>
    </ReadOnlyContext.Provider>
  );
}

function useStatusAndTags(): StatusAndTags {
  const context = useContext(StatusAndTagsContext);
  if (!context) throw new Error('Status and Tags are only within a Project.');
  return context;
}

type Unit = ManuscriptChapter | ManuscriptScene;

/** A unit's Status dot, named; nothing without a Status. */
export function UnitStatusDot({ unit }: { unit: Unit | undefined }) {
  const { statuses } = useStatusAndTags();
  return <StatusDot status={statusOf(statuses, unit?.status)} />;
}

/**
 * A unit's Status, as a button that opens its choices, then its Tags as
 * chips with a box to type more in. Read-only Projects show them only.
 */
export function StatusAndTagsEditor({ unit }: { unit: Unit }) {
  const readOnly = useContext(ReadOnlyContext);
  const { statuses, setStatus, setTags } = useStatusAndTags();
  const status = statusOf(statuses, unit.status);
  return (
    <div className="status-and-tags">
      <Menu
        label={`Status of ${unit.title}`}
        disabled={readOnly}
        items={statusChoices(statuses, unit.status, (statusId) =>
          setStatus(unit.id, statusId),
        )}
      >
        <span className="unit-status" data-empty={!status || undefined}>
          <StatusDot status={status} named={false} />
          {status?.name ?? 'No Status'}
        </span>
      </Menu>
      <TagInput
        tags={unit.tags ?? NO_TAGS}
        onChange={(tags) => setTags(unit.id, tags)}
      />
    </div>
  );
}

/** No Tags, the same each time. */
const NO_TAGS: string[] = [];
