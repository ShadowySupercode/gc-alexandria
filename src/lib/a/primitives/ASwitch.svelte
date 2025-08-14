<script lang="ts">
  let { checked = false, class: className = '', onchange = undefined as undefined | ((v:boolean)=>void) } = $props();
  function toggle(){ checked = !checked; onchange?.(checked); }
</script>
<button type="button" role="switch" aria-checked={checked}
  onclick={toggle}
  class={`inline-flex items-center h-6 w-11 rounded-full border border-muted/30 transition px-0.5 ${checked ? 'bg-primary' : 'bg-surface'} ${className}`}
>
  <span class={`inline-block h-5 w-5 rounded-full bg-white shadow transform transition ${checked ? 'translate-x-5' : 'translate-x-0'}`} />
</button>
