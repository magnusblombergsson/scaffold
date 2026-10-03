import { crc32, deflateRawSync } from 'node:zlib';
import type { ProseLanguage } from '../../shared/project-types';

// A minimal .docx: one document part, and a styles part holding only Word's
// built-in Normal and Heading 1, so the reader's Word restyles it as they like.

/** A run of text, and whether it is bold or italic. */
export type DocxRun = { text: string; bold: boolean; italic: boolean };

/** A paragraph: Normal, Heading 1, or Normal centred. */
export type DocxParagraph = {
  style?: 'heading1';
  centred?: boolean;
  runs: DocxRun[];
};

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const XML_DECLARATION =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

/** A .docx of `paragraphs`, its Prose in `language` for spellchecking. */
export function docx(
  paragraphs: DocxParagraph[],
  language: ProseLanguage,
): Uint8Array {
  return zip([
    ['[Content_Types].xml', CONTENT_TYPES],
    ['_rels/.rels', PACKAGE_RELATIONSHIPS],
    ['word/_rels/document.xml.rels', DOCUMENT_RELATIONSHIPS],
    ['word/document.xml', documentXml(paragraphs)],
    ['word/styles.xml', stylesXml(language)],
  ]);
}

function documentXml(paragraphs: DocxParagraph[]): string {
  return `${XML_DECLARATION}<w:document xmlns:w="${W}"><w:body>${paragraphs
    .map(paragraphXml)
    .join('')}</w:body></w:document>`;
}

function paragraphXml({ style, centred, runs }: DocxParagraph): string {
  const properties =
    (style === 'heading1' ? '<w:pStyle w:val="Heading1"/>' : '') +
    (centred ? '<w:jc w:val="center"/>' : '');
  return `<w:p>${properties && `<w:pPr>${properties}</w:pPr>`}${runs
    .map(runXml)
    .join('')}</w:p>`;
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
    '</w:styles>'
  );
}

const CONTENT_TYPES =
  `${XML_DECLARATION}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
  '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
  '<Default Extension="xml" ContentType="application/xml"/>' +
  '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
  '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>' +
  '</Types>';

const PACKAGE_RELATIONSHIPS =
  `${XML_DECLARATION}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
  '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
  '</Relationships>';

const DOCUMENT_RELATIONSHIPS =
  `${XML_DECLARATION}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
  '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
  '</Relationships>';

// --- Zip ---

/** 1 January 1980, the earliest date a zip can hold, so the same Prose makes the same file. */
const DOS_DATE = (1 << 5) | 1;
/** Names are UTF-8. */
const UTF8_FLAG = 0x0800;
const DEFLATE = 8;

/** A zip archive of `files`, each deflated. */
export function zip(files: [name: string, text: string][]): Uint8Array {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const [name, text] of files) {
    const nameBytes = Buffer.from(name, 'utf8');
    const data = Buffer.from(text, 'utf8');
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
