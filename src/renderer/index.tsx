import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';
import { followViewSettings } from './view-settings';

followViewSettings();

createRoot(document.getElementById('root')!).render(<App />);
