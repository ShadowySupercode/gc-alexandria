<script lang="ts">
  import { Heading, P, A } from "flowbite-svelte";
  import { activeInboxRelays, activeOutboxRelays, getNdkContext } from "$lib/ndk";
  import { userStore } from "$lib/stores/userStore";
  import { anonymousRelays } from "$lib/consts";
  import type NDK from "@nostr-dev-kit/ndk";
  import { NDKEvent, NDKRelaySet } from "@nostr-dev-kit/ndk";
  // @ts-ignore - Workaround for Svelte component import issue
  import LoginModal from "$lib/components/LoginModal.svelte";
  import { parseAdvancedmarkup } from "$lib/utils/markup/advancedMarkupParser";
  import { nip19 } from "nostr-tools";
  import { getMimeTags } from "$lib/utils/mime";
  import { userBadge } from "$lib/snippets/UserSnippets.svelte";
  import AMarkupForm from "$lib/a/forms/AMarkupForm.svelte";
  import { AAlert } from "$lib/a";

  const ndk = getNdkContext();

  // Function to close the success message
  function closeSuccessMessage() {
    submissionSuccess = false;
    submittedEvent = null;
  }

  function clearForm() {
    subject = "";
    content = "";
    submissionError = "";
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

  // Use the new relay management system with anonymous relays as fallbacks
  const allRelays = [
    ...$activeInboxRelays,
    ...$activeOutboxRelays,
    ...anonymousRelays,
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

  /**
   * Handle form submission from AMarkupForm
   */
  async function handleFormSubmit(newSubject: string, newContent: string) {
    submissionError = "";
    subject = newSubject;
    content = newContent;

    if (!subject || !content) {
      submissionError = "Please fill in all fields";
      return;
    }

    if (!user.signedIn) {
      savedFormData = { subject, content };
      showLoginModal = true;
      return;
    }

    await submitIssue();
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
                (relay) => relay.url,
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

<div class="w-full max-w-3xl flex flex-col self-center mb-3 px-2">
    <Heading tag="h1" class="h-leather mb-2">Contact GitCitadel</Heading>

    <P class="my-3">
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
        ndk,
      )} or you can view submitted issues on the <A
        href="https://gitcitadel.com/r/naddr1qvzqqqrhnypzquqjyy5zww7uq7hehemjt7juf0q0c9rgv6lv8r2yxcxuf0rvcx9eqy88wumn8ghj7mn0wvhxcmmv9uq3wamnwvaz7tmjv4kxz7fwdehhxarj9e3xzmny9uqsuamnwvaz7tmwdaejumr0dshsqzjpd3jhsctwv3exjcgtpg0n0/issues"
        target="_blank">Alexandria repo page.</A
      >
    </P>

    <Heading tag="h2" class="h-leather mt-4 mb-2">Submit an issue</Heading>

    <P class="my-3">
      If you are logged into the Alexandria web application (using the button at
      the top-right of the window), then you can use the form, below, to submit
      an issue, that will appear on our repo page.
    </P>

    <AMarkupForm
      bind:subject={subject}
      bind:content={content}
      isSubmitting={isSubmitting}
      onSubmit={handleFormSubmit}
    />

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
      <AAlert color="red">
        {submissionError}
      </AAlert>
    {/if}
</div>

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
