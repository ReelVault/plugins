# v1.0.1

### Features

- **Hidden until reviewed** — when downvotes reach `downvotesToHide` (default 2), the segment is hidden from the player and from other viewers until an administrator approves or rejects it. The author and administrators still see it, marked as hidden.
- **Administrator decisions** — the admin list has confirm and reject actions and a Hidden status filter. A decision locks the segment against further votes and against deletion by its author.
- **English and Polish interface** — the interface is translated and follows the host locale. Configuration labels stay in English.
- **Translated settings** — the setting labels and descriptions are available in English and Polish.
- **Clearer score settings** — `approvalThreshold` and `rejectionThreshold` are now *Approval score* and *Rejection score*. Their descriptions say the score is upvotes minus downvotes.

### Fixes

- **Marker sync after votes** — a vote stores the segment before markers are synced, so the sync sees the new status. It used to read the previous status of a segment that the vote had just hidden or approved.
- **Error responses** — failed requests return an HTTP error status with a code. They used to return 200 with an error body, so a refused delete could show as "Marker removed".
- **Private admin events** — administrator realtime events carry identifiers and status only, without the submitter's or voters' identities or the hidden segment's content.
