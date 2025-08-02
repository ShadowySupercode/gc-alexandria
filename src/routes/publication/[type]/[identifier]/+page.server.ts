import { error } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ params }) => {
  const { type, identifier } = params;

  // Validate the identifier type for SSR
  const validTypes = ['id', 'd', 'naddr', 'nevent'];
  if (!validTypes.includes(type)) {
    throw error(400, `Unsupported identifier type: ${type}`);
  }

  // Provide basic data for SSR - actual fetching will happen on client
  return {
    publicationType: "", // Will be determined on client side
    indexEvent: null, // Will be fetched on client side
  };
}; 