import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";

export interface ConfirmOptions {
	title: string;
	body?: string;
	confirmLabel: string;
	cancelLabel: string;
	/** Destructive actions focus "cancel" by default so a stray Enter does not delete. */
	danger?: boolean;
}

/**
 * Promise-based replacement for `window.confirm`: a bottom sheet on phones and a
 * centred card on larger screens. Render `dialog` once in the page tree; `ask`
 * resolves `true` only when the user confirms.
 */
export function useConfirm(): { ask: (options: ConfirmOptions) => Promise<boolean>; dialog: ReactNode } {
	const [options, setOptions] = useState<ConfirmOptions | null>(null);
	const resolver = useRef<((accepted: boolean) => void) | null>(null);

	const settle = useCallback((accepted: boolean): void => {
		resolver.current?.(accepted);
		resolver.current = null;
		setOptions(null);
	}, []);

	const ask = useCallback((next: ConfirmOptions): Promise<boolean> => {
		// A new question supersedes an unanswered one, which counts as a cancel.
		resolver.current?.(false);
		return new Promise<boolean>((resolve) => {
			resolver.current = resolve;
			setOptions(next);
		});
	}, []);

	const dialog = options ? <ConfirmSheet options={options} onConfirm={() => settle(true)} onCancel={() => settle(false)} /> : null;

	return { ask, dialog };
}

function ConfirmSheet({ options, onConfirm, onCancel }: { options: ConfirmOptions; onConfirm: () => void; onCancel: () => void }) {
	const confirmRef = useRef<HTMLButtonElement>(null);
	const cancelRef = useRef<HTMLButtonElement>(null);

	// Focus once on open. Keyed on `danger` only: a parent re-render must not steal focus back.
	useEffect(() => {
		(options.danger ? cancelRef.current : confirmRef.current)?.focus();
	}, [options.danger]);

	useEffect(() => {
		const onKey = (event: KeyboardEvent): void => {
			if (event.key === "Escape") onCancel();
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [onCancel]);

	return (
		<div className="rv-sheet">
			{/* Backdrop is its own button, so clicks outside the panel cancel without a click handler on a div. */}
			<button type="button" className="rv-sheet__scrim" tabIndex={-1} aria-label={options.cancelLabel} onClick={onCancel} />
			<div className="rv-sheet__panel" role="alertdialog" aria-modal="true" aria-labelledby="rv-sheet-title">
				<h2 id="rv-sheet-title" className="rv-sheet__title">
					{options.title}
				</h2>
				{options.body ? <p className="rv-sheet__body">{options.body}</p> : null}
				<div className="rv-sheet__actions">
					<button ref={cancelRef} type="button" className="rv-button rv-button--outline" onClick={onCancel}>
						{options.cancelLabel}
					</button>
					<button
						ref={confirmRef}
						type="button"
						className={options.danger ? "rv-button rv-button--danger" : "rv-button rv-button--primary"}
						onClick={onConfirm}
					>
						{options.confirmLabel}
					</button>
				</div>
			</div>
		</div>
	);
}
