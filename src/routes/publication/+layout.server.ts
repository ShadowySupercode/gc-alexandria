// This file is kept for compatibility but no longer handles redirects.
// Redirects are now handled by +page.server.ts and the redirect route.
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async () => {
  return {};
};
