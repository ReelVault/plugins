import { existsSync } from "node:fs";
import type { Suite } from "./report";

export function generateClip(suite: Suite, target: string, seconds: number): void {
	if (existsSync(target)) return;
	const proc = Bun.spawnSync([
		"ffmpeg",
		"-y",
		"-f",
		"lavfi",
		"-i",
		`testsrc=duration=${seconds}:size=640x360:rate=24`,
		"-f",
		"lavfi",
		"-i",
		`sine=frequency=440:duration=${seconds}`,
		"-c:v",
		"libx264",
		"-preset",
		"ultrafast",
		"-c:a",
		"aac",
		"-shortest",
		target,
	]);
	suite.expect(proc.exitCode === 0, `ffmpeg failed for ${target}: ${proc.stderr.toString().slice(-300)}`);
}
