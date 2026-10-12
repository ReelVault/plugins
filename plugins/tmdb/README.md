# TMDB Metadata Provider (`org.reelvault.tmdb`)

A metadata provider backed by [The Movie Database (TMDB)](https://www.themoviedb.org). It supplies titles, overviews, details and artwork for movies and series.

This product uses the TMDB API but is not endorsed or certified by TMDB.

## Setup

1. Create a free account at [themoviedb.org](https://www.themoviedb.org) and get an API key or a read access token from your account settings.
2. In ReelVault, open **Admin → Plugins**, open **TMDB Metadata Provider** and paste the key into **TMDB API key (Read Access Token)**.
3. Save, then scan a library or re-identify a file.

The key is stored on your server as a secret. ReelVault never shows it again.

## Configuration

| Field | Default | What it does |
|---|---|---|
| `apiKey` | none (required) | The API key or v4 read access token |
| `language` | `en-US` | Language for overviews, titles and details, such as `pl-PL` |
| `fallbackLanguage` | `en-US` | Used when a translation is missing |
| `searchLanguage` | `en-US` | Language for searches. `en-US` matches English release names best |

Use language codes such as `en-US`, `pl-PL`, `pt-BR` or `de`.

## Links

- [Plugins overview](../../README.md)
- [Artwork & descriptions](https://reelvault.org/guide/metadata) in the ReelVault docs
