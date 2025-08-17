<script lang="ts">
  import { Alert } from "flowbite-svelte";

  let { color, dismissable, children } = $props<{
    color?: string;
    dismissable?: boolean;
    children?: any;
  }>();
</script>

<Alert {color} {dismissable} class="alert-leather mb-4">
  {@render children()}
</Alert>