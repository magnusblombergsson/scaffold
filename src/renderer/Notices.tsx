import { useState } from 'react';
import type { SessionNotice, Tip } from '../shared/api';
import type { Manuscript } from '../shared/project-types';

/**
 * What the Author should know as the Project opens: other computers it is
 * also open on, where they left off on another computer, and tips. Each can
 * be dismissed; none stops the Author from working.
 */
export function Notices({
  sessions,
  manuscript,
  tips,
  onContinue,
  onDismissTip,
}: {
  sessions: SessionNotice;
  manuscript: Manuscript;
  tips: Tip[];
  onContinue(sceneId: string, cursor?: number): void;
  onDismissTip(tip: Tip): void;
}) {
  const [alsoOpenShown, setAlsoOpenShown] = useState(true);
  const [continueShown, setContinueShown] = useState(true);

  const { alsoOpen, continueAt } = sessions;
  const continueTitle =
    continueAt && sceneTitle(manuscript, continueAt.sceneId);
  const notices = [
    alsoOpenShown && alsoOpen.length > 0 && (
      <div className="notice" key="also-open">
        <p>
          {alsoOpen.map(({ host, minutesAgo }) => (
            <span key={host}>
              Also open on <strong>{host}</strong>, last active{' '}
              {minutesAgo === 0 ? 'just now' : `${minutesAgo} min ago`}.{' '}
            </span>
          ))}
        </p>
        <button onClick={() => setAlsoOpenShown(false)}>Dismiss</button>
      </div>
    ),
    continueShown && continueAt && continueTitle !== undefined && (
      <div className="notice" key="continue">
        <p>
          Continue at <em>{continueTitle}</em>, where you left off on{' '}
          <strong>{continueAt.host}</strong>?
        </p>
        <button
          onClick={() => {
            setContinueShown(false);
            onContinue(continueAt.sceneId, continueAt.cursor);
          }}
        >
          Continue
        </button>
        <button onClick={() => setContinueShown(false)}>Dismiss</button>
      </div>
    ),
    tips.includes('keep-on-device') && (
      <div className="notice" key="keep-on-device">
        <p>
          Some of this Project's files are online-only, so they download when
          opened. To keep them all on this computer, right-click the Project
          folder in File Explorer and choose “Always keep on this device”.
        </p>
        <button onClick={() => onDismissTip('keep-on-device')}>Dismiss</button>
      </div>
    ),
  ].filter(Boolean);

  if (notices.length === 0) return null;
  return (
    <div className="notices" role="status">
      {notices}
    </div>
  );
}

/** The title of a Scene in the Manuscript that isn't Missing. */
function sceneTitle(manuscript: Manuscript, sceneId: string) {
  const scenes = [
    ...manuscript.chapters.flatMap((chapter) => chapter.scenes),
    ...manuscript.unplaced,
  ];
  const scene = scenes.find((s) => s.id === sceneId);
  return scene && !('missing' in scene && scene.missing)
    ? scene.title
    : undefined;
}
