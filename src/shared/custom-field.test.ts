import { describe, expect, it } from 'vitest';
import { customSuggestions, offeredSuggestions } from './custom-field';

describe('customSuggestions', () => {
  it('offers each value held, most used first, then alphabetically ignoring case', () => {
    expect(
      customSuggestions([
        'The Rebels',
        'House Vael',
        'the crown',
        'House Vael',
        'Asterhold',
      ]),
    ).toEqual(['House Vael', 'Asterhold', 'the crown', 'The Rebels']);
  });

  it('groups values differing only in case or surrounding spaces, in their first spelling', () => {
    expect(
      customSuggestions([' house vael', 'House Vael', 'HOUSE VAEL ', 'Vael']),
    ).toEqual(['house vael', 'Vael']);
  });

  it('keeps values differing otherwise apart, commas and inner spaces too', () => {
    expect(
      customSuggestions([
        'Paris, France',
        'Paris',
        'House  Vael',
        'House Vael',
      ]),
    ).toEqual(['House  Vael', 'House Vael', 'Paris', 'Paris, France']);
  });

  it('offers no empty, multi-line or longer than 60 characters value', () => {
    const sixty = 'x'.repeat(60);
    expect(
      customSuggestions([
        '',
        '   ',
        'Born in the north.\nRaised in the south.',
        'x'.repeat(61),
        `  ${sixty}  `,
      ]),
    ).toEqual([sixty]);
  });
});

describe('offeredSuggestions', () => {
  const suggestions = ['House Vael', 'Vael', 'The Crown'];

  it('offers all while the field is empty', () => {
    expect(offeredSuggestions(suggestions, '')).toEqual(suggestions);
  });

  it('offers those holding the text anywhere, ignoring case', () => {
    expect(offeredSuggestions(suggestions, 'vAE')).toEqual([
      'House Vael',
      'Vael',
    ]);
    expect(offeredSuggestions(suggestions, 'crown')).toEqual(['The Crown']);
  });

  it('leaves out the value the field holds, ignoring case and surrounding spaces', () => {
    expect(offeredSuggestions(suggestions, ' vael ')).toEqual(['House Vael']);
  });

  it('offers nothing while the text is more than one line', () => {
    expect(offeredSuggestions(suggestions, 'Vael\n')).toEqual([]);
  });
});
