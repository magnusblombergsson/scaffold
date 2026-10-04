/// <reference types="vite/client" />
import { createRoot } from 'react-dom/client';
import { App } from './App';
import {
  applyStoredLook,
  OverviewSwitcher,
} from './prototype-outline-overviews/OverviewSwitcher';
import './styles.css';

// PROTOTYPE (throwaway): the outline-overviews switcher, development only.
const proto = import.meta.env.DEV || import.meta.env.VITE_PROTO === '1';
if (proto) applyStoredLook();

createRoot(document.getElementById('root')!).render(
  <>
    <App />
    {proto && <OverviewSwitcher />}
  </>,
);
