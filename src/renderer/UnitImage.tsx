import { useContext } from 'react';
import type {
  ManuscriptChapter,
  ManuscriptScene,
} from '../shared/project-types';
import type { MenuItem } from './Binder';
import { useImageUrl, ViewableImage } from './ImageView';
import { ReadOnlyContext } from './read-only';

type Unit = ManuscriptChapter | ManuscriptScene;

/**
 * A Scene's or Chapter's image as a `data:` URL, or null without one; it is
 * read again when the unit's image changes, even under the same file name.
 */
function useUnitImage({ id, image }: Unit): string | null {
  return useImageUrl(
    image,
    () => window.project.unitImage(id),
    (event) => event.type === 'unitImageChanged' && event.id === id,
  );
}

/**
 * A Scene's or Chapter's image, small, beside its title on a card, a lane,
 * a Corkboard's header or an Overview row; clicked, the large view.
 */
export function UnitThumbnail({ unit }: { unit: Unit }) {
  const url = useUnitImage(unit);
  return url ? (
    <ViewableImage
      className="unit-thumbnail"
      src={url}
      alt={`Image of ${unit.title}`}
      caption={unit.title}
    />
  ) : null;
}

/** Add image… or Replace image…, and Remove image, as buttons. */
export function UnitImageButtons({ unit }: { unit: Unit }) {
  const readOnly = useContext(ReadOnlyContext);
  return (
    <div className="unit-image-actions">
      {unitImageItems(unit, readOnly).map((item) => (
        <button
          key={item.label}
          type="button"
          disabled={item.disabled}
          onClick={() => 'run' in item && void item.run()}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

/** Add image… or Replace image…, and Remove image, in a unit's menu. */
export function unitImageItems(unit: Unit, readOnly: boolean): MenuItem[] {
  return [
    {
      label: unit.image ? 'Replace image…' : 'Add image…',
      disabled: readOnly,
      run: () => window.project.chooseUnitImage(unit.id),
    },
    ...(unit.image
      ? [
          {
            label: 'Remove image',
            disabled: readOnly,
            run: () => window.project.removeUnitImage(unit.id),
          },
        ]
      : []),
  ];
}
