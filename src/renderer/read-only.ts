import { createContext } from 'react';

/**
 * True once a newer app has upgraded the Project on another computer: main
 * writes nothing more, so the editors take no more edits.
 */
export const ReadOnlyContext = createContext(false);
