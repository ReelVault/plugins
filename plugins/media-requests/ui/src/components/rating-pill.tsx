import type { MediaRating } from "../../../types";

interface RatingStyle {
	dot: string;
	label?: string;
}

/** Signature colors for well-known rating sources; unknown sources stay neutral. */
const RATING_STYLES: Record<string, RatingStyle> = {
	tmdb: { dot: "linear-gradient(140deg, #ffb02e 0%, #ff4d17 55%, #d32f2f 100%)", label: "TMDB" },
	imdb: { dot: "#f5c518", label: "IMDb" },
	rotten_tomatoes: { dot: "#fa320a", label: "RT" },
	rotten_tomatoes_fresh: { dot: "#fa320a", label: "RT" },
	rotten_tomatoes_certified_fresh: { dot: "#fa320a", label: "RT" },
	rotten_tomatoes_upright: { dot: "#fa320a", label: "RT" },
	rotten_tomatoes_splat: { dot: "#94cc2c", label: "RT" },
	metacritic: { dot: "#6c3", label: "MC" },
	mal: { dot: "#2e51a2", label: "MAL" },
	anilist: { dot: "#02a9ff", label: "AL" },
	trakt: { dot: "#ed1c40", label: "Trakt" },
};

export function RatingPill({ rating }: { rating: MediaRating }) {
	const style: RatingStyle = RATING_STYLES[rating.source.toLowerCase()] ?? { dot: "" };
	const label = rating.label ?? style.label ?? rating.source;
	const value = rating.maxValue ? `${rating.value}/${rating.maxValue}` : `${rating.value}`;

	return (
		<span className="rv-rating" title={label}>
			<span className="rv-rating__dot" style={style.dot ? { background: style.dot } : undefined} aria-hidden="true" />
			<span className="rv-rating__value">{value}</span>
		</span>
	);
}
