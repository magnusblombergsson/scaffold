import { describe, expect, it } from 'vitest';
import type { CustomField } from './custom-field';
import type { EntrySummary } from './project-types';
import { importClashes, mapEntry, type ReadEntry } from './story-bible-import';

const read = (
  name: string,
  paragraphs: ReadEntry['paragraphs'],
  group?: string,
): ReadEntry => ({ name, group, paragraphs, warnings: [] });

const customFields: CustomField[] = [
  { id: 'f1', type: 'character', label: 'Birthday' },
  { id: 'f2', type: 'place', label: 'Climate' },
];

describe('the type of an imported Entry', () => {
  it('is its Type line, ignoring case, over its Heading 1', () => {
    const mapped = mapEntry(
      read('Harbour', [{ label: 'Type', text: 'place' }], 'Characters'),
      [],
    );
    expect(mapped.type).toBe('place');
    expect(mapped.warnings).toEqual([]);
  });

  it('is its Heading 1, by a type’s label or group title', () => {
    expect(mapEntry(read('Mara', [], 'characters'), []).type).toBe('character');
    expect(mapEntry(read('Gods', [], 'World Rule'), []).type).toBe(
      'world-rule',
    );
  });

  it('is Other, with a warning, without one or with one unknown', () => {
    expect(mapEntry(read('Mara', []), [])).toMatchObject({
      type: 'other',
      warnings: ['No type: imported as Other'],
    });
    expect(
      mapEntry(read('Mara', [{ label: 'Type', text: 'Monster' }]), []),
    ).toMatchObject({
      type: 'other',
      warnings: ['“Monster” is no type: imported as Other'],
    });
    expect(mapEntry(read('Mara', [], 'Notes'), [])).toMatchObject({
      type: 'other',
      warnings: ['“Notes” is no type: imported as Other'],
    });
  });

  it('is the one the Author chooses, which re-maps its labels without the type warning', () => {
    const entry = read('Mara', [{ label: 'Role', text: 'Protagonist' }]);
    expect(mapEntry(entry, []).description).toBe('Role: Protagonist');

    const chosen = mapEntry(entry, [], 'character');
    expect(chosen.type).toBe('character');
    expect(chosen.fields.role).toBe('protagonist');
    expect(chosen.description).toBe('');
    expect(chosen.warnings).toEqual([]);
  });
});

describe('the labels of an imported Entry', () => {
  it('map to its fields, ignoring case, split as an Export joins them', () => {
    const mapped = mapEntry(
      read('Mara', [
        { label: 'Type', text: 'Character' },
        { label: 'Aliases', text: 'M, the Ferrywoman' },
        { label: 'tags', text: 'ferry, flashback' },
        { label: 'Role', text: 'Protagonist · the lead · mostly' },
        { text: 'She runs the ferry.\nAlone, mostly.' },
        { text: 'She is proud.' },
        { label: 'Appearance', text: 'Tall.' },
        { label: 'Voice traits', text: 'Clipped.' },
        { label: 'SAYS', text: 'aye, reckon' },
        { label: 'Never says', text: 'okay' },
        { label: 'Example lines', text: 'Get in.\nMind the rope.' },
        { label: 'birthday', text: 'Midsummer' },
        { label: 'Private notes', text: 'Based on Gran.' },
      ]),
      customFields,
    );
    expect(mapped).toEqual({
      type: 'character',
      name: 'Mara',
      aliases: ['M', 'the Ferrywoman'],
      tags: ['ferry', 'flashback'],
      description: 'She runs the ferry.\nAlone, mostly.\n\nShe is proud.',
      fields: {
        role: 'protagonist',
        roleNote: 'the lead · mostly',
        appearance: 'Tall.',
        voice: {
          traits: 'Clipped.',
          says: ['aye', 'reckon'],
          neverSays: ['okay'],
          examples: ['Get in.', 'Mind the rope.'],
        },
      },
      custom: { f1: 'Midsummer' },
      privateNotes: 'Based on Gran.',
      warnings: [],
    });
  });

  it('reads a Place’s senses and a Plot Thread’s Status', () => {
    expect(
      mapEntry(
        read(
          'Harbour',
          [
            { label: 'Smells', text: 'Tar.' },
            { label: 'Atmosphere', text: 'Busy.' },
            { label: 'Climate', text: 'Wet' },
          ],
          'Places',
        ),
        customFields,
      ),
    ).toMatchObject({
      fields: {
        senses: {
          smells: 'Tar.',
          sight: '',
          sound: '',
          touch: '',
          atmosphere: 'Busy.',
        },
      },
      custom: { f2: 'Wet' },
    });
    expect(
      mapEntry(
        read('Feud', [{ label: 'Status', text: 'resolved' }], 'Plot Threads'),
        [],
      ).fields,
    ).toEqual({ status: 'resolved' });
  });

  it('takes a lone value that is no Role as a Role note', () => {
    expect(
      mapEntry(
        read('Bram', [{ label: 'Role', text: 'the brother' }], 'Characters'),
        [],
      ).fields,
    ).toMatchObject({ role: null, roleNote: 'the brother' });
  });

  it('keeps an unknown label, or one of another type, as a line at the end of the description, with a warning', () => {
    const mapped = mapEntry(
      read(
        'Harbour',
        [
          { label: 'Smells', text: 'Tar.' },
          { label: 'Mood', text: 'Grim' },
          { text: 'Where the boats come in.' },
          { label: 'Role', text: 'Protagonist' },
          { label: 'Birthday', text: 'Never' },
        ],
        'Places',
      ),
      customFields,
    );
    expect(mapped.description).toBe(
      'Where the boats come in.\n\nMood: Grim\nRole: Protagonist\nBirthday: Never',
    );
    expect(mapped.warnings).toEqual([
      '“Mood” is no field of a Place: kept in the description',
      '“Role” is no field of a Place: kept in the description',
      '“Birthday” is no field of a Place: kept in the description',
    ]);
  });

  it('keeps an unknown Role or Status in the description, with a warning', () => {
    const character = mapEntry(
      read('Bram', [{ label: 'Role', text: 'Villain · scary' }], 'Characters'),
      [],
    );
    expect(character.fields.role).toBeNull();
    expect(character.description).toBe('Role: Villain · scary');
    expect(character.warnings).toEqual([
      '“Villain · scary” is no Role: kept in the description',
    ]);
    const thread = mapEntry(
      read('Feud', [{ label: 'Status', text: 'Paused' }], 'Plot Threads'),
      [],
    );
    expect(thread.fields.status).toBe('open');
    expect(thread.description).toBe('Status: Paused');
    expect(thread.warnings).toEqual([
      '“Paused” is no Status: kept in the description',
    ]);
  });

  it('keeps a field given twice in the description, with a warning', () => {
    const mapped = mapEntry(
      read(
        'Mara',
        [
          { label: 'Appearance', text: 'Tall.' },
          { label: 'Appearance', text: 'Grey eyes.' },
        ],
        'Characters',
      ),
      [],
    );
    expect(mapped.fields.appearance).toBe('Tall.');
    expect(mapped.description).toBe('Appearance: Grey eyes.');
    expect(mapped.warnings).toEqual([
      '“Appearance” is given twice: kept in the description',
    ]);
  });

  it('reads a plain paragraph starting with a known label as labelled, and any other as description', () => {
    const mapped = mapEntry(
      read('Mara', [
        { text: 'Type: Character' },
        { text: 'role: Supporting' },
        { text: 'Note: she lies.' },
        { text: 'Birthday: Midsummer' },
      ]),
      customFields,
    );
    expect(mapped.type).toBe('character');
    expect(mapped.fields.role).toBe('supporting');
    expect(mapped.custom).toEqual({ f1: 'Midsummer' });
    expect(mapped.description).toBe('Note: she lies.');
    expect(mapped.warnings).toEqual([]);
  });

  it('reads no plain paragraph as labelled in an Entry with a bold label, as an Export writes it', () => {
    const mapped = mapEntry(
      read('Mara', [
        { label: 'Type', text: 'Character' },
        { text: 'Role: she has none.' },
        { text: 'Tags: none either.' },
      ]),
      [],
    );
    expect(mapped.fields.roleNote).toBe('');
    expect(mapped.tags).toEqual([]);
    expect(mapped.description).toBe(
      'Role: she has none.\n\nTags: none either.',
    );
    expect(mapped.warnings).toEqual([]);
  });

  it('keeps what reading the Entry warned of', () => {
    expect(
      mapEntry(
        {
          ...read('Mara', [], 'Characters'),
          warnings: ['Its image was left out'],
        },
        [],
      ).warnings,
    ).toEqual(['Its image was left out']);
  });
});

describe('the clashes of imported Entries', () => {
  const existing: EntrySummary[] = [
    {
      id: 'e1',
      type: 'character',
      name: 'Mara',
      aliases: ['the Ferrywoman'],
      visibility: 'mentioned',
    },
  ];

  it('warns of a name or alias that an Entry in the Story Bible, or another imported, goes by', () => {
    expect(
      importClashes(
        [
          { name: 'mara', aliases: [] },
          { name: 'Bram', aliases: ['Brother'] },
          { name: 'Brother', aliases: ['The Ferrywoman'] },
        ],
        existing,
      ),
    ).toEqual([
      ['“mara” is also Mara, in the Story Bible'],
      ['“Brother” is also Brother, also imported'],
      [
        '“Brother” is also Bram, also imported',
        '“The Ferrywoman” is also Mara, in the Story Bible',
      ],
    ]);
  });
});
