<script lang="ts">
  import { networkFetchLimit } from "$lib/state";
  import { createEventDispatcher } from "svelte";

  const dispatch = createEventDispatcher<{
    update: { limit: number };
  }>();

  let inputValue = $networkFetchLimit;

  function handleInput(event: Event) {
    const input = event.target as HTMLInputElement;
    const value = parseInt(input.value);
    // Ensure value is between 1 and 50
    if (value >= 1 && value <= 50) {
      inputValue = value;
    }
  }

  function handleUpdate() {
    $networkFetchLimit = inputValue;
    dispatch("update", { limit: inputValue });
  }

  function handleKeyDown(event: KeyboardEvent) {
    if (event.key === "Enter") {
      handleUpdate();
    }
  }
</script>

<div class="event-control-container">
  <label for="event-limit" class="event-control-label">
    Number of root events:
  </label>
  <input
    type="number"
    id="event-limit"
    min="1"
    max="50"
    class="event-control-input"
    bind:value={inputValue}
    oninput={handleInput}
    onkeydown={handleKeyDown}
  />
  <button
    onclick={handleUpdate}
    class="btn-base"
  >
    Update
  </button>
</div>
