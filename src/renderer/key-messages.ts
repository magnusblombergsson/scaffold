import type { KeyResult } from '../shared/api';

/** What to tell the Author once a key they entered was checked. */
export function keyResultMessage({ check, status }: KeyResult): {
  warning: boolean;
  text: string;
} {
  const untilQuit = status.kept === 'untilQuit';
  const kept = untilQuit ? 'Key kept until Writing Tools quits' : 'Key saved';
  switch (check) {
    case 'ok':
      return { warning: false, text: `${kept}.` };
    case 'invalid':
      return {
        warning: true,
        text: "Invalid key: Anthropic doesn't accept it, so it wasn't saved.",
      };
    case 'no-credit':
      return {
        warning: true,
        text: `${kept}, but the account has no credit. Add credit in Anthropic Console before using the Assistant.`,
      };
    case 'unreachable':
      return {
        warning: true,
        text: `Can't reach Anthropic, so the key wasn't checked. ${untilQuit ? "It's kept until Writing Tools quits" : "It's saved"}; if it doesn't work, the Assistant will say so.`,
      };
  }
}
