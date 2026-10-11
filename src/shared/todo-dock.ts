/**
 * How Writing's Todos dock shows on this computer, in every Project: folded
 * to its header or raised, its height raised in CSS pixels, and whether it
 * shows All the Todos or This context's, those of the unit open and the units
 * containing it.
 */
export type TodoDock = {
  folded: boolean;
  height: number;
  scope: TodoScope;
};

const TODO_SCOPES = ['all', 'context'] as const;

/** Which Todos a list shows: All, or This context's. */
export type TodoScope = (typeof TODO_SCOPES)[number];

export const DEFAULT_TODO_DOCK: TodoDock = {
  folded: true,
  height: 220,
  scope: 'all',
};

/** The valid fields of what `settings.json` keeps or a window sends. */
export function readTodoDock(stored: unknown): Partial<TodoDock> {
  if (typeof stored !== 'object' || stored === null) return {};
  const { folded, height, scope } = stored as Record<string, unknown>;
  return {
    ...(typeof folded === 'boolean' && { folded }),
    ...(typeof height === 'number' && Number.isFinite(height) && { height }),
    ...(TODO_SCOPES.includes(scope as TodoScope) && {
      scope: scope as TodoScope,
    }),
  };
}
