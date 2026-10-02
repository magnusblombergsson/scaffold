// What the Author is told when a Project's format is newer than this app's
// (ADR 0004). Main refuses with these, and the window shows the same words.

export function newerFormatMessage(
  projectName: string,
  format: number,
  reads: number,
): string {
  return `${projectName} was saved by a newer version of Writing Tools (format ${format}; this app reads up to ${reads}). Update the app to open it.`;
}

/** `host` is the computer whose newer app upgraded it, when known. */
export function upgradedMessage(projectName: string, host?: string): string {
  return `${projectName} was upgraded ${host ? `on ${host}` : 'on another computer'} by a newer version. Update this app to keep editing.`;
}
