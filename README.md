# ReelVault Plugins

The official plugins for [ReelVault](https://reelvault.org), a self-hosted media server. Each folder under [`plugins/`](plugins/) is one plugin, with its own `plugin.json` manifest, code and README.

Install them in ReelVault from **Admin → Plugins**.

## Official plugins

| Plugin | ID | What it does |
|---|---|---|
| [TMDB Metadata Provider](plugins/tmdb/README.md) | `org.reelvault.tmdb` | Titles, overviews and artwork from The Movie Database |
| [OMDb Metadata Provider](plugins/omdb/README.md) | `org.reelvault.omdb` | IMDb data from OMDb |
| [Community Markers](plugins/community-markers/README.md) | `org.reelvault.community-markers` | Shared intro, credits and recap markers, with voting |
| [Trailers](plugins/trailers/README.md) | `org.reelvault.trailers` | On-demand YouTube trailer search and playback |
| [Cinemamode](plugins/cinemamode/README.md) | `org.reelvault.cinemamode` | Plays trailers of similar titles before a movie |
| [Media Requests](plugins/media-requests/README.md) | `org.reelvault.requests` | Users request missing titles, admins approve them |
| [Bug Reports](plugins/bug-reports/README.md) | `org.reelvault.bug-reports` | Users report problems, admins triage them in the panel |
| [Webhooks](plugins/webhooks/README.md) | `org.reelvault.webhooks` | Sends server events to Discord, Telegram or any JSON endpoint |
| [Notify Webhook](plugins/notify-webhook/README.md) | `org.reelvault.notify-webhook` | Sends every notification to a JSON webhook |

## Build the catalog

```bash
bun install
bun run build-catalog
```

The build writes `dist/reelvault-catalog.json`, which ReelVault servers read, and one zip per plugin version in `dist/plugins/<id>/`. A version that is already packaged in `dist/` is reused, not rebuilt.

## Test and check

```bash
bun run test
bun run lint
bun run check-types
bun run deadcode
```

`lint` runs Biome and oxlint without changing files. Use `bun run lint:fix` to apply Biome's fixes.

## Write your own

Start from the `plugin-template` repository. The [plugin guide](https://reelvault.org/plugins/getting-started) explains the manifest, the host API and the UI schema.

## License

GNU General Public License v3.0. See [LICENSE](LICENSE).
