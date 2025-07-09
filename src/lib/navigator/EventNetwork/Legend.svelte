<!-- Legend Component (Svelte 5, Runes Mode) -->

<script lang="ts">
  import { Button } from "flowbite-svelte";
  import { CaretDownOutline, CaretUpOutline } from "flowbite-svelte-icons";
  let { collapsedOnInteraction = false, className = "" } = $props<{
    collapsedOnInteraction: boolean;
    className: string;
  }>();

  let expanded = $state(true);

  $effect(() => {
    if (collapsedOnInteraction) {
      expanded = false;
    }
  });

  function toggle() {
    expanded = !expanded;
  }
</script>

<div class={`leather-legend ${className}`}>
  <div class="flex items-center justify-between space-x-3">
    <h3 class="h-leather">Legend</h3>
    <Button
      color="none"
      outline
      size="xs"
      onclick={toggle}
      class="rounded-full"
    >
      {#if expanded}
        <CaretUpOutline />
      {:else}
        <CaretDownOutline />
      {/if}
    </Button>
  </div>

  {#if expanded}
    <ul class="legend-list">
      <!-- Index event node -->
      <li class="legend-item">
        <div class="legend-icon">
          <span
            class="legend-circle"
            style="background-color: hsl(200, 70%, 75%)"
          >
            <span class="legend-letter">I</span>
          </span>
        </div>
        <span class="legend-text"
          >Index events (kind 30040) - Each with a unique pastel color</span
        >
      </li>

      <!-- Content event node -->
      <li class="legend-item">
        <div class="legend-icon">
          <span class="legend-circle content">
            <span class="legend-letter">C</span>
          </span>
        </div>
        <span class="legend-text"
          >Content events (kinds 30041, 30818) - Publication sections</span
        >
      </li>

      <!-- Link arrow -->
      <li class="legend-item">
        <svg class="w-6 h-6 mr-2" viewBox="0 0 24 24">
          <path
            d="M4 12h16M16 6l6 6-6 6"
            class="network-link-leather"
            stroke-width="2"
            fill="none"
          />
        </svg>
        <span class="legend-text">Arrows indicate reading/sequence order</span>
      </li>
    </ul>
  {/if}
</div>
