// Regenerates the app icons from the two drawings: `npm run icons`.
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { renderIcons } from './render-icons.ts';

const dir = path.join(import.meta.dirname, '../../assets/icon');
const read = (name: string) => readFileSync(path.join(dir, name), 'utf8');

const icons = renderIcons({
  full: read('icon.svg'),
  small: read('icon-small.svg'),
});
for (const [extension, data] of Object.entries(icons)) {
  writeFileSync(path.join(dir, `icon.${extension}`), data);
}
