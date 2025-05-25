<script lang="ts">
  import { publicationColumnVisibility } from "$lib/stores";
  import type { NDKEvent } from "@nostr-dev-kit/ndk";

  type ColumnType = "toc" | "blog" | "inner" | "discussion";

  let { indexEvent } = $props<{
    rootId: any;
    publicationType: string;
    indexEvent: NDKEvent;
  }>();

  let lastScrollY = $state(0);
  let isVisible = $state(true);

  // Add derived value for isVisible based on scroll position
  let isNavVisible = $derived.by(() => {
    if (window.innerWidth >= 768) return true;
    return isVisible;
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
</script>

<!-- Component template here -->

<nav
  class="Navbar navbar-leather flex fixed top-[60px] sm:top-[76px] w-full min-h-[70px] px-2 sm:px-4 py-2.5 z-10 transition-transform duration-300 {isNavVisible
    ? 'translate-y-0'
    : '-translate-y-full'}"
>
  <!-- ... rest of the code ... -->
</nav>
