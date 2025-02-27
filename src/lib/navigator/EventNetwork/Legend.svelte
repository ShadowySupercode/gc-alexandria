<script lang="ts">
  export let className: string = "";
</script>

<div class="leather-legend {className}">
  <h3 class="text-lg font-bold mb-2 h-leather">Legend</h3>
  <ul class="legend-list">
    <li class="legend-item">
      <div class="legend-icon">
        <span class="legend-circle" style="background-color: hsl(200, 70%, 75%)">
        </span>
        <span class="legend-letter">I</span>
      </div>
      <span>Index events (kind 30040) - Each with a unique pastel color</span>
    </li>
    <li class="legend-item">
      <div class="legend-icon">
        <span class="legend-circle content"></span>
        <span class="legend-letter">C</span>
      </div>
      <span>Content events (kind 30041) - Publication sections</span>
    </li>
    <li class="legend-item">
      <svg class="w-6 h-6 mr-2" viewBox="0 0 24 24">
        <path d="M4 12h16M16 6l6 6-6 6" class="network-link-leather" />
      </svg>
      <span>Arrows indicate reading/sequence order</span>
    </li>
  </ul>
</div>
