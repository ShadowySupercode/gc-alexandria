<script lang="ts">
  import { levelsToRender } from "$lib/state";
  import { createEventDispatcher } from "svelte";

  let inputValue = $levelsToRender;

  const dispatch = createEventDispatcher<{
    update: { limit: number };
  }>();
  function handleInput(event: Event) {
    const input = event.target as HTMLInputElement;
    const value = parseInt(input.value);
    // Ensure value is between 1 and 50
    if (value >= 1 && value <= 50) {
      inputValue = value;
    }
  }

  function handleUpdate() {
    $levelsToRender = inputValue;
    dispatch("update", { limit: inputValue });
  }

  function handleKeyDown(event: KeyboardEvent) {
    if (event.key === "Enter") {
      handleUpdate();
    }
  }
</script>

<div class="flex items-center gap-2 mb-4">
  <label for="levels-to-render" class="text-sm font-medium"
    >Levels to render:
  </label>
  <label for="event-limit" class="text-sm font-medium">Limit: </label>
  <input
    type="number"
    id="levels-to-render"
    min="1"
    max="50"
    class="w-20 bg-primary-0 dark:bg-primary-1000 border border-gray-300 dark:border-gray-700 rounded-md px-2 py-1"
    bind:value={inputValue}
    oninput={handleInput}
    onkeydown={handleKeyDown}
  />
  <button
    onclick={handleUpdate}
    class="px-3 py-1 bg-primary-0 dark:bg-primary-1000 border border-gray-300 dark:border-gray-700 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800"
  >
    Update
  </button>
</div>
