import { createContext, useContext, type ReactNode } from 'react';
import type {
  ManuscriptChapter,
  ManuscriptBook,
  ManuscriptPart,
  ManuscriptScene,
  PartLabel,
} from '../shared/project-types';
import type { CustomField } from '../shared/custom-field';
import type { KeyFieldChoices } from '../shared/key-fields';
import { statusOf, type Status } from '../shared/status';
import { Menu, statusChoices, StatusDot } from './Binder';
import { ImagePickerProvider } from './ImagePicker';
import { ReadOnlyContext } from './read-only';
import { ComposerHeightContext, type ComposerHeight } from './composer-height';
import { TagInput } from './TagsDialog';
import { StoryBibleContext } from './story-bible-lens';
import type { ProjectMirror } from './project-mirror';
import { MirrorContext } from './use-project';
import type { LensSource } from '../shared/story-bible-as-of';

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

/** No Key field chosen, the same each time. */
const NO_KEY_FIELDS: KeyFieldChoices = {};

const KeyFieldsContext = createContext<KeyFieldChoices>(NO_KEY_FIELDS);

/**
 * What every view of an open Project reads: whether it is read-only, its
 * Status list with how to set Status and Tags, its Custom fields, the
 * Key fields chosen for each Entry type, the message box's height, and the
 * images to choose from.
 */
export function ProjectContexts({
  mirror,
  readOnly,
  partLabel,
  statusAndTags,
  customFields,
  keyFields,
  composerHeight,
  storyBible,
  children,
}: {
  /** The window's Project mirror, which holds the units' values. */
  mirror: ProjectMirror;
  readOnly: boolean;
  /** What the Project calls a Part. */
  partLabel?: PartLabel;
  statusAndTags: StatusAndTags;
  customFields: CustomField[];
  keyFields: KeyFieldChoices;
  composerHeight: ComposerHeight;
  /** What every reader's lens on the Story Bible is made from. */
  storyBible: LensSource;
  children: ReactNode;
}) {
  return (
    <MirrorContext.Provider value={mirror}>
      <ReadOnlyContext.Provider value={readOnly}>
        <StatusAndTagsContext.Provider value={statusAndTags}>
          <CustomFieldsContext.Provider value={customFields}>
            <KeyFieldsContext.Provider value={keyFields}>
              <ComposerHeightContext.Provider value={composerHeight}>
                <StoryBibleContext.Provider value={storyBible}>
                  <ImagePickerProvider partLabel={partLabel}>
                    {children}
                  </ImagePickerProvider>
                </StoryBibleContext.Provider>
              </ComposerHeightContext.Provider>
            </KeyFieldsContext.Provider>
          </CustomFieldsContext.Provider>
        </StatusAndTagsContext.Provider>
      </ReadOnlyContext.Provider>
    </MirrorContext.Provider>
  );
}

/** The Project's Custom fields, by Entry type, each type's in their order. */
export function useCustomFields(): CustomField[] {
  return useContext(CustomFieldsContext);
}

/** The Key fields the Author has chosen for each Entry type; an item not chosen is as its type's defaults have it. */
export function useKeyFields(): KeyFieldChoices {
  return useContext(KeyFieldsContext);
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

type Unit =
  | ManuscriptBook
  | ManuscriptPart
  | ManuscriptChapter
  | ManuscriptScene;

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
