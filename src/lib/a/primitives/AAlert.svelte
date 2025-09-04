<script lang="ts">
  import { Alert } from "flowbite-svelte";

  let { color, dismissable, children, title } = $props<{
    color?: string;
    dismissable?: boolean;
    children?: any;
    title?: any;
  }>();
</script>

<Alert {color} {dismissable} class="alert-leather mb-4">
  {#if title}
  <div class="flex">
    <span class="text-lg font-medium">{@render title()}</span>
  </div>
  {/if}
  {@render children()}
</Alert>