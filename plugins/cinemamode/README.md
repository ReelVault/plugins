# Cinemamode

Cinema mode for ReelVault — before a movie starts, the player rolls a few
trailers of similar titles (by default only titles already in your library), so
you get a few minutes of "pre-show" before the feature. The viewer can skip the
trailers at any time.

## How it works

- The plugin declares a `playbackPreRoll` field in `ui.json` pointing at `/pre-roll`.
- Before a session starts, the player asks the first enabled plugin with that
  declaration and plays the entries it returns (embedded YouTube).
- Title selection: TMDB `recommendations` + `similar` for the title being played,
  intersected with your library (`host.metadata.findManyByExternalIds`). With
  `libraryOnly` on, only titles you own are eligible.
- Results are cached in plugin storage (12 h) so playback start is not delayed.

## Configuration (plugin settings in the admin panel)

- `enabled` — turns cinema mode on (off by default)
- `tmdbApiKey` — optional own TMDB API key
- `language` — preferred trailer language (`en-US` / `pl-PL`)
- `trailerCount` — number of trailers, 1–5 (default 3)
- `libraryOnly` — library titles only (default on)

Diagnostic endpoint: `GET /v1/plugins/org.reelvault.cinemamode/preview?mediaFileId=…`
(admin) — shows what would be played.
