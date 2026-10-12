import type {
  ImageHolder,
  ImageRef,
  ProjectImage,
} from '../shared/project-types';

/** How many of the units holding an image its tile names. */
const TITLES_SHOWN = 3;

/**
 * The units holding an image, as its tile names them: the first, then up
 * to two more, then how many others, such as “The Gilded Tankard · Scene 3,
 * Scene 7 +8 more”.
 */
export function holdersLabel(holders: ImageHolder[]): string {
  const [first, ...rest] = holders.map((h) => h.title);
  const more = holders.length - TITLES_SHOWN;
  return [
    first,
    rest.length > 0 && ` · ${rest.slice(0, TITLES_SHOWN - 1).join(', ')}`,
    more > 0 && ` +${more} more`,
  ]
    .filter(Boolean)
    .join('');
}

/** The images held by a unit whose name has `text` in it, ignoring case; all without any. */
export function imagesMatching(
  images: ProjectImage[],
  text: string,
): ProjectImage[] {
  const typed = text.trim().toLocaleLowerCase();
  if (!typed) return images;
  return images.filter(({ holders }) =>
    holders.some((h) => h.title.toLocaleLowerCase().includes(typed)),
  );
}

/** Whether `ref` could take a copy of one of `images`: one it doesn't hold. */
export function offersImage(images: ProjectImage[], ref: ImageRef): boolean {
  return images.some(({ holders }) => !holders.some((h) => h.id === ref.id));
}
