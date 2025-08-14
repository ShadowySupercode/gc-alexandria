<script>
  let theme = $state('ocean'); // e.g. 'ocean' or '' for default
  const apply = () => document.documentElement.setAttribute('data-theme', theme);
  $effect(apply);
</script>

<select bind:value={theme} onchange={apply}>
  <option value="">Default</option>
  <option value="ocean">Ocean</option>
</select>
