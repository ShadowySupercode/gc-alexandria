<!--
  Legend Component
  
  Displays a legend explaining the different node and link types in the
  event network visualization.
-->
<script lang="ts">
  // Optional class name to apply to the legend container
  export let className: string = "";
</script>

<div class="leather-legend {className}">
  <h3 class="h-leather">Legend</h3>
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
      <span class="legend-text">Index events (kind 30040) - Each with a unique pastel color</span>
    </li>
    
    <!-- Content event node -->
    <li class="legend-item">
      <div class="legend-icon">
        <span class="legend-circle content">
          <span class="legend-letter">C</span>
        </span>
      </div>
      <span class="legend-text">Content events (kinds 30041, 30818) - Publication sections</span>
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
</div>

