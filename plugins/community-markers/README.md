# Community Markers (`org.reelvault.community-markers`)

Community-submitted and community-verified video segments (intro, credits,
recaps, chapters and highlights) in the spirit of SponsorBlock.

## Features

1. **Segment submission** — users mark a start and end (`startSeconds`, `endSeconds`) and pick a type:
   `intro`, `credits`, `recap`, `chapter`, or `highlight` (a single point in time).

2. **Voting (upvote / downvote)** — any signed-in user can vote on a submitted
   segment (`+1`, `-1`, `0` to withdraw). The score is
   `upvotes.length - downvotes.length`.

3. **Approval into the server database** — a segment that reaches the approval
   threshold is marked `approved` and written into ReelVault's native
   `media_markers` table, so the player skips it or shows a skip button. Only
   approved segments reach the player.

4. **Moderation** — an administrator's decision is final: votes never change a
   segment that an administrator edited.
   - `downvotesToHide` (default **2**): once a segment has this many downvotes it
     becomes `hidden`. It is removed from the player and from other viewers' lists
     until an administrator approves or rejects it. Its author and administrators
     still see it, marked as hidden.
   - `rejectionThreshold` (default **-2**): a segment whose score falls to this
     value becomes `rejected` and is removed from the player.
   - An administrator edit locks the segment: votes no longer change it, and its
     author can no longer delete it.

5. **Realtime events** — the plugin emits `segment:submitted`, `segment:voted`,
   `segment:approved`, `segment:rejected`, `segment:hidden`, `segment:updated`, and
   `segment:deleted`. Hidden and updated events carry only the identifiers and the
   status, never the segment's content.

6. **Translations** — the interface is available in English and Polish and follows
   the host locale. Failed requests carry an HTTP error status and a `code`
   (for example `404` with `segment.not_found`); the interface translates the code.

## HTTP routes

All routes live under `/v1/plugins/org.reelvault.community-markers/`:

- `GET /segments?mediaFileId={id}` — segments with their score and the current user's vote.
- `POST /segments` — submit a segment (`{ mediaFileId, type, startSeconds, endSeconds, label? }`).
- `POST /segments/vote?id={id}&mediaFileId={id}` — cast a vote (`{ value: 1 | -1 | 0 }`).
- `DELETE /segments?id={id}&mediaFileId={id}` — delete a segment (its author or an administrator).

Administrator routes:

- `GET /admin/segments` — every segment across all media files.
- `PATCH /admin/segments?id={id}&mediaFileId={id}` — edit or decide on a segment (locks it).
- `DELETE /admin/segments?id={id}&mediaFileId={id}` — delete a segment.

## Configuration

| Option | Default | Meaning |
| --- | --- | --- |
| `autoApprove` | `false` | New segments go live for everyone immediately. |
| `approvalThreshold` | `1` | Net score (upvotes minus downvotes) a segment needs to be approved in manual mode. |
| `rejectionThreshold` | `-2` | Net score (negative) at which a segment is rejected. |
| `downvotesToHide` | `2` | Downvotes at which a segment is hidden until an administrator decides. |
