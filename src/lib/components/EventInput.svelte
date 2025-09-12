<script lang="ts">
  import { get } from "svelte/store";
  import { userStore } from "$lib/stores/userStore";
  import { goto } from "$app/navigation";
  import { Button } from "flowbite-svelte";
  import EventForm from "./event_input/EventForm.svelte";
  import TagManager from "./event_input/TagManager.svelte";
  import EventPreview from "./event_input/EventPreview.svelte";
  import type { EventData, TagData } from "./event_input/types";
  import { publishEvent, loadEvent } from "./event_input/eventServices";
  import { getNdkContext } from "$lib/ndk";

  // AI-NOTE:  Main EventInput component refactored for better separation of concerns
  // This component now serves as a container that orchestrates the form, tags, preview, and publishing

  // Get NDK context at component level (can only be called during initialization)
  const ndk = getNdkContext();

  // Main event state
  let eventData = $state<EventData>({
    kind: 1,
    content: "",
    createdAt: Math.floor(Date.now() / 1000),
  });

  // Tag state
  let tags = $state<TagData[]>([]);

  // UI state
  let loading = $state(false);
  let error = $state<string | null>(null);
  let success = $state<string | null>(null);
  let showJsonPreview = $state(false);

  // Publishing state
  let publishedRelays = $state<string[]>([]);
  let lastPublishedEventId = $state<string | null>(null);

  // Event loading state
  let eventIdSearch = $state("");
  let eventJsonInput = $state("");
  let loadingEvent = $state(false);
  let loadMethod = $state<"hex" | "json">("hex");

  // Session storage loading
  let hasLoadedFromStorage = $state(false);

  // Load content from sessionStorage if available (from ZettelEditor)
  $effect(() => {
    if (hasLoadedFromStorage) return; // Prevent multiple loads

    const storedContent = sessionStorage.getItem("zettelEditorContent");
    const storedSource = sessionStorage.getItem("zettelEditorSource");

    if (storedContent && storedSource === "publication-format") {
      eventData.content = storedContent;
      hasLoadedFromStorage = true;

      // Clear the stored content after loading
      sessionStorage.removeItem("zettelEditorContent");
      sessionStorage.removeItem("zettelEditorSource");
    }
  });

  /**
   * Handles form validation
   */
  function handleValidate(isValid: boolean, error?: string, warning?: string) {
    if (!isValid && error) {
      // Validation failed - error is already shown in EventForm
      return;
    }

    if (warning) {
      // Validation passed with warning - user can proceed
      console.log("Validation warning:", warning);
    }

    // Validation passed - form is ready for publishing
    console.log("Form validation passed");
  }

  /**
   * Handles the publishing process
   */
  async function handlePublish() {
    loading = true;
    error = null;
    success = null;
    publishedRelays = [];

    try {
      const result = await publishEvent(ndk, eventData, tags);

      if (result.success) {
        publishedRelays = result.relays || [];
        lastPublishedEventId = result.eventId || null;
        success = `Published to ${result.relays?.length || 0} relay(s).`;
      } else {
        error = result.error || "Failed to publish event.";
      }
    } catch (err) {
      console.error("Error in handlePublish:", err);
      error = `Publishing failed: ${err instanceof Error ? err.message : "Unknown error"}`;
    } finally {
      loading = false;
    }
  }

  /**
   * Loads an event by its hex ID for editing
   */
  async function loadEventById(): Promise<void> {
    if (!eventIdSearch.trim()) {
      error = "Please enter an event ID.";
      return;
    }

    const eventId = eventIdSearch.trim();

    // Validate hex format
    if (!/^[a-fA-F0-9]{64}$/.test(eventId)) {
      error = "Invalid event ID format. Must be a 64-character hex string.";
      return;
    }

    loadingEvent = true;
    error = null;

    try {
      const loadedEvent = await loadEvent(ndk, eventId);

      if (loadedEvent) {
        eventData = loadedEvent.eventData;
        tags = loadedEvent.tags;
        success = `Loaded event ${eventId.substring(0, 8)}...`;
      } else {
        error = `Event ${eventId} not found on any relay.`;
      }
    } catch (err) {
      console.error("Error loading event:", err);
      error = `Failed to load event: ${err instanceof Error ? err.message : "Unknown error"}`;
    } finally {
      loadingEvent = false;
    }
  }

  /**
   * Loads an event from JSON string for editing
   */
  function loadEventFromJson(): void {
    if (!eventJsonInput.trim()) {
      error = "Please enter event JSON.";
      return;
    }

    try {
      const eventJson = JSON.parse(eventJsonInput.trim());

      // Validate required fields
      if (typeof eventJson.kind !== "number") {
        error = "Invalid event JSON: missing or invalid 'kind' field.";
        return;
      }

      if (typeof eventJson.content !== "string") {
        error = "Invalid event JSON: missing or invalid 'content' field.";
        return;
      }

      if (!Array.isArray(eventJson.tags)) {
        error = "Invalid event JSON: missing or invalid 'tags' field.";
        return;
      }

      // Extract event data (drop fields that need to be regenerated)
      eventData = {
        kind: eventJson.kind,
        content: eventJson.content,
        createdAt: Math.floor(Date.now() / 1000), // Use current time
      };

      // Convert tags from NDK format to our format
      tags = eventJson.tags.map((tag: string[]) => ({
        key: tag[0] || "",
        values: tag.slice(1),
      }));

      success = "Loaded event from JSON successfully.";
      error = null;
    } catch (err) {
      console.error("Error parsing event JSON:", err);
      error = `Failed to parse event JSON: ${err instanceof Error ? err.message : "Invalid JSON format"}`;
    }
  }

  /**
   * Clears all form fields and resets to initial state
   */
  function clearForm(): void {
    eventData = {
      kind: 1,
      content: "",
      createdAt: Math.floor(Date.now() / 1000),
    };
    tags = [];
    error = null;
    success = null;
    publishedRelays = [];
    lastPublishedEventId = null;
    eventIdSearch = "";
    eventJsonInput = "";
    showJsonPreview = false;
  }

  /**
   * Navigate to view the published event
   */
  function viewPublishedEvent() {
    if (lastPublishedEventId) {
      goto(`/events?id=${encodeURIComponent(lastPublishedEventId)}`);
    }
  }
</script>

<div
  class="w-full max-w-2xl mx-auto my-8 p-4 sm:p-6 bg-white dark:bg-gray-900 rounded-lg shadow-lg overflow-hidden"
>
  <div class="flex justify-between items-center mb-4">
    <h2 class="text-xl font-bold text-gray-900 dark:text-gray-100">
      Publish Nostr Event
    </h2>
    <div class="flex gap-2">
      <button
        type="button"
        class="btn btn-outline btn-secondary btn-sm"
        onclick={clearForm}
      >
        Clear Form
      </button>
      <button
        type="button"
        class="btn btn-primary btn-sm border border-primary-600"
        onclick={() => {
          // Trigger validation by submitting the form
          const form = document.querySelector("form");
          if (form) {
            form.dispatchEvent(new Event("submit", { bubbles: true }));
          }
        }}
      >
        Validate Form
      </button>
    </div>
  </div>

  <!-- Event ID Search Section -->
  <div
    class="mb-6 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-600 overflow-hidden"
  >
    <h3 class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
      Load Existing Event
    </h3>

    <!-- Load Method Tabs -->
    <div class="flex gap-1 mb-3">
      <button
        type="button"
        class="px-3 py-1 text-sm rounded-l-lg border border-gray-300 dark:border-gray-600 {loadMethod ===
        'hex'
          ? 'bg-blue-500 text-white border-blue-500'
          : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600'}"
        onclick={() => (loadMethod = "hex")}
      >
        Hex ID
      </button>
      <button
        type="button"
        class="px-3 py-1 text-sm rounded-r-lg border border-gray-300 dark:border-gray-600 {loadMethod ===
        'json'
          ? 'bg-blue-500 text-white border-blue-500'
          : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600'}"
        onclick={() => (loadMethod = "json")}
      >
        JSON
      </button>
    </div>

    {#if loadMethod === "hex"}
      <!-- Hex ID Input -->
      <div class="flex gap-2 min-w-0">
        <input
          type="text"
          class="input input-bordered flex-1 min-w-0"
          placeholder="Enter 64-character hex event ID"
          bind:value={eventIdSearch}
          maxlength="64"
          onkeydown={(e) => {
            if (e.key === "Enter" && !loadingEvent && eventIdSearch.trim()) {
              e.preventDefault();
              loadEventById();
            }
          }}
        />
        <button
          type="button"
          class="btn btn-secondary flex-shrink-0"
          onclick={loadEventById}
          disabled={loadingEvent || !eventIdSearch.trim()}
        >
          {loadingEvent ? "Loading..." : "Load Event"}
        </button>
      </div>
      <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">
        Load an existing event from relays by its hex ID.
      </p>
    {:else}
      <!-- JSON Input -->
      <div class="space-y-2">
        <textarea
          class="textarea textarea-bordered w-full h-32 font-mono text-sm"
          placeholder="Paste event JSON here (content, kind, tags fields required)"
          bind:value={eventJsonInput}
        ></textarea>
        <div class="flex gap-2">
          <button
            type="button"
            class="btn btn-secondary"
            onclick={loadEventFromJson}
            disabled={!eventJsonInput.trim()}
          >
            Load from JSON
          </button>
          <button
            type="button"
            class="btn btn-outline btn-secondary btn-sm"
            onclick={() => (eventJsonInput = "")}
          >
            Clear JSON
          </button>
        </div>
      </div>
      <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">
        Paste a complete event JSON to load it into the form. Fields like id,
        pubkey, created_at, and sig will be regenerated.
      </p>
    {/if}
  </div>

  <!-- Main Form -->
  <EventForm bind:eventData {tags} onvalidate={handleValidate} />

  <!-- Tag Management -->
  <TagManager bind:tags kind={eventData.kind} content={eventData.content} />

  <!-- Action Buttons -->
  <div class="flex justify-end gap-2 mt-4">
    <button
      type="button"
      class="btn btn-primary border border-primary-600 px-4 py-2"
      onclick={handlePublish}
      disabled={loading}
    >
      Publish
    </button>
  </div>

  <!-- Status Messages -->
  {#if loading}
    <div class="mt-2 text-gray-500 dark:text-gray-400">Publishing...</div>
  {/if}
  {#if error}
    <div class="mt-2 text-red-600 dark:text-red-400">{error}</div>
  {/if}
  {#if success}
    <div class="mt-2 text-green-600 dark:text-green-400">{success}</div>
    <div class="text-xs text-gray-500 dark:text-gray-400">
      Relays: {publishedRelays.join(", ")}
    </div>
    {#if lastPublishedEventId}
      <div class="mt-2 text-green-700 dark:text-green-300">
        Event ID: <span class="font-mono">{lastPublishedEventId}</span>
        <Button
          onclick={viewPublishedEvent}
          class="text-blue-600 dark:text-blue-500 hover:underline ml-2"
        >
          View your event
        </Button>
      </div>
    {/if}
  {/if}

  <!-- Event Preview -->
  <EventPreview
    {ndk}
    {eventData}
    {tags}
    {showJsonPreview}
    onTogglePreview={() => (showJsonPreview = !showJsonPreview)}
  />
</div>
