<script lang="ts"> let { class: className = '' } = $props(); </script>
<div class={`rounded-lg border border-muted/20 bg-surface shadow-sm ${className}`}>
  <slot name="header" />
  <div class="p-4"><slot /></div>
  <slot name="footer" />
</div>
