import { fieldsOfType, type CustomField } from '../shared/custom-field';
import { emptyFields } from '../shared/entry';
import {
  ENTRY_TYPE_LABELS,
  VISIBILITY_LABELS,
  type EntryType,
  type EntryValue,
} from '../shared/project-types';
import {
  builtInFields,
  customFieldKey,
  FIELD_LABELS,
  fieldOf,
  fieldText,
  withField,
  type BuiltInField,
  type ProposalField,
} from '../shared/proposal';

// An Entry in Conflict (#217): every text part of each version, labelled,
// so the Author sees what differs, and the Entry a merge keeps, built from
// the version the Author chose for each differing part.

/** A text part of an Entry: what every Entry has, a field of its type, or a Custom field. */
export type PartKey =
  'type' | 'name' | 'visibility' | 'voice.examples' | ProposalField;

/**
 * One part across the versions: its text in each, undefined in a version
 * whose type has no such part, and whether they differ.
 */
export type ConflictPart = {
  key: PartKey;
  label: string;
  texts: (string | undefined)[];
  differs: boolean;
};

/** Whether all versions are of one type, so that they can be merged. */
export function sameType(versions: readonly EntryValue[]): boolean {
  return versions.every((v) => v.type === versions[0].type);
}

/**
 * The text parts of an Entry's versions, in the Entry's order: type, name,
 * aliases, visibility, description, each type's own fields, then its
 * Custom fields among `customFields`. A part empty in every version is
 * left out.
 */
export function entryParts(
  versions: readonly EntryValue[],
  customFields: readonly CustomField[] = [],
): ConflictPart[] {
  const types = [...new Set(versions.map((v) => v.type))];
  const keys: PartKey[] = [
    'type',
    'name',
    'aliases',
    'visibility',
    'description',
    ...new Set(types.flatMap(typeFields)),
    ...types.flatMap((type) =>
      fieldsOfType(customFields, type).map((f) => customFieldKey(f.id)),
    ),
  ];
  const filled = versions.map(withAllFields);
  return keys.flatMap((key) => {
    const texts = filled.map((v) => partText(v, key, customFields));
    if (texts.every((text) => !text?.trim())) return [];
    const differs = texts.some((text) => text !== texts[0]);
    return [{ key, label: partLabel(key, customFields), texts, differs }];
  });
}

/**
 * The Entry a merge keeps: the first version with, for each differing part
 * but the description, the value of the version chosen for it by index,
 * and `description`. The versions must be of one type, and each differing
 * part chosen.
 */
export function mergedEntry(
  versions: readonly EntryValue[],
  choices: Partial<Record<PartKey, number>>,
  description: string,
  customFields: readonly CustomField[] = [],
): EntryValue {
  let merged: EntryValue = { ...withAllFields(versions[0]), description };
  for (const { key, differs } of entryParts(versions, customFields)) {
    if (!differs || key === 'description') continue;
    const chosen = choices[key];
    if (chosen === undefined) throw new Error(`No version chosen for ${key}`);
    merged = withPart(
      merged,
      withAllFields(versions[chosen]),
      key,
      customFields,
    );
  }
  return merged;
}

/** The parts `entryParts` lists that `mergedEntry` needs a choice for. */
export function partsToChoose(parts: readonly ConflictPart[]): ConflictPart[] {
  return parts.filter((part) => part.differs && part.key !== 'description');
}

/** The Entry with every field of its type, those it lacks empty. */
function withAllFields(entry: EntryValue): EntryValue {
  return { ...entry, fields: { ...emptyFields(entry.type), ...entry.fields } };
}

/** The fields of `type` beyond its description and aliases, Example lines among the Voice's. */
function typeFields(type: EntryType): PartKey[] {
  return builtInFields(type)
    .filter((field) => field !== 'description' && field !== 'aliases')
    .flatMap((field): PartKey[] =>
      field === 'voice.neverSays' ? [field, 'voice.examples'] : [field],
    );
}

function partLabel(key: PartKey, customFields: readonly CustomField[]): string {
  if (key === 'type') return 'Type';
  if (key === 'name') return 'Name';
  if (key === 'visibility') return 'Visibility';
  if (key === 'voice.examples') return 'Example lines';
  if (key.startsWith('custom:')) {
    return (
      customFields.find((f) => customFieldKey(f.id) === key)?.label ??
      'Custom field'
    );
  }
  return FIELD_LABELS[key as BuiltInField];
}

/** The part as the Author reads it; undefined when the Entry's type has no such part. */
function partText(
  entry: EntryValue,
  key: PartKey,
  customFields: readonly CustomField[],
): string | undefined {
  if (key === 'type') return ENTRY_TYPE_LABELS[entry.type];
  if (key === 'name') return entry.name;
  if (key === 'visibility') return VISIBILITY_LABELS[entry.visibility];
  if (key === 'voice.examples') {
    return entry.fields.voice?.examples.join('\n');
  }
  const value = fieldOf(entry, key, customFields);
  return value === undefined ? undefined : fieldText(key, value ?? '');
}

/** `target` with `source`'s value of the part; both of one type. */
function withPart(
  target: EntryValue,
  source: EntryValue,
  key: PartKey,
  customFields: readonly CustomField[],
): EntryValue {
  if (key === 'type') return target;
  if (key === 'name') return { ...target, name: source.name };
  if (key === 'visibility') {
    return { ...target, visibility: source.visibility };
  }
  if (key === 'voice.examples') {
    const voice = target.fields.voice!;
    const { examples } = source.fields.voice!;
    return {
      ...target,
      fields: { ...target.fields, voice: { ...voice, examples } },
    };
  }
  return withField(target, key, fieldOf(source, key, customFields) ?? '');
}
