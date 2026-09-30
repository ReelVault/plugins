import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { waitForHealth } from "./client";
import { E2E_ROOT } from "./state";

const CONTROL_PATH = join(E2E_ROOT, "supervisor.json");
const PID_PATH = join(E2E_ROOT, "supervisor.pid");

interface ControlFile {
	cmd: "restart" | "stop" | null;
	generation: number;
}

export function isSupervisorRunning(): boolean {
	if (!existsSync(PID_PATH)) return false;
	const pid = Number.parseInt(readFileSync(PID_PATH, "utf8").trim(), 10);
	if (Number.isNaN(pid)) return false;
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
}

export async function restartServer(): Promise<void> {
	const before = readGeneration();
	writeFileSync(CONTROL_PATH, `${JSON.stringify({ cmd: "restart", generation: before }, null, "\t")}\n`);
	const deadline = Date.now() + 90_000;
	while (Date.now() < deadline) {
		await Bun.sleep(500);
		if (readGeneration() > before && (await waitForHealth())) return;
	}
	throw new Error("restartServer: supervisor did not complete restart in time");
}

function readGeneration(): number {
	if (!existsSync(CONTROL_PATH)) return 0;
	return (JSON.parse(readFileSync(CONTROL_PATH, "utf8")) as ControlFile).generation;
}

export async function stopServer(): Promise<void> {
	writeFileSync(CONTROL_PATH, `${JSON.stringify({ cmd: "stop", generation: readGeneration() }, null, "\t")}\n`);
	const deadline = Date.now() + 20_000;
	while (Date.now() < deadline) {
		await Bun.sleep(500);
		if (!(await waitForHealth())) return;
	}
	throw new Error("stopServer: server still healthy after 20s");
}
