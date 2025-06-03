<script lang="ts">
  import {
    BookOutline,
    CaretLeftOutline,
    CloseOutline,
    GlobeOutline,
  } from "flowbite-svelte-icons";
  import { Button } from "flowbite-svelte";
  import { publicationColumnVisibility } from "$lib/stores";
  import type { NostrEvent } from '$lib/types/nostr';
  import { onDestroy, onMount } from "svelte";
  import { getUserMetadata } from '$lib/utils';

  // Helper function to get tag values from a NostrEvent
  function getMatchingTags(event: NostrEvent, tagName: string): string[][] {
    return event.tags.filter(tag => tag[0] === tagName);
  }

  let { publicationType, indexEvent } = $props<{
    rootId: string;
    publicationType: string;
    indexEvent: NostrEvent;
  }>();

  let title: string = $derived.by(
    () => getMatchingTags(indexEvent, "title")[0]?.[1] ?? "Untitled",
  );
  let author: string = $derived.by(
    () => getMatchingTags(indexEvent, "author")[0]?.[1] ?? "unknown",
  );
  let pubkey: string = $derived.by(
    () => getMatchingTags(indexEvent, "p")[0]?.[1] ?? indexEvent.pubkey,
  );
  let isLeaf: boolean = $derived.by(() => indexEvent.kind === 30041);

  let lastScrollY = $state(0);
  let isVisible = $state(true);

  let displayName = $state<string | undefined>(undefined);

  $effect(() => {
    if (pubkey) {
      getUserMetadata(pubkey).then(profile => {
        displayName = profile.display_name || profile.name;
      });
    }
  });

  // Function to toggle column visibility
  function toggleColumn(column: "toc" | "blog" | "inner" | "discussion") {
    publicationColumnVisibility.update((current) => {
      const newValue = !current[column];
      const updated = { ...current, [column]: newValue };

      if (window.innerWidth < 1400 && column === "blog" && newValue) {
        updated.discussion = false;
      }

      return updated;
    });
  }

  function shouldShowBack() {
    const vis = $publicationColumnVisibility;
    return ["discussion", "toc", "inner"].some(
      (key) => vis[key as keyof typeof vis],
    );
  }

  function backToMain() {
    publicationColumnVisibility.update((current) => {
      const updated = { ...current };

      // if current is 'inner', just go back to blog
      if (current.inner && !(current.discussion || current.toc)) {
        updated.inner = false;
        updated.blog = true;
        return updated;
      }

      updated.discussion = false;
      updated.toc = false;

      if (publicationType === "blog") {
        updated.inner = true;
        updated.blog = false;
      } else {
        updated.main = true;
      }

      return updated;
    });
  }

  function backToBlog() {
    publicationColumnVisibility.update((current) => {
      const updated = { ...current };
      updated.inner = false;
      updated.discussion = false;
      updated.blog = true;
      return updated;
    });
  }

  function handleScroll() {
    if (window.innerWidth < 768) {
      const currentScrollY = window.scrollY;

      // Hide on scroll down
      if (currentScrollY > lastScrollY && currentScrollY > 50) {
        isVisible = false;
      }
      // Show on scroll up
      else if (currentScrollY < lastScrollY) {
        isVisible = true;
      }

      lastScrollY = currentScrollY;
    }
  }

  let unsubscribe: () => void;
  onMount(() => {
    window.addEventListener("scroll", handleScroll);
    unsubscribe = publicationColumnVisibility.subscribe(() => {
      isVisible = true; // show navbar when store changes
    });
  });

  onDestroy(() => {
    window.removeEventListener("scroll", handleScroll);
    unsubscribe?.();
  });
</script>

<style>
  /* Add your styles here */
</style>

<div class="flex flex-col space-y-4">
  <!-- Component content -->
</div> 