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

  const indexEvent = createNDKEvent(data.ndk, data.indexEvent);
  const publicationTree = new SveltePublicationTree(indexEvent, data.ndk);
  const toc = new TableOfContents(
    indexEvent.tagAddress(),
    publicationTree,
    page.url.pathname ?? "",
  );

  setContext("publicationTree", publicationTree);
  setContext("toc", toc);
  setContext("asciidoctor", Processor());

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

  onMount(() => {
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