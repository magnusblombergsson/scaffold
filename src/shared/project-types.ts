// Types shared by main, preload and renderer. The renderer never sees paths or
// file formats, only these values.

export type SceneRef = { kind: 'scene'; id: string };
export type UnitRef = SceneRef;

export type SceneValue = { id: string; markdown: string };
export type UnitValue = SceneValue;

export type SceneNode = { id: string; title: string };
export type ChapterNode = { id: string; title: string; scenes: SceneNode[] };
export type ProjectTree = { chapters: ChapterNode[] };
