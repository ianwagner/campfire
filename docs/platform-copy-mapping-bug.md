# Platform copy hydration

The inline platform copy panels in the Review screen depend on the local
`copyCards` state. When the `allowPublicListeners` flag is disabled we still
need to fetch copy cards so they can be matched with ads.

The Review page now always loads copy cards for a group and selects the
strategy based on runtime capabilities:

- If realtime listeners are allowed **and** enabled, the page attaches a
  Firestore snapshot listener so updates stream in automatically.
- Otherwise it falls back to polling the collection every 10 seconds. The
  effect no longer returns early just because `allowPublicListeners` is
  false, so reviewers still see the latest copy even in locked-down reviews.
  【F:src/Review.jsx†L1496-L1559】

Downstream selectors (`copyCardsWithMeta`, `copiesByProduct`, and
recipe-based assignments) continue to build off `copyCards`, ensuring platform
copy panels stay populated now that the state is hydrated regardless of the
flag. 【F:src/Review.jsx†L751-L875】
