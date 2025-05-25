<script lang="ts">
  const { type = "Unknown Type" } = $props<{ type: string }>();

  let displayType = $derived.by(() => {
    const typeValue = type.toLowerCase();
    switch (typeValue) {
      case 'book': return 'Book';
      case 'illustrated': return 'Illustrated Book';
      case 'magazine': return 'Magazine';
      case 'documentation': return 'Documentation';
      case 'academic': return 'Academic Paper';
      case 'blog': return 'Blog Post';
      default: return typeValue.charAt(0).toUpperCase() + typeValue.slice(1);
    }
  });
</script>

<span>Type: {displayType}</span>
