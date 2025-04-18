<script lang="ts">
  import { Button } from "flowbite-svelte";
  import Login from './Login.svelte';
  
  export let show = false;
  export let onClose = () => {};
</script>

{#if show}
  <div class="fixed inset-0 z-50 flex items-center justify-center overflow-x-hidden overflow-y-auto outline-none focus:outline-none bg-gray-900 bg-opacity-50">
    <div class="relative w-auto my-6 mx-auto max-w-3xl">
      <div class="border-0 rounded-lg shadow-lg relative flex flex-col w-full bg-white outline-none focus:outline-none">
        <!-- Header -->
        <div class="flex items-start justify-between p-5 border-b border-solid border-gray-300 rounded-t">
          <h3 class="text-xl font-medium text-gray-900">Login Required</h3>
          <button 
            class="ml-auto bg-transparent border-0 text-gray-400 float-right text-3xl leading-none font-semibold outline-none focus:outline-none"
            on:click={onClose}
          >
            <span class="bg-transparent text-gray-500 h-6 w-6 text-2xl block outline-none focus:outline-none">×</span>
          </button>
        </div>
        
        <!-- Body -->
        <div class="relative p-6 flex-auto">
          <p class="text-base leading-relaxed text-gray-500 mb-4">
            You need to be logged in to submit an issue. Your form data will be preserved.
          </p>
          <div class="flex justify-center">
            <Login />
          </div>
        </div>
      </div>
    </div>
  </div>
{/if}