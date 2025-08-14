<script lang="ts">
  import { onMount } from 'svelte';
  import type { TocItem } from './toc-utils';
  import { ATocNode } from "$lib/a";

  let {
    items = [] as TocItem[],
    activeId = null as string | null,
    collapsible = true,
    expandDepth = 1,
    class: className = '',
    onnavigate = undefined as undefined | ((href: string) => void)
  } = $props();

  let expanded = $state(new Set<string>());
  let parentOf = new Map<string, string | null>();

  function mapParents(list: TocItem[], parent: string | null = null) {
    for (const it of list) {
      parentOf.set(it.id, parent);
      if (it.children?.length) mapParents(it.children, it.id);
    }
  }

  function initExpansion(list: TocItem[], depth = 0) {
    for (const it of list) {
      if (depth < expandDepth) expanded.add(it.id);
      if (it.children?.length) initExpansion(it.children, depth + 1);
    }
    expanded = new Set(expanded);
  }

  function expandAncestors(id: string | null) {
    if (!id) return;
    let cur: string | null | undefined = id;
    while (cur) {
      expanded.add(cur);
      cur = parentOf.get(cur) ?? null;
    }
    expanded = new Set(expanded);
  }

  onMount(() => {
    initExpansion(items, 0);
    expandAncestors(activeId);
    if (activeId) {
      const el = document.querySelector(`[data-toc-id="${activeId}"]`);
      if (el instanceof HTMLElement) el.scrollIntoView({ block: 'nearest' });
    }
  });

  function toggle(id: string) {
    if (!collapsible) return;
    if (expanded.has(id)) expanded.delete(id);
    else expanded.add(id);
    expanded = new Set(expanded);
  }

  const pad = (depth: number) => `padding-left: calc(var(--space-4) * ${Math.max(depth, 0)})`;
  const onNavigate = (href: string) => onnavigate?.(href);

</script>

<nav aria-label="Table of contents" class={`text-sm ${className}`}>
  <ul class="space-y-1 max-h-[calc(100vh-6rem)] overflow-auto pr-1">
    {#each items as item (item.id)}
      <ATocNode {item} depth={0} {activeId} {collapsible} {expanded} {toggle} {pad} {onNavigate} />
    {/each}
  </ul>
</nav>
