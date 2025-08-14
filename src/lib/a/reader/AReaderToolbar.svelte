<script lang="ts">
  import { theme, setTheme } from '$lib/theme/theme-store';
  import AButton from '../primitives/AButton.svelte';
  let size = 16;
  let line = 1.7;
  function applySize() {
    document.documentElement.style.fontSize = size + 'px';
  }
  function incSize() {
    size = Math.min(22, size + 1);
    applySize();
  }
  function decSize() {
    size = Math.max(14, size - 1);
    applySize();
  }
  function incLine() {
    line = Math.min(2, Math.round((line + 0.05) * 100) / 100);
    document.documentElement.style.setProperty('--leading-reading', String(line));
  }
  function decLine() {
    line = Math.max(1.4, Math.round((line - 0.05) * 100) / 100);
    document.documentElement.style.setProperty('--leading-reading', String(line));
  }
</script>

<div class="flex items-center gap-3 p-2 border-b border-muted/20 bg-surface sticky top-0 z-10">
  <label class="text-sm opacity-70">Theme</label>
  <select
    class="h-9 px-2 rounded-md border border-muted/30 bg-surface"
    bind:value={$theme}
    on:change={(e) => setTheme((e.target as HTMLSelectElement).value)}
  >
    <option value="light">Light</option>
    <option value="dark">Dark</option>
    <option value="sepia">Sepia</option>
  </select>
  <div class="mx-2 h-6 w-px bg-muted/30" />
  <label class="text-sm opacity-70">Text size</label>
  <AButton variant="outline" size="sm" on:click={decSize}>−</AButton>
  <span class="text-sm w-8 text-center">{size}px</span>
  <AButton variant="outline" size="sm" on:click={incSize}>+</AButton>
  <div class="mx-2 h-6 w-px bg-muted/30" />
  <label class="text-sm opacity-70">Line height</label>
  <AButton variant="outline" size="sm" on:click={decLine}>−</AButton>
  <span class="text-sm w-10 text-center">{line}</span>
  <AButton variant="outline" size="sm" on:click={incLine}>+</AButton>
</div>
