<script lang="ts">
  import type { NavItem, UserInfo } from './nav-types';
  import { onMount } from 'svelte';
  let { user = null as UserInfo | null, items = [] as NavItem[], onselect = undefined as undefined | ((i:NavItem)=>void) } = $props();
  let open = $state(false); let btn: HTMLButtonElement;
  function onDoc(e: MouseEvent){ if (!open) return; if (!(e.target instanceof Node)) return; if (!btn?.parentElement?.contains(e.target)) open = false; }
  onMount(()=>{ document.addEventListener('mousedown', onDoc); return () => document.removeEventListener('mousedown', onDoc); });
</script>
<div class="relative">
  <button bind:this={btn} class="inline-flex items-center gap-2 h-9 px-2 rounded-md border border-muted/30 hover:bg-primary/10" aria-haspopup="menu" aria-expanded={open} onclick={() => (open = !open)}>
    <img src={user?.avatarUrl || 'https://via.placeholder.com/24'} alt="" class="h-6 w-6 rounded-full object-cover" />
    <span class="hidden sm:block text-sm">{user?.name || 'Account'}</span>
    <svg class="h-4 w-4 opacity-70" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
  </button>
  {#if open}
    <div class="absolute right-0 mt-1 min-w-[14rem] rounded-lg border border-muted/20 bg-surface shadow-lg py-1 z-50">
      {#if user}
        <div class="px-3 py-2 text-sm">
          <div class="font-medium">{user.name}</div>
        </div>
        <div class="my-1 h-px bg-muted/20" ></div>
      {/if}
      <ul>
        {#each items as it}
          {#if it.divider}
            <li class="my-1 h-px bg-muted/20"></li>
          {:else}
            <li>
              <a href={it.href || '#'} target={it.external ? '_blank':undefined} rel={it.external ? 'noreferrer':undefined}
                 class="flex items-center gap-2 px-3 py-2 text-sm hover:bg-primary/10"
                 onclick={(e)=>{ if (!it.href || it.href==='#'){ e.preventDefault(); open=false; onselect?.(it); } else { open=false; } }}>
                {it.title}
                {#if it.badge}<span class="ml-auto text-[10px] rounded px-1.5 py-0.5 border border-primary/30 text-primary bg-primary/5">{it.badge}</span>{/if}
              </a>
            </li>
          {/if}
        {/each}
      </ul>
    </div>
  {/if}
</div>
