/** The Claude models the Author can choose from, in the order offered. */
export const MODELS = [
  { id: 'claude-opus-5-5', label: 'Opus 5.5' },
  { id: 'claude-sonnet-5', label: 'Sonnet 5' },
  { id: 'claude-haiku-4-5', label: 'Haiku 4.5' },
] as const;

export type ModelId = (typeof MODELS)[number]['id'];

export const DEFAULT_MODEL: ModelId = 'claude-opus-5-5';

export function isModelId(value: unknown): value is ModelId {
  return MODELS.some((model) => model.id === value);
}
