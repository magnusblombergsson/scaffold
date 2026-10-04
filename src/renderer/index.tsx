/// <reference types="vite/client" />
import { createRoot } from 'react-dom/client';
import { App } from './App';
import {
  applyStoredLook,
  PrototypeSwitcher,
} from './prototype-visual-refresh/PrototypeSwitcher';
import './styles.css';

// PROTOTYPE (throwaway): the visual-refresh switcher, development only.
if (import.meta.env.DEV) applyStoredLook();

createRoot(document.getElementById('root')!).render(
  <>
    <App />
    {import.meta.env.DEV && <PrototypeSwitcher />}
  </>,
);
