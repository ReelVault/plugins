import { useCallback, useEffect, useState } from "react";
import type { MediaAvailabilityState, MediaCard, MediaDetails, MediaSeasonDetails } from "../../types";
import { createApi } from "./api";
import { EmptyState, ErrorState, Spinner } from "./components/feedback";
import { formatDate, formatVote } from "./components/format";
import { backdropUrl, profileUrl, stillUrl, widePosterUrl } from "./components/poster-url";
import { RatingPill } from "./components/rating-pill";
import { Shelf } from "./components/shelf";
import { StateBadge, stateMessage } from "./components/state-badge";
import { detach } from "./detach";
import { usePluginHost } from "./host-context";
import { getMessages, type Messages } from "./messages";

const REQUESTABLE: ReadonlySet<MediaAvailabilityState> = new Set(["none", "rejected"]);
const RECOMMENDATION_LIMIT = 18;
const CREW_SLOTS = 6;
/** Headline jobs first (Creator/Director…), everything else keeps provider order. */
const CREW_JOB_PRIORITY = ["creator", "showrunner", "director", "screenplay", "writer", "producer"];

function crewJobRank(job: string): number {
	const lower = job.toLowerCase();
	const hit = CREW_JOB_PRIORITY.findIndex((needle) => lower.includes(needle));
	return hit === -1 ? CREW_JOB_PRIORITY.length : hit;
}

function ChevronDownIcon() {
	return (
		<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
			<path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
		</svg>
	);
}

function BackIcon() {
	return (
		<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
			<path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
		</svg>
	);
}

export function DetailView() {
	const host = usePluginHost();
	const messages = getMessages(host.context.locale);
	const locale = host.context.locale;
	const [api] = useState(() => createApi(host));

	const params = host.context.params;
	const providerId = params.providerId ?? "";
	const externalId = params.externalId ?? "";
	const mediaType = params.mediaType === "tv_show" ? "tv_show" : "movie";
	const isPage = host.context.page === "detail";

	const [details, setDetails] = useState<MediaDetails | null>(null);
	const [recommendations, setRecommendations] = useState<MediaCard[]>([]);
	const [similar, setSimilar] = useState<MediaCard[]>([]);
	const [status, setStatus] = useState<"loading" | "idle" | "error">("loading");
	const [submitting, setSubmitting] = useState(false);

	const [expandedSeason, setExpandedSeason] = useState<number | null>(null);
	const [seasonCache, setSeasonCache] = useState<Record<number, MediaSeasonDetails>>({});
	const [seasonLoading, setSeasonLoading] = useState<number | null>(null);
	const [seasonError, setSeasonError] = useState<number | null>(null);

	const load = useCallback(async (): Promise<void> => {
		if (!(providerId && externalId)) return;
		setStatus("loading");
		try {
			const result = await api.details({ providerId, externalId, mediaType });
			setDetails(result);
			setStatus("idle");

			const [recommendationPage, similarPage] = await Promise.all([
				api.discover({ category: "recommendations", mediaType, externalId, providerId, page: 1 }),
				api.discover({ category: "similar", mediaType, externalId, providerId, page: 1 }),
			]);
			setRecommendations(recommendationPage.items.filter((item) => item.externalId !== externalId).slice(0, RECOMMENDATION_LIMIT));
			setSimilar(similarPage.items.filter((item) => item.externalId !== externalId).slice(0, RECOMMENDATION_LIMIT));
		} catch {
			setStatus("error");
		}
	}, [api, providerId, externalId, mediaType]);

	useEffect(() => {
		setExpandedSeason(null);
		setSeasonCache({});
		detach(load());
		if (isPage) window.scrollTo({ top: 0 });
	}, [load, isPage]);

	const loadSeason = useCallback(
		async (seasonNumber: number): Promise<void> => {
			setExpandedSeason(seasonNumber);
			if (seasonCache[seasonNumber]) return;
			setSeasonLoading(seasonNumber);
			setSeasonError(null);
			try {
				const season = await api.season({ providerId, externalId, seasonNumber });
				setSeasonCache((cache) => ({ ...cache, [seasonNumber]: season }));
			} catch {
				setSeasonError(seasonNumber);
			} finally {
				setSeasonLoading(null);
			}
		},
		[api, providerId, externalId, seasonCache],
	);

	const toggleSeason = (seasonNumber: number): void => {
		if (expandedSeason === seasonNumber) {
			setExpandedSeason(null);
			return;
		}
		detach(loadSeason(seasonNumber));
	};

	const submitRequest = async (): Promise<void> => {
		if (!details) return;
		setSubmitting(true);
		try {
			await api.createRequest({
				title: details.title,
				mediaType,
				year: details.year,
				providerId,
				externalId,
				posterPath: details.posterPath,
				overview: details.overview,
				requestedByName: host.context.user?.name,
			});
			host.toast("success", messages.requestSuccess);
			setDetails({ ...details, state: "pending" });
			detach(load());
		} catch (error) {
			host.toast("error", error instanceof Error ? error.message : messages.requestError);
		} finally {
			setSubmitting(false);
		}
	};

	const openCard = (card: MediaCard): void => {
		if (isPage) {
			host.navigate(
				`/plugins/org.reelvault.requests/page/detail?providerId=${encodeURIComponent(card.providerId)}&externalId=${encodeURIComponent(
					card.externalId,
				)}&mediaType=${card.mediaType}`,
			);
			return;
		}
		host.openDialog("detail", { providerId: card.providerId, externalId: card.externalId, mediaType: card.mediaType });
	};

	const goBack = (): void => {
		if (isPage) history.back();
		else host.close();
	};

	if (status === "loading") {
		return (
			<div className="rv-loading">
				<Spinner />
				<span>{messages.loading}</span>
			</div>
		);
	}
	if (status === "error" || !details) {
		return <ErrorState text={messages.error} retryLabel={messages.retry} onRetry={() => detach(load())} />;
	}

	const poster = widePosterUrl(details.posterPath);
	const backdrop = backdropUrl(details.backdropPath);
	const requestable = REQUESTABLE.has(details.state);
	const vote = formatVote(details.voteAverage);

	const facts: string[] = [mediaType === "tv_show" ? messages.tvShow : messages.movie];
	if (mediaType === "tv_show" && details.seasons.length > 0) {
		facts.push(details.seasons.length === 1 ? messages.seasonOne : `${String(details.seasons.length)} ${messages.seasonsCount}`);
	}
	if (details.providerStatus) facts.push(details.providerStatus);
	const dateLabel = mediaType === "tv_show" ? messages.firstAirDateLabel : messages.releaseDateLabel;

	const libraryHref = details.metadataId;
	const crewTop = [...details.crew]
		.toSorted((left, right) => crewJobRank(left.job) - crewJobRank(right.job))
		.reduce<Array<[string, string]>>((slots, member) => {
			if (slots.length >= CREW_SLOTS) return slots;
			if (slots.some(([job]) => job === member.job)) return slots;
			slots.push([member.job, member.name]);
			return slots;
		}, []);

	return (
		<div className="rv-detailpage">
			<DetailHero
				details={details}
				messages={messages}
				poster={poster}
				backdrop={backdrop}
				facts={facts}
				vote={vote}
				requestable={requestable}
				submitting={submitting}
				onBack={goBack}
				onSubmit={() => detach(submitRequest())}
				onOpenInLibrary={libraryHref ? () => host.navigate(`/metadata/${libraryHref}`) : undefined}
			/>

			<div className="rv-detailbody">
				<div className="rv-detailmain">
					{details.tagline ? <p className="rv-tagline">{details.tagline}</p> : null}

					{details.overview ? (
						<section className="rv-section">
							<h3 className="rv-shelf__title">{messages.overview}</h3>
							<p className="rv-overview">{details.overview}</p>
						</section>
					) : null}

					{crewTop.length > 0 ? (
						<section className="rv-section">
							<div className="rv-crew">
								{crewTop.map(([job, name]) => (
									<div key={job} className="rv-crew__item">
										<span className="rv-crew__job">{job}</span>
										<span className="rv-crew__name">{name}</span>
									</div>
								))}
							</div>
						</section>
					) : null}

					{details.keywords.length > 0 ? (
						<div className="rv-keywords">
							{details.keywords.map((keyword) => (
								<span key={keyword.id} className="rv-tag">
									{keyword.name}
								</span>
							))}
						</div>
					) : null}

					{mediaType === "tv_show" && details.seasons.length > 0 ? (
						<SeasonsAccordion
							seasons={details.seasons}
							messages={messages}
							locale={locale}
							expandedSeason={expandedSeason}
							seasonCache={seasonCache}
							seasonLoading={seasonLoading}
							seasonError={seasonError}
							onToggle={toggleSeason}
							onRetry={(seasonNumber) => detach(loadSeason(seasonNumber))}
						/>
					) : null}

					{details.cast.length > 0 ? (
						<section className="rv-section">
							<h3 className="rv-shelf__title">{messages.cast}</h3>
							<div className="rv-cast">
								{details.cast.map((member) => {
									const profile = profileUrl(member.profilePath);
									return (
										<div key={`${member.id}-${member.character ?? ""}`} className="rv-cast__item">
											{profile ? (
												<img className="rv-cast__avatar" src={profile} alt="" loading="lazy" />
											) : (
												<span className="rv-cast__avatar rv-cast__avatar--empty">{member.name.slice(0, 1)}</span>
											)}
											<span className="rv-cast__name">{member.name}</span>
											{member.character ? <span className="rv-cast__role">{member.character}</span> : null}
										</div>
									);
								})}
							</div>
						</section>
					) : null}

					<Shelf title={messages.recommendations} cards={recommendations} messages={messages} onOpen={openCard} />
					<Shelf title={messages.similar} cards={similar} messages={messages} onOpen={openCard} />
				</div>

				<aside className="rv-sidebar">
					<div className="rv-sidebar__card">
						{details.originalTitle && details.originalTitle !== details.title ? (
							<div className="rv-sidebar__row">
								<span className="rv-sidebar__label">{messages.originalTitle}</span>
								<span className="rv-sidebar__value">{details.originalTitle}</span>
							</div>
						) : null}
						{details.providerStatus ? (
							<div className="rv-sidebar__row">
								<span className="rv-sidebar__label">{messages.status}</span>
								<span className="rv-sidebar__value">{details.providerStatus}</span>
							</div>
						) : null}
						{details.releaseDate ? (
							<div className="rv-sidebar__row">
								<span className="rv-sidebar__label">{dateLabel}</span>
								<span className="rv-sidebar__value">{formatDate(details.releaseDate, locale)}</span>
							</div>
						) : null}
						{details.productionCompanies.length > 0 ? (
							<div className="rv-sidebar__row">
								<span className="rv-sidebar__label">{messages.production}</span>
								<span className="rv-sidebar__value">
									{details.productionCompanies
										.slice(0, 4)
										.map((company) => company.name)
										.join(", ")}
								</span>
							</div>
						) : null}
					</div>
				</aside>
			</div>
		</div>
	);
}

function SeasonsAccordion({
	seasons,
	messages,
	locale,
	expandedSeason,
	seasonCache,
	seasonLoading,
	seasonError,
	onToggle,
	onRetry,
}: {
	seasons: MediaDetails["seasons"];
	messages: Messages;
	locale: string;
	expandedSeason: number | null;
	seasonCache: Record<number, MediaSeasonDetails>;
	seasonLoading: number | null;
	seasonError: number | null;
	onToggle: (seasonNumber: number) => void;
	onRetry: (seasonNumber: number) => void;
}) {
	return (
		<section className="rv-section">
			<h3 className="rv-shelf__title">{messages.seasonsHeader}</h3>
			<div className="rv-accordion">
				{seasons.map((season) => {
					const expanded = expandedSeason === season.number;
					return (
						<div key={season.number} className={expanded ? "rv-season rv-season--open" : "rv-season"}>
							<button type="button" className="rv-season__head" onClick={() => onToggle(season.number)}>
								<span className="rv-season__name">{season.name}</span>
								<span className="rv-season__count">
									{season.episodeCount === 1 ? messages.episodeCountOne : `${season.episodeCount} ${messages.episodes}`}
								</span>
								<span className="rv-season__chevron">
									<ChevronDownIcon />
								</span>
							</button>
							{expanded ? (
								<SeasonBody
									season={season}
									seasonDetails={seasonCache[season.number]}
									loading={seasonLoading === season.number}
									hasError={seasonError === season.number}
									messages={messages}
									locale={locale}
									onRetry={onRetry}
								/>
							) : null}
						</div>
					);
				})}
			</div>
		</section>
	);
}

function DetailHero({
	details,
	messages,
	poster,
	backdrop,
	facts,
	vote,
	requestable,
	submitting,
	onBack,
	onSubmit,
	onOpenInLibrary,
}: {
	details: MediaDetails;
	messages: Messages;
	poster: string | undefined;
	backdrop: string | undefined;
	facts: string[];
	vote: string | undefined;
	requestable: boolean;
	submitting: boolean;
	onBack: () => void;
	onSubmit: () => void;
	onOpenInLibrary?: () => void;
}) {
	return (
		<div className="rv-hero" style={backdrop ? { backgroundImage: `url(${backdrop})` } : undefined}>
			<div className="rv-hero__scrim" aria-hidden="true" />
			<div className="rv-hero__content">
				<div className="rv-hero__poster">
					{poster ? <img src={poster} alt="" /> : <span className="rv-hero__placeholder">{details.title.slice(0, 1)}</span>}
				</div>
				<div className="rv-hero__meta">
					<div className="rv-hero__titlerow">
						<button type="button" className="rv-backbtn" title={messages.back} aria-label={messages.back} onClick={onBack}>
							<BackIcon />
						</button>
						<h1 className="rv-hero__title">
							{details.title}
							{details.year ? <span className="rv-hero__year"> ({details.year})</span> : null}
						</h1>
					</div>
					<div className="rv-hero__facts">
						<StateBadge state={details.state} messages={messages} />
						{facts.map((fact) => (
							<span key={fact} className="rv-hero__fact">
								{fact}
							</span>
						))}
					</div>
					{details.genres.length > 0 ? <div className="rv-hero__genres">{details.genres.map((genre) => genre.name).join(", ")}</div> : null}
					{details.ratings.length > 0 || vote ? (
						<div className="rv-hero__ratings">
							{vote ? <RatingPill rating={{ source: "tmdb", label: "TMDB", value: Number(vote), maxValue: 10 }} /> : null}
							{details.ratings
								.filter((rating) => rating.source.toLowerCase() !== "tmdb")
								.map((rating) => (
									<RatingPill key={rating.source} rating={rating} />
								))}
						</div>
					) : null}
					<div className="rv-hero__actions">
						{requestable ? (
							<button type="button" className="rv-button rv-button--primary" disabled={submitting} onClick={onSubmit}>
								{submitting ? messages.requesting : messages.request}
							</button>
						) : (
							<span className={`rv-badge rv-badge--${details.state} rv-badge--large`}>{stateMessage(details.state, messages)}</span>
						)}
						{onOpenInLibrary ? (
							<button type="button" className="rv-button rv-button--outline" onClick={onOpenInLibrary}>
								{messages.openInLibrary}
							</button>
						) : null}
					</div>
				</div>
			</div>
		</div>
	);
}

function SeasonBody({
	season,
	seasonDetails,
	loading,
	hasError,
	messages,
	locale,
	onRetry,
}: {
	season: MediaDetails["seasons"][number];
	seasonDetails: MediaSeasonDetails | undefined;
	loading: boolean;
	hasError: boolean;
	messages: Messages;
	locale: string;
	onRetry: (seasonNumber: number) => void;
}) {
	if (loading) {
		return (
			<div className="rv-season__body">
				<div className="rv-loading rv-loading--compact">
					<Spinner />
				</div>
			</div>
		);
	}
	if (hasError) {
		return (
			<div className="rv-season__body">
				<ErrorState text={messages.error} retryLabel={messages.retry} onRetry={() => onRetry(season.number)} />
			</div>
		);
	}
	if (!seasonDetails) return null;
	if (seasonDetails.episodes.length === 0) {
		return (
			<div className="rv-season__body">
				<EmptyState text={messages.noResults} />
			</div>
		);
	}
	return (
		<div className="rv-season__body">
			<ul className="rv-episodes">
				{seasonDetails.episodes.map((episode) => {
					const still = stillUrl(episode.thumbnailPath);
					return (
						<li key={episode.number} className="rv-episode">
							<span className="rv-episode__still">
								{still ? <img src={still} alt="" loading="lazy" /> : <span className="rv-episode__placeholder" aria-hidden="true" />}
							</span>
							<span className="rv-episode__info">
								<span className="rv-episode__title">
									{String(episode.number)}. {episode.name ?? `${messages.season} ${String(episode.number)}`}
								</span>
								{episode.airDate ? <span className="rv-episode__date">{formatDate(episode.airDate, locale)}</span> : null}
								{episode.overview ? <span className="rv-episode__overview">{episode.overview}</span> : null}
							</span>
						</li>
					);
				})}
			</ul>
		</div>
	);
}
