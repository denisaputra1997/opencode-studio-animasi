#!/usr/bin/env bash
# Fetch dokumentasi library up-to-date dari Context7.
# Pakai: ./fetch.sh "<pertanyaan>" "<nama library>" [jumlah_snippet]
set -euo pipefail

KEY="${CONTEXT7_API_KEY:-}"
if [ -z "$KEY" ]; then
  echo "Error: env CONTEXT7_API_KEY belum di-set." >&2
  exit 1
fi

QUERY="${1:?pertanyaan wajib diisi}"
LIB="${2:-}"
LIMIT="${3:-5}"

curl -sS -G "https://context7.com/api/v3/search" \
  -H "Authorization: Bearer $KEY" \
  --data-urlencode "query=$QUERY" \
  --data-urlencode "libraryName=$LIB" \
  --data-urlencode "type=json" \
| jq -r --argjson n "$LIMIT" '
    (.codeSnippets // [])[:$n][]
    | "## \(.codeTitle)\nSource: \(.libraryId) — \(.codeId)\n\(.codeList[0].code)\n"
  '