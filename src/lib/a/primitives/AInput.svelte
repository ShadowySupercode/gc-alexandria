<script lang="ts">
  let { value = "", class: className = "", placeholder = "" } = $props();
</script>

<input
  class={`w-full h-10 px-3 rounded-md border border-muted/30 bg-surface text-text placeholder:opacity-60 focus:outline-none focus:ring-2 focus:ring-primary/40 ${className}`}
  bind:value
  {placeholder}
/>
