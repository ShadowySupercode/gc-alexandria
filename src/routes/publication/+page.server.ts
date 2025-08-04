import { redirect } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";

// Route pattern constants
const ROUTES = {
  PUBLICATION_BASE: "/publication",
  NADDR: "/publication/naddr",
  NEVENT: "/publication/nevent", 
  ID: "/publication/id",
  D_TAG: "/publication/d",
  START: "/start",
} as const;

// Identifier prefixes
const IDENTIFIER_PREFIXES = {
  NADDR: "naddr",
  NEVENT: "nevent",
} as const;

export const load: PageServerLoad = ({ url }) => {
  const id = url.searchParams.get("id");
  const dTag = url.searchParams.get("d");

  // Handle backward compatibility for old query-based routes
  if (id) {
    // Check if id is an naddr or nevent
    if (id.startsWith(IDENTIFIER_PREFIXES.NADDR)) {
      redirect(301, `${ROUTES.NADDR}/${id}`);
    } else if (id.startsWith(IDENTIFIER_PREFIXES.NEVENT)) {
      redirect(301, `${ROUTES.NEVENT}/${id}`);
    } else {
      // Assume it's a hex ID
      redirect(301, `${ROUTES.ID}/${id}`);
    }
  } else if (dTag) {
    redirect(301, `${ROUTES.D_TAG}/${dTag}`);
  }

  // If no query parameters, redirect to the start page
  redirect(301, ROUTES.START);
}; 