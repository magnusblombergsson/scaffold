# Importing Word and Markdown into Chapters and Scenes

Research for [#6](https://github.com/magnusblombergsson/writing-tools/issues/6) (part of map #1). Facts gathered 2026-09-28 from primary sources (library READMEs and source, package registries, the OOXML and CommonMark specs, and first-party docs of tools that already do this import). This note does not choose a library or an import design.

Terms follow `CONTEXT.md`: a **Manuscript** is **Chapters** containing **Scenes**.

## 1. .docx parsing libraries

### Node / TypeScript (Electron main process or a Tauri webview)

| Library | Reads .docx? | Output | License | Latest release / activity |
|---|---|---|---|---|
| **mammoth** (mwilliamson/mammoth.js) | Yes | HTML (Markdown output deprecated), raw text, or an internal document tree via `transformDocument` | BSD-2-Clause | 1.13.0, published 2026-09-26; repo pushed 2026-09-26; ~6.3k stars |
| **docx-wasm** (WASM build of Rust docx-rs, below) | Yes (`read_docx` to JSON) | JSON document model | MIT | 0.4.23-rc1, 2026-07-28 |
| **docx** (dolanmiu/docx) | **No**: generate/modify only | n/a | MIT | 9.8.1, 2026-09-28 |
| **docx-preview** | Renders .docx to HTML for display | Styled HTML (visual fidelity, not semantic) | Apache-2.0 | 0.4.1, 2026-09-21 |

Sources: npm registry metadata (`registry.npmjs.org/<pkg>`), GitHub API for repo activity, [mammoth README](https://github.com/mwilliamson/mammoth.js/blob/master/README.md), [dolanmiu/docx](https://github.com/dolanmiu/docx) ("Easily generate and modify .docx files").

**mammoth: what it preserves (from its README and source)**

- Design goal: "produce simple and clean HTML by using semantic information in the document, and ignoring other details". Works best "if you only use styles to semantically mark up your document." Supports headings, lists, tables, footnotes/endnotes, images, bold/italic/underline/strikethrough/super/subscript, links, line breaks, text boxes, comments. ([README](https://github.com/mwilliamson/mammoth.js/blob/master/README.md))
- **Headings**: the default style map ([`lib/options-reader.js`](https://github.com/mwilliamson/mammoth.js/blob/master/lib/options-reader.js)) maps `Heading1`-`Heading6` style IDs and `Heading 1`-`Heading 6` / `heading 1`-`heading 6` style names to `h1`-`h6`, plus Apple Pages' `Heading` to `h1`. **`Title` is not mapped by default.** Custom styles can be mapped, e.g. `p[style-name='Chapter Title'] => h1:fresh`.
- **Bold / italic**: bold becomes `<strong>`, italic `<em>`, remappable (`b => em`). But the `b` / `i` matchers only match *explicitly applied* formatting: "It will not match any text that is italic because of its paragraph or run style." The default map maps the `Strong` character style to `strong`, but has **no default mapping for an `Emphasis` character style**, so italics applied via a character style are lost unless a mapping such as `r[style-name='Emphasis'] => em` is added.
- **Page breaks**: `w:br w:type="page"` is read as a `pageBreak` element ([`lib/docx/body-reader.js`](https://github.com/mwilliamson/mammoth.js/blob/master/lib/docx/body-reader.js)), but by default it produces **no HTML output**; it can be made visible with a style mapping like `br[type='page'] => hr` ([`lib/style-reader.js`](https://github.com/mwilliamson/mammoth.js/blob/master/lib/style-reader.js)). `w:lastRenderedPageBreak` and `w:sectPr` (section breaks) are in the ignore list, and the paragraph property `w:pageBreakBefore` is not read at all.
- **Tracked changes**: `w:del` is ignored and `w:ins` content is kept, i.e. the import reflects the document as if all changes were accepted.
- Empty paragraphs are dropped by default (`ignoreEmptyParagraphs`). Conversion returns `messages` (warnings, e.g. unrecognised styles, unsupported break types).
- Browser input is `{arrayBuffer}`; Node input is a path or buffer. So it runs in either Electron's main process or a webview.
- `transformDocument` gives access to paragraph `styleId` / `styleName`, but the README says that API "should be considered unstable, and may change between any versions".
- README: "Markdown support is deprecated. Generating HTML and using a separate library to convert the HTML to Markdown is recommended." (HTML→Markdown: e.g. `turndown`, MIT, 7.2.4, 2026-04-03.)

### Rust (Tauri backend)

| Crate | Reads .docx? | Model | License | Latest / activity |
|---|---|---|---|---|
| **docx-rs** (bokuweb/docx-rs) | Yes, `read_docx` → `Docx` struct, serialisable to JSON | Near-raw OOXML model | MIT | 0.4.22 (crates.io updated 2026-07-21); repo pushed 2026-09-25; ~3.5M downloads |
| **docx-rust** (cstkingkey/docx-rs, fork of PoiScript/docx-rs) | Yes, `DocxFile::from_file` then `.parse()` → `Docx` | Raw OOXML model | MIT | 0.1.11 (2026-01-22); repo pushed 2026-08-27; 34 stars |
| **docx-lite** | Text extraction | — | MIT OR Apache-2.0 | 0.2.0 (2025-09-27) |
| **dotext** | Plain text only | — | MIT | 0.1.1 (2017), unmaintained |

Sources: crates.io API (`crates.io/api/v1/crates/<name>`), [docx-rs README](https://github.com/bokuweb/docx-rs), [docx-rust docs](https://docs.rs/docx-rust/latest/docx_rust/).

- docx-rs's reader (`docx-core/src/reader/`) parses paragraph style (`pStyle`), `outlineLvl`, `pageBreakBefore`, section properties, run style (`rStyle`), bold/italic (including explicit `w:val="false"` disabling), `w:br` with its type (page/column/textWrapping), insertions/deletions, comments, and `styles.xml`. It is a **faithful document model, not a semantic converter**: resolving "is this run italic?" through the style hierarchy (doc defaults → paragraph style → character style → direct formatting) and "is this paragraph a heading?" is left to the caller.
- Neither Rust crate has a mammoth-like "style map to semantic output" layer; that would be application code (a few hundred lines over the model).

### Pandoc (external tool, either stack)

- Pandoc's docx reader maps Word heading styles to headings and bold/italic to strong/emphasis; with `-f docx+styles` it keeps every paragraph/character style name as a `custom-style` attribute (Divs for paragraph styles, Spans for character styles). Empty paragraphs are omitted unless `+empty_paragraphs`. ([Pandoc MANUAL](https://github.com/jgm/pandoc/blob/main/MANUAL.txt))
- License: **GPL-2.0-or-later** ([COPYRIGHT](https://github.com/jgm/pandoc/blob/main/COPYRIGHT)). Latest 3.11 (2026-08-29). It is a standalone Haskell binary, usable only as a bundled sidecar executable or a user-installed dependency, and bundling brings GPL distribution obligations.

## 2. Markdown parsing libraries

All listed parsers produce headings (with level), emphasis, strong, and thematic breaks as distinct nodes/events.

| Stack | Library | Output | Compliance | License | Latest |
|---|---|---|---|---|---|
| JS | **remark-parse** / **mdast-util-from-markdown** on **micromark** (unified) | mdast tree (`heading{depth}`, `emphasis`, `strong`, `thematicBreak`) with source positions | CommonMark; GFM via plugin | MIT | remark-parse 11.0.0 (2023-09); micromark 4.0.3 (2026-09-26); mdast-util-from-markdown 2.0.3 (2026-02) |
| JS | **markdown-it** | Token stream (`heading_open`, `em_open`, `strong_open`, `hr`) | CommonMark | MIT | 15.0.2 (2026-09-11) |
| JS | **marked** | Tokens / HTML | CommonMark + GFM | MIT | 18.0.14 (2026-09-22) |
| JS | **prosemirror-markdown** | Parses to a ProseMirror doc (built on markdown-it) | — | MIT | 1.13.8 (2026-09-21) |
| Rust | **pulldown-cmark** | Pull-parser events (`Start(Heading{level})`, `Emphasis`, `Strong`, `Rule`) | "goal is 100% compliance" with CommonMark | MIT | 0.13.4 (2026-05); repo pushed 2026-09-28; ~160M downloads |
| Rust | **comrak** | AST (port of cmark-gfm), source positions | CommonMark 0.31.2 by default; GFM 670/670 | BSD-2-Clause | 0.55.0 (2026-09-06) |
| Rust | **markdown** (markdown-rs, wooorm; Rust sibling of micromark) | mdast | 100% CommonMark, GFM, MDX | MIT | 1.0.0 (2025-04-23); repo last pushed 2025-04 |

Sources: npm registry and crates.io metadata; READMEs of [remark](https://github.com/remarkjs/remark), [pulldown-cmark](https://github.com/pulldown-cmark/pulldown-cmark), [comrak](https://github.com/kivikakk/comrak), [markdown-rs](https://github.com/wooorm/markdown-rs).

### CommonMark pitfalls for scene-break markers ([CommonMark spec](https://github.com/commonmark/commonmark-spec/blob/master/spec.txt))

- `***`, `---`, `___`, `* * *` (3+ matching `-`, `_`, `*`, spaces allowed) are **thematic breaks**: a clean, parser-visible scene-break signal.
- **`---` directly under a line of text is a setext H2, not a break**: "If a line of dashes that meets the above conditions for being a thematic break could also be interpreted as the underline of a setext heading, the interpretation as a setext heading takes precedence" (`Foo\n---` → `<h2>Foo</h2>`). A scene break written as `---` without a blank line above it silently turns the last paragraph into a heading.
- **A line containing only `#` is an empty H1** ("ATX headings can be empty": `#` → `<h1></h1>`). The manuscript-format convention of a lone `#` as a scene break therefore parses as an empty heading, which a heading-level splitter would treat as a new Chapter. `###` alone is an empty H3.
- Other writer conventions (`~`, `* * *` centred, `§`, a blank line) are either ordinary paragraphs or invisible: `~` and `§` parse as a one-character paragraph; extra blank lines are collapsed and leave no trace in the AST.

## 3. Word-side signals for Chapters and Scenes (OOXML, ISO/IEC 29500)

- **Heading styles**: the semantic signal is the paragraph style (`w:pStyle`, e.g. style ID `Heading1`, name `heading 1`). Custom styles (e.g. "Chapter Title") have free-form names and IDs, so name matching alone misses them. (Not verified here: how localised Word builds name built-in heading styles; worth checking with a test file.)
- **Outline level** `w:outlineLvl` (0-9, 9 = body text) is set on built-in heading styles and can be set on any paragraph or custom style; it "shall not affect the appearance of the text" but drives the TOC/navigation pane. ([OutlineLevel, ISO/IEC 29500 text via Microsoft Learn](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.wordprocessing.outlinelevel)) This is a more robust heading signal than style names when authors use custom "Chapter Title" styles based on a heading.
- **Page breaks** appear three ways: a run break `w:br w:type="page"` ([Break](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.wordprocessing.break)); a paragraph property `w:pageBreakBefore`, which can be inherited from a style ("its value is determined by the setting previously set at any level of the style hierarchy", [PageBreakBefore](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.wordprocessing.pagebreakbefore)); and section breaks (`w:sectPr` inside a paragraph's `w:pPr`, e.g. "next page"). `w:lastRenderedPageBreak` is only a layout cache of where Word last paginated and is not an authored break.
- **Formatting** can come from direct run properties (`w:b`, `w:i`), a character style (`Emphasis`), a paragraph style, or document defaults; OOXML booleans can also explicitly turn a property off. Only a converter that resolves the style hierarchy sees all of them (mammoth does not; see §1).

## 4. How existing tools split imports (first-party docs)

- **Scrivener** (Literature & Latte): "If you import a .docx document created with heading styles, such as Heading 1, Heading 2, etc., Scrivener can import that document and split it according to its headings"; for Markdown "if you use hashtags to indicate different heading levels, Scrivener can automatically split the document at each heading". For unstructured files, "Import and Split" splits on a separator: "By default, this is the # character, but you can choose any character". ([L&L blog](https://www.literatureandlatte.com/blog/merge-and-split-files-in-the-scrivener-binder))
- **Atticus**: "Change all of your Chapter Titles into a Heading 1"; "Add a page break between chapters"; "If you use three asterisks, with no spacing or any other formatting applied to them between your scenes, Atticus will automatically convert those to placeholder scene breaks", with the caveat "keep them left aligned. Centering them will not import your scene breaks correctly." Headings 2-6 import as subheadings, not structure. ([Atticus: prepare your Word document](https://www.atticus.io/tutorial/how-to-prepare-your-word-document-for-upload/))

## 5. Splitting heuristics: what the sources support

Signals, roughly from most to least reliable, per the specs and tools above:

1. **Explicit heading structure.** Heading 1 (or outline level 0) = Chapter is the convention both Scrivener and Atticus rely on. Heading 2 as a Scene title is used by some authors but is not a universal convention (Atticus treats H2-H6 as subheadings).
2. **Scene separators**: a paragraph whose entire text is a known separator (`***`, `* * *`, `#`, `~`, `§`, etc.). In .docx these are ordinary paragraphs (often centred), so detection is text matching after trimming whitespace. In Markdown, `***`/`* * *` arrive as thematic breaks but `#` arrives as an empty heading and `---` can become a setext heading (§2). Atticus shows that exact-text matching is brittle (centring broke theirs); Scrivener makes the separator user-configurable.
3. **Page breaks** as Chapter boundaries when there are no headings (Atticus's fallback). Must consider `w:br type=page`, `pageBreakBefore` (including via styles), and section breaks; mammoth only exposes the first.
4. **Fallbacks when nothing is found**: one Chapter containing one Scene; or first-line-of-chapter patterns (e.g. paragraphs matching "Chapter N" / "CHAPTER ONE", short all-caps lines). No primary source documents the reliability of these text patterns; they are guesses and would need testing on real manuscripts.

Across tools, the pattern is **deterministic split + let the Author choose/confirm the rule** (Scrivener's separator field, Atticus's "prepare your document" checklist), rather than a silent best guess.

## Implications (for the decision, not the decision)

- **Node/TS has a ready-made semantic .docx converter (mammoth); Rust does not.** In Rust, docx-rs gives a complete model but heading detection, style-inherited italics, and break handling are app code. In JS, mammoth covers most of it but needs a custom style map (at minimum `Emphasis`/`Title`/custom chapter styles and `br[type='page']`) and still misses `pageBreakBefore`, section breaks, and style-inherited italics.
- **A Tauri app could still run mammoth in the webview** (it accepts an `ArrayBuffer`), so the .docx question does not by itself force Electron. Alternatively docx-wasm exposes the Rust reader to JS.
- **Markdown is well served in both stacks** (micromark/remark or markdown-it in JS; pulldown-cmark or comrak in Rust), all permissive licenses and active.
- **Scene-break detection should happen before or alongside Markdown parsing, not only on the AST**, because `#` and `---` change meaning under CommonMark. For .docx, it is paragraph-text matching regardless of library.
- **Pandoc is the most complete converter but GPL-2.0+ and a large external binary**; that is a licensing/distribution decision, not just a technical one.
- **Italics are the formatting most at risk** (style-inherited italics in .docx; Word "Emphasis" style). Italics matter in fiction (thoughts, titles, emphasis), so a test corpus with style-applied italics is worth having before choosing.
- The import step likely needs a **preview/confirm UI** where the Author picks the Chapter signal (Heading 1 / page break / pattern) and Scene separator, since every source tool relies on author-controlled conventions rather than inference.
