# Review 2.0 platform copy integration plan

## Objectives
- Surface platform copy inline with 1x1 units during the Review 2.0 flow so reviewers can see messaging context while approving square creatives.
- Pull copy variants per product (matching the Data/Distribution tab behaviour) so each ad is paired with the correct messaging card.
- Allow reviewers to edit copy directly in the flow and save changes back to the `copyCards` subcollection ("data sheet").

## Data plumbing
1. **Reuse the existing copy card subscription.** The Review screen already subscribes to `adGroups/{groupId}/copyCards` and stores the result in `copyCards`. 【F:src/Review.jsx†L586-L607】【F:src/Review.jsx†L1220-L1293】
2. **Group copy by product.** Build a `useMemo` that normalizes `copyCards` into a `{ productKey: CopyCard[] }` map (trim, lowercase) so lookups mirror `AdminDistribution`. That component batches cards per product before matching them to recipe rows. 【F:src/AdminDistribution.jsx†L200-L284】
3. **Fetch recipe metadata for Review 2.0.** Recipes (and their product names) are only loaded when `reviewVersion === 3` today. Extend the existing fetch to also hydrate `recipes` for version 2 so we can map each ad's `recipeCode` to the product name stored on the recipe document. 【F:src/Review.jsx†L580-L581】【F:src/Review.jsx†L1485-L1511】
4. **Map recipes to products.** Once recipes are always available, derive a dictionary that can resolve a product name by any of: recipe document ID, `recipeNo`, or the `recipeCode` embedded in filenames (strip leading zeros to mirror `AdminDistribution`).

## Rendering inline copy
1. **Attach product metadata to each card.** While constructing `recipeGroups`/`versionGroupsByAd`, annotate the group with the resolved product name so each asset set knows which copy cards apply.
2. **Detect the 1x1 creative.** Review 2.0 already sorts version assets by aspect ratio priority. When iterating over `sortedAssets`, check for `normalizeAspectKey(getAssetAspectRatio(asset)) === '1x1'`. For that entry, render a new `ReviewCopyPanel` before and after the asset grid.
3. **Display copy variants.** The panel should pull `copyByProduct[productKey]`. If multiple cards exist, render them as a stack (matching the modal style) with clear labels for primary/headline/description.
4. **Handle empty states.** When no copy exists for a product, show a link to generate copy (opening the existing modal) or a "No platform copy yet" message.

## Editing workflow
1. **Reuse the existing edit modal plumbing.** `handleOpenEditModal('copy')` already preps the edit state and leverages `saveCopyCards` to persist updates to Firestore. 【F:src/Review.jsx†L4100-L4172】【F:src/Review.jsx†L2998-L3033】
2. **Pre-filter modal to the product.** When the reviewer clicks "Edit copy" from a panel, set `modalCopies` to only that product's cards before invoking the modal. After saving, merge the results back into the full `copyCards` array so other products remain intact.
3. **Offer inline quick edits.** For simple tweaks (e.g., fixing a typo), expose inline inputs bound to local state and call `saveCopyCards` with the updated list. This keeps the modal optional while still using the shared persistence method.
4. **Leverage `CopyRecipePreview` for advanced editing.** Embedding the component in the modal maintains feature parity (generation, product selection, delete). It already accepts `initialResults`, `showOnlyResults`, and `onCopiesChange` to keep local state in sync with `copyCards`. 【F:src/CopyRecipePreview.jsx†L20-L140】

## Persistence & syncing
- `saveCopyCards` already handles create/update/delete operations against Firestore; ensure inline edits reuse this function so the Data/Distribution tab continues to pick up changes automatically. 【F:src/Review.jsx†L2998-L3033】
- After saving, refresh the product map memo so the inline panels immediately reflect updates without requiring a full page reload.

## UX considerations
- Keep the copy panel visually lightweight (e.g., bordered card with typography hierarchy) to avoid overpowering the creative preview.
- Preserve existing review hotkeys and focus flow—open the copy modal in a dialog that traps focus, and return focus to the triggering button on close.
- Respect `isGroupReviewed` locks: disable inline edit controls when the group is finalized, matching the behaviour of the status dropdown.
