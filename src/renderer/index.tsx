/// <reference types="vite/client" />
import { createRoot } from 'react-dom/client';
import { App } from './App';
import {
  applyStoredLook,
  PeekSwitcher,
} from './prototype-story-bible-peek/PeekSwitcher';
import './styles.css';

// PROTOTYPE (throwaway): the story-bible-peek switcher, development only.
const proto = import.meta.env.DEV || import.meta.env.VITE_PROTO === '1';
if (proto) applyStoredLook();

createRoot(document.getElementById('root')!).render(
  <>
    <App />
    {proto && <PeekSwitcher />}
  </>,
);
