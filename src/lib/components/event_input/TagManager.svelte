<script lang="ts">
  import { extractSmartMetadata, metadataToTags } from "$lib/utils/asciidoc_metadata";
  import { titleToDTag, requiresDTag } from "$lib/utils/event_input_utils";
  import type { TagData, PresetTag } from "./types";

  // AI-NOTE:  TagManager component handles tag management with preset tags
  // This component automatically manages preset tags based on event kind and content

  let {
    tags = $bindable(),
    kind,
    content,
  }: {
    tags: TagData[];
    kind: number;
    content: string;
  } = $props();

  let removedTags = $state<Set<string>>(new Set());
  let extractedMetadata = $state<[string, string][]>([]);
  let lastContent = $state("");
  let lastKind = $state(0);

  // Define preset tags for different event kinds
  let presetTags = $derived.by(() => {
    const presets: PresetTag[] = [];

    // Version tag for 30040 events
    if (kind === 30040) {
      presets.push({
        key: "version",
        defaultValue: "1",
        required: true,
        autoUpdate: false,
        description: "Publication version"
      });
    }

    // D-tag and title for addressable events
    if (requiresDTag(kind)) {
      presets.push({
        key: "d",
        defaultValue: "default-title",
        required: true,
        autoUpdate: true,
        description: "Document identifier (derived from title)"
      });

      presets.push({
        key: "title",
        defaultValue: "Default Title",
        required: true,
        autoUpdate: true,
        description: "Document title (extracted from content)"
      });
    }

    return presets;
  });

  // Extract metadata from content for AsciiDoc events
  $effect(() => {
    if (kind === 30040 || kind === 30041) {
      const { metadata } = extractSmartMetadata(content);
      extractedMetadata = metadataToTags(metadata);
    } else {
      extractedMetadata = [];
    }
  });

  // Manage preset tags automatically
  $effect(() => {
    // Only run this effect when content or kind changes, not when tags change
    if (content === lastContent && kind === lastKind) {
      return; // Skip if nothing has changed
    }
    
    lastContent = content;
    lastKind = kind;
    
    const currentTags = [...tags]; // Create a copy to avoid mutation
    
    const newTags: TagData[] = [];

    // Add preset tags
    for (const preset of presetTags) {
      if (removedTags.has(preset.key)) continue;

      let value = preset.defaultValue;
      
      // Auto-update values based on content
      if (preset.autoUpdate && content.trim()) {
        if (preset.key === "title") {
          const { metadata } = extractSmartMetadata(content);
          value = metadata.title || preset.defaultValue;
        } else if (preset.key === "d") {
          const { metadata } = extractSmartMetadata(content);
          value = titleToDTag(metadata.title || "") || preset.defaultValue;
        }
      }

      // Find existing tag or create new one
      const existingTag = currentTags.find(t => t.key === preset.key);
      if (existingTag) {
        // For preset tags, always ensure exactly one value
        if (preset.autoUpdate) {
          newTags.push({
            key: preset.key,
            values: [value] // Only keep the first (primary) value
          });
        } else {
          newTags.push({
            key: preset.key,
            values: [existingTag.values[0] || preset.defaultValue] // Keep user value or default
          });
        }
      } else {
        newTags.push({
          key: preset.key,
          values: [value]
        });
      }
    }

    // Add non-preset tags (avoid duplicates)
    for (const tag of currentTags) {
      const isPresetKey = presetTags.some(p => p.key === tag.key);
      const alreadyAdded = newTags.some(t => t.key === tag.key);
      
      if (!isPresetKey && !alreadyAdded) {
        newTags.push(tag);
      }
    }

    // Ensure there's always an empty tag row for user input
    if (newTags.length === 0 || newTags[newTags.length - 1].key !== "") {
      newTags.push({ key: "", values: [""] });
    }

    // Only update if the tags have actually changed
    const tagsChanged = JSON.stringify(newTags) !== JSON.stringify(currentTags);
    if (tagsChanged) {
      tags = newTags;
    }
  });

  /**
   * Adds a new tag
   */
  function addTag(): void {
    tags = [...tags, { key: "", values: [""] }];
  }

  /**
   * Removes a tag at the specified index
   */
  function removeTag(index: number): void {
    const tagKey = tags[index]?.key;
    
    if (tagKey) {
      removedTags.add(tagKey);
    }
    
    tags = tags.filter((_, i) => i !== index);
  }

  /**
   * Adds a value to a tag
   */
  function addTagValue(tagIndex: number): void {
    tags = tags.map((tag, i) => {
      if (i === tagIndex) {
        return { ...tag, values: [...tag.values, ""] };
      }
      return tag;
    });
  }

  /**
   * Removes a value from a tag
   */
  function removeTagValue(tagIndex: number, valueIndex: number): void {
    tags = tags.map((tag, i) => {
      if (i === tagIndex) {
        const newValues = tag.values.filter((_, vi) => vi !== valueIndex);
        return { ...tag, values: newValues.length > 0 ? newValues : [""] };
      }
      return tag;
    });
  }

  /**
   * Updates a tag key
   */
  function updateTagKey(index: number, newKey: string): void {
    tags = tags.map((tag, i) => {
      if (i === index) {
        return { ...tag, key: newKey };
      }
      return tag;
    });
  }

  /**
   * Updates a tag value
   */
  function updateTagValue(tagIndex: number, valueIndex: number, newValue: string): void {
    tags = tags.map((tag, i) => {
      if (i === tagIndex) {
        const newValues = [...tag.values];
        newValues[valueIndex] = newValue;
        return { ...tag, values: newValues };
      }
      return tag;
    });
  }

  /**
   * Checks if a tag is a preset tag
   */
  function isPresetTag(tagKey: string): boolean {
    return presetTags.some(p => p.key === tagKey);
  }

  /**
   * Gets preset tag info
   */
  function getPresetTagInfo(tagKey: string): PresetTag | undefined {
    return presetTags.find(p => p.key === tagKey);
  }
</script>

<div class="space-y-4">
  <label for="tags-container" class="block font-medium mb-1 text-gray-700 dark:text-gray-300">
    Tags
  </label>
  
  <!-- Extracted Metadata Section -->
  {#if extractedMetadata.length > 0}
    <div class="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
      <h4 class="text-sm font-medium text-blue-800 dark:text-blue-200 mb-2">
        Extracted Metadata (from AsciiDoc header)
      </h4>
      <div class="text-sm text-blue-700 dark:text-blue-300">
        {extractedMetadata.map(([key, value]) => `${key}: ${value}`).join(', ')}
      </div>
    </div>
  {/if}
  
  <!-- Tags Container -->
  <div id="tags-container" class="space-y-2">
    {#each tags as tag, i}
      <div class="border border-gray-300 dark:border-gray-600 rounded-lg p-3 space-y-2">
        <!-- Tag Key Row -->
        <div class="flex gap-2 items-center">
          <span class="text-sm font-medium text-gray-700 dark:text-gray-300 min-w-[60px]">Tag:</span>
          <input
            type="text"
            class="input input-bordered flex-1"
            placeholder="tag key (e.g., q, p, e)"
            value={tag.key}
            oninput={(e) => updateTagKey(i, (e.target as HTMLInputElement).value)}
          />
          {#if isPresetTag(tag.key)}
            <span class="text-xs bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 px-2 py-1 rounded">
              Preset
            </span>
          {/if}
          <button
            type="button"
            class="btn btn-error btn-sm"
            onclick={() => removeTag(i)}
          >
            ×
          </button>
        </div>
        
        <!-- Preset Tag Description -->
        {#if isPresetTag(tag.key)}
          {@const presetInfo = getPresetTagInfo(tag.key)}
          {#if presetInfo}
            <div class="text-xs text-gray-600 dark:text-gray-400 italic">
              {presetInfo.description}
              {#if presetInfo.autoUpdate}
                (auto-updates from content)
              {/if}
            </div>
          {/if}
        {/if}
        
        <!-- Tag Values -->
        <div class="space-y-2">
          <div class="flex items-center gap-2">
            <span class="text-sm font-medium text-gray-700 dark:text-gray-300 min-w-[60px]">Values:</span>
            <button
              type="button"
              class="btn btn-sm btn-outline btn-primary"
              onclick={() => addTagValue(i)}
            >
              Add Value
            </button>
          </div>
          
          {#each tag.values as value, valueIndex}
            <div class="flex gap-2 items-center">
              <span class="text-xs text-gray-500 dark:text-gray-400 min-w-[40px]">
                {valueIndex + 1}:
              </span>
              <input
                type="text"
                class="input input-bordered flex-1"
                placeholder="value"
                value={value}
                oninput={(e) => updateTagValue(i, valueIndex, (e.target as HTMLInputElement).value)}
              />
              {#if tag.values.length > 1}
                <button
                  type="button"
                  class="btn btn-sm btn-outline btn-error"
                  onclick={() => removeTagValue(i, valueIndex)}
                >
                  ×
                </button>
              {/if}
            </div>
          {/each}
        </div>
      </div>
    {/each}
    
    <!-- Add Tag Button -->
    <div class="flex justify-end">
      <button
        type="button"
        class="btn btn-primary btn-sm border border-primary-600 px-3 py-1"
        onclick={addTag}
      >
        Add Tag
      </button>
    </div>
  </div>
</div>
