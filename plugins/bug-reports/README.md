# Bug Reports Plugin (`org.reelvault.bug-reports`)

Lets users report bugs, playback problems, bad metadata and UI glitches straight from the app, and gives admins a panel to triage them.

## Features

- **Report form** — users submit a category, priority, description, page URL, and browser/OS details.
- **HTTP routes**:
  - `GET /reports` — list reports (users see their own; admins see all, with filters for status, category, severity and text).
  - `GET /reports/summary` — counts by status (open, in progress, resolved, …). Administrators only.
  - `GET /reports/item/:id` — one report.
  - `POST /reports` — create a report.
  - `PATCH /reports/:id` — update status, priority and admin notes (admin only).
  - `DELETE /reports/:id` — delete a report (author or admin).
- **Retention** — the scheduled task `bug-reports-cleanup` deletes closed or rejected reports after the configured retention window.
- **Admin notifications** — optional in-app notification on every new report.

## Configuration (`config.ts`)

- `notifyAdminsOnReport` (boolean, default `true`) — notify admins about new reports.
- `maxActiveReportsPerUser` (number, default `20`) — active reports allowed per user.
- `retentionDays` (number, default `90`) — how long closed reports are kept.

## Frontend (`ui/` + `ui.json`)

The plugin is fully self-contained and uses **declarative schemas**: the host
(website) renders the UI with its own components (Dialog, Input, Select,
Textarea, Table…), so it matches the app and the host contains no plugin-specific
code. Schemas are data — they cannot run code; data and mutations go through the
plugin's backend routes.

- `ui/schema-report.ts` → the "Report a bug" dialog (submission form). It is reachable from the floating button and from the player's footer; a report sent from the player records the media file being played (`mediaId`).
- `ui/schema-detail.ts` → the manage dialog: the reporter, page URL and device details, plus status, severity and notes (save via PATCH) and delete (DELETE, after a confirmation). The captured logs are stored with the report and returned by `GET /reports/item/:id`; the dialog does not display them yet.
- `ui/schema-admin.ts` → the admin panel (stats, filters, report table, row actions).
- `ui.json` declares the surfaces with `schemaRef` (`./dist/ui/schema-*.json`) and the `root-floating-overlay` and `details-action-bar` slots that open the dialog.

Builder: `@reelvault/sdk/ui/schema` (`defineSchema`, `textField`, `table`, `button`, …). `bun run build-catalog` compiles `schema*.ts` to `dist/ui/schema-*.json` and packs it into the plugin archive.
