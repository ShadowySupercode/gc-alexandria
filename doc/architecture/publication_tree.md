# Publication Tree

The Publication Tree forms a critical piece of Alexandria's core feature set: structured publications.  It represents publications as an unbalanced N-ary tree in which each Node is a Nostr event and edges are formed by `a` or `e` tag references in kind `30040` index events.

## Lazy Loading

Alexandria's structured publications are arbitrarily large, and may in practice become much larger than the in-app publication editor allows due to the composability of `30040` event trees. Very large publications could take a prohibitively long time to download and render on certain networks or client devices.

To resolve this problem, the Publication Tree is lazy-loading. Only the root node needs to be fetched at initialization. Additional nodes may be fetched as needed.

### Lazy Load Strategies

Lazy loading is typically realized in one of two modes:

- **Linear Mode:** Nodes in the tree are discovered and loaded in an in-order, depth-first traversal. This mode is used to reveal more of a publication when the user scrolls down a page.
- **Seek Mode:** A specific node is discovered via a depth-first search. Nodes encountered during the search are loaded into the tree. This mode is used to bring the user to a saved bookmark within a publication.

### Lazy Load Praxis

Two of the realizations of the lazy-loading pattern are described above in the description of the two strategies. More realizations of this pattern are possible, however.

- **Parallel Subtree Loading:** After sufficient nodes in the tree are loaded and rendered to give the user a usable view, it may still be desirable to load the rest of the tree into memory so it is on hand when the user requires it. Web Workers may be used to traverse multiple subtrees in parallel, loading the retrieved events into the data structure when each subtree has been exhausted.
- **Full Discovery of Partial Events:** If relays support the retrieval of partial event data—e.g., just event IDs and certain tags—the Publication Tree may be used or modified so as to load the full tree with partial data in each node. Partial event data may be used, for example, to render a table of contents. Complete event data may be retrieved in the background, or when the full event data is needed for rendering.

## Usage with Parsers

This project uses the Asciidoctor.js library to parse AsciiDoc content in Alexandria's publications. Asciidoctor provides an extensions API to allow programs to plug into various steps in the parsing process.

In the parsing process, Asciidoctor produces an abstract syntax tree (AST) from the provided AsciiDoc text. A [tree processor extension](https://docs.asciidoctor.org/asciidoctor.js/latest/extend/extensions/tree-processor/) may be used to side-load publication sections into an instance of the Publication Tree at parse time.
