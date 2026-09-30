import { type ChildProcess, spawn } from "node:child_process";
import { existsSync, openSync, readFileSync, writeFileSync } from "node:fs";
import { waitForHealth } from "./lib/client";
import { BASE_URL, DATA_DIR, E2E_ROOT, SERVER_DIR, SERVER_LOG, WEB_DIST } from "./lib/state";

interface ControlFile {
	cmd: "restart" | "stop" | null;
	generation: number;
}

const CONTROL_PATH = `${E2E_ROOT}/supervisor.json`;
const PID_PATH = `${E2E_ROOT}/supervisor.pid`;

function readControl(): ControlFile {
	if (!existsSync(CONTROL_PATH)) return { cmd: null, generation: 0 };
	return JSON.parse(readFileSync(CONTROL_PATH, "utf8")) as ControlFile;
}

function writeControl(control: ControlFile): void {
	writeFileSync(CONTROL_PATH, `${JSON.stringify(control, null, "\t")}\n`);
}

function serverEnv(): NodeJS.ProcessEnv {
	return {
		...process.env,
		APP_PORT: String(4660),
		ROOT_DIR: DATA_DIR,
		APP_WEB_DIST: WEB_DIST,
		NODE_ENV: "production",
		SETUP_TOKEN_ENABLED: "false",
		REELVAULT_AUTH_RATE_LIMIT_ENABLED: "false",
	};
}

let _child: ChildProcess | null = null;

function spawnServer(): void {
	const logFile = openSync(SERVER_LOG, "a");
	_child = spawn("bun", ["run", "src/index.ts"], {
		cwd: SERVER_DIR,
		env: serverEnv(),
		stdio: ["ignore", logFile, logFile],
	});
}

async function startServer(): Promise<void> {
	if (await waitForHealth(BASE_URL)) return;
	spawnServer();
	const deadline = Date.now() + 60_000;
	while (Date.now() < deadline) {
		await Bun.sleep(500);
		if (await waitForHealth(BASE_URL)) return;
	}
	throw new Error(`server did not become healthy, see ${SERVER_LOG}`);
}

async function stopServer(): Promise<void> {
	const proc = Bun.spawnSync(["ss", "-tlnp", "-H"]);
	for (const line of proc.stdout.toString().split("\n")) {
		if (!line.includes(":4660")) continue;
		for (const match of line.matchAll(/pid=(\d+)/g)) {
			try {
				process.kill(Number.parseInt(match[1], 10), "SIGTERM");
			} catch {
				return;
			}
		}
	}
	const deadline = Date.now() + 10_000;
	while (Date.now() < deadline) {
		await Bun.sleep(250);
		if (!(await waitForHealth(BASE_URL))) return;
	}
	throw new Error("server did not stop within 10s");
}

async function main(): Promise<void> {
	writeFileSync(PID_PATH, `${process.pid}\n`);
	let control = readControl();
	control.cmd = null;
	control.generation = 0;
	writeControl(control);
	await startServer();
	console.log("supervisor ready");
	while (true) {
		await Bun.sleep(400);
		control = readControl();
		if (control.cmd === "restart") {
			console.log("restart requested");
			await stopServer().catch((error) => console.error(error));
			await startServer();
			writeControl({ cmd: null, generation: control.generation + 1 });
			console.log(`restart done (generation ${control.generation + 1})`);
		} else if (control.cmd === "stop") {
			console.log("stop requested");
			await stopServer().catch((error) => console.error(error));
			writeControl({ cmd: null, generation: control.generation });
		}
	}
}

process.on("SIGTERM", () => {
	stopServer()
		.finally(() => process.exit(0))
		.catch(() => process.exit(1));
});

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
