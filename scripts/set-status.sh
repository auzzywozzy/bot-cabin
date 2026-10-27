#!/usr/bin/env bash
# Update an agent's status in the office.
# Usage: ./scripts/set-status.sh <agent> <working|meeting|idle|break> ["task text"]
#        (agent ids are listed in src/agents.config.js)
# Always writes public/status/<agent>.json for local dev. If SITE_URL and STATUS_WRITE_TOKEN are set
# (in the environment or in .env), it also POSTs the update to your deployed site's /api/status.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/_env.sh"
DIR="$ROOT/public/status"
IDS="$(cd "$ROOT" && node -e 'import("./src/agents.config.js").then(m=>console.log(m.agentIds().join(" ")))')"
usage() { echo "Usage: $0 <${IDS// /|}> <working|meeting|idle|break> [\"task text\"]" >&2; exit 1; }
[[ $# -ge 2 && $# -le 3 ]] || usage
AGENT="$1"; STATE="$2"; TASK="${3:-}"
[[ " $IDS " == *" $AGENT "* && "$AGENT" =~ ^[a-z]+$ ]] || { echo "Unknown agent: $AGENT" >&2; usage; }
case "$STATE" in working|meeting|idle|break) ;; *) echo "Unknown state: $STATE" >&2; usage ;; esac
mkdir -p "$DIR"
BODY="$(AGENT="$AGENT" STATE="$STATE" TASK="$TASK" node -e '
  const t = [...(process.env.TASK || "")].slice(0, 200).join("");
  process.stdout.write(JSON.stringify({ agent: process.env.AGENT, state: process.env.STATE, task: t,
    updated: new Date().toISOString().replace(/\.\d{3}Z$/, "Z") }));')"
printf '%s\n' "$BODY" > "$DIR/$AGENT.json"
cat "$DIR/$AGENT.json"
if [[ -n "${SITE_URL:-}" && -n "${STATUS_WRITE_TOKEN:-}" && "${NO_PUSH:-}" != "1" ]]; then
  post_json "$SITE_URL/api/status" "$BODY" || true
fi
