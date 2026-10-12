# OMDb Metadata Provider (`org.reelvault.omdb`)

A metadata provider backed by the [OMDb API](https://www.omdbapi.com). It supplies IMDb data for movies and series.

## Setup

1. Get a free API key at [omdbapi.com](https://www.omdbapi.com). The key arrives by email.
2. In ReelVault, open **Admin → Plugins**, open **OMDb Metadata Provider** and paste the key into **OMDb API key**.
3. Save, then scan a library or re-identify a file.

The key is stored on your server as a secret. ReelVault never shows it again.

The free plan has a daily request limit, which a large first scan can reach.

## Configuration

| Field | Default | What it does |
|---|---|---|
| `apiKey` | none (required) | Your OMDb API key |
| `plot` | `full` | The plot length to fetch: `full` or `short` |

## Links

- [Plugins overview](../../README.md)
- [Artwork & descriptions](https://reelvault.org/guide/metadata) in the ReelVault docs
