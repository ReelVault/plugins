# Trailers (`org.reelvault.trailers`)

On-demand YouTube trailers for movies and series, plus the **Watch trailer**
action on title pages.

## Features

- Finds the best YouTube trailer for a title from TMDB's video list. It searches
  the language set in `preferredLanguage` (English or Polish) first, then falls
  back to the official English trailer.
- Needs a TMDB API key (`apiKey`). The field is optional in the settings, but
  without a key no trailers are found.
- Plays the trailer in a `youtube-nocookie.com` dialog.
- Caches found trailers. A title without a trailer is remembered for 24 hours, so
  TMDB is not asked about it again before then.
- Sends its TMDB requests through the host's outbound HTTP capability, so the
  `plugins.http.allowedDomains` setting and the SSRF guard apply to them.

## Routes

- `GET /trailer`: the trailer for a title. Pass `metadataId`, or `title` / `tmdbId`, with optional `mediaType` and `year`.
- `GET /stats`: the number of cached trailers, split into movies and series.

## Related

- The trailer dialog is declarative (a schema) and sits in the `details-action-bar` slot.
- [Cinemamode](../cinemamode) plays trailers before a movie.
