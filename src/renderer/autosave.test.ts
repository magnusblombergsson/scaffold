import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAutosave } from './autosave';

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('autosave', () => {
  it('saves after 1 s without changes', () => {
    const save = vi.fn();
    const autosave = createAutosave(save);

    autosave.change('a');
    autosave.change('ab');
    vi.advanceTimersByTime(999);
    expect(save).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(save).toHaveBeenCalledOnce();
    expect(save).toHaveBeenCalledWith('ab');
  });

  it('saves at least every 5 s while the Author keeps typing', () => {
    const save = vi.fn();
    const autosave = createAutosave(save);

    for (let t = 0; t < 12_000; t += 300) {
      autosave.change(`text at ${t}`);
      vi.advanceTimersByTime(300);
    }

    expect(save.mock.calls.map(([value]) => value)).toEqual([
      'text at 4800',
      'text at 9900',
    ]);
  });

  it('flush saves pending changes at once, and only once', () => {
    const save = vi.fn();
    const autosave = createAutosave(save);

    autosave.change('pending');
    autosave.flush();
    expect(save).toHaveBeenCalledWith('pending');

    vi.advanceTimersByTime(10_000);
    autosave.flush();
    expect(save).toHaveBeenCalledOnce();
  });

  it('says whether a change is waiting to be saved', () => {
    const autosave = createAutosave(vi.fn());
    expect(autosave.pending()).toBe(false);

    autosave.change('a');
    expect(autosave.pending()).toBe(true);

    vi.advanceTimersByTime(1000);
    expect(autosave.pending()).toBe(false);
  });
});
