# Wiki Tags ('w') vs D-Tags: Conceptual Distinction

## AsciiDoc Wiki Link Syntax

In AsciiDoc content, wiki links are created using double-bracket notation:

```asciidoc
The concept of [[Knowledge Graphs]] enables semantic relationships...
```

This syntax automatically generates a 'w' tag during conversion:

```python
["w", "knowledge-graphs", "Knowledge Graphs"]
```

## Semantic Difference: Forward vs Backward Links

### D-Tags: Forward Links (Explicit Definitions)

**Search Direction**: "Find events ABOUT this specific concept"

```python
["d", "knowledge-graphs"]
```

**Semantics**:

- The d-tag **IS** the subject/identity of the event
- Represents an **explicit definition** or primary topic
- Forward declaration: "This event defines/is about knowledge-graphs"
- Search query: "Show me THE event that explicitly defines 'knowledge-graphs'"
- Expectation: A single canonical definition event per pubkey

**Use Case**: Locating the authoritative content that defines a concept

### W-Tags: Backward Links (Implicit References)

**Search Direction**: "Which events MENTION this keyword?"

```python
["w", "knowledge-graphs", "Knowledge Graphs"]
```

**Semantics**:

- The w-tag **REFERENCES** a concept within the content
- Represents an **implicit mention** or contextual usage
- Backward reference: "This event mentions/relates to knowledge-graphs"
- Search query: "Show me ALL events that discuss 'knowledge-graphs' in their
  text"
- Expectation: Multiple content events that reference the term

**Use Case**: Discovering all content that relates to or discusses a concept

## Structural Opacity Comparison

### D-Tags: Transparent Structure

```
Event with d-tag "knowledge-graphs"
└── Title: "Knowledge Graphs"
└── Content: [Explicit definition and explanation]
└── Purpose: THIS IS the knowledge-graphs event
```

### W-Tags: Opaque Structure

```
Event mentioning "knowledge-graphs"
├── Title: "Semantic Web Technologies"
├── Content: "...uses [[Knowledge Graphs]] for..."
└── Purpose: This event DISCUSSES knowledge-graphs (among other things)
```

**Opacity**: You retrieve content events that regard the topic without knowing:

- Whether they define it
- How central it is to the event
- What relationship context it appears in

## Query Pattern Examples

### Finding Definitions (D-Tag Query)

```bash
# Find THE definition event for "knowledge-graphs"
nak req -k 30041 --tag d=knowledge-graphs
```

**Result**: The specific event with d="knowledge-graphs" (if it exists)

### Finding References (W-Tag Query)

```bash
# Find ALL events that mention "knowledge-graphs"
nak req -k 30041 --tag w=knowledge-graphs
```

**Result**: Any content event containing `[[Knowledge Graphs]]` wikilinks

## Analogy

**D-Tag**: Like a book's ISBN - uniquely identifies and locates a specific work

**W-Tag**: Like a book's index entries - shows where a term appears across many
works

## Implementation Notes

From your codebase (`nkbip_converter.py:327-329`):

```python
# Extract wiki links and create 'w' tags
wiki_links = extract_wiki_links(content)
for wiki_term in wiki_links:
    tags.append(["w", clean_tag(wiki_term), wiki_term])
```

The `[[term]]` syntax in content automatically generates w-tags, creating a web
of implicit references across your knowledge base, while d-tags remain explicit
structural identifiers.
