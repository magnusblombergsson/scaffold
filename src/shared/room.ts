import { MODE_LABELS } from './conversation';

/**
 * The places the Author switches between at the top of the window, in the
 * order it shows them. All but the Story Bible are also Modes; the Story
 * Bible gives the Assistant no role of its own.
 */
export const ROOMS = [
  'writing',
  'storyBible',
  'brainstorm',
  'interview',
  'plan',
] as const;
export type Room = (typeof ROOMS)[number];

export const ROOM_LABELS: Record<Room, string> = {
  ...MODE_LABELS,
  storyBible: 'Story Bible',
};
