<script lang="ts">
  import { networkFetchLimit } from "$lib/state";
  import { createEventDispatcher } from "svelte";

  const dispatch = createEventDispatcher<{
    update: { limit: number };
  }>();

  // Convert inputValue to a derived value
  let inputValue = $derived.by(() => $networkFetchLimit);

  function handleInput(event: Event) {
    const input = event.target as HTMLInputElement;
    const value = parseInt(input.value);
    // Ensure value is between 1 and 50
    if (value >= 1 && value <= 50) {
      $networkFetchLimit = value;
    }
  }

  function handleUpdate() {
    dispatch("update", { limit: inputValue });
  }

  function handleKeyDown(event: KeyboardEvent) {
    if (event.key === "Enter") {
      handleUpdate();
    }
  }
</script>

<div class="flex items-center gap-2 mb-4">
  <label for="event-limit" class="leather bg-transparent text-sm font-medium"
    >Number of root events:
  </label>
  <input
    type="number"
    id="event-limit"
    min="1"
    max="50"
    class="w-20 bg-primary-0 dark:bg-primary-1000 border border-gray-300 dark:border-gray-700 rounded-md px-2 py-1 dark:text-white"
    value={inputValue}
    oninput={handleInput}
    onkeydown={handleKeyDown}
  />
  <button
    onclick={handleUpdate}
    class="btn-leather px-3 py-1 bg-primary-0 dark:bg-primary-1000 border border-gray-300 dark:border-gray-700 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800"
  >
    Update
  </button>
</div>
