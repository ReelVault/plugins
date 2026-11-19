<div align="center">

<img src=".github/assets/banner.png" alt="ReelVault Plugins" width="1200">

# ReelVault Plugins

**Add only the features you need.**

[![Plugins](https://img.shields.io/badge/official%20plugins-9-00E676?style=for-the-badge)](plugins/)
[![Docs](https://img.shields.io/badge/docs-reelvault.org-00E676?style=for-the-badge)](https://reelvault.org/plugins/getting-started)
[![License](https://img.shields.io/badge/license-GPL--3.0-blue?style=for-the-badge)](LICENSE)

[Docs](https://reelvault.org/plugins/getting-started) · [Why plugins](#why-plugins) · [Install](#install-in-three-steps) · [Official plugins](#official-plugins) · [Development](#development)

</div>

These are the official plugins for [ReelVault](https://reelvault.org), a self-hosted media server. Every folder under [`plugins/`](plugins/) is a plugin, with its own `plugin.json`, code and README.

<div align="center">

<img src="https://reelvault.org/screenshots/admin-plugins.png" alt="Installing plugins in the admin panel" width="850">

</div>

## Why plugins

| | |
|---|---|
| 🎬 **Better artwork and descriptions** | TMDB and OMDb add posters, summaries and ratings to your titles. |
| ✂️ **Skip the boring parts** | Skip intros, credits and recaps with markers shared and voted on by the community. |
| 📽️ **Trailers, on demand** | Look up a trailer for any title, or play trailers for similar movies before the main film. |
| 📥 **Requests and reports** | Let users ask for missing titles and report problems; admins deal with both in the panel. |
| 🔔 **Notifications that reach you** | Send server events to Discord, Telegram or any JSON endpoint, or forward every notification to a webhook. |
| 🧩 **Your own ideas** | Write a plugin with the SDK, bundle it as a zip and install it without rebuilding the server. |

> Plugins run **inside the server process**, with full access to your server. Only install ones you trust.

## Install in three steps

1. Open **Admin → Plugins** in your ReelVault web app.
2. Find the plugin under **Available** — or add this catalog with the **Repositories** button if it isn't listed yet.
3. Install it, then configure it on its settings page. No server restart needed.

## Official plugins

| Plugin | ID | What it does |
| --- | --- | --- |
| 🎬 [TMDB Metadata Provider](plugins/tmdb/README.md) | `org.reelvault.tmdb` | Titles, overviews and artwork from The Movie Database |
| 🎞️ [OMDb Metadata Provider](plugins/omdb/README.md) | `org.reelvault.omdb` | IMDb data from OMDb |
| ✂️ [Community Markers](plugins/community-markers/README.md) | `org.reelvault.community-markers` | Shared intro, credits and recap markers, with voting |
| 📽️ [Trailers](plugins/trailers/README.md) | `org.reelvault.trailers` | On-demand YouTube trailer search and playback |
| 🍿 [Cinemamode](plugins/cinemamode/README.md) | `org.reelvault.cinemamode` | Plays trailers of similar titles before a movie |
| 📥 [Media Requests](plugins/media-requests/README.md) | `org.reelvault.requests` | Users request missing titles, admins approve them |
| 🐞 [Bug Reports](plugins/bug-reports/README.md) | `org.reelvault.bug-reports` | Users report problems, admins review them in the panel |
| 🔔 [Webhooks](plugins/webhooks/README.md) | `org.reelvault.webhooks` | Sends server events to Discord, Telegram or any JSON endpoint |
| 📣 [Notify Webhook](plugins/notify-webhook/README.md) | `org.reelvault.notify-webhook` | Sends every notification to a JSON webhook |

## Development

Everything in this section is for people maintaining the catalog or writing plugins.

### Build the catalog

```bash
bun install
bun run build-catalog
```

It writes `dist/reelvault-catalog.json` (what servers read), plus a zip for each plugin version in `dist/plugins/<id>/`. Versions already packaged in `dist/` aren't rebuilt.

### Test and check

```bash
bun run test
bun run lint
bun run check-types
bun run deadcode
```

`lint` runs Biome and oxlint without touching files. Use `lint:fix` to apply Biome's fixes.

### Write your own

Start from the [`plugin-template`](https://github.com/ReelVault/plugin-template) repository. The [plugin guide](https://reelvault.org/plugins/getting-started) explains the manifest, the host API and the UI schema.

### Publish a catalog

For one-click installs, host a `reelvault-catalog.json` at any static URL (a GitHub Release asset is fine) with one entry per plugin. The [publishing guide](https://reelvault.org/plugins/publishing) covers the format and the checksum.

Contributions are welcome — see [CONTRIBUTING.md](https://github.com/ReelVault/.github/blob/main/CONTRIBUTING.md).

## License

GNU General Public License v3.0. See [LICENSE](LICENSE).
