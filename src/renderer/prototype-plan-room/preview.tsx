// PROTOTYPE (throwaway): the Plan Room prototype alone in a browser, with a
// stand-in header, for a look without Electron (#300). The real thing is the
// Plan tab in the app (npm start). Never merge to main.

import { createRoot } from 'react-dom/client';
import '../styles.css';
import { PlanRoom } from './PlanRoom';
import { PlanSwitcher } from './PlanSwitcher';

createRoot(document.getElementById('root')!).render(
  <div className="project-view">
    <header>
      <span className="project-name">The Lantern Keeper</span>
      <div role="group" aria-label="Room" className="mode-switch">
        {['Writing', 'Story Bible', 'Brainstorm', 'Interview', 'Plan'].map(
          (r) => (
            <button key={r} aria-pressed={r === 'Plan'}>
              {r}
            </button>
          ),
        )}
      </div>
      <span className="scene-title" />
    </header>
    <div className="project-body">
      <div className="room">
        <PlanRoom />
        <PlanSwitcher />
      </div>
    </div>
  </div>,
);
