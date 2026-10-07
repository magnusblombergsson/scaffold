import { describe, expect, it } from 'vitest';
import { revealedEdge } from './zen';

describe('revealedEdge', () => {
  const height = 800;

  it('reveals the header at the top edge and the status bar at the bottom edge', () => {
    expect(revealedEdge(0, height, null)).toBe('top');
    expect(revealedEdge(799, height, null)).toBe('bottom');
    expect(revealedEdge(400, height, null)).toBeNull();
  });

  it('reveals nothing until the pointer is at the very edge', () => {
    expect(revealedEdge(30, height, null)).toBeNull();
    expect(revealedEdge(780, height, null)).toBeNull();
  });

  it('keeps what it revealed while the pointer is over it, and hides it once the pointer leaves', () => {
    expect(revealedEdge(30, height, 'top')).toBe('top');
    expect(revealedEdge(780, height, 'bottom')).toBe('bottom');
    expect(revealedEdge(120, height, 'top')).toBeNull();
    expect(revealedEdge(700, height, 'bottom')).toBeNull();
  });

  it('switches edges when the pointer jumps to the other one', () => {
    expect(revealedEdge(799, height, 'top')).toBe('bottom');
    expect(revealedEdge(0, height, 'bottom')).toBe('top');
  });
});
