// A Scene's or Chapter's Status, from the Project's ordered Status list
// (v3 spec §1). Units name a Status by its id, so renaming one changes only
// the list.

/** The fixed palette a Status's colour comes from, legible in light and dark. */
export const STATUS_COLOURS = [
  'grey',
  'red',
  'orange',
  'yellow',
  'green',
  'teal',
  'blue',
  'purple',
] as const;
export type StatusColour = (typeof STATUS_COLOURS)[number];

export type Status = { id: string; name: string; colour: StatusColour };

/**
 * The list a new or imported Project starts with. Their ids are fixed, so a
 * Project given the list on two computers at once has the same ids on both.
 */
export const DEFAULT_STATUSES: readonly Status[] = [
  { id: 'idea', name: 'Idea', colour: 'purple' },
  { id: 'outlined', name: 'Outlined', colour: 'blue' },
  { id: 'drafted', name: 'Drafted', colour: 'orange' },
  { id: 'revised', name: 'Revised', colour: 'teal' },
  { id: 'done', name: 'Done', colour: 'green' },
];

/** The Status `id` names in `statuses`; none when it isn't in the list. */
export function statusOf(
  statuses: readonly Status[],
  id: string | undefined,
): Status | undefined {
  return id === undefined ? undefined : statuses.find((s) => s.id === id);
}

/**
 * The Status list as `project.json` holds it, if it holds one: its items
 * with an id and a name, a colour not in the palette read as grey.
 */
export function readStatusList(stored: unknown): Status[] | undefined {
  if (!Array.isArray(stored)) return undefined;
  return stored
    .filter(
      (item): item is Record<string, unknown> =>
        typeof item === 'object' &&
        item !== null &&
        typeof item.id === 'string' &&
        typeof item.name === 'string',
    )
    .map(({ id, name, colour }) => ({
      id: id as string,
      name: name as string,
      colour: STATUS_COLOURS.includes(colour as StatusColour)
        ? (colour as StatusColour)
        : 'grey',
    }));
}
