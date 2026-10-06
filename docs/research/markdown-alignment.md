# How Markdown tools store alignment and block formatting

Research note, 2026-10-06, for [#118](https://github.com/magnusblombergsson/scaffold/issues/118) (part of [Map: Scaffold v3](https://github.com/magnusblombergsson/scaffold/issues/113)). Question: how do Markdown-based writing tools and converters store paragraph-level formatting that plain Markdown can't express (alignment: left, centre, right, justified; also block quotes and similar), how does each map to .docx paragraph properties, and how does a reader that doesn't understand it degrade?

Findings are marked as **Source** (what a spec, vendor doc or codebase says, with a link) or **Inference** (this note's own reading). Web sources were fetched on 2026-10-06. The note doesn't recommend a decision. It lists the options and their trade-offs for the Author.

## Summary

- **Markdown has no paragraph alignment.** CommonMark and GFM define none. Every tool that offers it either borrows HTML, adds its own extension syntax, or keeps alignment out of the text altogether, in an export style sheet. **Block quotes are the exception.** `>` is core CommonMark, and every surveyed tool reads it.
- **The tools split three ways.** *Raw HTML* (`<p style="text-align:center">`, `<center>`) is what Obsidian and Typora users use. Both say Markdown inside HTML blocks is not rendered. *Pandoc fenced divs* (`::: {.center}` … `:::`) are what Zettlr uses, because it exports through Pandoc. *No per-paragraph alignment in the text*: iA Writer documents alignment only for table columns, and Ulysses sets `text-alignment` per style selector in its export style sheet.
- **Pandoc itself can't carry paragraph alignment to .docx.** Its document model has no attributes on paragraphs. The docx writer honours only `custom-style` on a div, which becomes a named Word paragraph style with no alignment unless a reference doc defines one. The docx reader parses `w:jc`, but only to set table-cell alignment, and drops it from paragraphs. Raw HTML is "suppressed" in docx output.
- **In .docx, alignment is `<w:jc w:val="…">` in a paragraph's `w:pPr`.** The values are `left`/`start`, `center`, `right`/`end` and `both` (justified). When `w:jc` is absent, the style hierarchy decides. Scaffold's own docx writer already emits `w:jc w:val="center"` for the Scene break, so mapping alignment directly is a one-line extension, and Scaffold doesn't need Pandoc for it.
- **On today's Scaffold, every in-text syntax shows up as visible text, not as formatting.** The current reader (`readProse`) treats everything except `*` runs and backslash escapes as plain text. A fenced div, an HTML tag, an HTML comment, an attribute list or a `>` therefore all appear verbatim in the editor. They also go into the Export, count as words and are sent to the Assistant. Nothing is silently dropped, and nothing is misapplied. A probe of the real module confirmed this (§3).
- **The sharper hazard runs the other way: old literal text read as new syntax.** Today's writer escapes only `*` and `\`. A paragraph the Author typed as `> …`, `::: …` or `<p …>` is stored verbatim. A newer reader that gives those characters meaning would reformat existing Prose. And a backslash escape such as `\>` doesn't survive an older app: it reads `\>` as `>` and writes back a bare `>`.
- **Hiding alignment out of the text (ADR 0006) has its own misapplication risk.** A frontmatter map keyed by paragraph index is invisible to an older app, which keeps unknown keys. But if the Author then adds or deletes a paragraph there, the indices shift, and a newer app would centre the wrong paragraph. That is exactly the misapplication ADR 0006 exists to prevent, unless each entry is anchored to the paragraph's content.
- **The editor side is already solved.** TipTap's TextAlign extension stores `textAlign` as a node attribute (`left`, `center`, `right`, `justify`, default `null`) and renders it as `style="text-align: …"`. Only the boundary format (ADR 0001) has to change.

## 1. Where Scaffold stands today

- **Source (repo):** Prose crosses the editor boundary as restricted Markdown with paragraphs, `*italic*` and `**bold**`. A literal `*` or `\` is escaped. "Prose formatting beyond this (footnotes, block quotes) needs the boundary format extended first." The format is Scaffold's own, not CommonMark ([ADR 0001](../adr/0001-electron-and-tiptap.md)).
- **Source (repo):** `readProse`/`markdownToDoc` split on blank lines and read only asterisk runs and backslash escapes before ASCII punctuation (`ESCAPABLE`). Every other character is text. `docToMarkdown` escapes only `\` and `*` ([`src/shared/prose-markdown.ts`](../../src/shared/prose-markdown.ts)).
- **Source (repo):** The .docx writer models a paragraph as `{ style?: 'heading1'; centred?: boolean; runs }` and writes `centred` as `<w:jc w:val="center"/>` inside `<w:pPr>`. Today only the Scene break `***` is centred ([`src/main/export/docx.ts`](../../src/main/export/docx.ts), [`manuscript-export.ts`](../../src/main/export/manuscript-export.ts)).
- **Source (repo):** The Markdown Export writes CommonMark from the parsed spans, not from the stored text. It escapes a leading `#>+=|-` and digits followed by `.`/`)` so that no line starts a block ([`manuscript-export.ts`](../../src/main/export/manuscript-export.ts)). **Inference:** what Scaffold stores and what it exports are already separate, so the stored syntax doesn't have to be the exported syntax.
- **Source (repo):** Import uses mammoth with a style map that keeps only emphasis, strong and page breaks ([`src/main/import/manuscript-import.ts`](../../src/main/import/manuscript-import.ts)). Mammoth does expose a paragraph's `alignment` (for example `"center"`) to a `transformDocument` hook, but it doesn't emit it in HTML by default ([mammoth.js README, "Document transforms"](https://github.com/mwilliamson/mammoth.js#document-transforms)).
- **Source (repo):** Unknown frontmatter keys and event types are kept, and an older app goes without features it can't see ([ADR 0004](../adr/0004-one-format-version-gate-first.md), [ADR 0006](../adr/0006-hide-what-old-apps-would-misapply.md)).

## 2. How .docx stores it

- **Source:** `w:jc` (Paragraph Alignment) "specifies the paragraph alignment which shall be applied to text in this paragraph. If this element is omitted on a given paragraph, its value is determined by the setting previously set at any level of the style hierarchy." Its parent is `w:pPr` (ISO/IEC 29500-1 §17.3.1.13, quoted in [Microsoft Learn: Justification class](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.wordprocessing.justification)).
- **Source:** The values are `left`, `start` (Office 2010+), `center`, `right`, `end` (Office 2010+) and `both` ("Justified"). There are also `distribute`, `numTab`, the kashida variants and `thaiDistribute` ([Microsoft Learn: JustificationValues](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.wordprocessing.justificationvalues)).
- **Mapping for Scaffold's four alignments (Inference from the above):** left → omit `w:jc` (or `left`), centre → `center`, right → `right`, justified → `both`. Using `left`/`right` rather than `start`/`end` keeps Word 2007 compatible. Alignment can also live in a paragraph style (`w:style/w:pPr/w:jc`) that paragraphs reference with `w:pStyle`. That is how Pandoc's `custom-style` route works (§3A).
- **Block quotes in .docx:** there is no block-quote element. **Source:** Pandoc writes a block quote as paragraphs styled `Block Text` (`Footnote Block Text` in notes). Its reader treats the styles `Quote`, `Block Text`, `Block Quote`, `Block Quotation` and `Intense Quote`, or a paragraph indented more than its style, as a block quote ([Pandoc `Writers/Docx/OpenXML.hs`](https://github.com/jgm/pandoc/blob/main/src/Text/Pandoc/Writers/Docx/OpenXML.hs), [`Readers/Docx.hs` `isBlockQuote`, `relativeIndent`](https://github.com/jgm/pandoc/blob/main/src/Text/Pandoc/Readers/Docx.hs)). **Inference:** Scaffold could map a quote to Word's built-in `Quote` style or to `w:ind` left/right indents. Either reads back through Pandoc as a quote.

## 3. The storage options

For each option: the syntax, which tools read and write it, round-trip fidelity, how an older Scaffold degrades, and the .docx mapping. The older-Scaffold behaviour was checked by running today's `readProse`/`writeProse` on each sample (Node 24, scratch copy of `prose-markdown.ts`):

| Stored text | What today's Scaffold shows | What it writes back |
|---|---|---|
| `::: {.center}\nThe End\n:::` | one paragraph, fence lines as literal text with line breaks | unchanged |
| `::: center\n\nThe End\n\n:::` | three paragraphs: `::: center`, `The End`, `:::` | unchanged |
| `<p style="text-align: center">The *End*</p>` | literal tags around "The ", then *End* in italic | unchanged |
| `<!-- align: center -->\nThe End` | the comment as visible text, a line break, then "The End" | unchanged |
| `> A quoted *line*` | literal `> ` and the quote text, with *line* in italic | unchanged |
| `The End\n{: .center}` | the IAL as visible text on a second line | unchanged |
| `[The End]{.center}` | literal brackets and braces | unchanged |
| `\> escaped quote marker` | `> escaped quote marker` (backslash consumed) | `> escaped quote marker`, **escape lost** |

### A. Pandoc fenced divs (and `custom-style`)

- **Syntax (Source):** "A Div starts with a fence containing at least three consecutive colons plus some attributes … The Div ends with another line containing a string of at least three consecutive colons. The fenced Div should be separated by blank lines from preceding and following blocks." The attributes are `{#id .class key="val"}`, or a single bare word taken as a class. Divs nest, and "Fences without attributes are always closing fences" ([Pandoc manual, Extension: `fenced_divs`](https://pandoc.org/MANUAL.html#extension-fenced_divs)).
- **Who reads and writes it:** Pandoc (on by default in `markdown`), and Zettlr, which exports "primarily powered by Pandoc". Its example reader line is `markdown+definition_lists+mmd_title_block+bracketed_spans+fenced_divs` ([Zettlr: Export](https://docs.zettlr.com/en/export/), [Zettlr: Defaults files](https://docs.zettlr.com/en/export/defaults-files.html)). CommonMark, GFM, Obsidian, iA Writer and Typora don't define it. **Inference:** they show the fences as literal paragraph text.
- **No paragraph attributes in Pandoc (Source):** "attributes cannot be added directly to paragraphs or text in the pandoc AST, paragraph styles will cause Divs to be created" ([Pandoc manual, Extension: `styles`](https://pandoc.org/MANUAL.html#ext-styles)). Even a single centred paragraph needs a wrapping div.
- **To .docx via Pandoc (Source):** only `custom-style` is honoured. "If you define a Div … with the attribute `custom-style`, pandoc will apply your specified style to the contained elements … Styles will be defined in the output file as inheriting from normal text … if the styles are not yet in your reference doc" ([Pandoc manual, Custom Styles](https://pandoc.org/MANUAL.html#custom-styles)). In the writer source, `custom-style` (`dynamicStyleKey`) is the only div attribute that becomes a paragraph property, and `w:jc` is written only for tables ([`OpenXML.hs`](https://github.com/jgm/pandoc/blob/main/src/Text/Pandoc/Writers/Docx/OpenXML.hs)). **Inference:** `::: {.center}` reaches Word uncentred, and `::: {custom-style="Centered"}` reaches it as a style called "Centered" that is only centred if a reference doc says so.
- **From .docx via Pandoc (Source):** the reader parses `w:jc` into `justification` but uses it only for table-cell alignment ([`Readers/Docx/Parse.hs`](https://github.com/jgm/pandoc/blob/main/src/Text/Pandoc/Readers/Docx/Parse.hs), `elemToCell`). With `-f docx+styles`, each paragraph style becomes a `custom-style` div ([manual, Custom Styles → Input](https://pandoc.org/MANUAL.html#custom-styles)). Direct `w:jc` on a paragraph is lost.
- **Round trip in Scaffold:** Scaffold would write and read the syntax itself, so the fidelity is whatever Scaffold's reader defines. **Inference:** the fences are lines of their own. That fits the blank-line paragraph split, but it doubles the line count of a single centred paragraph.
- **Older Scaffold:** shows junk. The fences become visible text or paragraphs of their own, are counted, are sent to the Assistant, and appear in its Export. Deleting a fence line there leaves an unclosed or orphaned fence for the newer app to interpret.

### B. Raw HTML blocks (`<p style="text-align:…">`, `<p align>`, `<center>`, `<div>`)

- **Syntax (Source):** an HTML block of kind 6 starts with a line beginning `<` or `</` followed by one of a list of tag names that includes `p`, `div`, `center` and `blockquote`. It "is followed by a blank line" to end, and its content "is treated as raw HTML" ([CommonMark spec 0.31.2, HTML blocks](https://spec.commonmark.org/0.31.2/#html-blocks)).
- **Markdown inside is not rendered:** Obsidian: "Obsidian does not render Markdown syntax inside HTML elements. This is an intentional design choice" ([Obsidian Flavored Markdown](https://obsidian.md/help/obsidian-flavored-markdown)). Typora: "Markdown syntax will not be parsed inside HTML blocks, which is the same for GFM/CommonMark" ([Typora: HTML Support](https://support.typora.io/HTML/)). **Inference:** a centred paragraph containing italics would have to spell the italics as `<em>`. Otherwise CommonMark tools show literal asterisks. Pandoc is the exception: by default it "interprets material between HTML block tags as Markdown" (`markdown_in_html_blocks`), and `native_divs` turns `<div>` into a native Div ([Pandoc manual, Raw HTML](https://pandoc.org/MANUAL.html#raw-html)).
- **Who reads and writes it:** Obsidian supports "CommonMark, GitHub Flavored Markdown, and LaTeX" and renders HTML. Typora renders HTML. In both, centring by HTML is a user habit, not a documented alignment feature. Neither page documents an alignment command.
- **To .docx:** Pandoc: raw HTML "is passed through unchanged in HTML … Markdown, CommonMark … and suppressed in other formats" ([manual, Extension: `raw_html`](https://pandoc.org/MANUAL.html#extension-raw_html)). Typora: when exporting "to other formats, such as Word or LaTeX, their HTML content may become plain text" ([Typora: HTML Support](https://support.typora.io/HTML/)). **Inference:** for these tools the alignment never reaches Word. Scaffold's own writer could map it, but only by parsing CSS out of the attribute.
- **Older Scaffold:** shows junk. The tags appear verbatim. Asterisks inside are still read as marks, so the old app keeps the italics, but every tool that follows CommonMark shows them as literal asterisks.

### C. HTML comment marker (`<!-- align: center -->`)

- **Syntax (Source):** kind 2 of HTML block: starts with `<!--` and ends at a line containing `-->` ([CommonMark spec, HTML blocks](https://spec.commonmark.org/0.31.2/#html-blocks)). iA Writer documents HTML comments as its cross-platform comment syntax ([iA Writer Markdown Guide, Comments](https://ia.net/writer/support/basics/markdown-guide)).
- **Who reads it:** no surveyed tool gives a comment any formatting meaning. CommonMark viewers simply hide it. **Inference:** in third-party viewers it degrades to an unaligned paragraph with an invisible marker, the quietest degradation among the in-text options.
- **To .docx:** Pandoc treats it as raw HTML, suppressed in docx. Only Scaffold's own writer would map it.
- **Older Scaffold:** shows junk: the comment as visible text. If it sits on the paragraph's own first line, as in the probe, it stays attached when the Author moves the paragraph in the old app.

### D. Attribute lists (kramdown block IAL; Pandoc bracketed spans)

- **kramdown (Source):** "A block IAL … has to be put directly before or after the block-level element to which the attributes should be attached … The block IAL is ignored in all other cases, for example, when the block IAL is surrounded by blank lines". The syntax is `{: .class key="val"}` ([kramdown syntax, Block Inline Attribute Lists](https://kramdown.gettalong.org/syntax.html#block-ials)). It comes from Maruku and is used by Jekyll. None of the surveyed writing apps support it.
- **Pandoc (Source):** `[text]{.class key="val"}` is an inline Span ([manual, `bracketed_spans`](https://pandoc.org/MANUAL.html#extension-bracketed_spans)). It is not a paragraph property. Pandoc puts attributes on headings, code blocks, divs, spans, images and links, not on paragraphs (§A).
- **Older Scaffold:** shows junk (the `{…}` text). **Inference:** a trailing per-paragraph attribute is the most compact in-text form, since the paragraph stays one paragraph. But no Markdown tool other than kramdown reads it as an attribute.

### E. CommonMark block quote (`>`), for block quotes specifically

- **Syntax (Source):** a block quote marker is up to three spaces of indentation, `>`, and an optional space. Lines without the marker can continue a paragraph inside it (lazy continuation) ([CommonMark spec, Block quotes](https://spec.commonmark.org/0.31.2/#block-quotes)).
- **Who reads and writes it:** every surveyed tool. Obsidian: "You can quote text by adding a `>` symbols before the text" ([Obsidian: Basic formatting syntax](https://obsidian.md/help/syntax)). iA Writer: "Type `>` plus a space", and `>>` nests ([iA Writer Markdown Guide](https://ia.net/writer/support/basics/markdown-guide)). Ulysses maps Block Quote to `<blockquote>` on HTML export ([Ulysses: Markdown XL](https://help.ulysses.app/introduction/markdown-xl)). Pandoc maps it to Word's `Block Text` style (§2).
- **Older Scaffold:** shows junk (a literal `> `), and the inner marks still render. **Collision (Inference from the probe):** today a paragraph that the Author typed as "> …" is stored as `> …` unescaped, so a newer reader that honours `>` would turn existing literal text into a quote. And the obvious protection, escaping the character as `\>`, is undone by an older app, which reads `\>` as `>` and writes back a bare `>`.

### F. Obsidian callouts (`> [!type]`)

- **Syntax (Source):** a block quote whose first line is `[!type]`. "Unless you customize callouts, any unsupported type defaults to the `note` type", and custom types need CSS snippets ([Obsidian: Callouts](https://obsidian.md/help/callouts)).
- **Relevance:** Obsidian users centre text with a CSS snippet and a `[!center]` callout. That is a community workaround, not a documented feature, and it renders as a block quote everywhere outside Obsidian. **Inference:** it is an example of syntax that a non-understanding reader *misapplies*: it becomes a quote, or a "note" box.

### G. Out of band: frontmatter or a sidecar, keyed by paragraph (the ADR 0006 hiding place)

- **Syntax (Inference):** for example a Scene frontmatter key such as `paragraphs: {3: center}`, or a list of entries anchored to a paragraph. No surveyed Markdown tool does this for alignment. It is a Scaffold-only design.
- **Older Scaffold:** sees nothing and keeps the unknown key (ADR 0004/0006). The Prose stays clean in the editor, in the Assistant's context and in its Export.
- **The catch (Inference):** the older app keeps the key but doesn't update it. If the Author inserts, deletes, splits or merges a paragraph there, an index-keyed map now points at the wrong paragraph, and the newer app centres it. That is a misapplication, the case ADR 0006 exists to avoid. Anchoring each entry to the paragraph's content (for example its text, or a hash of it) lets the newer app drop entries that no longer match, at the cost of losing alignment on any edited paragraph. Conflict merging (two computers) has the same alignment-drift problem.
- **Third-party tools:** they show the Prose unaligned. Obsidian and Pandoc read YAML frontmatter as metadata.
- **To .docx:** direct `w:jc` from Scaffold's writer.

### H. No per-paragraph storage: alignment as an export style (Ulysses, iA Writer)

- **Ulysses (Source):** "To define the horizontal alignment of a paragraph's text, find the selector `defaults` and add or change `text-alignment` to `left`, `right`, `center`, `justified` or `auto`." Headings and figures take their own selectors (`heading-all`, `paragraph-figure`). Alignment is set per element type in the PDF/DOCX export style, not per paragraph in the text ([Ulysses Help: Customize an Export Style](https://ulyssesapp.helpjuice.com/styles-themes/customize-an-export-style)). Ulysses' in-text paragraph markup is headings, block quote, code block, raw source, comment and divider ([Ulysses: Markdown XL](https://help.ulysses.app/introduction/markdown-xl)). **Inference:** a single centred line in Ulysses comes from a style rule or raw source, not from the Markdown.
- **iA Writer (Source):** its Markdown guide documents alignment only for table columns ("To align a column: left `:--`, right `--:`, center `:-:`"), plus `+++` page breaks and `//` or `<!-- -->` comments. It documents no paragraph alignment ([iA Writer Markdown Guide](https://ia.net/writer/support/basics/markdown-guide)).
- **Older Scaffold:** unaffected, since nothing is stored in Prose. **Inference:** this covers manuscript-wide choices (justified body text, centred Scene breaks), but not a one-off centred epigraph, sign or letter.

## 4. Tool survey at a glance

| Tool | Paragraph alignment in the text? | How | Block quote | To .docx |
|---|---|---|---|---|
| CommonMark / GFM | No | Raw HTML passes through | `>` | n/a (spec) |
| Pandoc | Only as a div attribute | `::: {custom-style="…"}` (reference-doc style) | `>` → `Block Text` | `custom-style` only. Raw HTML suppressed. Reader drops paragraph `w:jc` |
| Obsidian | No documented feature | Raw HTML (Markdown inside not rendered), CSS callouts | `>`, callouts | Via plugins/Pandoc |
| Typora | No documented feature | Raw HTML | `>` | HTML "may become plain text" |
| Zettlr | Via Pandoc | Fenced divs, bracketed spans | `>` | Pandoc + reference doc |
| iA Writer | No | Table columns only | `>`, `>>` | n/a |
| Ulysses | No (per style selector) | Export style sheet `text-alignment` | Block Quote markup | Style sheet decides |
| kramdown | Yes (generic attributes) | Block IAL `{: …}` | `>` | n/a |
| TipTap (editor) | Yes (node attribute) | `textAlign` → `style="text-align: …"` | Blockquote node | n/a |

TipTap source: the TextAlign extension adds a `textAlign` attribute to the configured node types, with alignments `['left', 'center', 'right', 'justify']`, `defaultAlignment: null`, parsed from and rendered to `style="text-align: …"` ([`extension-text-align/src/text-align.ts`](https://github.com/ueberdosis/tiptap/blob/main/packages/extension-text-align/src/text-align.ts)).

## 5. Trade-offs for the Author (no recommendation)

- **Visible junk vs silent misapplication.** Every in-text option (A–E) degrades on today's Scaffold to visible markup. The Author sees it, and so do the Export and the Assistant, but nothing is wrongly formatted. The out-of-band option (G) is invisible to an old app, but can misapply after an edit there unless it is anchored to content. Hiding (ADR 0006) and "never misapply" pull against each other here, because Prose is the one thing the old app edits.
- **Old text read as new syntax.** Any syntax built from characters the current writer leaves unescaped (`>`, `:`, `<`, `{`, `[`) can match Prose the Author already typed. A new reader needs a way to tell old Scene files from new ones (a per-file marker or a format bump). Or it chooses a syntax the current writer can't produce. Backslash escapes don't survive a round trip through an older app.
- **Interoperability vs fidelity.** Fenced divs match Pandoc and Zettlr. Raw HTML matches Obsidian and Typora, but forces inline marks into HTML. A comment marker is invisible everywhere but means nothing anywhere else. Since the Markdown Export is generated rather than copied, the stored syntax and the exported syntax can differ.
- **.docx is the easy end.** Scaffold's writer already emits `w:jc`. Left/centre/right/justified map to omitted/`center`/`right`/`both`, and a block quote maps to the `Quote` style or indentation. Going through Pandoc would lose direct alignment, but Scaffold doesn't use Pandoc.
- **Scope.** If the need is manuscript-wide (justified body, centred breaks), the Ulysses model (H) stores nothing per paragraph and has no compatibility cost. The per-paragraph options are only needed for one-off blocks.

## Sources

- CommonMark Spec 0.31.2: [HTML blocks](https://spec.commonmark.org/0.31.2/#html-blocks), [Block quotes](https://spec.commonmark.org/0.31.2/#block-quotes)
- Pandoc User's Guide ([MANUAL.txt](https://github.com/jgm/pandoc/blob/main/MANUAL.txt)): [`fenced_divs`](https://pandoc.org/MANUAL.html#extension-fenced_divs), [`bracketed_spans`](https://pandoc.org/MANUAL.html#extension-bracketed_spans), [`raw_html`](https://pandoc.org/MANUAL.html#extension-raw_html), [`styles`](https://pandoc.org/MANUAL.html#ext-styles), [Custom Styles](https://pandoc.org/MANUAL.html#custom-styles)
- Pandoc source: [`Writers/Docx/OpenXML.hs`](https://github.com/jgm/pandoc/blob/main/src/Text/Pandoc/Writers/Docx/OpenXML.hs), [`Readers/Docx.hs`](https://github.com/jgm/pandoc/blob/main/src/Text/Pandoc/Readers/Docx.hs), [`Readers/Docx/Parse.hs`](https://github.com/jgm/pandoc/blob/main/src/Text/Pandoc/Readers/Docx/Parse.hs)
- ISO/IEC 29500 `w:jc` via Microsoft Learn: [Justification](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.wordprocessing.justification), [JustificationValues](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.wordprocessing.justificationvalues)
- Obsidian: [Obsidian Flavored Markdown](https://obsidian.md/help/obsidian-flavored-markdown), [Basic formatting syntax](https://obsidian.md/help/syntax), [Callouts](https://obsidian.md/help/callouts)
- Typora: [HTML Support](https://support.typora.io/HTML/)
- iA Writer: [Markdown Guide](https://ia.net/writer/support/basics/markdown-guide)
- Ulysses: [Customize an Export Style](https://ulyssesapp.helpjuice.com/styles-themes/customize-an-export-style), [Markdown XL](https://help.ulysses.app/introduction/markdown-xl)
- Zettlr: [Export](https://docs.zettlr.com/en/export/), [Defaults files](https://docs.zettlr.com/en/export/defaults-files.html)
- kramdown: [Syntax, Block IALs](https://kramdown.gettalong.org/syntax.html#block-ials)
- mammoth.js: [README, Document transforms](https://github.com/mwilliamson/mammoth.js#document-transforms)
- TipTap: [`extension-text-align`](https://github.com/ueberdosis/tiptap/blob/main/packages/extension-text-align/src/text-align.ts)
- This repo: ADR [0001](../adr/0001-electron-and-tiptap.md), [0004](../adr/0004-one-format-version-gate-first.md), [0006](../adr/0006-hide-what-old-apps-would-misapply.md); `src/shared/prose-markdown.ts`, `src/main/export/docx.ts`, `src/main/export/manuscript-export.ts`, `src/main/import/manuscript-import.ts`
