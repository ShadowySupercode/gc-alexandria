<script lang="ts">
  type Props = {
    currentPage: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
    totalItems?: number;
    itemsLabel?: string;
    className?: string;
  };

  let {
    currentPage = $bindable<number>(1),
    totalPages = 1,
    hasNextPage = false,
    hasPreviousPage = false,
    totalItems = 0,
    itemsLabel = 'items',
    className = ''
  } = $props<{
    currentPage: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
    totalItems?: number;
    itemsLabel?: string;
    className?: string;
  }>();

  function next() {
    if (hasNextPage) currentPage = currentPage + 1;
  }
  function previous() {
    if (hasPreviousPage) currentPage = currentPage - 1;
  }
</script>

{#if totalPages > 1}
  <div class={`mt-4 flex flex-row items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg ${className}`}>
    <div class="text-sm text-gray-600 dark:text-gray-400">
      Page {currentPage} of {totalPages} ({totalItems} total {itemsLabel})
    </div>
    <div class="flex flex-row items-center gap-2">
      <button
        class="px-3 py-1 !mb-0 text-sm bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
        onclick={previous}
        disabled={!hasPreviousPage}
      >
        Previous
      </button>
      <span class="!mb-0 text-sm text-gray-600 dark:text-gray-400">
        {currentPage} / {totalPages}
      </span>
      <button
        class="px-3 py-1 !mb-0 text-sm bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
        onclick={next}
        disabled={!hasNextPage}
      >
        Next
      </button>
    </div>
  </div>
{/if}
