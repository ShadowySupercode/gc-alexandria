# Relay Selector Class Design

The relay selector will be a singleton that tracks, rates, and ranks Nostr
relays to help the application determine which relay should be used to handle
each request. It will weight relays based on observed characteristics, then use
these weights to implement a weighted round robin algorithm for selecting
relays, with some additional modifications to account for domain-specific
features of Nostr.

## Relay Weights

### Categories

Relays are broadly divided into three categories:

1. **Public**: no authorization is required
2. **Private Write**: authorization is required to write to this relay, but not
   to read
3. **Private Read and Write**: authorization is required to use any features of
   this relay

The broadest level of relay selection is based on these categories.

- For users that are not logged in, public relays are used exclusively.
- For logged-in users, public and private read relays are initially rated
  equally for read operations.
- For logged-in users, private write relays are preferred above public relays
  for write operations.

### User Preferences

The relay selector will respect user relay preferences while still attempting to
optimize for responsiveness and success rate.

- User inbox relays will be stored in a separate list from general-purpose
  relays, and weighted and sorted separately using the same algorithm as the
  general-purpose relay list.
- Local relays (beginning with `wss://localhost` or `ws://localhost`) will be
  stored _unranked_ in a separate list, and used when the relay selector is
  operating on a web browser (as opposed to a server).
- When a caller requests relays from the relay selector, the selector will
  return:
  - The highest-ranked general-purpose relay
  - The highest-ranked user inbox relay
  - (If on browser) any local relays

### Weighted Metrics

Several weighted metrics are used to compute a relay's score. The score is used
to rank relays to determine which to prefer when fetching events.

#### Response Time

The response time weight of each relay is computed according to the logarithmic
function $`r(t) = -log(t) + 1`$, where $`t`$ is the median response time in
seconds. This function has a few features which make it useful:

- $`r(1) = 1`$, making a response time of 1s the netural point. This causes the
  algorithm to prefer relays that respond in under 1s.
- $`r(0.3) \approx 1.5`$ and $`r(3) \approx 0.5`$. This clusters the 0.5 to 1.5
  weight range in the 300ms to 3s response time range, which is a sufficiently
  rapid response time to keep user's from switching context.
- The function has a long tail, so it doesn't discount slower response times too
  heavily, too quickly.

#### Success Rate

The success rate $`s(x)`$ is computed as the fraction of total requests sent to
the relay that returned at least one event in response. The optimal score is 1,
meaning the relay successfully responds to 100% of requests.

#### Trust Level

Certain relays may be assigned a constant "trust level" score $`T`$. This
modifier is a number in the range $`[-0.5, 0.5]`$ that indicates how much a
relay is trusted by the GitCitadel organization.

A few factors contribute to a higher trust rating:

- Effective filtering of spam and abusive content.
- Good data transparency, including such policies as honoring deletion requests.
- Event aggregation policies that aim at synchronization with the broader relay
  network.

#### Preferred Vendors

Certain relays may be assigned a constant "preferred vendor" score $`V`$. This
modifier is a number in the range $`[0, 0.5]`$. It is used to increase the
priority of GitCitadel's preferred relay vendors.

### Overall Weight

The overall weight of a relay is calculated as
$`w(t, x) = r(t) \times s(x) + T + V`$. The `RelaySelector` class maintains a
list of relays sorted by their overall weights. The weights may be updated at
runtime when $`t`$ or $`x`$ change. On update, the relay list is re-sorted to
account for the new weights.

## Algorithm

The relay weights contribute to a weighted round robin (WRR) algorithm for relay
selection. Pseudocode for the algorithm is given below:

```pseudocode
Constants and Variables:
  const N   // Number of relays
  const CW  // Connection weight
  wInit     // Map of relay URLs to initial weights
  conn      // Map of relay URLs to the number of active connections to that relay
  wCurr     // Current relay weights
  rSorted   // List of relay URLs sorted in ascending order

Function getRelay:
  r = rSorted[N - 1]                  // Get the highest-ranked relay
  conn[r]++                           // Increment the number of connections
  wCurr[r] = wInit[r] + conn[r] * CW  // Adjust current weights based on new connection weight
  sort rSorted by wCurr               // Re-sort based on updated weights
  return r
```

## Class Methods

The `RelaySelector` class should expose the following methods to support updates
to relay weights. Pseudocode for each method is given below.

### Add Response Time Datum

This function updates the class state by side effect. Locking should be used in
concurrent use cases.

```pseudocode
Constants and Variables:
  const CW  // Connection weight
  rT        // A map of relay URLs to their Trust Level scores
  rV        // A map of relay URLs to their Preferred Vendor scores
  rTimes    // A map of relay URLs to a list or recorded response times
  rReqs     // A map of relay URLs to the number of recorded requests
  rSucc     // A map of relay URLs to the number of successful requests
  rTimes    // A map of relay URLs to recorded response times
  wInit     // Map of relay URLs to initial weights
  conn      // Map of relay URLs to the number of active connections to that relay
  wCurr     // Current relay weights
  rSorted   // List of relay URLs sorted in ascending order

Parameters:
  r   // A relay URL
  rt  // A response time datum recorded for the given relay

Function addResponseTimeDatum:
  append rt to rTimes[r]
  sort rTimes[r]
  rtMed = median of rTimes[r]
  rtWeight = -1 * log(rtMed) + 1
  succRate = rSucc[r] / rReqs[r]
  wInit[r] = rtWeight * succRate + rT[r] + rV[r]
  wCurr[r] = wInit[r] + conn[r] * CW
  sort rSorted by wCurr
```

### Add Success Rate Datum

This function updates the class state by side effect. Locking should be used in
concurrent use cases.

```pseudocode
Constants and Variables:
  const CW  // Connection weight
  rT        // A map of relay URLs to their Trust Level scores
  rV        // A map of relay URLs to their Preferred Vendor scores
  rReqs     // A map of relay URLs to the number of recorded requests
  rSucc     // A map of relay URLs to the number of successful requests
  rTimes    // A map of relay URLs to recorded response times
  wInit     // Map of relay URLs to initial weights
  conn      // Map of relay URLs to the number of active connections to that relay
  wCurr     // Current relay weights
  rSorted   // List of relay URLs sorted in ascending order

Parameters:
  r  // A relay URL
  s  // A boolean value indicating whether the latest request to relay r succeeded

Function addSuccessRateDatum:
  rReqs[r]++
  if s is true:
    rSucc[r]++
  rtMed = median of rTimes[r]
  rtWeight = -1 * log(rtMed) + 1
  succRate = rSuccReqs[r] / rReqs[r]
  wInit[r] = rtWeight * succRate + rT[r] + rV[r]
  wCurr[r] = wInit[r] + conn[r] * CW
  sort rSorted by wCurr
```

### Add Relay

```pseudocode
Constants and Variables:
  general  // A list of general-purpose relay URLs
  inbox    // A list of user-defined inbox relay URLs
  local    // A list of local relay URLs

Parameters:
  r      // The relay URL
  rType  // The relay type (general, inbox, or local)

Function addRelay:
  if rType is "general":
    add r to general
    sort general by current weights
  if rType is "inbox":
    add r to inbox
    sort inbox by current weights
  if rType is "local":
    add r to local
```

### Get Relay

```
Constants and Variables:
  general  // A sorted list of general-purpose relay URLs
  inbox    // A sorted list of user-defined inbox relay URLs
  local    // An unsorted list of local relay URLs

Parameters:
  rank  // The requested rank

Function getRelay:
  selected = []
  if local has members:
    add all local members to selected
  if rank less than length of inbox:
    add inbox[rank] to selected
  if rank less than length of general:
    add general[rank] to selected
```
