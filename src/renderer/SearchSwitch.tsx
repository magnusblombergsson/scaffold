import { useContext } from 'react';
import type { ConversationState } from './Conversation';
import { ReadOnlyContext } from './read-only';

/**
 * In Research, whether the Assistant searches the web in the Conversation
 * open, or a new one, and a switch to turn that off and back on from its
 * next message on. On LM Studio, which has no search, it says so instead:
 * links and pasted text still work (ADR 0019).
 */
export function SearchSwitch({
  conversation: { model, searching, setSearching, streaming },
}: {
  conversation: ConversationState;
}) {
  const readOnly = useContext(ReadOnlyContext);
  // Until the Model is known, whether it can search isn't.
  if (!model) return null;
  if (model.provider === 'lmstudio') {
    return (
      <p className="search-switch search-none">
        LM Studio can’t search the web. Links you paste and text you paste still
        work.
      </p>
    );
  }
  return (
    <label className="search-switch">
      <input
        type="checkbox"
        checked={searching}
        onChange={(event) => void setSearching(event.target.checked)}
        disabled={readOnly || streaming !== null}
      />
      Search the web
    </label>
  );
}
