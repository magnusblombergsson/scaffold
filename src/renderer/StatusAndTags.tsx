import { createContext, useContext, type ReactNode } from 'react';
import type {
  ManuscriptChapter,
  ManuscriptPart,
  ManuscriptScene,
} from '../shared/project-types';
import type { CustomField } from '../shared/custom-field';
import { statusOf, type Status } from '../shared/status';
import { Menu, statusChoices, StatusDot } from './Binder';
import { ReadOnlyContext } from './read-only';
import { TagInput } from './TagsDialog';

/**
 * The Project's Status list, and how to give a Scene, Chapter or Part a Status or
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

/** No Custom fields, the same each time. */
const NO_CUSTOM_FIELDS: CustomField[] = [];

const CustomFieldsContext = createContext<CustomField[]>(NO_CUSTOM_FIELDS);

/**
 * What every view of an open Project reads: whether it is read-only, its
 * Status list with how to set Status and Tags, and its Custom fields.
 */
export function ProjectContexts({
  readOnly,
  statusAndTags,
  customFields,
  children,
}: {
  readOnly: boolean;
  statusAndTags: StatusAndTags;
  customFields: CustomField[];
  children: ReactNode;
}) {
  return (
    <ReadOnlyContext.Provider value={readOnly}>
      <StatusAndTagsContext.Provider value={statusAndTags}>
        <CustomFieldsContext.Provider value={customFields}>
          {children}
        </CustomFieldsContext.Provider>
      </StatusAndTagsContext.Provider>
    </ReadOnlyContext.Provider>
  );
}

/** The Project's Custom fields, by Entry type, each type's in their order. */
export function useCustomFields(): CustomField[] {
  return useContext(CustomFieldsContext);
}

function useStatusAndTags(): StatusAndTags {
  const context = useContext(StatusAndTagsContext);
  if (!context) throw new Error('Status and Tags are only within a Project.');
  return context;
}

/** The Project's Status list, in order. */
export function useStatuses(): Status[] {
  return useStatusAndTags().statuses;
}

type Unit = ManuscriptPart | ManuscriptChapter | ManuscriptScene;

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
