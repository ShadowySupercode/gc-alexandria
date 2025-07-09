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
- **Wikilinks:** `[[NIP-54]]` will render as a hyperlink and goes to [NIP-54](./events?d=nip-54)

## Publications and Wikis

**Publications** and **wikis** in Alexandria use **AsciiDoc** as their primary markup language, not Markdown.

AsciiDoc supports a much broader set of formatting, semantic, and structural features, including:

- Section and document structure
- Advanced tables, callouts, admonitions
- Cross-references, footnotes, and bibliography
- Custom attributes and macros
- **Math rendering** (Asciimath and LaTeX)
- **Diagram rendering** (PlantUML, BPMN, TikZ)
- And much more

### Advanced Content Types

Alexandria supports rendering of advanced content types commonly used in academic, technical, and business documents:

#### Math Rendering

Use `[stem]` blocks for mathematical expressions:

```asciidoc
[stem]
++++
\frac{\partial f}{\partial x} = \lim_{h \to 0} \frac{f(x + h) - f(x)}{h}
++++
```

Inline math is also supported using `$...$` or `\(...\)` syntax.

#### PlantUML Diagrams

PlantUML diagrams are automatically detected and rendered:

```asciidoc
[source,plantuml]
----
@startuml
participant User
participant System
User -> System: Login Request
System --> User: Login Response
@enduml
----
```

#### BPMN Diagrams

BPMN (Business Process Model and Notation) diagrams are supported:

```asciidoc
[source,bpmn]
----
<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL">
  <bpmn:process id="Process_1">
    <bpmn:startEvent id="StartEvent_1" name="Start"/>
    <bpmn:task id="Task_1" name="Process Task"/>
    <bpmn:endEvent id="EndEvent_1" name="End"/>
  </bpmn:process>
</bpmn:definitions>
----
```

#### TikZ Diagrams

TikZ diagrams for mathematical illustrations:

```asciidoc
[source,tikz]
----
\begin{tikzpicture}
  \draw[thick,red] (0,0) circle (1cm);
  \draw[thick,blue] (2,0) rectangle (3,1);
\end{tikzpicture}
----
```

### Rendering Features

- **Automatic Detection**: Content types are automatically detected based on syntax
- **Fallback Display**: If rendering fails, the original source code is displayed
- **Source Code**: Click "Show source" to view the original code
- **Responsive Design**: All rendered content is responsive and works on mobile devices

For more information on AsciiDoc, see the [AsciiDoc documentation](https://asciidoc.org/).

---

**Note:**

- The markdown parsers are primarily used for comments, issues, and other user-generated content.
- Publications and wikis are rendered using AsciiDoc for maximum expressiveness and compatibility.
- All URLs are sanitized to remove tracking parameters, and YouTube links are presented in a clean, privacy-friendly format.
- [Here is a test markup file](/tests/integration/markupTestfile.md) that you can use to test out the parser and see how things should be formatted.
