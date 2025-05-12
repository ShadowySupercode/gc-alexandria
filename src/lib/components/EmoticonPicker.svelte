<script lang="ts">
  import { heroiconEmoticons, unicodeEmojis } from '../utils/emoticons';
  import { createEventDispatcher } from 'svelte';
  import { onMount } from 'svelte';

  const dispatch = createEventDispatcher();
  let search = '';
  let showMore = false;
  let filteredHeroicons = heroiconEmoticons;
  let filteredUnicode = unicodeEmojis;

  function handleSelect(shortcode: string) {
    dispatch('select', { shortcode });
  }

  function filterEmoticons() {
    const s = search.trim().toLowerCase();
    filteredHeroicons = heroiconEmoticons.filter(e =>
      e.name.toLowerCase().includes(s) || e.shortcode.includes(s)
    );
    filteredUnicode = unicodeEmojis.filter(e =>
      e.name.toLowerCase().includes(s) || e.shortcode.includes(s)
    );
  }

  $: filterEmoticons();
</script>

<div class="emoticon-picker bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg shadow-lg p-2 w-72">
  <input
    type="text"
    class="emoticon-search mb-2 w-full px-2 py-1 rounded border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm"
    placeholder="Search emoticons..."
    bind:value={search}
    on:input={filterEmoticons}
    autocomplete="off"
  />
  <div class="flex flex-wrap gap-2 mb-2">
    {#each filteredHeroicons as emoticon}
      <button
        type="button"
        class="emoticon-btn flex flex-col items-center justify-center p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"
        title={emoticon.name + ' ' + emoticon.shortcode}
        on:click={() => handleSelect(emoticon.shortcode)}
      >
        <svelte:component this={emoticon.component} class="w-6 h-6 text-gray-700 dark:text-gray-200" />
        <span class="text-xs text-gray-500">{emoticon.shortcode}</span>
      </button>
    {/each}
  </div>
  <button
    type="button"
    class="emoticon-more-btn w-full text-center py-1 text-xs text-gray-600 dark:text-gray-400 border-t border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800"
    on:click={() => showMore = !showMore}
  >
    {showMore ? 'Hide more...' : '... more'}
  </button>
  {#if showMore}
    <div class="flex flex-wrap gap-2 mt-2 max-h-32 overflow-y-auto">
      {#each filteredUnicode as emoticon}
        <button
          type="button"
          class="emoticon-btn flex flex-col items-center justify-center p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"
          title={emoticon.name + ' ' + emoticon.shortcode}
          on:click={() => handleSelect(emoticon.shortcode)}
        >
          <span class="w-6 h-6 text-2xl emoji-muted">{emoticon.char}</span>
          <span class="text-xs text-gray-500">{emoticon.shortcode}</span>
        </button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .emoji-muted {
    filter: grayscale(1) opacity(0.7);
    display: inline-block;
  }
</style> 