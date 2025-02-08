import type { BaseMessage } from '@langchain/core/messages';
import { get } from 'svelte/store';
import { apiKey } from '$lib/stores/apiKey';

export type LLMProvider = 'anthropic' | 'openai' | 'google';

export async function sendLLMMessage(messages: BaseMessage[], provider: LLMProvider = 'anthropic') {
    const key = get(apiKey);
    
    if (!key) {
        throw new Error('No API key provided');
    }

    console.log('Sending to LLM API:', messages);

    const response = await fetch('/api/llm', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': key,
            'x-llm-provider': provider
        },
        body: JSON.stringify({ messages })
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Failed to communicate with LLM: ${error}`);
    }

    const result = await response.json();
    console.log('Received from LLM API:', result);
    return result;
}