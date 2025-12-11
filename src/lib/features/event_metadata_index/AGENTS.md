# Feature: Event Metadata Index

IndexedDB is used to locally represent Nostr event metadata, include titles,
heirarchies, and ordinal relationships. The Alexandria client uses this local
metadata store to efficiently retrieve and order events to support, among other
things, publication views and table of contents (ToC) views.

## IndexedDB Schema

### Database

- **Name**: `Alexandria_Event_Metadata`

### Object Stores

#### Metadata Store

- **Name**: `event-metadata`
- **Key**: Nostr event ID - unique 32-byte lowercase hex-encoded string
- **Value**: JSON containing metadata or critical tag values:
  - `title`: The event's `t` tag value
- **Indexes**
  - `index[title]`
- **Notes**: The `event-metadata` store _does not store full events_. It stores
  metadata, such as event title, that the Alexandria client can use to quickly
  retrieve full events or quickly construct UI presentations that only require
  event metadata.

#### Ordinal Map Store

- **Name**: `event-ordinals`
- **Key**: Compound key path consisting of two parts
  - Nostr event ID - unique 32-byte lowercase hex-encoded string
  - Left-padded 7-digit ordinal
  - Example:
    `["51c1a5059ecc2114fc5083878af532eb67b739fa9d9ad847d9ca0b6714ec051f", "0000123"]`
- **Value**: JSON containing ordinal mapping
  - `id`: Nostr event ID - unique 32-byte lowercase hex-encoded string
- **Indexes**
  - `index[id]`
- **Notes**
  - The `event-ordinals` store contains lexicographically ordered mappings of
    kind 30040 index events to their children.
  - The first part of the key (before the underscore) is the unique ID of a kind
    30040 index event.
  - The second part of the key is an ordinal indicating where the mapped child
    event sits among its peers.
  - The `id` field in the value is the unique ID of the mapped child event.
  - Alexandria client code can use range queries over the compound key to
    iterate over the children of a given kind 30040 index event in their
    expected display order.
