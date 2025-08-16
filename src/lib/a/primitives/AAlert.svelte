<script>
  import { Alert } from "flowbite-svelte";

  let { color, children } = $props();
</script>

<Alert {color} class="alert-leather mb-4">
  {@render children()}
</Alert>