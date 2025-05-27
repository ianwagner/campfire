# Recipe Level Review Flow

This document describes the updated ad review workflow with explicit recipe versioning. Every recipe holds the ads for all aspect ratios and is reviewed as a single unit.

## Data Model

```
adGroups/{groupId}/recipes/{recipeId}
  status: "ready" | "approved" | "rejected" | "edit_requested"
  version: number
  lastUpdatedAt: Timestamp
  lastUpdatedBy: userId

adGroups/{groupId}/recipes/{recipeId}/assets/{assetId}
  firebaseUrl: string
  aspectRatio: string
  version: number           // matches parent recipe version
  parentAssetId: string     // original asset ID when replacing
```

- **status** controls visibility in the first-pass queue.
- **version** starts at `1` and increments whenever designers upload a new set of assets in response to an edit request.
- Individual assets are tracked for history but the recipe document determines what reviewers see.

## First Review Flow (Fast Pass)

1. Query recipes where `status == "ready"` and show one hero asset per recipe.
2. Reviewer may **approve**, **reject**, or **request_edit** for the entire recipe.
3. `approve` sets `status` to `approved`.
4. `reject` sets `status` to `rejected`.
5. `request_edit` sets `status` to `edit_requested`.
6. When no recipes remain with `status == "ready"` a summary screen is shown with counts and buttons for "Adjust Approvals" and "Gallery".

The review link automatically loads the First Review Flow if ready recipes exist. Otherwise it goes straight to the summary screen.

## Second Review Flow (Adjustments)

This view shows all recipes in the group regardless of status. It displays:

- Current status and version.
- Past versions (V1, V2, …) with thumbnails.
- Comment history for each action.
- Options to override the previous decision.

## Designer Workflow

Designers only see recipes marked `edit_requested`. After replacing the necessary aspect ratios they update the recipe's `status` to `ready`. The system increments `version` automatically. Only the latest version of a recipe returns to the First Review Flow.

