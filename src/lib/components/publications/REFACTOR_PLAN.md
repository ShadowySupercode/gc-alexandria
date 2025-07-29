# Component Refactoring Plan for Path-Based Routing

This document outlines the necessary changes to Svelte components to support the new path-based routing for publications.

## 1. `PublicationHeader.svelte`

This component generates links to publications and needs to be updated to the new URL format.

### Actions:

1.  **Locate `href` derivation:** Find the `$derived.by` block that computes the `href` constant.
2.  **Update URL structure:** Modify the logic to generate URLs in the format `/publication/[type]/[identifier]`.
    -   If the event has a `d` tag and is a replaceable event (e.g., kind 30040), encode it as an `naddr` and use the URL `/publication/naddr/[naddr]`.
    -   If the event is not replaceable but has an ID (like a kind 30041), encode it as an `nevent` and use the URL `/publication/nevent/[nevent]`.
    -   Use the existing `naddrEncode` and `neventEncode` utilities from `src/lib/utils.ts` to encode identifiers.
    -   If needed, add new `naddrDecode` and `neventDecode` utilities to `src/lib/utils.ts`, leveraging functions from the `nip19` module in the `nostr-tools` package.

## 2. `Publication.svelte`

This component is responsible for rendering the publication content. The primary changes will be in how data is passed to it, rather than in its internal logic.

### Actions:

1.  **Review props:** The component accepts `rootAddress`, `publicationType`, and `indexEvent`. This is good.
2.  **Update parent component:** The new `src/routes/publication/[type]/[identifier]/+page.svelte` will be responsible for providing these props from the data loaded on the server. No direct changes to `Publication.svelte` should be needed unless the data shape from the `load` function requires it. It is expected that the `load` function will provide the `indexEvent` directly.
3.  **Add identifierType prop:** If the rendering logic needs to know the original identifier type (e.g., `id`, `d`, `naddr`, `nevent`), introduce a new `identifierType` prop to `Publication.svelte`.

## 3. General Codebase Audit

Other parts of the application might contain hardcoded links to publications using the old query parameter format.

### Actions:

1.  **Perform a codebase search:** Search for the strings `"publication?id="` and `"publication?d="` to identify any other places where links are constructed.
2.  **Update any found links:** Refactor any discovered instances to use the new `/publication/[type]/[identifier]` format. 