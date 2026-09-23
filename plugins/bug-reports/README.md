# Bug Reports Plugin (`org.reelvault.bug-reports`)

Lets users report bugs, playback problems, bad metadata and UI glitches straight from the app, and gives admins a panel to triage them.

## Features

- **Report form** — users submit a category, priority, description, page URL, and browser/OS details.
- **HTTP routes**:
  - `GET /reports` — list reports (users see their own; admins see all, with filters for status, category, severity and text).
  - `GET /reports/summary` — counts by status (open, in progress, resolved, …).
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
(ReelVault.Website) renders the UI with its own components (Dialog, Input, Select,
Textarea, Table…), so it matches the app and the host contains no plugin-specific
code. Schemas are data — they cannot run code; data and mutations go through the
plugin's backend routes.

- `ui/schema-report.ts` → the "Report a bug" dialog (submission form).
- `ui/schema-detail.ts` → the edit dialog (status, severity, notes; save via PATCH, delete via DELETE).
- `ui/schema-admin.ts` → the admin panel (stats, filters, report table, row actions).
- `ui.json` declares the surfaces with `schemaRef` (`./dist/ui/schema-*.json`) and the `root-floating-overlay` and `details-action-bar` slots that open the dialog.

Builder: `reelvault-sdk/ui/schema` (`defineSchema`, `textField`, `table`, `button`, …). `bun run build-catalog` compiles `schema*.ts` to `dist/ui/schema-*.json` and packs it into the plugin archive.
