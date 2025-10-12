<script lang="ts">
  import Publication from "$lib/components/publications/Publication.svelte";
  import type { PageProps } from "./$types";
  import { onDestroy, onMount, setContext } from "svelte";
  import Processor from "asciidoctor";
  import { SveltePublicationTree } from "$lib/components/publications/svelte_publication_tree.svelte";
  import { TableOfContents } from "$lib/components/publications/table_of_contents.svelte";
  import { page } from "$app/state";
  import { goto } from "$app/navigation";
  import { createNDKEvent } from "$lib/utils/nostrUtils";
  import { browser } from "$app/environment";
  import {
    fetchEventByDTag,
    fetchEventById,
    fetchEventByNaddr,
    fetchEventByNevent,
  } from "$lib/utils/websocket_utils.ts";
  import type { NostrEvent } from "$lib/utils/websocket_utils.ts";
  import type { NDKEvent } from "@nostr-dev-kit/ndk";

  let { data }: PageProps = $props();

  // AI-NOTE: Handle client-side loading when event is not available during SSR
  let indexEvent = $state<NDKEvent | null>(null);
  let loading = $state(false);
  let error = $state<string | null>(null);
  let publicationTree = $state<SveltePublicationTree | null>(null);
  let toc = $state<TableOfContents | null>(null);
  let initialized = $state(false);

  // AI-NOTE: Initialize with server-side data if available
  $effect(() => {
    if (initialized) return; // Prevent re-initialization
    
    if (data.indexEvent && data.ndk) {
      const serverEvent = createNDKEvent(data.ndk, data.indexEvent);
      indexEvent = serverEvent;
      initializePublicationComponents(serverEvent);
      initialized = true;
    } else if (browser && data.identifierInfo && !loading) {
      // AI-NOTE: Client-side loading when server-side data is not available
      loadEventClientSide();
    }
  });

  async function loadEventClientSide() {
    if (!browser || !data.identifierInfo || loading) return;

    loading = true;
    error = null;

    try {
      const { type, identifier } = data.identifierInfo;
      let fetchedEvent: NostrEvent | null = null;

      // Handle different identifier types
      switch (type) {
        case "id":
          fetchedEvent = await fetchEventById(identifier);
          break;
        case "d":
          fetchedEvent = await fetchEventByDTag(identifier);
          break;
        case "naddr":
          fetchedEvent = await fetchEventByNaddr(identifier);
          break;
        case "nevent":
          fetchedEvent = await fetchEventByNevent(identifier);
          break;
        default:
          throw new Error(`Unsupported identifier type: ${type}`);
      }

      if (fetchedEvent && data.ndk) {
        const clientEvent = createNDKEvent(data.ndk, fetchedEvent);
        indexEvent = clientEvent;
        initializePublicationComponents(clientEvent);
        initialized = true;
      } else {
        throw new Error("Failed to fetch event from relays");
      }
    } catch (err) {
      console.error("[Publication] Client-side loading failed:", err);
      error = err instanceof Error ? err.message : "Failed to load publication";
    } finally {
      loading = false;
    }
  }

  function initializePublicationComponents(event: NDKEvent) {
    if (!data.ndk) return;
    
    console.log("[Publication] Initializing publication components for event:", event.tagAddress());
    
    publicationTree = new SveltePublicationTree(event, data.ndk);
    toc = new TableOfContents(
      event.tagAddress(),
      publicationTree,
      page.url.pathname ?? "",
    );

    // Set up bookmark handling
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
        const bookmarkKey = `${event.tagAddress()}`;
        store.put({ key: bookmarkKey, address });
      };
    });
  }

  // AI-NOTE: Set context values reactively to avoid capturing initial null values
  $effect(() => {
    if (publicationTree) {
      setContext("publicationTree", publicationTree);
    }
  });

  $effect(() => {
    if (toc) {
      setContext("toc", toc);
    }
  });

  setContext("asciidoctor", Processor());

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
      const bookmarkKey = `${indexEvent!.tagAddress()}`;
      const request = store.get(bookmarkKey);

      request.onsuccess = () => {
        if (request.result?.address && publicationTree && indexEvent) {
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

{#if indexEvent && publicationTree && toc}
  {@const debugInfo = `indexEvent: ${!!indexEvent}, publicationTree: ${!!publicationTree}, toc: ${!!toc}`}
  {@const debugElement = console.debug('[Publication] Rendering publication with:', debugInfo)}
    <Publication
      rootAddress={indexEvent.tagAddress()}
      publicationType={data.publicationType}
      indexEvent={indexEvent}
      publicationTree={publicationTree}
      toc={toc}
    />
{:else if loading}
  <main class="publication">
    <div class="flex items-center justify-center min-h-screen">
      <p class="text-gray-600 dark:text-gray-400">Loading publication...</p>
    </div>
  </main>
{:else if error}
  <main class="publication">
    <div class="flex items-center justify-center min-h-screen">
      <div class="text-center">
        <p class="text-red-600 dark:text-red-400 mb-4">Failed to load publication</p>
        <p class="text-gray-600 dark:text-gray-400 mb-4">{error}</p>
        <button 
          class="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          onclick={loadEventClientSide}
        >
          Try Again
        </button>
      </div>
    </div>
  </main>
{:else}
  {@const debugInfo = `indexEvent: ${!!indexEvent}, publicationTree: ${!!publicationTree}, toc: ${!!toc}`}
  {@const debugElement = console.debug('[Publication] NOT rendering publication with:', debugInfo)}
  <main class="publication">
    <div class="flex items-center justify-center min-h-screen">
      <p class="text-gray-600 dark:text-gray-400">Loading publication...</p>
    </div>
  </main>
{/if}
