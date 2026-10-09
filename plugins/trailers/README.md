# Trailers

On-demand YouTube trailers for movies and series inside ReelVault, plus the
"Watch trailer" action on title pages.

## Features

- Finds the best YouTube trailer for a title from TMDB's video list. English is
  preferred by default; the `preferredLanguage` setting switches to Polish.
  The TMDB API key (`apiKey`) is optional but needed for the lookup.
- Plays the trailer in a `youtube-nocookie.com` dialog.
- Caches found trailers. A title without a trailer is remembered for 24 hours, so
  TMDB is not asked about it again before then.
- Sends its TMDB requests through the host's outbound HTTP capability, so the
  `plugins.http.allowedDomains` setting and the SSRF guard apply to them.

## Routes

- `GET /trailer` — the trailer for a title: `metadataId`, or `title` / `tmdbId`, with optional `mediaType` and `year`.
- `GET /stats` — the number of cached trailers, split into movies and series.

## Links

- Declarative schema dialogs and a `details-action-bar` slot.
- See the [Cinemamode](../cinemamode) plugin for pre-roll trailers before a movie.
