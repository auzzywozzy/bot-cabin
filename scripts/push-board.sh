#!/usr/bin/env bash
# Push the pipeline board and/or the "Today" busy/free board to your deployed site (POST /api/board).
# Each section you send replaces the stored one, so it is safe to run on a schedule.
#
# Usage:
#   ./scripts/push-board.sh --pipeline pipeline.csv          # pipeline only (CSV format: see board/pipeline.mjs)
#   ./scripts/push-board.sh --calendar busy.json             # today board only (format: see board/calendar.mjs)
#   ./scripts/push-board.sh --pipeline p.csv --calendar busy.json
#   ./scripts/push-board.sh --dry-run --pipeline p.csv       # print the payload, send nothing
#   cat busy.json | ./scripts/push-board.sh --calendar -
# Needs SITE_URL and STATUS_WRITE_TOKEN (environment or .env) unless --dry-run. TIMEZONE sets the zone used for
# "this week" and the busy/free blocks (IANA name, default UTC).
# Exit: 0 ok, 1 push failed, 2 not configured, 3 bad input.
set -uo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/_env.sh"
PIPE=""; CAL=""; DRY=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --pipeline) PIPE="${2:-}"; shift 2 || { echo "push-board: --pipeline needs a CSV file" >&2; exit 3; } ;;
    --calendar) CAL="${2:-}"; shift 2 || { echo "push-board: --calendar needs FILE or -" >&2; exit 3; } ;;
    --dry-run) DRY=1; shift ;;
    -h|--help) sed -n '2,14p' "$0"; exit 0 ;;
    *) echo "push-board: unknown argument: $1 (see --help)" >&2; exit 3 ;;
  esac
done
[[ -n "$PIPE" || -n "$CAL" ]] || { echo "push-board: nothing to push (use --pipeline and/or --calendar)" >&2; exit 3; }
command -v node >/dev/null || { echo "push-board: node not found" >&2; exit 2; }

PIPE_JSON=null; CAL_JSON=null
if [[ -n "$PIPE" ]]; then
  PIPE_JSON="$(node "$ROOT/board/pipeline.mjs" "$PIPE")" || { echo "push-board: pipeline aggregation failed" >&2; exit 3; }
fi
if [[ -n "$CAL" ]]; then
  if [[ "$CAL" != "-" && ! -r "$CAL" ]]; then echo "push-board: calendar file not readable: $CAL" >&2; exit 3; fi
  CAL_JSON="$(node "$ROOT/board/calendar.mjs" "$CAL")" || { echo "push-board: calendar conversion failed" >&2; exit 3; }
fi
BODY="$(printf '{"pipeline":%s,"calendar":%s}' "$PIPE_JSON" "$CAL_JSON" | node -e '
  let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const o=JSON.parse(s);for(const k of Object.keys(o))if(o[k]===null)delete o[k];process.stdout.write(JSON.stringify(o));});')" \
  || { echo "push-board: could not build payload" >&2; exit 3; }
if [[ $DRY -eq 1 ]]; then printf '%s\n' "$BODY"; exit 0; fi
if [[ -z "${SITE_URL:-}" || -z "${STATUS_WRITE_TOKEN:-}" ]]; then
  echo "push-board: not configured (set SITE_URL and STATUS_WRITE_TOKEN, see .env.example)" >&2; exit 2
fi
post_json "${BOARD_API_URL:-$SITE_URL/api/board}" "$BODY" || exit 1
