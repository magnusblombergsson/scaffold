// PROTOTYPE (throwaway): answers "Story Bible Entry layout" (#124, map
// #113). Three ways to lay out the Entry view, on the real app with real
// editors, switched from a floating bar (0 = today's single column):
//
//   A  Profile sheet: a header with the name, aliases, Tags and type, the
//      image as a portrait beside it; then the fields in one column, the
//      type's groups packed into a grid (Says / Never says side by side,
//      the senses two by two).
//   B  Fields and a side panel: the writing fields (Name, Description,
//      Appearance, Voice or Senses) on the left; everything you set rather
//      than write (image, type, Tags, Aliases, Role, Status, what the
//      Assistant sees) in a panel on the right.
//   C  Header and tabs: a compact header (small image, name, type, Role or
//      Status, Tags, visibility) and the rest split into tabs per type, so
//      a Character never scrolls past Voice to reach its private notes.
//
// Tags are a stub: kept in memory per Entry, never saved. The bar also
// forces light or dark. Alt+←/→ cycles variants. Mounted only in
// development (see index.tsx). Never merge to main.

import {
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactElement,
} from 'react';
import {
  type EntrySummary,
  type EntryValue,
  type Senses,
  type Voice,
} from '../../shared/project-types';
import './entry-layout.css';

const VARIANTS = [
  { key: '0', name: 'Today' },
  { key: 'A', name: 'Profile sheet' },
  { key: 'B', name: 'Fields + side panel' },
  { key: 'C', name: 'Header + tabs' },
] as const;
export type Layout = (typeof VARIANTS)[number]['key'];
type Theme = 'system' | 'light' | 'dark';
const THEMES: Theme[] = ['system', 'light', 'dark'];

function fromUrl<T extends string>(
  key: string,
  allowed: readonly T[],
  fallback: T,
): T {
  const value = new URLSearchParams(location.search).get(key) as T | null;
  return value && allowed.includes(value) ? value : fallback;
}

let layout: Layout = fromUrl(
  'variant',
  VARIANTS.map((v) => v.key),
  'A',
);
const listeners = new Set<() => void>();
function setLayout(next: Layout) {
  layout = next;
  const url = new URL(location.href);
  url.searchParams.set('variant', next);
  history.replaceState(null, '', url);
  listeners.forEach((l) => l());
}

/** The layout the bar has chosen; '0' in a packaged build. */
export function useEntryLayout(): Layout {
  const chosen = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => layout,
  );
  return import.meta.env.DEV ? chosen : '0';
}

/** The parts of the Entry view, each already wired to its field. */
export type EntryPieces = {
  entry: EntryValue;
  summary: EntrySummary;
  typeSelect: ReactElement;
  image: ReactElement;
  name: ReactElement;
  aliases: ReactElement;
  collisions: ReactElement | null;
  visibilityRadios: ReactElement;
  visibilitySelect: ReactElement;
  description: ReactElement;
  roleChoice: ReactElement;
  roleNote: ReactElement;
  appearance: ReactElement;
  voice: Record<keyof Voice, ReactElement>;
  senses: Record<keyof Senses, ReactElement>;
  threadStatus: ReactElement;
  privateNotes: ReactElement;
  tags: ReactElement;
};

export function ArrangedEntry({
  variant,
  p,
}: {
  variant: Layout;
  p: EntryPieces;
}) {
  if (variant === 'A') return <ProfileSheet p={p} />;
  if (variant === 'B') return <SidePanel p={p} />;
  return <HeaderTabs p={p} />;
}

/** A Character's Voice, packed: Says and Never says side by side. */
function VoiceGrid({ voice }: { voice: EntryPieces['voice'] }) {
  return (
    <section className="el-group" aria-label="Voice">
      <h3>Voice</h3>
      <div className="el-grid">
        <div className="el-span">{voice.traits}</div>
        {voice.says}
        {voice.neverSays}
        <div className="el-span">{voice.examples}</div>
      </div>
    </section>
  );
}

/** A Place's senses, Atmosphere across the top, the rest two by two. */
function SensesGrid({ senses }: { senses: EntryPieces['senses'] }) {
  return (
    <section className="el-group" aria-label="Senses">
      <h3>Senses</h3>
      <div className="el-grid">
        <div className="el-span">{senses.atmosphere}</div>
        {senses.sight}
        {senses.sound}
        {senses.smells}
        {senses.touch}
      </div>
    </section>
  );
}

function ProfileSheet({ p }: { p: EntryPieces }) {
  const type = p.entry.type;
  return (
    <div className="el-a">
      <header className="el-a-header">
        <div className="el-a-title">
          <div className="el-meta">
            <span className="el-select">{p.typeSelect}</span>
            <span className="el-dot">·</span>
            <span className="el-meta-label">Assistant sees it</span>
            <span className="el-select">{p.visibilitySelect}</span>
          </div>
          {p.name}
          <div className="el-a-aliases">{p.aliases}</div>
          {p.tags}
        </div>
        <div className="el-a-portrait">{p.image}</div>
      </header>
      {p.collisions}
      {type === 'character' && (
        <div className="el-a-role">
          {p.roleChoice}
          {p.roleNote}
        </div>
      )}
      {type === 'plot-thread' && p.threadStatus}
      {p.description}
      {type === 'character' && (
        <>
          {p.appearance}
          <VoiceGrid voice={p.voice} />
        </>
      )}
      {type === 'place' && <SensesGrid senses={p.senses} />}
      {p.privateNotes}
    </div>
  );
}

function SidePanel({ p }: { p: EntryPieces }) {
  const type = p.entry.type;
  return (
    <div className="el-b">
      <div className="el-b-main">
        {p.name}
        {p.collisions}
        {p.description}
        {type === 'character' && (
          <>
            {p.appearance}
            <VoiceGrid voice={p.voice} />
          </>
        )}
        {type === 'place' && <SensesGrid senses={p.senses} />}
        {p.privateNotes}
      </div>
      <aside className="el-b-side" aria-label="About this Entry">
        {p.image}
        <label className="el-b-row">
          <span className="el-b-label">Type</span>
          <span className="el-select">{p.typeSelect}</span>
        </label>
        {type === 'character' && (
          <>
            {p.roleChoice}
            {p.roleNote}
          </>
        )}
        {type === 'plot-thread' && p.threadStatus}
        <div className="el-b-block">
          <span className="el-b-label">Tags</span>
          {p.tags}
        </div>
        {p.aliases}
        {p.visibilityRadios}
      </aside>
    </div>
  );
}

type Tab = { key: string; label: string; body: ReactElement };

function HeaderTabs({ p }: { p: EntryPieces }) {
  const type = p.entry.type;
  const tabs: Tab[] = [
    {
      key: 'about',
      label: 'Description',
      body: (
        <>
          {p.description}
          {p.aliases}
        </>
      ),
    },
    ...(type === 'character'
      ? [
          { key: 'look', label: 'Appearance', body: p.appearance },
          { key: 'voice', label: 'Voice', body: <VoiceGrid voice={p.voice} /> },
        ]
      : []),
    ...(type === 'place'
      ? [
          {
            key: 'senses',
            label: 'Senses',
            body: <SensesGrid senses={p.senses} />,
          },
        ]
      : []),
    { key: 'private', label: '🔒 Private notes', body: p.privateNotes },
  ];
  const [tab, setTab] = useState(tabs[0].key);
  const shown = tabs.some((t) => t.key === tab) ? tab : tabs[0].key;
  return (
    <div className="el-c">
      <header className="el-c-header">
        <div className="el-c-avatar">{p.image}</div>
        <div className="el-c-title">
          {p.name}
          <div className="el-meta">
            <span className="el-select">{p.typeSelect}</span>
            {type === 'character' && (
              <>
                <span className="el-dot">·</span>
                <div className="el-c-inline">{p.roleChoice}</div>
              </>
            )}
            {type === 'plot-thread' && (
              <>
                <span className="el-dot">·</span>
                <div className="el-c-inline">{p.threadStatus}</div>
              </>
            )}
          </div>
          {type === 'character' && (
            <div className="el-c-rolenote">{p.roleNote}</div>
          )}
          {p.tags}
        </div>
        <div className="el-c-visibility">
          <span className="el-meta-label">Assistant sees it</span>
          <span className="el-select">{p.visibilitySelect}</span>
        </div>
      </header>
      {p.collisions}
      <nav className="el-c-tabs" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={t.key === shown}
            className="el-c-tab"
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </nav>
      {/* Every tab stays mounted, so its editors keep their undo. */}
      {tabs.map((t) => (
        <div
          key={t.key}
          role="tabpanel"
          className="el-c-panel"
          hidden={t.key !== shown}
        >
          {t.body}
        </div>
      ))}
    </div>
  );
}

/** Tags, in memory only: the real ones are not built yet. */
const stubTags = new Map<string, string[]>();
const VOCABULARY = ['act one', 'family', 'needs research', 'north', 'secret'];

export function TagsStub({ entryId }: { entryId: string }) {
  const [tags, setTags] = useState(() => stubTags.get(entryId) ?? []);
  const [draft, setDraft] = useState('');
  useEffect(() => void stubTags.set(entryId, tags), [entryId, tags]);
  const add = () => {
    const tag = draft.trim().toLowerCase();
    if (tag && !tags.includes(tag)) setTags([...tags, tag]);
    setDraft('');
  };
  return (
    <div className="el-tags" aria-label="Tags">
      {tags.map((tag) => (
        <span className="el-tag" key={tag}>
          {tag}
          <button
            className="el-tag-remove"
            aria-label={`Remove tag ${tag}`}
            onClick={() => setTags(tags.filter((t) => t !== tag))}
          >
            ×
          </button>
        </span>
      ))}
      <input
        className="el-tag-input"
        list="el-tag-vocabulary"
        placeholder="+ Tag"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') add();
          if (e.key === 'Backspace' && !draft && tags.length)
            setTags(tags.slice(0, -1));
        }}
        onBlur={add}
      />
      <datalist id="el-tag-vocabulary">
        {VOCABULARY.map((t) => (
          <option key={t} value={t} />
        ))}
      </datalist>
    </div>
  );
}

/** The app's dark-mode rules, found once and then pointed at the forced theme. */
let darkRules: CSSMediaRule[] | null = null;
function forceTheme(theme: Theme) {
  darkRules ??= Array.from(document.styleSheets).flatMap((sheet) =>
    Array.from(sheet.cssRules).filter(
      (rule): rule is CSSMediaRule =>
        rule instanceof CSSMediaRule &&
        rule.media.mediaText.includes('prefers-color-scheme: dark'),
    ),
  );
  const media =
    theme === 'dark'
      ? 'all'
      : theme === 'light'
        ? 'not all'
        : '(prefers-color-scheme: dark)';
  for (const rule of darkRules) rule.media.mediaText = media;
  document.documentElement.style.colorScheme = theme === 'system' ? '' : theme;
}

/** The floating bar: variant and theme. */
export function EntryLayoutBar() {
  const current = useEntryLayout();
  const [theme, setTheme] = useState<Theme>(() =>
    fromUrl('theme', THEMES, 'system'),
  );
  const index = VARIANTS.findIndex((v) => v.key === current);
  const step = (by: number) =>
    setLayout(VARIANTS[(index + by + VARIANTS.length) % VARIANTS.length].key);

  useEffect(() => forceTheme(theme), [theme]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.altKey || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight'))
        return;
      e.preventDefault();
      step(e.key === 'ArrowLeft' ? -1 : 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <div className="el-bar" role="toolbar" aria-label="Prototype">
      <button onClick={() => step(-1)} aria-label="Previous variant">
        ←
      </button>
      <span className="el-bar-label">
        {current} · {VARIANTS[index].name}
      </span>
      <button onClick={() => step(1)} aria-label="Next variant">
        →
      </button>
      <span className="el-bar-sep" />
      {THEMES.map((t) => (
        <button key={t} aria-pressed={theme === t} onClick={() => setTheme(t)}>
          {t[0].toUpperCase() + t.slice(1)}
        </button>
      ))}
    </div>
  );
}
