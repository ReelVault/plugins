import { type ReactNode, useCallback, useEffect, useState } from "react";
import type { GenreTile, MediaCard, MediaRequest, MediaRequestStatus } from "../../types";
import { createApi, type DiscoverQuery } from "./api";
import { EmptyState, ErrorState, SkeletonGrid, SkeletonRow } from "./components/feedback";
import { GenreTileCard } from "./components/genre-tile";
import { PosterCard } from "./components/poster-card";
import { RequestCard } from "./components/request-card";
import { CarouselRow, Shelf } from "./components/shelf";
import { detach } from "./detach";
import { usePluginHost } from "./host-context";
import { getMessages, type Messages } from "./messages";

interface ShelfDefinition {
	key: string;
	titleKey: keyof Messages;
	query: DiscoverQuery;
}

/** Order mirrors the Jellyseerr discover layout. */
const BASE_SHELVES: ShelfDefinition[] = [
	{ key: "trending", titleKey: "trending", query: { category: "trending", mediaType: "movie", window: "day" } },
	{ key: "popular-movies", titleKey: "popularMovies", query: { category: "popular", mediaType: "movie" } },
	{ key: "upcoming-movies", titleKey: "upcomingMovies", query: { category: "upcoming", mediaType: "movie" } },
	{ key: "popular-shows", titleKey: "popularShows", query: { category: "popular", mediaType: "tv_show" } },
	{ key: "upcoming-shows", titleKey: "upcomingShows", query: { category: "upcoming", mediaType: "tv_show" } },
	{ key: "top-movies", titleKey: "topRatedMovies", query: { category: "top_rated", mediaType: "movie" } },
	{ key: "top-shows", titleKey: "topRatedShows", query: { category: "top_rated", mediaType: "tv_show" } },
];

interface GenreView {
	tile: GenreTile;
	items: MediaCard[];
	page: number;
	totalPages: number;
	loading: boolean;
}

type SearchFilter = "all" | "movie" | "tv_show";

const SEARCH_FILTERS: SearchFilter[] = ["all", "movie", "tv_show"];

const REQUESTS_EVENT = "plugin:org.reelvault.requests:requests.changed";

function detailPageUrl(providerId: string, externalId: string, mediaType: string): string {
	return `/plugins/org.reelvault.requests/page/detail?providerId=${encodeURIComponent(providerId)}&externalId=${encodeURIComponent(
		externalId,
	)}&mediaType=${mediaType}`;
}

function CardGrid({
	cards,
	messages,
	onOpen,
	onRequest,
	loading = false,
}: {
	cards: MediaCard[];
	messages: Messages;
	onOpen: (card: MediaCard) => void;
	onRequest?: (card: MediaCard) => void;
	loading?: boolean;
}) {
	if (loading) return <SkeletonGrid />;
	if (cards.length === 0) return <EmptyState text={messages.noResults} />;
	return (
		<div className="rv-grid">
			{cards.map((card) => (
				<PosterCard key={`${card.providerId}:${card.externalId}`} card={card} messages={messages} onOpen={onOpen} onRequest={onRequest} />
			))}
		</div>
	);
}

export function DiscoverPage() {
	const host = usePluginHost();
	const messages = getMessages(host.context.locale);
	const locale = host.context.locale;
	const [api] = useState(() => createApi(host));
	const isAdmin = host.context.user?.role === "admin";
	const userId = host.context.user?.id;

	const [shelves, setShelves] = useState<Record<string, MediaCard[]>>({});
	const [shelfStatus, setShelfStatus] = useState<"loading" | "idle" | "error">("loading");
	const [unsupported, setUnsupported] = useState(false);

	const [movieTiles, setMovieTiles] = useState<GenreTile[]>([]);
	const [tvTiles, setTvTiles] = useState<GenreTile[]>([]);
	const [tilesStatus, setTilesStatus] = useState<"loading" | "idle" | "error">("loading");

	const [requests, setRequests] = useState<MediaRequest[] | null>(null);

	const [genreView, setGenreView] = useState<GenreView | null>(null);

	const [searchInput, setSearchInput] = useState("");
	const [searchTerm, setSearchTerm] = useState<string | null>(null);
	const [searchResults, setSearchResults] = useState<MediaCard[] | null>(null);
	const [searchFilter, setSearchFilter] = useState<SearchFilter>("all");

	const loadShelves = useCallback(async (): Promise<void> => {
		setShelfStatus("loading");
		try {
			const pages = await Promise.all(BASE_SHELVES.map((shelf) => api.discover(shelf.query)));
			const byKey: Record<string, MediaCard[]> = {};
			BASE_SHELVES.forEach((shelf, index) => {
				const loaded = pages[index];
				byKey[shelf.key] = loaded ? loaded.items : [];
			});
			setShelves(byKey);
			setUnsupported(pages.every((page) => page.unsupported));
			setShelfStatus("idle");
		} catch {
			setShelfStatus("error");
		}
	}, [api]);

	const loadRequests = useCallback(async (): Promise<void> => {
		try {
			const result = await api.listRequests({ scope: isAdmin ? "all" : "me" });
			setRequests(result.requests.slice(0, 20));
		} catch {
			// The recent-requests shelf is decorative on this page; hide it on failure.
			setRequests([]);
		}
	}, [api, isAdmin]);

	const loadTiles = useCallback(async (): Promise<void> => {
		setTilesStatus("loading");
		try {
			const [movies, shows] = await Promise.all([api.genreTiles({ mediaType: "movie" }), api.genreTiles({ mediaType: "tv_show" })]);
			setMovieTiles(movies.tiles);
			setTvTiles(shows.tiles);
			setTilesStatus("idle");
		} catch {
			setTilesStatus("error");
		}
	}, [api]);

	useEffect(() => {
		detach(loadShelves());
		detach(loadRequests());
	}, [loadShelves, loadRequests]);

	// Genre tiles fire a burst of provider calls server-side; run them after the
	// main shelves are in so the page paints first.
	useEffect(() => {
		if (shelfStatus !== "idle" || searchTerm) return;
		detach(loadTiles());
	}, [shelfStatus, searchTerm, loadTiles]);

	useEffect(() => {
		const unsubscribe = host.onEvent(REQUESTS_EVENT, () => {
			detach(loadShelves());
			detach(loadRequests());
		});
		return unsubscribe;
	}, [host, loadShelves, loadRequests]);

	useEffect(() => {
		let cancelled = false;
		const run = async (): Promise<void> => {
			const term = searchTerm;
			if (!term) return;
			try {
				const [movies, shows] = await Promise.all([
					api.search({ query: term, mediaType: "movie" }),
					api.search({ query: term, mediaType: "tv_show" }),
				]);
				if (!cancelled) setSearchResults([...movies.items, ...shows.items]);
			} catch {
				if (!cancelled) setSearchResults([]);
			}
		};
		if (searchTerm) {
			detach(run());
		} else {
			setSearchResults(null);
		}
		return () => {
			cancelled = true;
		};
	}, [api, searchTerm]);

	const filterLabels: Record<SearchFilter, string> = {
		all: messages.all,
		movie: messages.movie,
		tv_show: messages.tvShow,
	};

	const openCard = (card: MediaCard): void => {
		host.navigate(detailPageUrl(card.providerId, card.externalId, card.mediaType));
	};

	const requestCard = async (card: MediaCard): Promise<void> => {
		try {
			await api.createRequest({
				title: card.title,
				mediaType: card.mediaType,
				year: card.year,
				providerId: card.providerId,
				externalId: card.externalId,
				posterPath: card.posterPath,
				overview: card.overview,
				requestedByName: host.context.user?.name,
			});
			host.toast("success", messages.requestSuccess);
			detach(loadShelves());
			detach(loadRequests());
		} catch (error) {
			host.toast("error", error instanceof Error ? error.message : messages.requestError);
		}
	};

	const cancelRequest = async (request: MediaRequest): Promise<void> => {
		if (!window.confirm(messages.confirmRemove)) return;
		try {
			await api.deleteRequest(request.id);
			detach(loadRequests());
			detach(loadShelves());
		} catch {
			host.toast("error", messages.actionError);
		}
	};

	const updateRequestStatus = async (request: MediaRequest, status: MediaRequestStatus): Promise<void> => {
		try {
			await api.updateRequest(request.id, { status });
			detach(loadRequests());
			detach(loadShelves());
		} catch {
			host.toast("error", messages.actionError);
		}
	};

	const openGenre = async (tile: GenreTile): Promise<void> => {
		setSearchTerm(null);
		setSearchInput("");
		setGenreView({ tile, items: [], page: 0, totalPages: 1, loading: true });
		try {
			const page = await api.discover({ category: "popular", mediaType: tile.mediaType, genreId: tile.id, page: 1 });
			setGenreView({ tile, items: page.items, page: page.page, totalPages: page.totalPages, loading: false });
		} catch {
			setGenreView({ tile, items: [], page: 1, totalPages: 1, loading: false });
		}
	};

	const loadMoreGenre = async (): Promise<void> => {
		if (!genreView || genreView.loading) return;
		const nextPage = genreView.page + 1;
		setGenreView({ ...genreView, loading: true });
		try {
			const loaded = await api.discover({
				category: "popular",
				mediaType: genreView.tile.mediaType,
				genreId: genreView.tile.id,
				page: nextPage,
			});
			setGenreView((current) =>
				current
					? {
							...current,
							items: [...current.items, ...loaded.items],
							page: loaded.page,
							totalPages: loaded.totalPages,
							loading: false,
						}
					: current,
			);
		} catch {
			setGenreView((current) => (current ? { ...current, loading: false } : current));
		}
	};

	const renderTileSection = (key: string, title: string, tiles: GenreTile[]): ReactNode => {
		if (tilesStatus === "loading") {
			return (
				<section key={key} className="rv-shelf">
					<h3 className="rv-shelf__title">{title}</h3>
					<SkeletonRow count={6} variant="wide" />
				</section>
			);
		}
		if (tiles.length === 0) return null;
		return (
			<section key={key} className="rv-shelf">
				<h3 className="rv-shelf__title">{title}</h3>
				<CarouselRow>
					{tiles.map((tile) => (
						<GenreTileCard key={`${tile.mediaType}:${tile.id}`} tile={tile} onSelect={(selected) => detach(openGenre(selected))} />
					))}
				</CarouselRow>
			</section>
		);
	};

	const renderShelves = (): ReactNode[] => {
		const elements: ReactNode[] = [];

		if (requests && requests.length > 0) {
			elements.push(
				<section key="recent-requests" className="rv-shelf">
					<h3 className="rv-shelf__title">{messages.recentRequests}</h3>
					<CarouselRow>
						{requests.map((request) => (
							<RequestCard
								key={request.id}
								request={request}
								messages={messages}
								locale={locale}
								isAdmin={isAdmin}
								userId={userId}
								onOpen={(entry) => {
									if (entry.providerId && entry.externalId) {
										host.navigate(detailPageUrl(entry.providerId, entry.externalId, entry.mediaType));
									}
								}}
								onCancel={(entry) => detach(cancelRequest(entry))}
								onStatus={(entry, nextStatus) => detach(updateRequestStatus(entry, nextStatus))}
							/>
						))}
					</CarouselRow>
				</section>,
			);
		}

		for (const shelf of BASE_SHELVES) {
			if (shelf.key === "upcoming-movies") {
				const section = renderTileSection("movie-tiles", messages.movieGenres, movieTiles);
				if (section) elements.push(section);
			}
			if (shelf.key === "upcoming-shows") {
				const section = renderTileSection("tv-tiles", messages.tvGenres, tvTiles);
				if (section) elements.push(section);
			}

			elements.push(
				<Shelf
					key={shelf.key}
					title={messages[shelf.titleKey]}
					cards={shelves[shelf.key] ?? []}
					messages={messages}
					onOpen={openCard}
					onRequest={(card) => detach(requestCard(card))}
					loading={shelfStatus === "loading"}
				/>,
			);
		}
		return elements;
	};

	const filteredSearch = (searchResults ?? []).filter((card) => searchFilter === "all" || card.mediaType === searchFilter);

	const renderSearch = (): ReactNode => (
		<section className="rv-section">
			<div className="rv-filterrow">
				{SEARCH_FILTERS.map((filter) => (
					<button
						key={filter}
						type="button"
						className={`rv-chip ${searchFilter === filter ? "rv-chip--active" : ""}`}
						onClick={() => setSearchFilter(filter)}
					>
						{filterLabels[filter]}
					</button>
				))}
				{searchResults ? <span className="rv-filterrow__count">{filteredSearch.length}</span> : null}
			</div>
			<CardGrid
				cards={filteredSearch}
				messages={messages}
				onOpen={openCard}
				onRequest={(card) => detach(requestCard(card))}
				loading={searchResults === null}
			/>
		</section>
	);

	const renderGenre = (): ReactNode => {
		if (!genreView) return null;
		return (
			<section className="rv-section">
				<h3 className="rv-shelf__title">{genreView.tile.name}</h3>
				<CardGrid
					cards={genreView.items}
					messages={messages}
					onOpen={openCard}
					onRequest={(card) => detach(requestCard(card))}
					loading={genreView.loading && genreView.items.length === 0}
				/>
				{genreView.page < genreView.totalPages ? (
					<div className="rv-loadmore">
						<button
							type="button"
							className="rv-button rv-button--outline"
							disabled={genreView.loading}
							onClick={() => detach(loadMoreGenre())}
						>
							{messages.loadMore}
						</button>
					</div>
				) : null}
			</section>
		);
	};

	const renderContent = (): ReactNode => {
		if (shelfStatus === "error") {
			return <ErrorState text={messages.error} retryLabel={messages.retry} onRetry={() => detach(loadShelves())} />;
		}
		if (unsupported && !searchTerm && !genreView) {
			return <EmptyState text={messages.unsupported} />;
		}
		if (searchTerm) {
			return renderSearch();
		}
		if (genreView) {
			return renderGenre();
		}
		return renderShelves();
	};

	return (
		<div className="rv-page">
			<header className="rv-pagetitle">
				<span className="rv-kicker">{messages.discoverKicker}</span>
				<div className="rv-titlebar">
					<h1 className="rv-display">
						{messages.discover}
						<span className="rv-display__accent">.</span>
					</h1>
					<form
						className="rv-search"
						onSubmit={(event) => {
							event.preventDefault();
							setGenreView(null);
							setSearchTerm(searchInput.trim() || null);
						}}
					>
						<svg className="rv-search__icon" viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
							<path
								d="M11 4a7 7 0 1 1 0 14 7 7 0 0 1 0-14Zm10 17-4.35-4.35"
								fill="none"
								stroke="currentColor"
								strokeWidth="2"
								strokeLinecap="round"
							/>
						</svg>
						<input
							className="rv-search__input"
							type="search"
							value={searchInput}
							placeholder={messages.searchPlaceholder}
							onChange={(event) => setSearchInput(event.target.value)}
						/>
						<button type="submit" className="rv-button rv-button--compact">
							{messages.search}
						</button>
						{searchTerm || genreView ? (
							<button
								type="button"
								className="rv-button rv-button--ghost rv-button--compact"
								onClick={() => {
									setSearchInput("");
									setSearchTerm(null);
									setGenreView(null);
								}}
							>
								{messages.clear}
							</button>
						) : null}
					</form>
					<button
						type="button"
						className="rv-button rv-button--outline"
						onClick={() => host.navigate("/plugins/org.reelvault.requests/page/requests")}
					>
						{messages.myRequests}
					</button>
				</div>
			</header>

			{renderContent()}
		</div>
	);
}
