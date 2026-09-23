import type { GenreTile } from "../../../types";
import { genreHue } from "./format";
import { tileBackdropUrl } from "./poster-url";

/**
 * Jellyseerr-style genre tile: a representative backdrop under a strong tint
 * derived deterministically from the genre id. Without a backdrop the tint
 * becomes the whole tile.
 */
export function GenreTileCard({ tile, onSelect }: { tile: GenreTile; onSelect: (tile: GenreTile) => void }) {
	const backdrop = tileBackdropUrl(tile.backdropPath);
	const hue = genreHue(`${tile.mediaType}:${tile.id}`);
	const startAlpha = backdrop ? 0.82 : 0.95;
	const endAlpha = backdrop ? 0.86 : 0.98;
	const scrim = `linear-gradient(115deg, hsl(${hue} 62% 42% / ${startAlpha}) 0%, hsl(${(hue + 24) % 360} 58% 34% / ${endAlpha}) 100%)`;

	return (
		<button type="button" className="rv-tile" onClick={() => onSelect(tile)}>
			{backdrop ? <img src={backdrop} alt="" loading="lazy" /> : null}
			<span className="rv-tile__scrim" style={{ backgroundImage: scrim }} aria-hidden="true" />
			<span className="rv-tile__name">{tile.name}</span>
		</button>
	);
}
