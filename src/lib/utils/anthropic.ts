import { get } from "svelte/store";
import { apiKey } from "$lib/stores/apiKey";

export async function createAnthropicMessage(content: string) {
  const key = get(apiKey);

  if (!key) {
    throw new Error("No API key provided");
  }

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-3-sonnet-20240229",
      messages: [{ role: "user", content }],
      max_tokens: 1024,
    }),
  });

  if (!response.ok) {
    throw new Error("Failed to communicate with Anthropic API");
  }

  return response.json();
}