<script lang="ts">
  import { Alert } from "flowbite-svelte";

  let { color, dismissable, children, title, classes } = $props<{
    color?: string;
    dismissable?: boolean;
    children?: any;
    title?: any;
    classes?: string;
  }>();
</script>

<Alert {color} {dismissable} class="alert-leather mb-4 {classes}">
  {#if title}
    <div class="flex">
      <span class="text-lg font-medium">{@render title()}</span>
    </div>
  {/if}
  {@render children()}
</Alert>
