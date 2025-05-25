<script lang="ts">
  const { left, right } = $props<{
    left: number|string;
    right: string;
  }>();
</script>

<div class="inline-flex rounded-xl overflow-hidden text-sm">
  <span class="bg-primary-600 text-white px-2 py-1 font-mono">
    {left}
  </span>
  <span class="bg-primary-100 text-primary-800 dark:bg-primary-800 dark:text-highlight px-2 py-1">
    {right}
  </span>
</div>