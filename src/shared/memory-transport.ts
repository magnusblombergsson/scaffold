import type { MainTransport, RendererTransport } from './bridge';

/** A window as main sees it over a memory transport. */
export type MemoryWindow = {
  readonly id: number;
  /** Calls the window's listeners on `channel`. */
  receive(channel: string, args: unknown[]): void;
};

/**
 * A Transport that carries calls in memory, as Electron's IPC would: values
 * are copied as they cross, and a handler that throws reaches the window as
 * Electron passes it on.
 */
export function memoryTransport() {
  const handlers = new Map<
    string,
    (window: MemoryWindow, args: unknown[]) => Promise<unknown>
  >();
  const listeners = new Map<
    string,
    (window: MemoryWindow, args: unknown[]) => void
  >();
  let opened = 0;

  const main: MainTransport<MemoryWindow> = {
    handle(channel, handler) {
      if (handlers.has(channel)) {
        throw new Error(`'${channel}' is handled already`);
      }
      handlers.set(channel, handler);
    },
    on(channel, listener) {
      listeners.set(channel, listener);
    },
    send(window, channel, args) {
      window.receive(channel, structuredClone(args));
    },
  };

  return {
    main,
    /** A new window, and its end of the transport. */
    open(): { window: MemoryWindow; renderer: RendererTransport } {
      const heard = new Map<string, Set<(args: unknown[]) => void>>();
      const window: MemoryWindow = {
        id: ++opened,
        receive(channel, args) {
          for (const listener of heard.get(channel) ?? []) listener(args);
        },
      };
      const renderer: RendererTransport = {
        async invoke(channel, args) {
          const handler = handlers.get(channel);
          if (!handler) throw new Error(`No handler for '${channel}'`);
          try {
            return structuredClone(
              await handler(window, structuredClone(args)),
            );
          } catch (error) {
            throw new Error(
              `Error invoking remote method '${channel}': ${String(error)}`,
            );
          }
        },
        send(channel, args) {
          listeners.get(channel)?.(window, structuredClone(args));
        },
        on(channel, listener) {
          const forChannel = heard.get(channel) ?? new Set();
          heard.set(channel, forChannel);
          const forward = (args: unknown[]) => listener(args);
          forChannel.add(forward);
          return () => {
            forChannel.delete(forward);
          };
        },
      };
      return { window, renderer };
    },
  };
}
