# Markup Support in Alexandria

Alexandria supports multiple markup formats for different use cases. Below is a summary of the supported tags and features for each parser, as well as the formats used for publications and wikis.

## Basic Markdown Parser

The **basic markdown parser** supports:

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
- **Nostr identifiers:** npub, nprofile, nevent, naddr, note, with or without `nostr:` prefix
- **Emoji shortcodes:** `:smile:`

## Advanced Markdown Parser

The **advanced markdown parser** includes all features of the basic parser, plus:

- **Inline code:** `` `code` ``
- **Syntax highlighting:** for code blocks in over 100 languages
- **Tables:** Pipe-delimited tables with or without headers
- **Footnotes:** `[^1]` and `[ ^1 ]: footnote text`
- **Wikilinks:** `[[Page Name]]` (NIP-54)
- **Better footnote rendering:** with backreferences and unique numbering

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