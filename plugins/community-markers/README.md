# Community Markers (SponsorBlock-style) Plugin for ReelVault

Community-submitted and community-verified video segments (intro, credits,
sponsors, recaps) in the spirit of SponsorBlock.

## Features

1. **Segment submission** — users mark a start and end (`startSeconds`, `endSeconds`) and pick a type:
   - `intro` (opening titles)
   - `credits` (end credits)
   - `recap` (previously on…)
   - `commercial` (sponsor / ad segment)
   - `chapter`

2. **Voting (upvote / downvote)** — any signed-in user can vote on a submitted
   segment (`+1`, `-1`, `0` to withdraw). The score is
   `upvotes.length - downvotes.length`.

3. **Automatic approval into the server database** — once a segment reaches the
   score threshold (default **1**), it is marked `approved` and written into
   ReelVault's native `media_markers` table, so the player skips it or shows a
   skip button. The submitter gets a notification: *"Your segment was approved
   by the community!"*

4. **Realtime events** — the plugin emits WebSocket events (`segment:submitted`,
   `segment:voted`, `segment:approved`, `segment:deleted`) so the player UI can
   update the progress bar immediately.

## HTTP routes

All routes live under `/v1/plugins/org.reelvault.community-markers/`:

- `GET /segments?mediaFileId={id}` — submitted segments with score and the current user's vote.
- `POST /segments` — submit a segment (`{ mediaFileId, type, startSeconds, endSeconds, label? }`).
- `POST /segments/vote?id={id}&mediaFileId={id}` — cast a vote (`{ value: 1 | -1 | 0 }`).
- `DELETE /segments?id={id}&mediaFileId={id}` — delete a segment (author).

## Configuration (`config.json`)

An optional `config.json` in the plugin directory:

```json
{
  "approvalThreshold": 1,
  "rejectionThreshold": -2,
  "autoApprove": false
}
```
