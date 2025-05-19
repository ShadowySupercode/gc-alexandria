# Markup Support in Alexandria

Alexandria supports multiple markup formats for different use cases. Below is a summary of the supported tags and features for each parser, as well as the formats used for publications and wikis.

## Basic Markup Parser

The **basic markup parser** follows the [Nostr best-practice guidelines](https://github.com/nostrability/nostrability/issues/146) and supports:

- **Headers:**  
  - ATX-style: `# H1` through `###### H6`  
  - Setext-style: `H1\n=====`
- **Bold:** `*bold*` or `**bold**`
- **Italic:** `_italic_` or `__italic__`
- **Strikethrough:** `~strikethrough~` or `~~strikethrough~~`
- **Blockquotes:** `> quoted text`
- **Unordered lists:** `* item`
- **Ordered lists:** `1. item`
- **Links:** `[text](url)`
- **Images:** `![alt](url)`
- **Hashtags:** `#hashtag`
- **Nostr identifiers:** npub, nprofile, nevent, naddr, note, with or without `nostr:` prefix (note is deprecated)
- **Emoji shortcodes:** `:smile:` will render as 😄

## Advanced Markup Parser

The **advanced markup parser** includes all features of the basic parser, plus:

- **Inline code:** `` `code` ``
- **Syntax highlighting:** for code blocks in many programming languages (from [highlight.js](https://highlightjs.org/))
- **Tables:** Pipe-delimited tables with or without headers
- **Footnotes:** `[^1]` or `[^Smith]`, which should appear where the footnote shall be placed, and will be displayed as unique, consecutive numbers
- **Footnote References:** `[^1]: footnote text` or `[^Smith]: Smith, Adam. 1984 "The Wiggle Mysteries`, which will be listed in order, at the bottom of the event, with back-reference links to the footnote, and text footnote labels appended
- **Wikilinks:** `[[NIP-54]]` will render as a hyperlink and goes to [NIP-54](./wiki?d=nip-54)

## Publications and Wikis

**Publications** and **wikis** in Alexandria use **AsciiDoc** as their primary markup language, not Markdown.

AsciiDoc supports a much broader set of formatting, semantic, and structural features, including:

- Section and document structure
- Advanced tables, callouts, admonitions
- Cross-references, footnotes, and bibliography
- Custom attributes and macros
- And much more

For more information on AsciiDoc, see the [AsciiDoc documentation](https://asciidoc.org/).

---

**Note:**
- The markdown parsers are primarily used for comments, issues, and other user-generated content.
- Publications and wikis are rendered using AsciiDoc for maximum expressiveness and compatibility.
- All URLs are sanitized to remove tracking parameters, and YouTube links are presented in a clean, privacy-friendly format.
- [Here is a test markup file](/tests/integration/markupTestfile.md) that you can use to test out the parser and see how things should be formatted.