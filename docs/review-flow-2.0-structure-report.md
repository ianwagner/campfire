# Ad Group & Review Flow 2.0 Analysis

## Current organization
- **Ad group document + subcollections.** A single ad group document supplies high-level metadata (campaign, locale, reviewVersion) while real-time `onSnapshot` listeners attach to the `assets`, `groupAssets`, `recipes`, and `copyCards` subcollections. The listeners fan the Firestore snapshots directly into component state, preserving Firestore IDs so downstream UI actions (edits, approvals) can write back to the same records.
- **Review Flow 2.0 load sequence.** When a reviewer opens an ad group with review version 2 or 3, the screen fetches the base document, runs a one-off `getDocs` for `assets`, and pulls `recipes` to drive step configuration. Assets are parsed for recipe codes, deduplicated to a single hero per creative, and merged with status metadata used to gate the approval checklist.
- **Copy-to-creative mapping.** `copyCards` are normalized into product-keyed dictionaries and paired with assets via recipe/product codes, letting the UI surface contextual copy next to each creative and reuse inline edit flows that push updates back to Firestore.

## Recommendations
1. **Add explicit error handlers to all ad group listeners.** Current `onSnapshot` calls omit error callbacks, so permission or connectivity failures silently halt live updates. Logging errors, surfacing toast notifications, and falling back to a periodic `getDocs` poll would keep asset, recipe, and copy data responsive during outages.
2. **Switch review asset loading to real-time with throttled fallback.** The review flow still fetches assets via a single `getDocs`, making mid-session uploads invisible. Converting that loader to `onSnapshot` (with a debounced poll fallback for legacy browsers) would keep reviewers synchronized with designers without manual refreshes.
3. **Introduce a normalization layer for review assets.** Firestore documents are currently spread straight into state, leaving downstream dedupe/sorting vulnerable to missing fields. A normalization step that enforces defaults for `status`, `recipeCode`, and URL metadata before processing would reduce crash risk and make analytics outputs more consistent.
