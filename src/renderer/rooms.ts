import type { UnitRef } from '../shared/project-types';
import type { ProposalTarget } from '../shared/proposal';
import type { Room } from '../shared/room';
import type { Command } from '../shared/shortcuts';
import type { TodoLink } from '../shared/todo';

/**
 * The Room something opens in, as a Todo's link, a Proposal's target or a
 * unit whose Conflict was resolved: an Entry in the Story Bible, the rest
 * in Writing.
 */
export function roomOf({ kind }: TodoLink | ProposalTarget | UnitRef): Room {
  return kind === 'entry' || kind === 'private' ? 'storyBible' : 'writing';
}

/** The Rooms with the Assistant panel and a Todos dock. */
export type DockRoom = Extract<Room, 'writing' | 'storyBible'>;

/** `room`, if it has the Assistant panel and a Todos dock; else null. */
export function dockRoomOf(room: Room): DockRoom | null {
  return room === 'writing' || room === 'storyBible' ? room : null;
}

/**
 * Whether a shortcut does its command in `room`. Switching Room and making
 * an Entry work in every Room; a Todo starts where there is a Todos dock;
 * the Assistant collapses where it is; the rest work in Writing only. From
 * the menus they switch to Writing instead.
 */
export function keyApplies(command: Command, room: Room): boolean {
  switch (command.type) {
    case 'room':
    case 'newEntry':
      return true;
    case 'newTodo':
      return dockRoomOf(room) !== null;
    case 'togglePane':
      return (
        room === 'writing' ||
        (room === 'storyBible' && command.pane === 'assistant')
      );
    default:
      return room === 'writing';
  }
}
