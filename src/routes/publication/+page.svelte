<script lang="ts">
  import Publication from "$lib/components/publications/Publication.svelte";
  import { TextPlaceholder } from "flowbite-svelte";
  import type { PageProps } from "./$types";
  import { onDestroy, onMount, setContext } from "svelte";
  import Processor from "asciidoctor";
  import ArticleNav from "$components/util/ArticleNav.svelte";
  import { SveltePublicationTree } from "$lib/components/publications/svelte_publication_tree.svelte";
  import { TableOfContents } from "$lib/components/publications/table_of_contents.svelte";
  import { page } from "$app/state";
  import { goto } from "$app/navigation";

  let { data }: PageProps = $props();

  const publicationTree = new SveltePublicationTree(data.indexEvent, data.ndk);
  const toc = new TableOfContents(data.indexEvent.tagAddress(), publicationTree, page.url.pathname ?? "");

  setContext("publicationTree", publicationTree);
  setContext("toc", toc);
  setContext("asciidoctor", Processor());

  // Get publication metadata for OpenGraph tags
  let title = $derived(
    data.indexEvent?.getMatchingTags("title")[0]?.[1] ||
    data.parser?.getIndexTitle(data.parser?.getRootIndexId()) ||
    "Alexandria Publication",
  );
  let currentUrl = $derived(`${page.url.origin}${page.url.pathname}${page.url.search}`);

  // Get image and summary from the event tags if available
  // If image unavailable, use the Alexandria default pic.
  let image = $derived(
    data.indexEvent?.getMatchingTags("image")[0]?.[1] ||
      "/screenshots/old_books.jpg",
  );
  let summary = $derived(
    data.indexEvent?.getMatchingTags("summary")[0]?.[1] ||
    "Alexandria is a digital library, utilizing Nostr events for curated publications and wiki pages.",
  );

  publicationTree.onBookmarkMoved(address => {
    goto(`#${address}`, {
      replaceState: true,
    });

    // TODO: Extract IndexedDB interaction to a service layer.
    // Store bookmark in IndexedDB
    const db = indexedDB.open('alexandria', 1);
    db.onupgradeneeded = () => {
      const objectStore = db.result.createObjectStore('bookmarks', { keyPath: 'key' });
    };
    
    db.onsuccess = () => {
      const transaction = db.result.transaction(['bookmarks'], 'readwrite');
      const store = transaction.objectStore('bookmarks');
      const bookmarkKey = `${data.indexEvent.tagAddress()}`;
      store.put({ key: bookmarkKey, address });
    };
  });

  onMount(() => {
    // TODO: Extract IndexedDB interaction to a service layer.
    // Read bookmark from IndexedDB
    const db = indexedDB.open('alexandria', 1);
    db.onupgradeneeded = () => {
      const objectStore = db.result.createObjectStore('bookmarks', { keyPath: 'key' });
    };
    
    db.onsuccess = () => {
      const transaction = db.result.transaction(['bookmarks'], 'readonly');
      const store = transaction.objectStore('bookmarks');
      const bookmarkKey = `${data.indexEvent.tagAddress()}`;
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

  onDestroy(() => data.parser.reset());
</script>

<svelte:head>
  <!-- Basic meta tags -->
  <title>{title}</title>
  <meta name="description" content={summary} />

  <!-- OpenGraph meta tags -->
  <meta property="og:title" content={title} />
  <meta property="og:description" content={summary} />
  <meta property="og:url" content={currentUrl} />
  <meta property="og:type" content="article" />
  <meta property="og:site_name" content="Alexandria" />
  <meta property="og:image" content={image} />

  <!-- Twitter Card meta tags -->
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content={title} />
  <meta name="twitter:description" content={summary} />
  <meta name="twitter:image" content={image} />
</svelte:head>

<ArticleNav
  publicationType={data.publicationType}
  rootId={data.parser.getRootIndexId()}
  indexEvent={data.indexEvent}
/>

<main class="publication {data.publicationType}">
  <Publication
    rootAddress={data.indexEvent.tagAddress()}
    publicationType={data.publicationType}
    indexEvent={data.indexEvent}
  />
</main>
