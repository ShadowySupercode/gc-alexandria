import { redirect } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ url }) => {
  const id = url.searchParams.get("id");
  const dTag = url.searchParams.get("d");

  // Handle backward compatibility for old query-based routes
  if (id) {
    // Check if id is an naddr or nevent
    if (id.startsWith("naddr")) {
      throw redirect(301, `/publication/naddr/${id}`);
    } else if (id.startsWith("nevent")) {
      throw redirect(301, `/publication/nevent/${id}`);
    } else {
      // Assume it's a hex ID
      throw redirect(301, `/publication/id/${id}`);
    }
  } else if (dTag) {
    throw redirect(301, `/publication/d/${dTag}`);
  }

  // If no query parameters, redirect to the start page or show publication feed
  throw redirect(301, "/start");
}; 