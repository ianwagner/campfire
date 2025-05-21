# Ad Review UI State Management Design

## Overview
The ad review interface allows multiple reviewers to provide feedback on ad assets. To keep the state simple and flexible, each ad document stores a single status field that is updated by any reviewer. Every change is appended to a `history` array so that designers can see how decisions evolved over time.

The system does **not** implement roles or locking. Any reviewer can change the status at any time. The most recent action represents the current state.

## Data Model
Each ad asset (stored under `adGroups/{groupId}/assets/{assetId}`) includes the following fields:

```json
{
  "status": "pending",                   // "pending" | "approved" | "rejected" | "edit_requested"
  "lastUpdatedBy": "<userId>",           // reviewer who last changed the status
  "lastUpdatedAt": "2025-05-20T21:47:00Z",
  "version": 1,
  "parentAdId": null,                    // asset ID of the original ad, null for first version
  "isResolved": false,
  "history": [                            // ordered list of all changes
    {
      "userId": "<userId>",
      "action": "approved",             // action taken
      "timestamp": "2025-05-20T21:03:00Z"
    }
  ]
}
```

* `status` – the current state of the ad asset.
* `lastUpdatedBy` – the `uid` of the reviewer who last made a change.
* `lastUpdatedAt` – ISO timestamp when the status was last updated.
* `version` – sequential version number starting at 1.
* `parentAdId` – reference to the original ad asset for tracking revisions.
* `isResolved` – when true, this ad (and its versions) no longer appear in the review queue.

* `history` – append-only array of change objects; newest entry reflects the current status.

## State Transitions
1. **Loading** – When the review UI loads, it queries all pending ad assets from Firestore and reads the current `status`, `lastUpdatedBy`, `lastUpdatedAt`, and `history` fields.
2. **Changing Status** – When a reviewer chooses Approve, Reject, or Request Edit:
   - The UI writes the new `status`, updates `lastUpdatedBy` and `lastUpdatedAt` with the reviewer’s ID and server timestamp, and pushes an entry to `history`.
   - No restrictions are enforced; any reviewer may overwrite the previous value.
3. **Viewing History** – Designers and reviewers read the full `history` array to see every action taken. The most recent entry indicates the current state.

## Ad Revisions and Versions
When a designer uploads a revised ad, a new document is created in the same collection. Copy `parentAdId` from the original, set `version` to the next number, and reset `status` to `pending`. Keep `isResolved` false so the revision appears in the queue.

### Resolving Ads
When the revised ad is approved, set `isResolved` to true on all documents with the same `parentAdId`. The final version remains `approved` but all related ads are hidden from further review.

## Designer Dashboard Requirements
- The dashboard displays the latest status (`status`, `lastUpdatedBy`, `lastUpdatedAt`).
- Beneath each ad, show a chronological log constructed from the `history` array. This allows designers to trace approvals, rejections, and edits over time.
- Highlight ads with multiple status changes if desired (e.g. show a badge when `history.length > 1`).

## No Roles or Locking
The system intentionally avoids role-based permissions or locking mechanics. All reviewers have equal ability to set the status, and updates happen immediately. Teams that want to coordinate who reviews can do so externally or with lightweight UI cues.

## Error Handling
If a status update fails (e.g. network error), the UI should surface the failure to the reviewer and allow them to retry. Firestore writes should be wrapped in try/catch blocks with appropriate user feedback.

