import { appendFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { REPORTS_DIR } from "./state";

export type CaseStatus = "pass" | "fail" | "skip";

export interface CaseResult {
	suite: string;
	name: string;
	status: CaseStatus;
	detail?: string;
	ms: number;
}

export class CaseError extends Error {}

export class Suite {
	private readonly results: CaseResult[] = [];
	private readonly startedAt = Date.now();

	readonly name: string;

	constructor(name: string) {
		this.name = name;
	}

	expect(condition: boolean, message: string): void {
		if (!condition) throw new CaseError(message);
	}

	expectEqual(actual: unknown, expected: unknown, label: string): void {
		const left = JSON.stringify(actual);
		const right = JSON.stringify(expected);
		this.expect(left === right, `${label}: expected ${right}, got ${left}`);
	}

	async case<T>(name: string, fn: (suite: Suite) => Promise<T> | T, skipReason?: string): Promise<T | undefined> {
		const started = Date.now();
		if (skipReason) {
			this.results.push({ suite: this.name, name, status: "skip", detail: skipReason, ms: 0 });
			console.log(`  SKIP  ${name} (${skipReason})`);
			return undefined;
		}
		try {
			const value = await fn(this);
			this.results.push({ suite: this.name, name, status: "pass", ms: Date.now() - started });
			console.log(`  PASS  ${name}`);
			return value;
		} catch (error) {
			const detail = error instanceof Error ? error.message : String(error);
			this.results.push({ suite: this.name, name, status: "fail", detail, ms: Date.now() - started });
			console.log(`  FAIL  ${name}\n        ${detail}`);
		}

		return undefined;
	}

	finish(): void {
		const passed = this.results.filter((entry) => entry.status === "pass").length;
		const failed = this.results.filter((entry) => entry.status === "fail").length;
		const skipped = this.results.filter((entry) => entry.status === "skip").length;
		const summary = `${this.name}: ${passed} pass, ${failed} fail, ${skipped} skip (${Date.now() - this.startedAt}ms)`;
		console.log(summary);
		const jsonPath = join(REPORTS_DIR, `${this.name}.json`);
		writeFileSync(jsonPath, `${JSON.stringify(this.results, null, "\t")}\n`);
		appendFileSync(
			join(REPORTS_DIR, "summary.jsonl"),
			`${JSON.stringify({ suite: this.name, passed, failed, skipped, results: this.results })}\n`,
		);
		if (failed > 0) process.exit(1);
	}
}

export function ensure<T>(value: T | null | undefined, message: string): T {
	if (value === null || value === undefined) throw new CaseError(message);
	return value;
}

export function requireKeys(...values: Array<string | undefined>): string | undefined {
	return values.every((value) => value && value.length > 0) ? values[0] : undefined;
}
