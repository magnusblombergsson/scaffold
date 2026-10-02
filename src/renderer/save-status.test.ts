import { describe, expect, it } from 'vitest';
import type { UnitSaveStatus } from '../shared/api';
import {
  NO_SAVE_STATUSES,
  overallSaveState,
  saveFailures,
  withSaveStatus,
} from './save-status';

const scene = { kind: 'scene', id: 's1' } as const;
const outline = { kind: 'outline', id: 's1' } as const;

function apply(...events: UnitSaveStatus[]) {
  return events.reduce(withSaveStatus, NO_SAVE_STATUSES);
}

const status = (
  ref: UnitSaveStatus['ref'],
  state: 'saving' | 'saved',
): UnitSaveStatus => ({ type: 'unitSaveStatus', ref, state });

const failed = (
  ref: UnitSaveStatus['ref'],
  reason: string,
): UnitSaveStatus => ({ type: 'unitSaveStatus', ref, state: 'failed', reason });

describe('save status', () => {
  it('is saved when nothing has been reported, or everything reported saved', () => {
    expect(overallSaveState(NO_SAVE_STATUSES)).toBe('saved');
    expect(
      overallSaveState(apply(status(scene, 'saving'), status(scene, 'saved'))),
    ).toBe('saved');
  });

  it('is saving while any unit is', () => {
    const statuses = apply(
      status(scene, 'saving'),
      status(outline, 'saving'),
      status(scene, 'saved'),
    );
    expect(overallSaveState(statuses)).toBe('saving');
  });

  it('is failed while any unit is, listing each failure until it is saved', () => {
    const statuses = apply(
      status(scene, 'saving'),
      failed(scene, 'the disk is full'),
      status(outline, 'saving'),
    );
    expect(overallSaveState(statuses)).toBe('failed');
    expect(saveFailures(statuses)).toEqual([
      { ref: scene, reason: 'the disk is full' },
    ]);

    const recovered = withSaveStatus(statuses, status(scene, 'saved'));
    expect(overallSaveState(recovered)).toBe('saving');
    expect(saveFailures(recovered)).toEqual([]);
  });
});
