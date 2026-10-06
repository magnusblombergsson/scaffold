/// <reference types="vite/client" />
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { ZenPrototype } from './prototype-zen-mode/ZenPrototype';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <>
    <App />
    {/* PROTOTYPE (throwaway, #116): never in a packaged build. */}
    {import.meta.env.DEV && <ZenPrototype />}
  </>,
);
