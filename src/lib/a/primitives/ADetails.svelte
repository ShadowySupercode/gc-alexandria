<script lang="ts">
  import { showTech } from '$lib/stores/techStore';
  let { summary = '', tech = false, defaultOpen = false, forceHide = false, class: className = '' } = $props();
  let open = $derived(defaultOpen);
  $effect(() => { if (tech && !$showTech) open = false; });
  function onToggle(e: Event){ const el = e.currentTarget as HTMLDetailsElement; open = el.open; }
</script>
<details open={open} ontoggle={onToggle} class={`group rounded-lg border border-muted/20 bg-surface ${className}`} data-kind={tech ? 'tech':'general'}>
  <summary class="flex items-center gap-2 cursor-pointer list-none px-3 py-2 rounded-lg select-none hover:bg-primary/10">
    <svg class={`h-4 w-4 transition-transform ${open ? 'rotate-90':''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>
    <span class="font-medium">{summary}</span>
    {#if tech}<span class="ml-2 text-[10px] uppercase tracking-wide rounded px-1.5 py-0.5 border border-primary/30 text-primary bg-primary/5">Technical</span>{/if}
    <span class="ml-auto text-xs opacity-60 group-open:opacity-50">{open ? 'Hide':'Show'}</span>
  </summary>
  {#if !(tech && !$showTech && forceHide)}<div class="px-3 pb-3 pt-1 text-[0.95rem] leading-6"><slot /></div>{/if}
</details>
