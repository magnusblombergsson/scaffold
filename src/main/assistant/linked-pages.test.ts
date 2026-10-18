import { describe, expect, it } from 'vitest';
import { PAGE_LIMITS, readLinks, type PageFetch } from './linked-pages';

/** A fetch that serves `pages` by URL, as HTML unless a type is given, and records what it was asked for. */
function fakeFetch(
  pages: Record<string, string | Response | (() => Promise<Response>)>,
) {
  const asked: string[] = [];
  const fetch: PageFetch = async (url) => {
    asked.push(url);
    const page = pages[url];
    if (page === undefined) throw new TypeError('fetch failed');
    if (typeof page === 'function') return page();
    if (page instanceof Response) return page;
    return new Response(page, {
      headers: { 'content-type': 'text/html; charset=utf-8' },
    });
  };
  return { fetch, asked };
}

describe('readLinks', () => {
  it('reads only the http and https links in a message', async () => {
    const { fetch, asked } = fakeFetch({
      'https://example.com/ferry': '<p>The ferry ran until 1962.</p>',
      'http://example.org/tides': '<p>Tides here are small.</p>',
    });

    const pages = await readLinks(
      'See https://example.com/ferry and http://example.org/tides, ' +
        'not file:///C:/secret.txt, javascript:alert(1), ftp://example.com/x ' +
        'or data:text/html,hi.',
      fetch,
    );

    expect(asked).toEqual([
      'https://example.com/ferry',
      'http://example.org/tides',
    ]);
    expect(pages).toEqual([
      { url: 'https://example.com/ferry', text: 'The ferry ran until 1962.' },
      { url: 'http://example.org/tides', text: 'Tides here are small.' },
    ]);
  });

  it('names a link that fails, and still reads the rest', async () => {
    const { fetch } = fakeFetch({
      'https://gone.example/': new Response('Not found', { status: 404 }),
      'https://example.com/ferry': '<p>The ferry ran until 1962.</p>',
    });

    const pages = await readLinks(
      'https://down.example/ https://gone.example/ https://example.com/ferry',
      fetch,
    );

    expect(pages).toEqual([
      { url: 'https://down.example/', reason: 'failed' },
      { url: 'https://gone.example/', reason: 'failed' },
      { url: 'https://example.com/ferry', text: 'The ferry ran until 1962.' },
    ]);
  });

  it('gives up on a page that takes too long', async () => {
    const hanging: PageFetch = (_url, { signal }) =>
      new Promise((_resolve, reject) =>
        signal.addEventListener('abort', () => reject(signal.reason)),
      );

    const pages = await readLinks('https://slow.example/', hanging, {
      ...PAGE_LIMITS,
      ms: 10,
    });

    expect(pages).toEqual([
      { url: 'https://slow.example/', reason: 'timed-out' },
    ]);
  });

  it('gives up on a page whose body keeps coming past the time limit', async () => {
    const trickling: PageFetch = async (_url, { signal }) =>
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('<p>Once'));
            signal.addEventListener('abort', () =>
              controller.error(signal.reason),
            );
          },
        }),
        { headers: { 'content-type': 'text/html' } },
      );

    const pages = await readLinks('https://slow.example/', trickling, {
      ...PAGE_LIMITS,
      ms: 10,
    });

    expect(pages).toEqual([
      { url: 'https://slow.example/', reason: 'timed-out' },
    ]);
  });

  it('won’t read a page bigger than the limit, said or not', async () => {
    const big = `<p>${'x'.repeat(200)}</p>`;
    const { fetch } = fakeFetch({
      'https://said.example/': new Response(big, {
        headers: { 'content-type': 'text/html', 'content-length': '5000' },
      }),
      'https://unsaid.example/': new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode(big));
            controller.close();
          },
        }),
        { headers: { 'content-type': 'text/html' } },
      ),
      'https://small.example/': '<p>Small.</p>',
    });

    const pages = await readLinks(
      'https://said.example/ https://unsaid.example/ https://small.example/',
      fetch,
      { ...PAGE_LIMITS, bytes: 100 },
    );

    expect(pages).toEqual([
      { url: 'https://said.example/', reason: 'too-big' },
      { url: 'https://unsaid.example/', reason: 'too-big' },
      { url: 'https://small.example/', text: 'Small.' },
    ]);
  });

  it('reads web pages and plain text, but names a link to anything else', async () => {
    const { fetch } = fakeFetch({
      'https://example.com/report.pdf': new Response('%PDF-1.7', {
        headers: { 'content-type': 'application/pdf' },
      }),
      'https://example.com/notes.txt': new Response('Plain notes.', {
        headers: { 'content-type': 'text/plain' },
      }),
    });

    const pages = await readLinks(
      'https://example.com/report.pdf https://example.com/notes.txt',
      fetch,
    );

    expect(pages).toEqual([
      { url: 'https://example.com/report.pdf', reason: 'not-a-page' },
      { url: 'https://example.com/notes.txt', text: 'Plain notes.' },
    ]);
  });

  it('sends a page as a reader sees it: its title and text, no scripts or styles', async () => {
    const { fetch } = fakeFetch({
      'https://example.com/ferry': `<!doctype html>
        <html><head><title>The Kvarken ferry &amp; its end</title>
        <style>p { color: red }</style>
        <script>var x = "<p>hidden</p>";</script></head>
        <body><!-- nav --><nav>Home</nav>
        <h1>History</h1><p>It ran&nbsp;until 1962 &mdash; then stopped.</p>
        <p>Fares: &#8364;2 &lt;each&gt;.</p><noscript>Enable JS</noscript></body></html>`,
    });

    const [page] = await readLinks('https://example.com/ferry', fetch);

    expect(page).toEqual({
      url: 'https://example.com/ferry',
      text:
        'The Kvarken ferry & its end\n\nHome\n\nHistory\n\n' +
        'It ran until 1962 — then stopped.\n\nFares: €2 <each>.',
    });
  });

  it('reads only so many links in one message, and names the rest', async () => {
    const { fetch, asked } = fakeFetch({
      'https://example.com/1': '<p>One.</p>',
      'https://example.com/2': '<p>Two.</p>',
    });

    const pages = await readLinks(
      'https://example.com/1 https://example.com/2 https://example.com/3',
      fetch,
      { ...PAGE_LIMITS, links: 2 },
    );

    expect(asked).toEqual(['https://example.com/1', 'https://example.com/2']);
    expect(pages).toEqual([
      { url: 'https://example.com/1', text: 'One.' },
      { url: 'https://example.com/2', text: 'Two.' },
      { url: 'https://example.com/3', reason: 'too-many' },
    ]);
  });

  it('takes a link as it ends, without the sentence’s punctuation', async () => {
    const { fetch, asked } = fakeFetch({});

    await readLinks(
      'Is (https://example.com/a) right? Or https://example.com/b. ' +
        'Also https://en.wikipedia.org/wiki/Ferry_(disambiguation), ' +
        'and https://example.com/a again.',
      fetch,
    );

    expect(asked).toEqual([
      'https://example.com/a',
      'https://example.com/b',
      'https://en.wikipedia.org/wiki/Ferry_(disambiguation)',
    ]);
  });
});
