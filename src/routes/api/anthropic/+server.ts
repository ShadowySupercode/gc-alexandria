import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
    const body = await request.json();
    const apiKey = request.headers.get('x-api-key');

    if (!apiKey) {
        return new Response('API key is required', { status: 401 });
    }

    try {
        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify(body),
        });

        if (!response.ok) {
            const error = await response.text();
            return new Response(error, { status: response.status });
        }

        const data = await response.json();
        return json(data);
    } catch (error) {
        console.error('Error calling Anthropic API:', error);
        return new Response('Internal Server Error', { status: 500 });
    }
};