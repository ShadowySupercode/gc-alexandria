import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { ChatAnthropic } from '@langchain/anthropic';
import { type BaseChatModel } from '@langchain/core/language_models/chat_models';
import { HumanMessage, AIMessage, SystemMessage } from '@langchain/core/messages';

// Store LLM instances in memory
const llmInstances = new Map<string, BaseChatModel>();

export const POST: RequestHandler = async ({ request }) => {
    const body = await request.json();
    const apiKey = request.headers.get('x-api-key');
    const provider = request.headers.get('x-llm-provider') || 'anthropic';

    if (!apiKey) {
        return new Response('API key is required', { status: 401 });
    }

    try {
        console.log('Received request body:', body);
        console.log('Using provider:', provider);

        // Get or create LLM instance
        let llm = llmInstances.get(apiKey);
        
        if (!llm) {
            console.log('Creating new LLM instance');
            switch (provider) {
                case 'anthropic':
                    llm = new ChatAnthropic({
                        anthropicApiKey: apiKey,
                        modelName: "claude-3-haiku-20240307",
                        temperature: 0,
                        maxTokens: 1024
                    });
                    llmInstances.set(apiKey, llm);
                    break;
                default:
                    return new Response(`Unsupported provider: ${provider}`, { status: 400 });
            }
        }

        // Convert raw messages to LangChain message instances
        const messages = body.messages.map((msg: any) => {
            console.log('Processing message:', msg);
            switch (msg.type) {
                case 'system':
                    return new SystemMessage(msg.content);
                case 'human':
                    return new HumanMessage(msg.content);
                case 'ai':
                    return new AIMessage(msg.content);
                default:
                    throw new Error(`Unsupported message type: ${msg.type}`);
            }
        });

        console.log('Sending messages to LLM:', messages);
        const response = await llm.invoke(messages);
        console.log('Raw LLM response:', response);

        // Extract the actual content from the response
        let content = '';
        if (typeof response.content === 'string') {
            content = response.content;
        } else if (Array.isArray(response.content)) {
            content = response.content.map(item => item.text || '').join(' ');
        } else if (response.content?.text) {
            content = response.content.text;
        }

        if (!content) {
            throw new Error('Could not extract content from LLM response');
        }

        return json({ content });
    } catch (error) {
        console.error('Error calling LLM:', error);
        return new Response(error.message || 'Internal Server Error', { 
            status: error.status || 500 
        });
    }
};