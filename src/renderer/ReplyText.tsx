import { useMemo } from 'react';
import {
  replyBlocks,
  replyInlines,
  type ReplyBlock,
  type ReplyInline,
} from './reply-markdown';

/**
 * A reply's text with its bold, italic and lists shown as formatting.
 * Elements are built from the parsed text, so nothing in it passes through
 * as HTML.
 */
export function ReplyText({ text }: { text: string }) {
  const blocks = useMemo(() => replyBlocks(text), [text]);
  return (
    <div className="message-text reply-text">
      <Blocks blocks={blocks} />
    </div>
  );
}

/** A short text's bold and italic shown as formatting, with no blocks. */
export function ReplyInlineText({ text }: { text: string }) {
  const inlines = useMemo(() => replyInlines(text), [text]);
  return <Inlines inlines={inlines} />;
}

function Blocks({ blocks }: { blocks: ReplyBlock[] }) {
  return blocks.map((block, i) => {
    if (block.type === 'paragraph') {
      return (
        <p key={i}>
          <Inlines inlines={block.children} />
        </p>
      );
    }
    const items = block.items.map((item, j) => (
      <li key={j}>
        <Blocks blocks={item} />
      </li>
    ));
    return block.ordered ? (
      <ol key={i} start={block.start}>
        {items}
      </ol>
    ) : (
      <ul key={i}>{items}</ul>
    );
  });
}

function Inlines({ inlines }: { inlines: ReplyInline[] }) {
  return inlines.map((inline, i) => {
    switch (inline.type) {
      case 'text':
        return inline.value;
      case 'break':
        return <br key={i} />;
      case 'strong':
        return (
          <strong key={i}>
            <Inlines inlines={inline.children} />
          </strong>
        );
      case 'emphasis':
        return (
          <em key={i}>
            <Inlines inlines={inline.children} />
          </em>
        );
    }
  });
}
