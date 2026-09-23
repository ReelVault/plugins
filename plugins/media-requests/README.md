# ReelVault Plugin: Media Requests (`org.reelvault.requests`)

A **Jellyseerr/Seerr-style** plugin: discover movies and series, search, see
details with availability, and run a request-and-approval flow for admins.

## Features

- **Discover**: carousels for *Trending*, *Popular movies*, *Popular series*,
  *Upcoming movies*, *Top rated* and genre filters. Data comes from installed
  metadata providers (e.g. TMDB) through the `providerAccess` capability — the
  plugin needs no API key of its own.
- **Search**: movies and series with poster and rating hints.
- **Details**: overview, cast, seasons, ratings, release status and
  recommendations, plus a clear availability badge (`Available` / `Pending` /
  `Approved` / `Rejected` / `Unavailable`).
- **Requests**: a user requests a title that is not in the library; an admin
  approves or rejects it.
- **Automatic availability detection (auto-fulfilment)**:
  - listens for the `media.file.ready` event;
  - matches on external id (provider) or title + year;
  - flips the status to `available` and sends the user an in-app notification;
  - the UI refreshes over realtime (`requests.changed`).
- **Scheduled task**: `media-requests-sync` periodically reconciles requests with the library.

## Requirements

- A metadata provider that supports discovery (e.g. `org.reelvault.tmdb`).
  Without one, the Discover page shows a hint and everything else keeps working.

## HTTP routes

All paths are relative to `/v1/plugins/org.reelvault.requests`:

| Method | Path | Permission | Description |
|---|---|---|---|
| `GET` | `/providers` | `user` | List metadata providers. |
| `GET` | `/discover` | `user` | Discovery feed (`category`, `mediaType`, `page`, `window`, `genreId`, `year`). |
| `GET` | `/search` | `user` | Search (`query`, `mediaType`). |
| `GET` | `/genres` | `user` | Genres (`mediaType`). |
| `GET` | `/details` | `user` | Details (`providerId`, `externalId`, `mediaType`). |
| `GET` | `/requests` | `user` | List requests (filter by status, type, range). |
| `GET` | `/requests/summary` | `user` | Numeric summary. |
| `POST` | `/requests` | `user` | New request (`title`, `mediaType`, `providerId`, `externalId`, …). |
| `PATCH` | `/requests/:id` | `admin` | Change a request's status. |
| `DELETE` | `/requests/:id` | `user` | Delete / cancel a request. |

## Capabilities

- `capabilities`: `httpRoute`, `storage`, `jobs`, `eventHandler`, `notification`, `providerAccess`
