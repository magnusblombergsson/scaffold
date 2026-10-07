import { describe, expect, it } from 'vitest';
import { menuWindow } from './menu-window';

class FakeWindow {
  destroyed = false;
  isDestroyed() {
    return this.destroyed;
  }
}

/** The menus' window, with `focused` as the window that has OS focus. */
function follow() {
  let focused: FakeWindow | null = null;
  const menus = menuWindow(() => focused);
  return {
    menus,
    focus(window: FakeWindow | null) {
      focused = window;
      if (window) menus.focused(window);
    },
  };
}

describe('menuWindow', () => {
  it('is the window in front', () => {
    const { menus, focus } = follow();
    const a = new FakeWindow();
    focus(a);
    expect(menus.current()).toBe(a);
  });

  it('stays with the window last in front while none has focus', () => {
    const { menus, focus } = follow();
    const a = new FakeWindow();
    focus(a);
    focus(null);
    expect(menus.current()).toBe(a);
  });

  it('follows the window focused last of two', () => {
    const { menus, focus } = follow();
    const a = new FakeWindow();
    const b = new FakeWindow();
    focus(a);
    focus(b);
    focus(null);
    expect(menus.current()).toBe(b);
  });

  // Focus the shell hasn't heard of yet: the OS has it, the event is to come.
  it('is the window in front before it hears of the focus', () => {
    let focused: FakeWindow | null = null;
    const menus = menuWindow(() => focused);
    const a = new FakeWindow();
    const b = new FakeWindow();
    menus.focused(a);
    focused = b;
    expect(menus.current()).toBe(b);
    focused = null;
    expect(menus.current()).toBe(b);
  });

  it('is none once the window last in front is closed', () => {
    const { menus, focus } = follow();
    const a = new FakeWindow();
    focus(a);
    focus(null);
    a.destroyed = true;
    expect(menus.current()).toBeNull();
  });

  it('is none before any window has had focus', () => {
    const { menus } = follow();
    expect(menus.current()).toBeNull();
  });
});
