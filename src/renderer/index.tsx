/// <reference types="vite/client" />
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { EntryLayoutBar } from './prototype-entry-layout/EntryLayoutPrototype';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <>
    <App />
    {/* PROTOTYPE (throwaway, #124): never in a packaged build. */}
    {import.meta.env.DEV && <EntryLayoutBar />}
  </>,
);
