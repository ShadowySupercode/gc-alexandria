# URL Service Documentation

The URL service provides centralized management of search and pagination parameters in URL query strings. This enables shareable search results and proper browser navigation.

## Features

- **Search Parameter Encoding**: Converts search queries and types into URL parameters
- **Pagination Support**: Manages page numbers in the URL
- **Backward Compatibility**: Supports legacy URL formats while introducing new standardized format
- **Browser Navigation**: Enables proper back/forward button functionality
- **Shareable URLs**: Users can copy and share search result URLs

## URL Format

### New Format (Recommended)
```
/events?q=<search_term>&stype=<search_type>&p=<page_number>
```

### Legacy Format (Still Supported)
```
/events?id=<event_id>&p=<page_number>
/events?d=<d_tag>&p=<page_number>
/events?t=<t_tag>&p=<page_number>
/events?n=<name>&p=<page_number>
```

## Search Types

- `d`: D-tag search (e.g., `q=myarticle&stype=d`)
- `t`: T-tag search (e.g., `q=bitcoin&stype=t`)
- `n`: Name search (e.g., `q=alice&stype=n`)
- `id`: Event ID search (e.g., `q=event123&stype=id`)
- `nip05`: NIP-05 address search (e.g., `q=alice@example.com&stype=nip05`)

## Usage Examples

### Encoding Search Parameters
```typescript
import { updateSearchURL } from '$lib/utils/url_service';

// Search for d-tag "myarticle"
updateSearchURL({
  q: 'myarticle',
  stype: 'd',
  p: 1
});

// Search for t-tag "bitcoin" on page 3
updateSearchURL({
  q: 'bitcoin',
  stype: 't',
  p: 3
});
```

### Decoding Search Parameters
```typescript
import { decodeSearchParams } from '$lib/utils/url_service';

const url = new URL(window.location.href);
const params = decodeSearchParams(url);

console.log(params.searchValue);  // "d:myarticle"
console.log(params.searchType);   // "d"
console.log(params.searchTerm);   // "myarticle"
console.log(params.page);         // 1
```

### Pagination
```typescript
import { updatePageURL } from '$lib/utils/url_service';

// Navigate to page 2
updatePageURL(2);

// Navigate to page 1 (removes p parameter)
updatePageURL(1);
```

### Clearing Search
```typescript
import { clearSearchURL } from '$lib/utils/url_service';

// Clear all search parameters
clearSearchURL();
```

## Integration with Components

### Events Page
The events page automatically decodes URL parameters on load and updates the search state accordingly.

### EventSearch Component
The EventSearch component encodes search parameters when performing searches and clears them when the search is cleared.

### PaginatedEventResults Component
The PaginatedEventResults component updates the page parameter when users navigate between pages.

## Future Enhancements

The URL service is designed to be extensible for future search features:

- **Lucene Query Support**: Add support for complex search queries
- **Filter Parameters**: Add support for date ranges, event types, etc.
- **Sort Parameters**: Add support for different sort orders
- **View Parameters**: Add support for different result view modes

## Migration from Legacy URLs

The service automatically handles legacy URL formats, so existing bookmarks and links will continue to work. New searches will use the standardized format for better consistency and future extensibility. 