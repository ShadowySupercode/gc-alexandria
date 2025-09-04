<script lang="ts">
  import { ChevronDownOutline } from "flowbite-svelte-icons";
  import { Button, Dropdown, DropdownGroup, Radio } from "flowbite-svelte";
  import { onMount } from "svelte";
  import { setTheme, theme as themeStore } from "$lib/stores/themeStore";

  let theme = $state<string>("light");

  onMount(() => {
    return themeStore.subscribe((v) => (theme = String(v)));
  });

  // Persist and apply whenever the selection changes
  $effect(() => {
    setTheme(theme);
  });
</script>

<Button>
  Theme {theme}<ChevronDownOutline class="ms-2 inline h-6 w-6" />
</Button>
<Dropdown simple class="w-44">
  <DropdownGroup class="space-y-3 p-3">
    <li>
      <Radio name="group1" bind:group={theme} value="light">Light</Radio>
    </li>
    <li>
      <Radio name="group1" bind:group={theme} value="ocean">Ocean</Radio>
    </li>
    <li>
      <Radio name="group1" bind:group={theme} value="forrest">Forrest</Radio>
    </li>
  </DropdownGroup>
</Dropdown>
