# Webhooks (`org.reelvault.webhooks`)

Sends ReelVault server events to Discord, Telegram, or any JSON endpoint.

## Features

- **Discord**: channel webhook (`content` payload with title and details).
- **Telegram**: bot API `sendMessage` (`telegramBotToken` + `telegramChatId`).
- **Generic JSON**: POST with `{ source, event, title, details, timestamp, server }`.
- **Events**: `media.ready` (new media), `playback.started`, `playback.stopped`.
- **Delivery log**: the last 100 attempts in plugin storage, with HTTP status and error.
- **Test**: manually send a test notification to every enabled target.

## HTTP routes (admin)

- `GET /status`: configuration (no secrets) and stats.
- `GET /history`: delivery log.
- `POST /test`: send a test notification.
- `POST /clear-history`: clear the log.

## Configuration (`config.ts`)

- `discordWebhookUrl` (secret), `discordEnabled`
- `telegramBotToken` (secret), `telegramChatId`, `telegramEnabled`
- `genericWebhookUrl` (secret), `genericEnabled`
- `serverPublicUrl`: link appended to notifications
- `onMediaReady`, `onPlaybackStarted`, `onPlaybackStopped`

## Frontend (`ui/` + `ui.json`)

The admin panel is a **declarative schema** (`ui/schema-admin.ts` → `dist/ui/schema-admin.json`, referenced by `schemaRef` in `ui.json`). The website renders it with its own components and calls the plugin's HTTP routes. There is no custom browser bundle and no iframe.
