<script lang="ts">
  import type { TocItem } from './toc-utils';
  import TocNode from './ATocNode.svelte';
  let { item, depth = 0, activeId = null as string | null, collapsible = true, expanded, toggle, pad, onNavigate }: { item: TocItem; depth?: number; activeId?: string|null; collapsible?: boolean; expanded: Set<string>; toggle: (id:string)=>void; pad: (depth:number)=>string; onNavigate: (href:string)=>void; } = $props();
  const hasChildren = !!(item.children && item.children.length > 0);
  let isOpen = $derived(expanded.has(item.id));
  let isActive = $derived(activeId === item.id);
</script>
<li>
  <div class="flex items-center gap-1 rounded-md hover:bg-primary/10" style={pad(depth)}>
    {#if collapsible && hasChildren}
      <button class="shrink-0 h-6 w-6 grid place-items-center rounded-md hover:bg-primary/10" aria-label={isOpen?`Collapse ${item.title}`:`Expand ${item.title}`} aria-expanded={isOpen} onclick={() => toggle(item.id)}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class={isOpen ? 'rotate-90 transition-transform' : 'transition-transform'}><path d="M9 18l6-6-6-6" /></svg>
      </button>
    {:else}
      <span class="shrink-0 h-6 w-6" />
    {/if}
    <a href={item.href ?? `#${item.id}`} data-toc-id={item.id}
       class="flex-1 min-w-0 rounded-md px-2 py-1.5 hover:bg-primary/10 focus:outline-none focus:ring-2 focus:ring-primary/40"
       class:text-primary={isActive}
       onclick={() => onNavigate(item.href ?? `#${item.id}`)}>
      <span class="truncate">{item.title}</span>
    </a>
  </div>
  {#if hasChildren}
    <ul id={`sub-${item.id}`} aria-hidden={!isOpen} class={isOpen ? 'mt-1 space-y-1' : 'hidden'}>
      {#each item.children as child (child.id)}
        <TocNode item={child} depth={depth + 1} {activeId} {collapsible} {expanded} {toggle} {pad} {onNavigate} />
      {/each}
    </ul>
  {/if}
</li>
