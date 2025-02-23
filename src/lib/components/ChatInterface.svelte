<script lang="ts">
  import { apiKey, advancedMode } from "$lib/stores/apiKey";
  import { Button, Spinner } from "flowbite-svelte";
  import { anthropicClient } from '$lib/clients/anthropic';
  import type { ChatMessage } from '$lib/types';
  import { onMount } from "svelte";

  // State
  let messages = $state<ChatMessage[]>([]);
  let userInput = $state("");
  let isLoading = $state(false);
  let isInitialized = $state(false);

  // Initialize client when API key changes
  $effect(() => {
    if ($apiKey) {
      initializeClient();
    } else {
      resetClient();
    }
  });

  // Initialize chat
  async function initializeClient() {
    isLoading = true;
    try {
      isInitialized = await anthropicClient.initialize($apiKey);
      if (isInitialized) {
        messages = [{
          role: "assistant",
          content: "Hello! How can I help you today?"
        }];
      }
    } catch (error) {
      console.error('Chat initialization error:', error);
      messages = [{
        role: "assistant",
        content: "Sorry, I encountered an error during initialization."
      }];
    } finally {
      isLoading = false;
    }
  }

  function resetClient() {
    $apiKey = "";
    messages = [];
    isInitialized = false;
    anthropicClient.reset();
  }

  async function sendMessage() {
    if (!userInput.trim() || isLoading || !isInitialized) return;

    try {
      isLoading = true;

      // Add user message
      const userMessage: ChatMessage = {
        role: "user",
        content: userInput
      };
      messages = [...messages, userMessage];

      // Clear input early for better UX
      const messageToSend = userInput;
      userInput = "";

      // Get AI response with full conversation history
      const response = await anthropicClient.sendMessage(messageToSend, messages);
      if (response) {
        messages = [...messages, response];
      } else {
        messages = [...messages, {
          role: "assistant",
          content: "I apologize, but I encountered an error processing your request."
        }];
      }

    } catch (error) {
      console.error('Chat error:', error);
      messages = [...messages, {
        role: "assistant",
        content: "I apologize, but I encountered an error processing your request."
      }];
    } finally {
      isLoading = false;
    }
  }

  function handleKeyPress(event: KeyboardEvent) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  }
</script>

{#if $advancedMode && $apiKey}
  <div
    class="fixed right-0 top-[64px] h-[calc(100vh-64px)] w-96 bg-white dark:bg-gray-800 shadow-lg z-40 border-l border-gray-200 dark:border-gray-700"
  >
    <div class="flex flex-col h-full">
      <!-- Header -->
      <div
        class="p-4 border-b dark:border-gray-700 flex justify-between items-center"
      >
        <h2 class="text-xl font-bold text-gray-800 dark:text-gray-200">
          Chat Assistant
        </h2>
        <Button color="red" size="xs" on:click={resetClient}>Clear API Key</Button>
      </div>

      <!-- Messages -->
      <div class="flex-grow overflow-y-auto p-4 space-y-4">
        {#each messages as message}
          <div
            class="message {message.role} p-3 rounded-lg w-fit max-w-[85%]
            {message.role === 'user'
              ? 'bg-blue-100 dark:bg-blue-900 ml-auto'
              : 'bg-gray-100 dark:bg-gray-800'}
            text-gray-800 dark:text-gray-200"
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
        <div class="flex space-x-2">
          <input
            type="text"
            bind:value={userInput}
            on:keydown={handleKeyPress}
            placeholder="Type your message..."
            class="flex-grow p-2 rounded-lg border dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200"
            disabled={isLoading || !$apiKey}
          />
          <Button
            color="primary"
            disabled={isLoading || !$apiKey || !userInput.trim()}
            on:click={sendMessage}
          >
            Send
          </Button>
        </div>
      </div>
    </div>
  </div>
{/if}

<style>
  .message {
    max-width: 85%;
    word-wrap: break-word;
  }

  .message.user {
    margin-left: auto;
  }

  .message.assistant {
    margin-right: auto;
  }

  :global(.dark) .message {
    color: #e5e7eb;
  }
</style>