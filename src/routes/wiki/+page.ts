import type { Load } from '@sveltejs/kit';
import { getWikiPageById, searchWikiPagesByDTag } from '../../lib/wiki';

export const load: Load = async ({ url }) => {
  const id = url.searchParams.get('id');
  const d = url.searchParams.get('d');

  if (d) {
    // Disambiguation/search page for d-tag
    const results = await searchWikiPagesByDTag(d);
    return { disambiguation: true, results, dtag: d };
  }

  if (id) {
    // Single wiki page by event id (bech32 or hex)
    const page = await getWikiPageById(id);
    if (!page) {
      return { status: 404, error: 'Wiki page not found.' };
    }
    return { disambiguation: false, page };
  }

  // No query: show only the search bar
  return { disambiguation: true, results: [], dtag: '' };
}; 