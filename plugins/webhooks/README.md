# Webhooks Plugin (`org.reelvault.webhooks`)

Sends ReelVault server events to Discord, Telegram, or any JSON endpoint.

## Features

- **Discord** — channel webhook (`content` payload with title and details).
- **Telegram** — bot API `sendMessage` (`telegramBotToken` + `telegramChatId`).
- **Generic JSON** — POST with `{ source, event, title, details, timestamp, server }`.
- **Events**: `media.ready` (new media), `playback.started`, `playback.stopped`.
- **Delivery log** — the last 100 attempts in plugin storage, with HTTP status and error.
- **Test** — manually send a test notification to every enabled target.

## HTTP routes (admin)

- `GET /status` — configuration (no secrets) + stats.
- `GET /history` — delivery log.
- `POST /test` — send a test notification.
- `POST /clear-history` — clear the log.

## Configuration (`config.ts`)

- `discordWebhookUrl` (secret), `discordEnabled`
- `telegramBotToken` (secret), `telegramChatId`, `telegramEnabled`
- `genericWebhookUrl` (secret), `genericEnabled`
- `serverPublicUrl` — link appended to notifications
- `onMediaReady`, `onPlaybackStarted`, `onPlaybackStopped`

## Frontend (`ui/` + `ui.json`)

The admin panel is a self-contained **declarative schema**
(`ui/schema-admin.ts` → `dist/ui/schema-admin.json`, referenced by `schemaRef`
in `ui.json`). The host renders it with its own components and talks to the
plugin's backend through the standard route bridge — no custom element bundle,
no iframe.
