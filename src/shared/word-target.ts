/** Whether `value` is a Word target: a whole number of words above none. */
export function isWordTarget(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0;
}
