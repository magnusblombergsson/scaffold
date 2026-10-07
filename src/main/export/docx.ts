import { crc32, deflateRawSync } from 'node:zlib';
import type { ImageExtension, ProseLanguage } from '../../shared/project-types';
import { ALIGN_NAME, type Alignment } from '../../shared/prose-markdown';
import { MEDIA_TYPES } from '../entry-image';

// A minimal .docx: one document part, its images, and a styles part holding
// Word's built-in Normal, Heading 1 and Heading 2, so the reader's Word
// restyles it as they like, and a Quote of our own, as Word's own is italic
// and centred.

/** A run of text, and whether it is bold or italic. */
export type DocxRun = { text: string; bold: boolean; italic: boolean };

/** An image alone in its paragraph, `width` and `height` in EMUs. */
export type DocxImage = {
  data: Uint8Array;
  extension: ImageExtension;
  width: number;
  height: number;
  /** Its alternative text. */
  description: string;
};

/**
 * A paragraph of text: Normal, Heading 1 or 2, or Quote, and how it is
 * aligned if not left.
 */
export type DocxTextParagraph = {
  style?: 'heading1' | 'heading2' | 'quote';
  align?: Alignment;
  runs: DocxRun[];
};

/** A paragraph of text, or holding only an image. */
export type DocxParagraph = DocxTextParagraph | { image: DocxImage };

/** English Metric Units an inch, as Word measures drawings. */
export const EMU_PER_INCH = 914400;

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const WP =
  'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing';
const A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const PIC = 'http://schemas.openxmlformats.org/drawingml/2006/picture';
const XML_DECLARATION =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

/** An image as the package holds it, at `word/<target>`, numbered from 1. */
type Media = DocxImage & { id: string; target: string; number: number };

/** A .docx of `paragraphs`, its text in `language` for spellchecking. */
export function docx(
  paragraphs: DocxParagraph[],
  language: ProseLanguage,
): Uint8Array {
  const media = new Map<DocxImage, Media>();
  for (const paragraph of paragraphs) {
    if (!('image' in paragraph)) continue;
    const number = media.size + 1;
    media.set(paragraph.image, {
      ...paragraph.image,
      // rId1 is the styles.
      id: `rId${number + 1}`,
      target: `media/image${number}.${paragraph.image.extension}`,
      number,
    });
  }
  const images = [...media.values()];
  return zip([
    ['[Content_Types].xml', contentTypes(images)],
    ['_rels/.rels', PACKAGE_RELATIONSHIPS],
    ['word/_rels/document.xml.rels', documentRelationships(images)],
    ['word/document.xml', documentXml(paragraphs, media)],
    ['word/styles.xml', stylesXml(language)],
    ...images.map(({ target, data }): [string, Uint8Array] => [
      `word/${target}`,
      data,
    ]),
  ]);
}

function documentXml(
  paragraphs: DocxParagraph[],
  media: Map<DocxImage, Media>,
): string {
  const namespaces =
    media.size > 0
      ? ` xmlns:r="${R}" xmlns:wp="${WP}" xmlns:a="${A}" xmlns:pic="${PIC}"`
      : '';
  const body = paragraphs
    .map((paragraph) =>
      'image' in paragraph
        ? `<w:p><w:r>${drawingXml(media.get(paragraph.image)!)}</w:r></w:p>`
        : paragraphXml(paragraph),
    )
    .join('');
  return `${XML_DECLARATION}<w:document xmlns:w="${W}"${namespaces}><w:body>${body}</w:body></w:document>`;
}

const STYLE_IDS: Record<NonNullable<DocxTextParagraph['style']>, string> = {
  heading1: 'Heading1',
  heading2: 'Heading2',
  quote: 'Quote',
};

function paragraphXml({ style, align, runs }: DocxTextParagraph): string {
  const properties =
    (style ? `<w:pStyle w:val="${STYLE_IDS[style]}"/>` : '') +
    (align ? `<w:jc w:val="${ALIGN_NAME[align]}"/>` : '');
  return `<w:p>${properties && `<w:pPr>${properties}</w:pPr>`}${runs
    .map(runXml)
    .join('')}</w:p>`;
}

/** An image inline in the text, its shape locked, as Word draws one. */
function drawingXml({
  id,
  number,
  target,
  width,
  height,
  description,
}: Media): string {
  const extent = `cx="${Math.round(width)}" cy="${Math.round(height)}"`;
  const name = target.slice('media/'.length);
  return (
    '<w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0">' +
    `<wp:extent ${extent}/>` +
    `<wp:docPr id="${number}" name="Picture ${number}" descr="${escapeAttribute(description)}"/>` +
    '<wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr>' +
    `<a:graphic><a:graphicData uri="${PIC}"><pic:pic>` +
    `<pic:nvPicPr><pic:cNvPr id="${number}" name="${name}"/><pic:cNvPicPr/></pic:nvPicPr>` +
    `<pic:blipFill><a:blip r:embed="${id}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>` +
    `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext ${extent}/></a:xfrm>` +
    '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>' +
    '</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing>'
  );
}

function runXml({ text, bold, italic }: DocxRun): string {
  const properties = (bold ? '<w:b/>' : '') + (italic ? '<w:i/>' : '');
  // A line break within a paragraph is a break, not a new paragraph.
  const content = text
    .split('\n')
    .map((line) => `<w:t xml:space="preserve">${escapeXml(line)}</w:t>`)
    .join('<w:br/>');
  return `<w:r>${properties && `<w:rPr>${properties}</w:rPr>`}${content}</w:r>`;
}

function escapeXml(text: string): string {
  return (
    text
      // Characters XML can't hold at all.
      // oxlint-disable-next-line no-control-regex
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
  );
}

function escapeAttribute(text: string): string {
  return escapeXml(text).replace(/"/g, '&quot;');
}

function stylesXml(language: ProseLanguage): string {
  return (
    `${XML_DECLARATION}<w:styles xmlns:w="${W}">` +
    '<w:docDefaults><w:rPrDefault><w:rPr>' +
    '<w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:eastAsia="Times New Roman" w:cs="Times New Roman"/>' +
    `<w:sz w:val="24"/><w:szCs w:val="24"/><w:lang w:val="${language}"/>` +
    '</w:rPr></w:rPrDefault><w:pPrDefault><w:pPr>' +
    '<w:spacing w:after="160" w:line="276" w:lineRule="auto"/>' +
    '</w:pPr></w:pPrDefault></w:docDefaults>' +
    '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>' +
    '<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/>' +
    '<w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:uiPriority w:val="9"/><w:qFormat/>' +
    '<w:pPr><w:keepNext/><w:keepLines/><w:spacing w:before="480" w:after="240"/><w:outlineLvl w:val="0"/></w:pPr>' +
    '<w:rPr><w:b/><w:bCs/><w:sz w:val="32"/><w:szCs w:val="32"/></w:rPr></w:style>' +
    '<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/>' +
    '<w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:uiPriority w:val="9"/><w:unhideWhenUsed/><w:qFormat/>' +
    '<w:pPr><w:keepNext/><w:keepLines/><w:spacing w:before="360" w:after="160"/><w:outlineLvl w:val="1"/></w:pPr>' +
    '<w:rPr><w:b/><w:bCs/><w:sz w:val="28"/><w:szCs w:val="28"/></w:rPr></w:style>' +
    // Indented half an inch on both sides.
    '<w:style w:type="paragraph" w:styleId="Quote"><w:name w:val="Quote"/>' +
    '<w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:uiPriority w:val="29"/><w:qFormat/>' +
    '<w:pPr><w:ind w:left="720" w:right="720"/></w:pPr></w:style>' +
    '</w:styles>'
  );
}

/** The package's content types, with each kind of image it holds. */
function contentTypes(media: Media[]): string {
  const extensions = [...new Set(media.map((m) => m.extension))];
  return (
    `${XML_DECLARATION}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    extensions
      .map(
        (extension) =>
          `<Default Extension="${extension}" ContentType="${MEDIA_TYPES[extension]}"/>`,
      )
      .join('') +
    '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
    '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>' +
    '</Types>'
  );
}

const PACKAGE_RELATIONSHIPS =
  `${XML_DECLARATION}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
  '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
  '</Relationships>';

/** The document's styles, then each of its images. */
function documentRelationships(media: Media[]): string {
  return (
    `${XML_DECLARATION}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="${R}/styles" Target="styles.xml"/>` +
    media
      .map(
        ({ id, target }) =>
          `<Relationship Id="${id}" Type="${R}/image" Target="${target}"/>`,
      )
      .join('') +
    '</Relationships>'
  );
}

// --- Zip ---

/** 1 January 1980, the earliest date a zip can hold, so the same content makes the same file. */
const DOS_DATE = (1 << 5) | 1;
/** Names are UTF-8. */
const UTF8_FLAG = 0x0800;
const DEFLATE = 8;

/** A zip archive of `files`, each deflated, text as UTF-8. */
export function zip(
  files: [name: string, content: string | Uint8Array][],
): Uint8Array {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const [name, content] of files) {
    const nameBytes = Buffer.from(name, 'utf8');
    const data =
      typeof content === 'string'
        ? Buffer.from(content, 'utf8')
        : Buffer.from(content);
    const compressed = deflateRawSync(data);
    // Fields shared by the local header and the central directory entry, from
    // the version needed to the extra field's length.
    const common = Buffer.alloc(26);
    common.writeUInt16LE(20, 0);
    common.writeUInt16LE(UTF8_FLAG, 2);
    common.writeUInt16LE(DEFLATE, 4);
    common.writeUInt16LE(0, 6);
    common.writeUInt16LE(DOS_DATE, 8);
    common.writeUInt32LE(crc32(data), 10);
    common.writeUInt32LE(compressed.length, 14);
    common.writeUInt32LE(data.length, 18);
    common.writeUInt16LE(nameBytes.length, 22);
    common.writeUInt16LE(0, 24);

    const local = Buffer.concat([
      uint32(0x04034b50),
      common,
      nameBytes,
      compressed,
    ]);
    const central = Buffer.alloc(14);
    central.writeUInt16LE(0, 0); // comment length
    central.writeUInt16LE(0, 2); // disk
    central.writeUInt16LE(0, 4); // internal attributes
    central.writeUInt32LE(0, 6); // external attributes
    central.writeUInt32LE(offset, 10);
    centrals.push(
      Buffer.concat([
        uint32(0x02014b50),
        uint16(20), // version made by
        common,
        central,
        nameBytes,
      ]),
    );
    locals.push(local);
    offset += local.length;
  }
  const directory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}

function uint16(value: number): Buffer {
  const buffer = Buffer.alloc(2);
  buffer.writeUInt16LE(value);
  return buffer;
}

function uint32(value: number): Buffer {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32LE(value);
  return buffer;
}
