# Ad Review UI State Management Design

## Overview
The ad review interface allows multiple reviewers to provide feedback on ad assets. To keep the state simple and flexible, each ad document stores a single status field that is updated by any reviewer.

The interface now uses a lightweight locking mechanism on ad groups so only one reviewer edits at a time. Each group document stores `lockedBy` (display name) and `lockedByUid` (the reviewer's uid). Older documents may omit `lockedByUid`, so the UI falls back to comparing names when determining who holds the lock.

## Data Model
Each ad asset (stored under `adGroups/{groupId}/assets/{assetId}`) includes the following fields:

```json
{
  "status": "pending",                   // "pending" | "approved" | "rejected" | "edit_requested"
  "lastUpdatedBy": "<userId>",           // reviewer who last changed the status
  "lastUpdatedAt": "2025-05-20T21:47:00Z",
  "version": 1,
  "parentAdId": null,                    // asset ID of the original ad, null for first version
  "isResolved": false
}
```

* `status` – the current state of the ad asset.
* `lastUpdatedBy` – the `uid` of the reviewer who last made a change.
* `lastUpdatedAt` – ISO timestamp when the status was last updated.
* `version` – sequential version number starting at 1.
* `parentAdId` – reference to the original ad asset for tracking revisions.
* `isResolved` – when true, this ad (and its versions) no longer appear in the review queue.


Newly uploaded ads start in the `pending` state so they are immediately visible to reviewers.

## State Transitions
1. **Loading** – When the review UI loads, it queries all pending ad assets from Firestore and reads the current `status`, `lastUpdatedBy`, and `lastUpdatedAt` fields.
2. **Changing Status** – When a reviewer chooses Approve, Reject, or Request Edit:
   - No restrictions are enforced; any reviewer may overwrite the previous value.

## Ad Revisions and Versions
When a designer uploads a revised ad, a new document is created in the same collection. Copy `parentAdId` from the original, set `version` to the next number, and reset `status` to `pending`. Keep `isResolved` false so the revision appears in the queue.

When the designer marks the revision `ready`, the previous ad's status is changed to `archived`. The review UI only displays the latest version but allows reviewers to open a modal and toggle between the newest and archived versions for reference.

### Resolving Ads
When the revised ad is approved, set `isResolved` to true on all documents with the same `parentAdId`. The final version remains `approved` but all related ads are hidden from further review.

## Designer Dashboard Requirements
- The dashboard displays the latest status (`status`, `lastUpdatedBy`, `lastUpdatedAt`).

## Locking Behavior
Role-based permissions are still avoided, but ad groups can be locked by a reviewer to reduce conflicts. The `lockedBy` and `lockedByUid` fields identify who currently holds the lock. The lock is cleared when the reviewer leaves the page so another user can resume the review later.

## Error Handling
If a status update fails (e.g. network error), the UI should surface the failure to the reviewer and allow them to retry. Firestore writes should be wrapped in try/catch blocks with appropriate user feedback.

## Cross-Collection Queries
When reviewers open the dashboard they may want to see all ready assets across
multiple ad groups. The UI uses Firestore's `collectionGroup` queries to read
every `assets` subcollection in a single request. Because each asset document
stores its `brandCode`, the query can filter by brand without loading each group
first.

