// The one typed bridge between main and a window's renderer. Each API is an
// interface and a method table naming how each of its methods crosses; main
// registers a handler table against it, and the preload builds the object
// the window sees from it. Both go through a Transport, so tests can carry
// them in memory.

/**
 * How a method crosses: `invoke` answers with a value or a failure, `send`
 * goes one way to main, `event` comes from main to a window's listeners.
 * The preload builds `stream`, a reply that streams pieces of text, and
 * `flush`, main asking for pending edits, by hand; main registers `stream`
 * as an invoke whose first argument tells the replies apart.
 */
export type Kind = 'invoke' | 'send' | 'event' | 'stream' | 'flush';

/* oxlint-disable typescript/no-explicit-any -- matching any signature */
type Listener = (...args: any[]) => void;

/** The kinds a method of this signature may cross as. */
type KindFor<F> = F extends (listener: Listener) => () => void
  ? 'event' | 'flush'
  : F extends (...args: infer P) => infer R
    ? P extends [...unknown[], (text: string) => void]
      ? 'stream'
      : R extends Promise<unknown>
        ? 'invoke'
        : 'send'
    : never;
/* oxlint-enable typescript/no-explicit-any */

/** Names every method of `Api` and the kind it crosses as. */
export type MethodTable<Api> = { readonly [K in keyof Api]: KindFor<Api[K]> };

/** The method table of each API, by name. */
type Tables<Apis> = { readonly [A in keyof Apis]: MethodTable<Apis[A]> };

type Args<F> = F extends (...args: infer P) => unknown ? P : never;
type Result<F> = F extends (...args: never[]) => infer R ? R : never;
type WithoutLast<P> = P extends [...infer Rest, unknown] ? Rest : never;

type Handler<F, K, Ctx> = K extends 'invoke'
  ? (ctx: Ctx, ...args: Args<F>) => Result<F> | Awaited<Result<F>>
  : K extends 'send'
    ? (ctx: Ctx, ...args: Args<F>) => void
    : K extends 'stream'
      ? (ctx: Ctx, askId: number, ...args: WithoutLast<Args<F>>) => Result<F>
      : never;

/** Methods main handles, rather than emits or leaves to the preload. */
type Handled = 'invoke' | 'send' | 'stream';

/**
 * What main does for each method of `Api` it handles, given the context of
 * the window that called.
 */
export type Handlers<Api, T, Ctx> = {
  [K in keyof Api as K extends keyof T
    ? T[K] extends Handled
      ? K
      : never
    : never]: Handler<Api[K], T[K & keyof T], Ctx>;
};

/** The methods that are events, from main to a window. */
type EventName<Api, T> = {
  [K in keyof Api]: K extends keyof T
    ? T[K] extends 'event'
      ? K
      : never
    : never;
}[keyof Api];

/** What an event's listeners are called with. */
type Payload<F> = F extends (listener: (payload: infer P) => void) => unknown
  ? P
  : never;

/** The methods the preload builds from the table. */
type Built<Api, T> = Pick<
  Api,
  {
    [K in keyof Api]: K extends keyof T
      ? T[K] extends 'invoke' | 'send' | 'event'
        ? K
        : never
      : never;
  }[keyof Api]
>;

/** Main's end of a Transport; `W` is a window as main knows it. */
export interface MainTransport<W> {
  /** Answers each invoke on `channel`. */
  handle(
    channel: string,
    handler: (window: W, args: unknown[]) => Promise<unknown>,
  ): void;
  /** Passes each send on `channel` to `listener`. */
  on(channel: string, listener: (window: W, args: unknown[]) => void): void;
  /** Sends `args` on `channel` to `window` alone, unless it has closed. */
  send(window: W, channel: string, args: unknown[]): void;
}

/** A window's end of a Transport. */
export interface RendererTransport {
  invoke(channel: string, args: unknown[]): Promise<unknown>;
  send(channel: string, args: unknown[]): void;
  /** Passes on what main sends on `channel`; returns an unsubscribe function. */
  on(channel: string, listener: (args: unknown[]) => void): () => void;
}

/**
 * What an invoke resolves with as it crosses: its value, or why it failed.
 * Electron would rewrite the message of an error thrown across and drop its
 * `reason`, so main sends them as values.
 */
type Outcome =
  | { ok: true; value: unknown }
  | { ok: false; message: string; reason?: string };

function failure(error: unknown): Outcome {
  if (!(error instanceof Error)) return { ok: false, message: String(error) };
  const { reason } = error as { reason?: unknown };
  return typeof reason === 'string'
    ? { ok: false, message: error.message, reason }
    : { ok: false, message: error.message };
}

function channelOf(api: string, method: string): string {
  return `${api}:${method}`;
}

/**
 * The bridge for these APIs: `main` registers their handlers and emits their
 * events, and `renderer` builds what a window sees.
 */
export function bridge<Apis, T extends Tables<Apis>>(tables: T) {
  type Name = keyof Apis & keyof T & string;

  function methodsOf(api: Name): [string, Kind][] {
    return Object.entries(tables[api] as Record<string, Kind>);
  }

  return {
    main<W>(transport: MainTransport<W>) {
      return {
        /** Answers every call to `api` from any window with `handlers`. */
        register<A extends Name, Ctx>(
          api: A,
          handlers: Handlers<Apis[A], T[A], Ctx>,
          contextOf: (window: W) => Ctx,
        ): void {
          const byName = handlers as unknown as Record<
            string,
            (ctx: Ctx, ...args: unknown[]) => unknown
          >;
          for (const [method, kind] of methodsOf(api)) {
            const channel = channelOf(api, method);
            const handler = byName[method];
            if (kind === 'send') {
              transport.on(channel, (window, args) => {
                const logFailure = (error: unknown) =>
                  console.error(`${channel} failed:`, error);
                try {
                  const result: unknown = handler(contextOf(window), ...args);
                  if (result instanceof Promise) result.catch(logFailure);
                } catch (error) {
                  logFailure(error);
                }
              });
              continue;
            }
            if (kind !== 'invoke' && kind !== 'stream') continue;
            transport.handle(
              channel,
              async (window, args): Promise<Outcome> => {
                try {
                  return {
                    ok: true,
                    value: await handler(contextOf(window), ...args),
                  };
                } catch (error) {
                  return failure(error);
                }
              },
            );
          }
        },

        /** Calls the `event` listeners of `api` in `window` with `payload`. */
        emit<A extends Name, E extends EventName<Apis[A], T[A]>>(
          window: W,
          api: A,
          event: E,
          payload: Payload<Apis[A][E]>,
        ): void {
          transport.send(window, channelOf(api, String(event)), [payload]);
        },
      };
    },

    renderer(transport: RendererTransport) {
      async function invoke(channel: string, args: unknown[]) {
        const outcome = (await transport.invoke(channel, args)) as Outcome;
        if (outcome.ok) return outcome.value;
        const { message, reason } = outcome;
        throw Object.assign(
          new Error(message),
          reason === undefined ? {} : { reason },
        );
      }

      return {
        /** The object a window sees for `api`, but for its hand-built methods. */
        build<A extends Name>(api: A): Built<Apis[A], T[A]> {
          const built: Record<string, unknown> = {};
          for (const [method, kind] of methodsOf(api)) {
            const channel = channelOf(api, method);
            if (kind === 'invoke') {
              built[method] = (...args: unknown[]) => invoke(channel, args);
            } else if (kind === 'send') {
              built[method] = (...args: unknown[]) =>
                transport.send(channel, args);
            } else if (kind === 'event') {
              built[method] = (listener: (payload: unknown) => void) =>
                transport.on(channel, ([payload]) => listener(payload));
            }
          }
          return built as Built<Apis[A], T[A]>;
        },
      };
    },
  };
}
