import type { PageServerLoad } from './$types';
import { redirect } from "@sveltejs/kit";

export const csr = false;

export const load: PageServerLoad = async ({ parent, url }) => {
  const { pubkey, dTag } = await parent();

  // Handle redirects from old query-param based URLs.
  if (pubkey && dTag) {
    redirect(301, `/publication/${pubkey}/${dTag}`);
  }
};
