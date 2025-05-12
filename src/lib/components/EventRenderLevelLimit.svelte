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

<div class="event-control-container">
  <label for="levels-to-render" class="event-control-label">
    Levels to render:
  </label>
  <input
    type="number"
    id="levels-to-render"
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
