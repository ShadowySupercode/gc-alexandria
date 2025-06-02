<script lang="ts">
  import { Alert } from "flowbite-svelte";
  import { HammerSolid } from "flowbite-svelte-icons";
  import PublicationFeed from "$lib/components/PublicationFeed.svelte";

  let searchQuery = $state("");

</script>

<Alert
  rounded={false}
  id="alert-experimental"
  class="border-t-4 border-primary-500 text-gray-900 dark:text-gray-100 dark:border-primary-500 flex justify-left mb-2"
>
  <HammerSolid class="mr-2 h-5 w-5 text-primary-500 dark:text-primary-500" />
  <span class="font-medium">
    Pardon our dust! The publication view is currently using an experimental
    loader, and may be unstable.
  </span>
</Alert>

<main class="leather flex flex-col flex-grow-0 space-y-4 p-4">
  <PublicationFeed
    {searchQuery}
  />
</main>
