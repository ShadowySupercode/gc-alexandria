<!-- ChatInterface.svelte -->
<script lang="ts">
  import { onMount } from "svelte";
  import { ChatAnthropic } from "@langchain/anthropic";
  import { apiKey, advancedMode } from "$lib/stores/apiKey";
  import { createFaissRag, searchRag } from "$lib/utils/ragUtils";
  import { Button, Input, Label, Spinner } from "flowbite-svelte";
  import { fly } from "svelte/transition";
  import { quintOut } from "svelte/easing";
  import type { NDKEvent } from "@nostr-dev-kit/ndk";

  // Props
  export let events: NDKEvent[] = [];

  // State Management
  let vectorStore = null;
  let messages: Array<{ role: string; content: string }> = [];
  let userInput = "";
  let isLoading = false;
  let chatAnthropic: ChatAnthropic | null = null;
  let initializationError = null;
  let tempApiKey = "";

  // Compute visibility based on advanced mode and API key
  $: isVisible = $advancedMode;
  $: showApiForm = isVisible && !$apiKey;
  $: showChat = isVisible && $apiKey;

  // Initialize chat when API key is available
  $: if ($apiKey && !chatAnthropic) {
    initializeChat();
  }

  // Initialize RAG when chat becomes visible
  $: if (showChat && !vectorStore && !initializationError) {
    initializeRag();
  }

  function initializeChat() {
    chatAnthropic = new ChatAnthropic({
      anthropicApiKey: $apiKey,
      modelName: "claude-3-sonnet-20240229",
    });
  }

  function saveApiKey() {
    if (!tempApiKey.startsWith("sk-")) {
      alert("Invalid API key format");
      return;
    }
    $apiKey = tempApiKey;
    tempApiKey = "";
  }

  async function initializeRag() {
    try {
      isLoading = true;
      const { store, diagnostics } = await createFaissRag(events);
      vectorStore = store;

      messages = [
        ...messages,
        {
          role: "assistant",
          content: `I'm ready to help you with questions about this article. I've processed ${diagnostics.processedEvents} sections of content.`,
        },
      ];
    } catch (error) {
      console.error("RAG Initialization Error:", error);
      initializationError = error;
      messages = [
        ...messages,
        {
          role: "assistant",
          content: "Hi! What would you like to learn about today?",
        },
      ];
    } finally {
      isLoading = false;
    }
  }

  async function sendMessage() {
    if (!userInput.trim() || !chatAnthropic) return;

    try {
      isLoading = true;
      messages = [...messages, { role: "user", content: userInput }];
      const currentInput = userInput;
      userInput = "";

      let systemMessage = "You are a helpful assistant.";

      if (vectorStore) {
        try {
          const { results } = await searchRag(vectorStore, currentInput);

          if (results?.length > 0) {
            const contextSections = results.map((doc, index) => {
              const relevanceMarker = index === 0 ? "MOST RELEVANT" : "RELATED";
              return `${relevanceMarker} SECTION\nTitle: ${doc.metadata.title}\nContent: ${doc.pageContent}`;
            });

            systemMessage = `ROLE AND OBJECTIVE
You are a knowledgeable assistant helping users understand a Nostr article.

AVAILABLE CONTENT SECTIONS
${contextSections.join("\n\n")}

RESPONSE GUIDELINES
1. Base your responses on the provided content sections
2. Focus on the most relevant section first
3. Draw connections between related sections when appropriate
4. If asked about topics not covered in these sections:
   - Clearly indicate the topic isn't covered in the current article
   - Suggest focusing on the available content instead`;
          }
        } catch (error) {
          console.error("RAG search error:", error);
        }
      }

      const response = await chatAnthropic.call([
        { role: "system", content: systemMessage },
        { role: "user", content: currentInput },
      ]);

      messages = [
        ...messages,
        {
          role: "assistant",
          content: response?.content || "No response content",
        },
      ];
    } catch (error) {
      console.error("Chat error:", error);
      messages = [
        ...messages,
        {
          role: "assistant",
          content: "I encountered an error processing your request. Please try again.",
        },
      ];
    } finally {
      isLoading = false;
    }
  }
</script>

{#if isVisible}
  <div
    class="fixed right-0 top-[64px] h-[calc(100vh-64px)] w-96 bg-white dark:bg-gray-800 shadow-lg z-40 border-l border-gray-200 dark:border-gray-700"
    transition:fly={{ duration: 300, x: 384, opacity: 1, easing: quintOut }}
  >
    <div class="flex flex-col h-full">
      <!-- Header -->
      <div class="p-4 border-b dark:border-gray-700">
        <h2 class="text-xl font-bold text-gray-800 dark:text-gray-200">
          Article Assistant
        </h2>
        <p class="text-sm text-gray-600 dark:text-gray-400 mt-1">
          Using article context for intelligent responses
        </p>
      </div>

      <!-- Content Container -->
      <div class="relative flex-grow">
        {#if showApiForm}
          <!-- API Key Form -->
          <div 
            class="absolute inset-0 p-4"
            in:fly={{ duration: 300, x: 384 }}
            out:fly={{ duration: 300, x: 384 }}
          >
            <div class="space-y-4">
              <Label for="apiKey" class="mb-2">API Key</Label>
              <Input
                id="apiKey"
                type="password"
                bind:value={tempApiKey}
                class="mb-4"
                placeholder="Enter your API key"
              />
              <Button on:click={saveApiKey} class="w-full">Save API Key</Button>
              <p class="text-sm text-red-500 mt-2">
                Warning: Entering your API key here may pose security risks. Never share
                your key or use it on untrusted sites.
              </p>
            </div>
          </div>
        {/if}
        
        {#if showChat}
          <!-- Chat Interface -->
          <div
            class="absolute inset-0 flex flex-col"
            in:fly={{ duration: 300, x: 384 }}
            out:fly={{ duration: 300, x: 384 }}
          >
          <!-- Messages -->
          <div class="flex-grow overflow-y-auto p-4 space-y-4">
            {#each messages as message}
              <div
                class="message {message.role} p-3 rounded-lg w-fit max-w-[85%] {message.role === 'user'
                  ? 'bg-blue-100 dark:bg-blue-900 ml-auto text-gray-800 dark:text-gray-200'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200'}"
              >
                <pre class="whitespace-pre-wrap font-sans">{message.content}</pre>
              </div>
            {/each}

            {#if isLoading}
              <div class="flex justify-center">
                <Spinner />
              </div>
            {/if}
          </div>

          <!-- Input -->
          <div class="p-4 border-t dark:border-gray-700">
            <form class="flex space-x-2" on:submit|preventDefault={sendMessage}>
              <input
                type="text"
                bind:value={userInput}
                placeholder="Ask about this article..."
                class="flex-grow p-2 rounded-lg border dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200"
                disabled={isLoading}
              />
              <Button type="submit" disabled={isLoading || !userInput.trim()}>
                Send
              </Button>
            </form>
          </div>
        </div>
      {/if}
    </div>
    </div>
  </div>
{/if}

<style>
  .message {
    max-width: 85%;
    word-wrap: break-word;
  }

  .user {
    margin-left: auto;
  }

  .assistant {
    margin-right: auto;
  }

  /* Scrollbar styling */
  .overflow-y-auto {
    scrollbar-width: thin;
    scrollbar-color: rgba(156, 163, 175, 0.5) transparent;
  }

  .overflow-y-auto::-webkit-scrollbar {
    width: 6px;
  }

  .overflow-y-auto::-webkit-scrollbar-track {
    background: transparent;
  }

  .overflow-y-auto::-webkit-scrollbar-thumb {
    background-color: rgba(156, 163, 175, 0.5);
    border-radius: 3px;
  }
</style>