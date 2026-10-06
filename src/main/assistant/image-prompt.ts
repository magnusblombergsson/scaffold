import type { ImagePromptResult } from '../../shared/api';
import type { Model } from '../../shared/models';
import { ENTRY_TYPE_LABELS, type EntryValue } from '../../shared/project-types';
import type { ProjectStore } from '../project-store/project-store';
import type { ProviderFor, ProviderRequest } from './provider';
import { finishedCall } from './reply-finishing';
import { IMAGE_PROMPT } from './system-prompts';

// The Image prompt (spec v2 §6): a one-off request about one Entry, outside
// any Conversation, for the Author to paste into an image generator. It reads
// through the Assistant's view, which has no private notes nor images, and
// nothing of it is logged.

export type ImagePromptDeps = {
  store: Pick<ProjectStore, 'flush' | 'assistantView'>;
  /** The Provider each Model is reached through. */
  providerFor: ProviderFor;
  /** The Model that writes it: the one chosen last. */
  defaultModel: () => Model;
};

/**
 * What asks `model` for an Image prompt of `entry`: its type, description,
 * Appearance and Senses, those with a value; nothing else of it, not even
 * its name. Null when none has a value, so there is nothing to describe.
 */
export function imagePromptRequest(
  model: Model,
  entry: EntryValue,
): ProviderRequest | null {
  const { appearance, senses } = entry.fields;
  const described = [
    ['Description', entry.description],
    ['Appearance', appearance ?? ''],
    ['Smells', senses?.smells ?? ''],
    ['Sight', senses?.sight ?? ''],
    ['Sound', senses?.sound ?? ''],
    ['Touch', senses?.touch ?? ''],
    ['Atmosphere', senses?.atmosphere ?? ''],
  ]
    .map(([label, text]) => [label, text.trim()])
    .filter(([, text]) => text !== '');
  if (described.length === 0) return null;
  const type = ENTRY_TYPE_LABELS[entry.type];
  return {
    model,
    system: [{ text: IMAGE_PROMPT }],
    messages: [
      {
        role: 'user',
        content: [
          `Write an image prompt for this ${type}.`,
          ...described.map(([label, text]) => `${label}:\n${text}`),
        ].join('\n\n'),
      },
    ],
  };
}

export function createImagePrompts({
  store,
  providerFor,
  defaultModel,
}: ImagePromptDeps) {
  return {
    /**
     * Has the Model chosen last write an Image prompt for an Entry, a new
     * one each time, through reply finishing as a Conversation's reply is.
     * Asks nothing for an Entry the Assistant never sees, or one with
     * nothing to describe.
     */
    async write(entryId: string): Promise<ImagePromptResult> {
      const model = defaultModel();
      // What the Author typed last is on disk before the request is built.
      await store.flush();
      const view = store.assistantView();
      const summary = view.listEntries().find((e) => e.id === entryId);
      if (!summary) throw new Error(`No such Entry: ${entryId}`);
      if (summary.visibility === 'never') {
        return { ok: false, model, failure: 'hidden' };
      }
      const entry = await view.read({ kind: 'entry', id: entryId });
      const request = imagePromptRequest(model, entry);
      if (!request) return { ok: false, model, failure: 'nothing' };

      const finished = await finishedCall(providerFor(model), request);
      const { failure } = finished;
      const metered = { model, ...finished.metered };
      if (failure) return { ok: false, ...metered, failure: failure.kind };
      if (finished.kind !== 'reply') {
        return { ok: false, ...metered, failure: 'empty' };
      }
      return {
        ok: true,
        ...metered,
        text: finished.text,
        cutShort: finished.ending === 'cut-short',
      };
    },
  };
}
