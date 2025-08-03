<script lang="ts">
  import Publication from "$lib/components/publications/Publication.svelte";
  import type { PageProps } from "./$types";
  import { onDestroy, onMount, setContext } from "svelte";
  import Processor from "asciidoctor";
  import ArticleNav from "$components/util/ArticleNav.svelte";
  import { SveltePublicationTree } from "$lib/components/publications/svelte_publication_tree.svelte";
  import { TableOfContents } from "$lib/components/publications/table_of_contents.svelte";
  import { page } from "$app/state";
  import { goto } from "$app/navigation";
  import { createNDKEvent } from "$lib/utils/nostrUtils";

  let { data }: PageProps = $props();

  // data.indexEvent can be null from server-side rendering
  // We need to handle this case properly
  // AI-NOTE: Always create NDK event since we now ensure NDK is available
  console.debug('[Publication] data.indexEvent:', data.indexEvent);
  console.debug('[Publication] data.ndk:', data.ndk);
  
  const indexEvent = data.indexEvent && data.ndk 
    ? createNDKEvent(data.ndk, data.indexEvent) 
    : null; // No event if no NDK or no event data
  
  console.debug('[Publication] indexEvent created:', indexEvent);

  // Only create publication tree if we have a valid index event
  const publicationTree = indexEvent ? new SveltePublicationTree(indexEvent, data.ndk) : null;
  const toc = indexEvent ? new TableOfContents(
    indexEvent.tagAddress(),
    publicationTree!,
    page.url.pathname ?? "",
  ) : null;

  setContext("publicationTree", publicationTree);
  setContext("toc", toc);
  setContext("asciidoctor", Processor());

  // Only set up bookmark handling if we have a valid publication tree
  if (publicationTree && indexEvent) {
    publicationTree.onBookmarkMoved((address) => {
      goto(`#${address}`, {
        replaceState: true,
      });

      // TODO: Extract IndexedDB interaction to a service layer.
      // Store bookmark in IndexedDB
      const db = indexedDB.open("alexandria", 1);
      db.onupgradeneeded = () => {
        const objectStore = db.result.createObjectStore("bookmarks", {
          keyPath: "key",
        });
      };

      db.onsuccess = () => {
        const transaction = db.result.transaction(["bookmarks"], "readwrite");
        const store = transaction.objectStore("bookmarks");
        const bookmarkKey = `${indexEvent.tagAddress()}`;
        store.put({ key: bookmarkKey, address });
      };
    });
  }

  onMount(() => {
    // Only handle bookmarks if we have valid components
    if (!publicationTree || !indexEvent) return;

    // TODO: Extract IndexedDB interaction to a service layer.
    // Read bookmark from IndexedDB
    const db = indexedDB.open("alexandria", 1);
    db.onupgradeneeded = () => {
      const objectStore = db.result.createObjectStore("bookmarks", {
        keyPath: "key",
      });
    };

    db.onsuccess = () => {
      const transaction = db.result.transaction(["bookmarks"], "readonly");
      const store = transaction.objectStore("bookmarks");
      const bookmarkKey = `${indexEvent.tagAddress()}`;
      const request = store.get(bookmarkKey);

      request.onsuccess = () => {
        if (request.result?.address) {
          // Set the bookmark in the publication tree
          publicationTree.setBookmark(request.result.address);

          // Jump to the bookmarked element
          goto(`#${request.result.address}`, {
            replaceState: true,
          });
        }
      };
    };
  });

  onDestroy(() => {
    // TODO: Clean up resources if needed
  });
</script>

{#if indexEvent && data.indexEvent}
  {@const debugInfo = `indexEvent: ${!!indexEvent}, data.indexEvent: ${!!data.indexEvent}`}
  {@const debugElement = console.debug('[Publication] Rendering publication with:', debugInfo)}
  <ArticleNav
    publicationType={data.publicationType}
    rootId={data.indexEvent.id}
    indexEvent={indexEvent}
  />

  <main class="publication {data.publicationType}">
    <Publication
      rootAddress={indexEvent.tagAddress()}
      publicationType={data.publicationType}
      indexEvent={indexEvent}
    />
  </main>
{:else}
  {@const debugInfo = `indexEvent: ${!!indexEvent}, data.indexEvent: ${!!data.indexEvent}`}
  {@const debugElement = console.debug('[Publication] NOT rendering publication with:', debugInfo)}
  <main class="publication">
    <div class="flex items-center justify-center min-h-screen">
      <p class="text-gray-600 dark:text-gray-400">Loading publication...</p>
    </div>
  </main>
{/if} 