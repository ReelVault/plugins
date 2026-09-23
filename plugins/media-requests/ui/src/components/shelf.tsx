import { type ReactNode, useRef } from "react";
import type { MediaCard } from "../../../types";
import type { Messages } from "../messages";
import { SkeletonRow } from "./feedback";
import { PosterCard } from "./poster-card";

function ChevronIcon({ direction }: { direction: "left" | "right" }) {
	return (
		<svg
			viewBox="0 0 24 24"
			width="18"
			height="18"
			aria-hidden="true"
			style={direction === "left" ? { transform: "scaleX(-1)" } : undefined}
		>
			<path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
		</svg>
	);
}

/**
 * Horizontal carousel row. The arrows live outside the scroller and fade in
 * on hover; they page by ~90% of the visible width.
 */
export function CarouselRow({ children }: { children: ReactNode }) {
	const rowRef = useRef<HTMLDivElement>(null);

	const page = (direction: 1 | -1): void => {
		const row = rowRef.current;
		if (!row) return;
		row.scrollBy({ left: direction * row.clientWidth * 0.9, behavior: "smooth" });
	};

	return (
		<div className="rv-carousel">
			<button type="button" className="rv-carousel__arrow rv-carousel__arrow--left" aria-label="←" onClick={() => page(-1)}>
				<ChevronIcon direction="left" />
			</button>
			<div ref={rowRef} className="rv-shelf__row">
				{children}
			</div>
			<button type="button" className="rv-carousel__arrow rv-carousel__arrow--right" aria-label="→" onClick={() => page(1)}>
				<ChevronIcon direction="right" />
			</button>
		</div>
	);
}

export function Shelf({
	title,
	cards,
	messages,
	onOpen,
	onRequest,
	loading = false,
}: {
	title: string;
	cards: MediaCard[];
	messages: Messages;
	onOpen: (card: MediaCard) => void;
	onRequest?: (card: MediaCard) => void;
	loading?: boolean;
}) {
	if (!loading && cards.length === 0) return null;

	return (
		<section className="rv-shelf">
			<h3 className="rv-shelf__title">{title}</h3>
			{loading ? (
				<SkeletonRow />
			) : (
				<CarouselRow>
					{cards.map((card) => (
						<PosterCard
							key={`${card.providerId}:${card.externalId}`}
							card={card}
							messages={messages}
							onOpen={onOpen}
							onRequest={onRequest}
						/>
					))}
				</CarouselRow>
			)}
		</section>
	);
}
