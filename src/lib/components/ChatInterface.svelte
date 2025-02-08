<!-- ChatInterface.svelte -->
<script lang="ts">
  import { onMount } from "svelte";
  import { apiKey } from "$lib/stores/apiKey";
  import { Button, Spinner } from "flowbite-svelte";
  import { fly } from "svelte/transition";
  import { quintOut } from "svelte/easing";
  import { sendLLMMessage } from "$lib/utils/llm";

  // State Management
  let messages = [];
  let userInput = "";
  let isLoading = false;
  let isInitialized = false;

  $: if ($apiKey && !isInitialized) {
    initializeChat();
  }

  function initializeChat() {
    try {
      messages = [
        {
          role: "assistant",
          content: "Hello! How can I help you today?",
        }
      ];
      
      isInitialized = true;
    } catch (error) {
      console.error("Failed to initialize chat:", error);
      messages = [
        {
          role: "assistant",
          content: "There was an error initializing the chat. Please check your API key and try again.",
        }
      ];
    }
  }

  function resetApiKey() {
    $apiKey = "";
    messages = [];
    userInput = "";
    isInitialized = false;
  }

  async function sendMessage() {
    if (!userInput.trim() || !$apiKey) return;

    try {
      isLoading = true;
      const currentInput = userInput;
      messages = [...messages, { role: "user", content: currentInput }];
      userInput = "";

      // Convert messages to LangChain format
      const langChainMessages = [
        {
          type: 'system',
          content: 'You are a helpful AI assistant.'
        },
        ...messages.map(msg => ({
          type: msg.role === 'user' ? 'human' : 'ai',
          content: msg.content
        }))
      ];

      console.log('Sending messages:', langChainMessages);

      // Send messages to LLM
      const response = await sendLLMMessage(langChainMessages);
      console.log('Received response:', response);

      if (response && response.content) {
        messages = [
          ...messages,
          {
            role: "assistant",
            content: response.content,
          }
        ];
      } else {
        throw new Error('Empty or invalid response from LLM');
      }
    } catch (error) {
      console.error("Chat error:", error);
      messages = [
        ...messages,
        {
          role: "assistant",
          content: "I encountered an error processing your request. Please try again.",
        }
      ];
    } finally {
      isLoading = false;
    }
  }

  function handleKeyPress(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  }
</script>

<div
  class="fixed right-0 top-[64px] h-[calc(100vh-64px)] w-96 bg-white dark:bg-gray-800 shadow-lg z-40 border-l border-gray-200 dark:border-gray-700"
  transition:fly={{ duration: 300, x: 384, opacity: 1, easing: quintOut }}
>
  <div class="flex flex-col h-full">
    <!-- Header -->
    <div class="p-4 border-b dark:border-gray-700">
      <div class="flex justify-between items-center mb-2">
        <h2 class="text-xl font-bold text-gray-800 dark:text-gray-200">
          Chat Assistant
        </h2>
        <Button
          color="red"
          size="xs"
          on:click={resetApiKey}
          class="ml-2"
        >
          Reset API Key
        </Button>
      </div>
    </div>

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
          on:keydown={handleKeyPress}
          placeholder="Type your message..."
          class="flex-grow p-2 rounded-lg border dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200"
          disabled={isLoading || !$apiKey}
        />
        <Button type="submit" disabled={isLoading || !$apiKey || !userInput.trim()}>
          Send
        </Button>
      </form>
    </div>
  </div>
</div>

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