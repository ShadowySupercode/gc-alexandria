import { get } from 'svelte/store';
import { apiKey } from '$lib/stores/apiKey';

export type LLMProvider = 'anthropic';

export type Message = {
    role: 'user' | 'assistant';
    content: string;
};

export async function sendLLMMessage(messages: Message[], provider: LLMProvider = 'anthropic') {
    const key = get(apiKey);
    
    if (!key) {
        throw new Error('No API key provided');
    }

    try {
        // This is a placeholder for future provider implementations
        // Currently we're using the AnthropicClient directly in the ChatInterface
        throw new Error('LLM providers not yet implemented in utils');
    } catch (error) {
        console.error('Chat error:', error);
        throw error;
    }
}