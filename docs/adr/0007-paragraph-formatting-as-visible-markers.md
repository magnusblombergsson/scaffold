# Paragraph formatting as per-paragraph markers, visible to old apps

Scaffold v3 extends the Prose boundary format (ADR 0001) with centre and right alignment and block quotes. Each is a marker at the start of the paragraph it applies to: `> ` for a block quote, `{.centre} ` or `{.right} ` for alignment, combined as `> {.centre} `. Left is unmarked. Consecutive quoted paragraphs each carry their own `> ` and read as one passage. A paragraph that starts with a literal `>` or `{.` is escaped with a backslash. The markers are in the text, so an MVP or v2 app shows them as literal characters, but it never misapplies them and keeps them when it rewrites the Scene. The format version stays as it is. Decided in [Prose formatting beyond bold and italic](https://github.com/magnusblombergsson/scaffold/issues/119).

## Considered Options

- **A frontmatter map of paragraph formats** (ADR 0006's hiding place): invisible to old apps, but an edit there that inserts or deletes a paragraph leaves an index-keyed map pointing at the wrong paragraph, which is a silent misapplication.
- **Bump the format** (ADR 0004): clean, but it locks every not-yet-updated computer out of the Project over a minor feature.
- **Raw HTML (`<p align="center">`)**: read by Obsidian and Typora, but bold and italic inside it would have to become `<em>` and `<strong>`, so the paragraph would leave our Markdown.
- **Pandoc fenced divs (`::: centre` … `:::`)**: the opening and closing fences are separate lines. If one is deleted in an old app, every paragraph after it would be read as centred.

## Consequences

- A marker can't drift: it lives in the paragraph it formats, so old-app edits can lose it but never move it.
- Prose written before v3 that happens to start with `> ` opens as a block quote. This is accepted: it is rare and visible, and toggling it off stores it escaped. Scanning to escape old text was rejected, because it can't tell old text from a quote written by another v3 computer.
- The Assistant sees the markers as stored. Word counts skip them, because they read the Prose through the same reader.
- Export renders the markers rather than copying them. .docx uses `w:jc` and a Scaffold-defined Quote style. Markdown uses `> ` and `<p align="…">`.
