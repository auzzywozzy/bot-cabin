# Shared helper, sourced by the other scripts. Loads .env from the project root if it exists.
# Nothing here prints the token.
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if [[ -f "$ROOT/.env" ]]; then set -a; . "$ROOT/.env"; set +a; fi
SITE_URL="${SITE_URL:-}"; SITE_URL="${SITE_URL%/}"; STATUS_WRITE_TOKEN="${STATUS_WRITE_TOKEN:-}"
# POST_JSON <url> <json-body>: sends the body with the bearer token, prints the HTTP status to stderr.
# The token goes to curl through a stdin config so it never shows up in the process list.
post_json() {
  local url="$1" body="$2" out code
  out="$( { printf 'header = "Authorization: Bearer %s"\n' "$STATUS_WRITE_TOKEN"; } | \
    curl -sS --config - -X POST -H 'Content-Type: application/json' --data-binary "$body" \
      --max-time 20 --retry 2 --retry-all-errors -w '\n%{http_code}' "$url" 2>&1)"
  code="${out##*$'\n'}"
  if [[ "$code" == "200" ]]; then echo "hosted: ok ($url)" >&2; return 0; fi
  echo "hosted: FAILED (HTTP $code): ${out%$'\n'*}" >&2; return 1
}
