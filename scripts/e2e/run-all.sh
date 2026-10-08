#!/usr/bin/env bash
set -uo pipefail

cd "$(dirname "$0")/../.."

E2E_ROOT="/tmp/rv-plugins-e2e"
REPORTS="$E2E_ROOT/reports"
SKIP_BUILD=0
[[ "${1:-}" == "--skip-build" ]] && SKIP_BUILD=1

mkdir -p "$REPORTS" "$E2E_ROOT"
: > "$REPORTS/summary.jsonl"

echo "=== [1/4] Building plugin catalog ==="
bun run build-catalog || exit 1

if [[ "$SKIP_BUILD" -eq 0 ]]; then
	echo "=== [2/4] Building website (isolated dist) ==="
	(cd ../website && bun run build) || exit 1
else
	echo "=== [2/4] Skipping website build (--skip-build) ==="
fi

echo "=== [3/4] Starting supervisor (server :4660) ==="
if curl -sf http://localhost:4660/v1/health >/dev/null 2>&1; then
	echo "server already healthy — assuming supervisor is running"
	SUP_PID=""
else
	bun run scripts/e2e/supervisor.ts &
	SUP_PID=$!
	trap '[[ -n "$SUP_PID" ]] && kill "$SUP_PID" 2>/dev/null' EXIT
	for _ in $(seq 1 60); do
		curl -sf http://localhost:4660/v1/health >/dev/null 2>&1 && break
		sleep 1
	done
	curl -sf http://localhost:4660/v1/health >/dev/null 2>&1 || { echo "server did not start"; exit 1; }
fi

echo "=== [4/4] Running suites ==="
SUITES=(
	00-bootstrap
	05-web-shell
	10-tmdb
	11-omdb
	12-media-requests
	13-cinemamode
	14-community-markers
	15-trailers
	16-webhooks
	17-bug-reports
	18-api-regressions
	20-install-abuse
	21-config-abuse
	22-routes-abuse
	23-upgrade-catalog
	30-roles-realtime
	40-restart-persistence
	41-reload-under-load
	50-ui
)

FAILED=()
for suite in "${SUITES[@]}"; do
	echo "--- $suite ---"
	if ! timeout 900 bun run "scripts/e2e/$suite.ts"; then
		FAILED+=("$suite")
	fi
done

echo ""
echo "=== SUMMARY ==="
printf '%-28s %6s %6s %6s\n' "SUITE" "PASS" "FAIL" "SKIP"
TOTAL_PASS=0
TOTAL_FAIL=0
TOTAL_SKIP=0
while IFS=$'\t' read -r name passed failed skipped; do
	printf '%-28s %6s %6s %6s\n' "$name" "$passed" "$failed" "$skipped"
	TOTAL_PASS=$((TOTAL_PASS + passed))
	TOTAL_FAIL=$((TOTAL_FAIL + failed))
	TOTAL_SKIP=$((TOTAL_SKIP + skipped))
done < <(bun -e '
const { readFileSync } = require("node:fs");
const lines = readFileSync("/tmp/rv-plugins-e2e/reports/summary.jsonl", "utf8").trim().split("\n");
const bySuite = new Map();
for (const line of lines) {
	const entry = JSON.parse(line);
	const current = bySuite.get(entry.suite) ?? { passed: 0, failed: 0, skipped: 0 };
	current.passed += entry.passed;
	current.failed += entry.failed;
	current.skipped += entry.skipped;
	bySuite.set(entry.suite, current);
}
for (const [name, counts] of bySuite) process.stdout.write(`${name}\t${counts.passed}\t${counts.failed}\t${counts.skipped}\n`);
')

echo ""
echo "TOTAL: $TOTAL_PASS pass, $TOTAL_FAIL fail, $TOTAL_SKIP skip"

if [[ ${#FAILED[@]} -gt 0 ]]; then
	echo "CRASHED SUITES: ${FAILED[*]}"
	echo "RESULT: FAILURE"
	exit 1
fi

if [[ "$TOTAL_FAIL" -gt 0 ]]; then
	echo "RESULT: FAILURE"
	exit 1
fi

echo "RESULT: SUCCESS"
