# Publication Route Refactoring Plan

This document outlines the plan to refactor the publication routes to improve SSR, add server-side metadata, and switch to path-based routing.

## 1. New Route Structure

The current query-based routing (`/publication?id=...`) will be replaced with a path-based structure: `/publication/[type]/[identifier]`.

### Supported Identifier Types:
-   `id`: A raw hex event ID.
-   `d`: A `d` tag identifier from a replaceable event.
-   `naddr`: A bech32-encoded `naddr` string for a replaceable event.
-   `nevent`: A bech32-encoded `nevent` string.

### Actions:

1.  **Create new route directory:** `src/routes/publication/[type]/[identifier]`.
2.  **Move `+page.svelte`:** Relocate the content of the current `src/routes/publication/+page.svelte` to `src/routes/publication/[type]/[identifier]/+page.svelte`.
3.  **Preserve old query-based route:** Instead of deleting old files, create `src/routes/publication/+page.server.ts` at the root of `src/routes/publication` to parse `?id=` and `?d=` query parameters and delegate to the new path-based routes.
4.  **Review base route:** Ensure `/publication` either renders the main feed (via `PublicationFeed.svelte`) or redirects to `/start`; keep the existing `+page.svelte` in place for backward compatibility.

## 2. Server-Side Rendering (SSR) and Data Loading

We will use SvelteKit's `load` functions to fetch data on the server.

### Actions:

1.  **Create `+page.server.ts`:** Inside `src/routes/publication/[type]/[identifier]/`, create a `+page.server.ts` file.
2.  **Implement `load` function:**
    -   The `load` function will receive `params` containing `type` and `identifier`.
    -   It will use these params to fetch the publication's root event. The logic will need to handle the different identifier types:
        -   If `type` is `id`, use the `identifier` as a hex event ID.
        -   If `type` is `d`, use the `identifier` to search for an event with a matching `d` tag; when multiple events share the same tag, select the event with the latest `created_at` timestamp. // AI-NOTE: choose latest for now; future logic may change.
        -   If `type` is `naddr` or `nevent`, decode the `identifier` using `nip19.decode()` (from `nostr-tools`) and construct the appropriate filter. Add corresponding `naddrDecode` and `neventDecode` functions to `src/lib/utils.ts` to centralize NIP-19 logic.
    -   The fetched event will be returned as `data` to the `+page.svelte` component.
    -   Handle cases where the event is not found by throwing a 404 error using `@sveltejs/kit/error`.

## 3. Server-Side Metadata

Publication-specific metadata will be rendered on the server for better link previews.

### Actions:

1.  **Create `+layout.server.ts`:** Inside `src/routes/publication/[type]/[identifier]/`, create a `+layout.server.ts`. Its `load` function will be very similar to the one in `+page.server.ts`. It will fetch the root event and return the necessary data for metadata (title, summary, image URL).
2.  **Create `+layout.svelte`:** Inside `src/routes/publication/[type]/[identifier]/`, create a `+layout.svelte`.
3.  **Implement metadata:**
    -   The layout will receive `data` from its `load` function.
    -   It will contain a `<svelte:head>` block.
    -   Inside `<svelte:head>`, render `<title>` and `<meta>` tags (OpenGraph, Twitter Cards) using properties from the loaded `data`.
    -   Use `{@render children()}` in `+layout.svelte` to display the page content.
    -   Refer to https://web.dev/learn/html/metadata/#officially_defined_meta_tags for a compilation of recommended meta tags.

## 4. Handling Authentication

For publications requiring authentication, we need to avoid full SSR of content while still providing a good user experience.

### Actions:

-   Skip authentication/authorization handling in this refactor; it will be addressed separately.
-   If the `indexEvent` cannot be fetched, display a user-friendly error message in `+page.svelte` indicating the publication cannot be loaded. 