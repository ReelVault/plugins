# v1.3.0

### Features

- **Captured logs in the manage dialog** — the manage dialog shows the logs a report captured, read-only and scrollable. Reports without logs show no block.
- **Report a bug from the player** — the player footer has a Report a bug button. A report sent from the player records the media file being played, and the manage dialog shows it.
- **Reporter, page and device** — the manage dialog shows who reported a bug, the page it happened on, and the browser and operating system. Reports can be deleted after a confirmation.

### Fixes

- **Storage limit** — each report is stored under its own key with an index of ids, so the 64 KiB value limit of plugin storage no longer stops new reports once enough have been filed. A report stored by an earlier version moves over on first use.
- **Log size and report count** — captured logs keep their newest 16,000 characters, and at most 1,500 reports are stored. A full store refuses new reports until closed ones are deleted.
- **Concurrent writes** — creating, updating, deleting and cleaning up reports run one at a time. Two writes at once cannot drop one, and two submissions at once cannot both pass the active-report limit.
- **Error responses** — errors return an HTTP status with a stable error code instead of a 200 response with a message. The summary is available to administrators only.
