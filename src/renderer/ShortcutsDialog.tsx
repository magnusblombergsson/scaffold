import { useEffect, useRef } from 'react';
import { CHEAT_SHEET, shortcutText } from '../shared/shortcuts';
import { MAC } from './platform';

/** Help ▸ Keyboard Shortcuts: every shortcut, to read. Escape or Done closes it. */
export function ShortcutsDialog({ onClose }: { onClose(): void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => dialogRef.current?.showModal(), []);

  return (
    <dialog
      ref={dialogRef}
      className="settings shortcuts"
      aria-labelledby="shortcuts-heading"
      // Escape closes it.
      onClose={onClose}
    >
      <h2 id="shortcuts-heading">Keyboard Shortcuts</h2>
      <p className="field-hint">
        Creating, the list keys, item menus and panes work in Writing only; the
        list keys while the Binder or Story Bible list has focus.
      </p>
      {CHEAT_SHEET.map(({ title, shortcuts }) => (
        <table key={title} className="shortcuts-group">
          <caption>{title}</caption>
          <tbody>
            {shortcuts.map(({ keys, action }) => (
              <tr key={keys.join() + action}>
                <th scope="row">
                  {keys.map((accelerator, i) => (
                    <span key={accelerator}>
                      {i > 0 && ' / '}
                      <kbd>{shortcutText(accelerator, MAC)}</kbd>
                    </span>
                  ))}
                </th>
                <td>{action}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ))}
      <div className="settings-close">
        <button onClick={() => dialogRef.current?.close()}>Done</button>
      </div>
    </dialog>
  );
}
