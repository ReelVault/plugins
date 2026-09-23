const SKELETON_IDS = Array.from({ length: 24 }, (_, index) => `rv-skeleton-${index + 1}`);

export function Spinner() {
	return <span className="rv-spinner" aria-hidden="true" />;
}

export function EmptyState({ text }: { text: string }) {
	return <p className="rv-empty">{text}</p>;
}

export function ErrorState({ text, retryLabel, onRetry }: { text: string; retryLabel: string; onRetry: () => void }) {
	return (
		<div className="rv-error">
			<span>{text}</span>
			<button type="button" className="rv-button rv-button--outline" onClick={onRetry}>
				{retryLabel}
			</button>
		</div>
	);
}

/** Pulsing placeholder shown while a shelf or grid is loading. */
export function SkeletonCard({ variant = "poster" }: { variant?: "poster" | "wide" }) {
	return <span className={`rv-skeleton rv-skeleton--${variant}`} aria-hidden="true" />;
}

export function SkeletonRow({ count = 8, variant = "poster" }: { count?: number; variant?: "poster" | "wide" }) {
	return (
		<div className="rv-shelf__row">
			{SKELETON_IDS.slice(0, count).map((id) => (
				<SkeletonCard key={id} variant={variant} />
			))}
		</div>
	);
}

export function SkeletonGrid({ count = 10 }: { count?: number }) {
	return (
		<div className="rv-grid">
			{SKELETON_IDS.slice(0, count).map((id) => (
				<SkeletonCard key={id} />
			))}
		</div>
	);
}
