<script lang="ts">
  import {
    Heading,
    P,
    A,
    Button,
    Label,
    Textarea,
    Input,
    Modal,
  } from "flowbite-svelte";
  import { ndkInstance, ndkSignedIn, activeInboxRelays, activeOutboxRelays } from "$lib/ndk";
  import { userStore } from "$lib/stores/userStore";
  import { communityRelays } from "$lib/consts";
  import type NDK from "@nostr-dev-kit/ndk";
  import { NDKEvent, NDKRelaySet } from "@nostr-dev-kit/ndk";
  // @ts-ignore - Workaround for Svelte component import issue
  import LoginModal from "$lib/components/LoginModal.svelte";
  import { parseAdvancedmarkup } from "$lib/utils/markup/advancedMarkupParser";
  import { nip19 } from "nostr-tools";
  import { getMimeTags } from "$lib/utils/mime";
  import { userBadge } from "$lib/snippets/UserSnippets.svelte";

  // Function to close the success message
  function closeSuccessMessage() {
    submissionSuccess = false;
    submittedEvent = null;
  }

  function clearForm() {
    subject = "";
    content = "";
    submissionError = "";
    isExpanded = false;
    activeTab = "write";
  }

  let subject = $state("");
  let content = $state("");
  let isSubmitting = $state(false);
  let showLoginModal = $state(false);
  let submissionSuccess = $state(false);
  let submissionError = $state("");
  let submittedEvent = $state<NDKEvent | null>(null);
  let issueLink = $state("");
  let successfulRelays = $state<string[]>([]);
  let isExpanded = $state(false);
  let activeTab = $state("write");
  let showConfirmDialog = $state(false);

  // Store form data when user needs to login
  let savedFormData = {
    subject: "",
    content: "",
  };

  // Subscribe to userStore
  let user = $state($userStore);
  userStore.subscribe((val) => (user = val));

  // Repository event address from the task
  const repoAddress =
    "naddr1qvzqqqrhnypzplfq3m5v3u5r0q9f255fdeyz8nyac6lagssx8zy4wugxjs8ajf7pqy88wumn8ghj7mn0wvhxcmmv9uqq5stvv4uxzmnywf5kz2elajr";

  // Use the new relay management system instead of hardcoded relays
  const allRelays = [
    "wss://relay.damus.io",
    "wss://relay.nostr.band",
    "wss://nos.lol",
    ...$activeInboxRelays,
    ...$activeOutboxRelays,
  ];

  // Hard-coded repository owner pubkey and ID from the task
  // These values are extracted from the naddr
  const repoOwnerPubkey =
    "fd208ee8c8f283780a9552896e4823cc9dc6bfd442063889577106940fd927c1";
  const repoId = "Alexandria";

  // Function to normalize relay URLs by removing trailing slashes
  function normalizeRelayUrl(url: string): string {
    return url.replace(/\/+$/, "");
  }

  function toggleSize() {
    isExpanded = !isExpanded;
  }

  async function handleSubmit(e: Event) {
    // Prevent form submission
    e.preventDefault();

    if (!subject || !content) {
      submissionError = "Please fill in all fields";
      return;
    }

    // Check if user is logged in
    if (!user.signedIn) {
      // Save form data
      savedFormData = {
        subject,
        content,
      };

      // Show login modal
      showLoginModal = true;
      return;
    }

    // Show confirmation dialog
    showConfirmDialog = true;
  }

  async function confirmSubmit() {
    showConfirmDialog = false;
    await submitIssue();
  }

  function cancelSubmit() {
    showConfirmDialog = false;
  }

  /**
   * Publish event to relays with retry logic
   */
  async function publishToRelays(
    event: NDKEvent,
    ndk: NDK,
    relays: Set<string>,
    maxRetries: number = 3,
    timeout: number = 10000,
  ): Promise<string[]> {
    const successfulRelays: string[] = [];
    const relaySet = NDKRelaySet.fromRelayUrls(Array.from(relays), ndk);

    // Set up listeners for successful publishes
    const publishPromises = Array.from(relays).map((relayUrl) => {
      return new Promise<void>((resolve) => {
        const relay = ndk.pool?.getRelay(relayUrl);
        if (relay) {
          relay.on("published", (publishedEvent: NDKEvent) => {
            if (publishedEvent.id === event.id) {
              successfulRelays.push(relayUrl);
              resolve();
            }
          });
        } else {
          resolve(); // Resolve if relay not available
        }
      });
    });

    // Try publishing with retries
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // Start publishing with timeout
        const publishPromise = event.publish(relaySet);
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error("Publish timeout")), timeout);
        });

        await Promise.race([
          publishPromise,
          Promise.allSettled(publishPromises),
          timeoutPromise,
        ]);

        if (successfulRelays.length > 0) {
          break; // Exit retry loop if we have successful publishes
        }

        if (attempt < maxRetries) {
          // Wait before retrying (exponential backoff)
          await new Promise((resolve) =>
            setTimeout(resolve, Math.pow(2, attempt) * 1000),
          );
        }
      } catch (error) {
        if (attempt === maxRetries && successfulRelays.length === 0) {
          throw new Error(
            "Failed to publish to any relays after multiple attempts",
          );
        }
      }
    }

    return successfulRelays;
  }

  async function submitIssue() {
    isSubmitting = true;
    submissionError = "";
    submissionSuccess = false;

    try {
      // Get NDK instance
      const ndk = $ndkInstance;
      if (!ndk) {
        throw new Error("NDK instance not available");
      }

      if (!ndk.signer) {
        throw new Error("No signer available. Make sure you are logged in.");
      }

      // Create and prepare the event
      const event = await createIssueEvent(ndk);

      // Collect all unique relays
      const uniqueRelays = new Set([
        ...allRelays.map(normalizeRelayUrl),
        ...(ndk.pool
          ? Array.from(ndk.pool.relays.values())
              .filter(
                (relay) => relay.url && !relay.url.includes("wss://nos.lol"),
              )
              .map((relay) => normalizeRelayUrl(relay.url))
          : []),
      ]);

      try {
        // Publish to relays with retry logic
        successfulRelays = await publishToRelays(event, ndk, uniqueRelays);

        // Store the submitted event and create issue link
        submittedEvent = event;

        // Create the issue link using the repository address
        const noteId = nip19.noteEncode(event.id);
        issueLink = `https://gitcitadel.com/r/${repoAddress}/issues/${noteId}`;

        // Clear form and show success message
        clearForm();
        submissionSuccess = true;
      } catch (error) {
        throw new Error("Failed to publish event");
      }
    } catch (error: any) {
      submissionError = `Error submitting issue: ${error.message || "Unknown error"}`;
    } finally {
      isSubmitting = false;
    }
  }

  /**
   * Create and sign a new issue event
   */
  async function createIssueEvent(ndk: NDK): Promise<NDKEvent> {
    const event = new NDKEvent(ndk);
    event.kind = 1621; // issue_kind
    event.tags.push(["subject", subject]);
    event.tags.push(["alt", `git repository issue: ${subject}`]);

    // Add repository reference with proper format
    const aTagValue = `30617:${repoOwnerPubkey}:${repoId}`;
    event.tags.push(["a", aTagValue, "", "root"]);

    // Add repository owner as p tag with proper value
    event.tags.push(["p", repoOwnerPubkey]);

    // Add MIME tags
    const mimeTags = getMimeTags(1621);
    event.tags.push(...mimeTags);

    // Set content
    event.content = content;

    // Sign the event
    try {
      await event.sign();
    } catch (error) {
      throw new Error("Failed to sign event");
    }

    return event;
  }

  // Handle login completion
  $effect(() => {
    if (user.signedIn && showLoginModal) {
      showLoginModal = false;

      // Restore saved form data
      if (savedFormData.subject) subject = savedFormData.subject;
      if (savedFormData.content) content = savedFormData.content;

      // Submit the issue
      submitIssue();
    }
  });
</script>

<div class="w-full flex justify-center">
  <main
    class="main-leather flex flex-col space-y-6 max-w-3xl w-full my-6 px-6 sm:px-4"
  >
    <Heading tag="h1" class="h-leather mb-2">Contact GitCitadel</Heading>

    <P class="mb-3">
      Make sure that you follow us on <A
        href="https://github.com/ShadowySupercode/gitcitadel"
        target="_blank">GitHub</A
      > and <A href="https://geyser.fund/project/gitcitadel" target="_blank"
        >Geyserfund</A
      >.
    </P>

    <P class="mb-3">
      You can contact us on Nostr {@render userBadge(
        "npub1s3ht77dq4zqnya8vjun5jp3p44pr794ru36d0ltxu65chljw8xjqd975wz",
        "GitCitadel",
      )} or you can view submitted issues on the <A
        href="https://gitcitadel.com/r/naddr1qvzqqqrhnypzquqjyy5zww7uq7hehemjt7juf0q0c9rgv6lv8r2yxcxuf0rvcx9eqy88wumn8ghj7mn0wvhxcmmv9uq3wamnwvaz7tmjv4kxz7fwdehhxarj9e3xzmny9uqsuamnwvaz7tmwdaejumr0dshsqzjpd3jhsctwv3exjcgtpg0n0/issues"
        target="_blank">Alexandria repo page.</A
      >
    </P>

    <Heading tag="h2" class="h-leather mt-4 mb-2">Submit an issue</Heading>

    <P class="mb-3">
      If you are logged into the Alexandria web application (using the button at
      the top-right of the window), then you can use the form, below, to submit
      an issue, that will appear on our repo page.
    </P>

    <form class="space-y-4" onsubmit={handleSubmit} autocomplete="off">
      <div>
        <Label for="subject" class="mb-2">Subject</Label>
        <Input
          id="subject"
          class="w-full bg-white dark:bg-gray-800"
          placeholder="Issue subject"
          bind:value={subject}
          required
          autofocus
        />
      </div>

      <div class="relative">
        <Label for="content" class="mb-2">Description</Label>
        <div
          class="relative border border-gray-300 dark:border-gray-600 rounded-lg {isExpanded
            ? 'h-[800px]'
            : 'h-[200px]'} transition-all duration-200 sm:w-[95vw] md:w-full"
        >
          <div class="h-full flex flex-col">
            <div
              class="border-b border-gray-300 dark:border-gray-600 rounded-t-lg"
            >
              <ul
                class="flex flex-wrap -mb-px text-sm font-medium text-center"
                role="tablist"
              >
                <li class="mr-2" role="presentation">
                  <button
                    type="button"
                    class="inline-block p-4 rounded-t-lg {activeTab === 'write'
                      ? 'border-b-2 border-primary-600 text-primary-600'
                      : 'hover:text-gray-600 hover:border-gray-300'}"
                    onclick={() => (activeTab = "write")}
                    role="tab"
                  >
                    Write
                  </button>
                </li>
                <li role="presentation">
                  <button
                    type="button"
                    class="inline-block p-4 rounded-t-lg {activeTab ===
                    'preview'
                      ? 'border-b-2 border-primary-600 text-primary-600'
                      : 'hover:text-gray-600 hover:border-gray-300'}"
                    onclick={() => (activeTab = "preview")}
                    role="tab"
                  >
                    Preview
                  </button>
                </li>
              </ul>
            </div>

            <div class="flex-1 min-h-0 relative">
              {#if activeTab === "write"}
                <div class="absolute inset-0 overflow-hidden">
                  <Textarea
                    id="content"
                    class="w-full h-full resize-none bg-primary-0 dark:bg-primary-1000 text-gray-900 dark:text-gray-100 border-s-4 border-primary-200 rounded-b-lg rounded-t-none shadow-none px-4 py-2 focus:border-primary-600 dark:focus:border-primary-400"
                    bind:value={content}
                    required
                    placeholder="Describe your issue in detail...

The following markup is supported:

# Headers (1-6 levels)

Header 1
======

*Bold* or **bold**

_Italic_ or __italic__ text

~Strikethrough~ or ~~strikethrough~~ text

> Blockquotes

Lists, including nested:
* Bullets/unordered lists
1. Numbered/ordered lists

[Links](url)
![Images](url)

`Inline code`

```language
Code blocks with syntax highlighting for over 100 languages
```

| Tables | With or without headers |
|--------|------|
| Multiple | Rows |

Footnotes[^1] and [^1]: footnote content

Also renders nostr identifiers: npubs, nprofiles, nevents, notes, and naddrs. With or without the nostr: prefix."
                  />
                </div>
              {:else}
                <div
                  class="absolute inset-0 p-4 max-w-none bg-white dark:bg-gray-800 prose-content markup-content"
                >
                  {#key content}
                    {#await parseAdvancedmarkup(content)}
                      <p>Loading preview...</p>
                    {:then html}
                      {@html html ||
                        '<p class="text-gray-700 dark:text-gray-300">Nothing to preview</p>'}
                    {:catch error}
                      <p class="text-red-500">
                        Error rendering preview: {error.message}
                      </p>
                    {/await}
                  {/key}
                </div>
              {/if}
            </div>
          </div>
          <Button
            type="button"
            size="xs"
            class="absolute bottom-2 right-2 z-10 opacity-60 hover:opacity-100"
            color="light"
            onclick={toggleSize}
          >
            {isExpanded ? "⌃" : "⌄"}
          </Button>
        </div>
      </div>

      <div class="flex justify-end space-x-4">
        <Button type="button" color="alternative" onclick={clearForm}>
          Clear Form
        </Button>
        <Button type="submit" tabindex={0}>
          {#if isSubmitting}
            Submitting...
          {:else}
            Submit Issue
          {/if}
        </Button>
      </div>

      {#if submissionSuccess && submittedEvent}
        <div
          class="p-6 mb-4 text-sm bg-success-200 dark:bg-success-700 border border-success-300 dark:border-success-600 rounded-lg relative"
          role="alert"
        >
          <!-- Close button -->
          <button
            class="absolute top-2 right-2 text-gray-700 hover:text-gray-900 dark:text-gray-300 dark:hover:text-gray-100"
            onclick={closeSuccessMessage}
            aria-label="Close"
          >
            <svg
              class="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M6 18L18 6M6 6l12 12"
              ></path>
            </svg>
          </button>

          <div class="flex items-center mb-3">
            <svg
              class="w-5 h-5 mr-2 text-success-700 dark:text-success-300"
              fill="currentColor"
              viewBox="0 0 20 20"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                fill-rule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                clip-rule="evenodd"
              ></path>
            </svg>
            <span class="font-medium text-success-800 dark:text-success-200"
              >Issue submitted successfully!</span
            >
          </div>

          <div
            class="mb-3 p-3 bg-white dark:bg-gray-800 rounded border border-success-200 dark:border-success-600"
          >
            <div class="mb-2">
              <span class="font-semibold">Subject:</span>
              <span
                >{submittedEvent.tags.find((t) => t[0] === "subject")?.[1] ||
                  "No subject"}</span
              >
            </div>
            <div>
              <span class="font-semibold">Description:</span>
              <div class="mt-1 note-leather max-h-[400px] overflow-y-auto">
                {#await parseAdvancedmarkup(submittedEvent.content)}
                  <p>Loading...</p>
                {:then html}
                  {@html html}
                {:catch error}
                  <p class="text-red-500">
                    Error rendering markup: {error.message}
                  </p>
                {/await}
              </div>
            </div>
          </div>

          <div class="mb-3">
            <span class="font-semibold">View your issue:</span>
            <div class="mt-1">
              <A
                href={issueLink}
                target="_blank"
                class="hover:underline text-primary-600 dark:text-primary-500 break-all"
              >
                {issueLink}
              </A>
            </div>
          </div>

          <!-- Display successful relays -->
          <div class="text-sm">
            <span class="font-semibold">Successfully published to relays:</span>
            <ul class="list-disc list-inside mt-1">
              {#each successfulRelays as relay}
                <li class="text-success-700 dark:text-success-300">{relay}</li>
              {/each}
            </ul>
          </div>
        </div>
      {/if}

      {#if submissionError}
        <div
          class="p-4 mb-4 text-sm text-red-700 bg-red-100 rounded-lg"
          role="alert"
        >
          {submissionError}
        </div>
      {/if}
    </form>
  </main>
</div>

<!-- Confirmation Dialog -->
<Modal bind:open={showConfirmDialog} size="sm" autoclose={false} class="w-full">
  <div class="text-center">
    <h3 class="mb-5 text-lg font-normal text-gray-700 dark:text-gray-300">
      Would you like to submit the issue?
    </h3>
    <div class="flex justify-center gap-4">
      <Button color="alternative" onclick={cancelSubmit}>Cancel</Button>
      <Button color="primary" onclick={confirmSubmit}>Submit</Button>
    </div>
  </div>
</Modal>

<!-- Login Modal -->
<LoginModal
  show={showLoginModal}
  onClose={() => (showLoginModal = false)}
  onLoginSuccess={() => {
    // Restore saved form data
    if (savedFormData.subject) subject = savedFormData.subject;
    if (savedFormData.content) content = savedFormData.content;

    // Submit the issue
    submitIssue();
  }}
/>
