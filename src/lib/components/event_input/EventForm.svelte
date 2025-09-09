<script lang="ts">
  import { Tooltip } from "flowbite-svelte";
  import type { EventData, TagData, ValidationResult } from "./types";
  import { validateEvent } from "./validation";

  // AI-NOTE:  EventForm component handles basic form inputs and validation
  // This component focuses on event kind and content, with validation feedback

  let {
    eventData = $bindable(),
    tags,
    onvalidate,
  }: {
    eventData: EventData;
    tags: TagData[];
    onvalidate: (isValid: boolean, error?: string, warning?: string) => void;
  } = $props();

  let validationError = $state<string | null>(null);
  let validationWarning = $state<string | null>(null);

  /**
   * Validates the current form data
   */
  function validateForm(): ValidationResult {
    return validateEvent(eventData, tags);
  }

  /**
   * Handles form validation
   */
  function handleValidate(e: Event) {
    e.preventDefault();
    validationError = null;
    validationWarning = null;

    const validation = validateForm();
    if (!validation.valid) {
      validationError = validation.reason || "Validation failed.";
      onvalidate(false, validation.reason || "Validation failed.");
      return;
    }

    if (validation.warning) {
      validationWarning = validation.warning;
      onvalidate(true, undefined, validation.warning);
    } else {
      onvalidate(true);
    }
  }

  /**
   * Validates kind input
   */
  function isValidKind(kind: number | string): boolean {
    const n = Number(kind);
    return Number.isInteger(n) && n >= 0 && n <= 65535;
  }

  /**
   * Gets kind description
   */
  function getKindDescription(kind: number): string {
    switch (kind) {
      case 1:
        return "Text Note";
      case 30023:
        return "Long-form Content";
      case 30040:
        return "Publication Index";
      case 30041:
        return "Publication Section";
      case 30818:
        return "AsciiDoc Document";
      default:
        return "Custom Event";
    }
  }
</script>

<form class="space-y-4" onsubmit={handleValidate}>
  <!-- Event Kind -->
  <div>
    <label class="block font-medium mb-1 text-gray-700 dark:text-gray-300" for="event-kind">
      Kind
    </label>
    <input
      id="event-kind"
      type="number"
      class="input input-bordered w-full"
      bind:value={eventData.kind}
      min="0"
      max="65535"
      required
    />
    {#if !isValidKind(eventData.kind)}
      <div class="text-red-600 dark:text-red-400 text-sm mt-1">
        Kind must be an integer between 0 and 65535 (NIP-01).
      </div>
    {/if}
    {#if isValidKind(eventData.kind)}
      <div class="flex items-center gap-2 mt-1">
        <span class="text-sm text-gray-600 dark:text-gray-400">
          {getKindDescription(eventData.kind)}
        </span>
        {#if eventData.kind === 30040}
          <Tooltip class="tooltip-leather" type="auto" placement="bottom">
            <button
              type="button"
              class="w-6 h-6 rounded-full bg-blue-500 hover:bg-blue-600 text-white flex items-center justify-center text-sm font-bold border border-blue-600 shadow-sm"
              title="Learn more about Publication Index events"
            >
              ?
            </button>
            <div class="max-w-sm p-2 text-xs">
              <strong>30040 - Publication Index:</strong> Events that organize AsciiDoc content into structured publications with metadata tags and section references.
            </div>
          </Tooltip>
        {/if}
      </div>
    {/if}
  </div>

  <!-- Event Content -->
  <div>
    <label class="block font-medium mb-1 text-gray-700 dark:text-gray-300" for="event-content">
      Content
    </label>
    <textarea
      id="event-content"
      bind:value={eventData.content}
      placeholder="Content (start with a header for the title)"
      class="textarea textarea-bordered w-full h-40"
      required
    ></textarea>
    
    <!-- Content hints based on kind -->
    {#if eventData.kind === 30023}
      <div class="text-sm text-gray-600 dark:text-gray-400 mt-1">
        Use Markdown format for long-form content. Do not use AsciiDoc headers (=).
      </div>
    {:else if eventData.kind === 30040 || eventData.kind === 30041 || eventData.kind === 30818}
      <div class="text-sm text-gray-600 dark:text-gray-400 mt-1">
        Use AsciiDoc format. Start with a document title (=) and include section headers (==).
      </div>
    {/if}
  </div>

  <!-- Validation Messages -->
  {#if validationError}
    <div class="text-red-600 dark:text-red-400 text-sm">
      {validationError}
    </div>
  {/if}
  {#if validationWarning}
    <div class="text-yellow-600 dark:text-yellow-400 text-sm">
      Warning: {validationWarning}
    </div>
  {/if}


</form>
