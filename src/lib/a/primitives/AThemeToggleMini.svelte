<script lang="ts">
  import { ChevronDownOutline } from "flowbite-svelte-icons";
  import { Dropdown, DropdownGroup, NavLi, Radio } from "flowbite-svelte";

  let theme = $state('papyrus'); // e.g. 'ocean' or '' for default
  const apply = () => document.documentElement.setAttribute('data-theme', theme);
  $effect(apply);
</script>

<NavLi>
  Theme {theme}<ChevronDownOutline class="text-primary-800 ms-2 inline h-6 w-6 dark:text-white" />
</NavLi>
<Dropdown simple class="w-44">
  <DropdownGroup class="space-y-3 p-3">
    <li>
      <Radio name="group1" bind:group={theme} value="papyrus">Papyrus</Radio>
    </li>
    <li>
      <Radio name="group1" bind:group={theme} value="ocean">Ocean</Radio>
    </li>
    <li>
      <Radio name="group1" bind:group={theme} value="forrest">Forrest</Radio>
    </li>
  </DropdownGroup>
</Dropdown>
