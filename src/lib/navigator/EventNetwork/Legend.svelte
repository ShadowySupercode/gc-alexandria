<!-- Legend Component (Svelte 5, Runes Mode) -->

<script lang="ts">
  import { Button } from "flowbite-svelte";
  import { CaretDownOutline, CaretUpOutline } from "flowbite-svelte-icons";

  // TODO: Move this to settings panel for user control
  const TAG_LEGEND_COLUMNS = 4; // Number of columns for tag anchor table
  let {
    collapsedOnInteraction = false,
    className = "",
    starMode = false,
    showTags = false,
    tagAnchors = [],
  } = $props<{
    collapsedOnInteraction: boolean;
    className: string;
    starMode?: boolean;
    showTags?: boolean;
    tagAnchors?: any[];
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
      {#if starMode}
        <!-- Star center node -->
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
            >Index events (kind 30040) - Star centers with unique colors</span
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
            >Content nodes (kind 30041) - Arranged around star centers</span
          >
        </li>

        <!-- Star links -->
        <li class="legend-item">
          <svg class="w-6 h-6 mr-2" viewBox="0 0 24 24">
            <path
              d="M12 4l8 8-8 8M12 4l-8 8 8 8"
              class="network-link-leather"
              stroke-width="2"
              fill="none"
            />
          </svg>
          <span class="legend-text"
            >Radial connections from star centers to content</span
          >
        </li>
      {:else}
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
          <span class="legend-text">Arrows indicate reading/sequence order</span
          >
        </li>
      {/if}

      <!-- Tag Anchors section -->
      {#if showTags && tagAnchors.length > 0}
        <li class="legend-item mt-3 border-t pt-2 w-full">
          <span class="legend-text font-semibold"
            >Active Tag Anchors: {tagAnchors[0].type}</span
          >
        </li>
        <li class="w-full">
          <div
            class="tag-grid"
            style="grid-template-columns: repeat({TAG_LEGEND_COLUMNS}, 1fr);"
          >
            {#each tagAnchors as anchor}
              <div class="tag-grid-item">
                <div class="legend-icon">
                  <span
                    class="legend-circle"
                    style="background-color: {anchor.color}; width: 18px; height: 18px; border: 2px solid white;"
                  >
                    <span class="legend-letter text-xs text-white font-bold">
                      {anchor.type === "t"
                        ? "#"
                        : anchor.type === "author"
                          ? "A"
                          : anchor.type.charAt(0).toUpperCase()}
                    </span>
                  </span>
                </div>
                <span class="legend-text text-xs">
                  {anchor.label}
                  <span class="text-gray-500">({anchor.count})</span>
                </span>
              </div>
            {/each}
          </div>
        </li>
      {/if}
    </ul>
  {/if}
</div>
