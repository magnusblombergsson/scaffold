// How the MVP app (format 1, as released at f91ca2e) reads and rewrites
// `project.json`, frozen so that format tests can check what an MVP app still
// open on another computer does with what this app writes (ADR 0006). It
// keeps the parsed object whole and spreads its change over it, so keys it
// doesn't know survive; never change it to match this app.

type ProjectTree = { chapters: unknown[] } & Record<string, unknown>;

type Manifest = {
  format: number;
  id: string;
  language: string;
  tree: ProjectTree;
};

/** Reads `project.json` as the MVP does: parsed, unchecked. */
export function mvpReadManifest(text: string): Manifest {
  return JSON.parse(text) as Manifest;
}

/** Writes `project.json` as the MVP does after a change of structure. */
export function mvpWriteManifest(
  manifest: Manifest,
  tree: ProjectTree,
): string {
  return `${JSON.stringify({ ...manifest, tree }, null, 2)}\n`;
}
