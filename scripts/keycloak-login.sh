#!/usr/bin/env bash

# ./scripts/keycloak-login.sh test-user password

set -euo pipefail

usage() {
  cat <<'EOF'
Usage: keycloak-login.sh <username> <password> [client-id]

Environment variables:
  KEYCLOAK_URL        Base URL to the Keycloak server (default: http://localhost:8080)
  KEYCLOAK_REALM      Realm to authenticate against (default: research)
  KEYCLOAK_CLIENT_ID  Client ID used for the password grant (default: research-migration-from-legacy)
EOF
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

if [[ $# -lt 2 ]]; then
  echo "Error: username and password arguments are required." >&2
  usage >&2
  exit 1
fi

KEYCLOAK_URL=${KEYCLOAK_URL:-http://localhost:8080}
KEYCLOAK_REALM=${KEYCLOAK_REALM:-research}
CLIENT_ID=${3:-${KEYCLOAK_CLIENT_ID:-research-migration-from-legacy}}
USERNAME=$1
PASSWORD=$2

TOKEN_ENDPOINT="${KEYCLOAK_URL%/}/realms/${KEYCLOAK_REALM}/protocol/openid-connect/token"

response=$(curl -sS -X POST \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  -d "grant_type=password" \
  -d "client_id=${CLIENT_ID}" \
  -d "username=${USERNAME}" \
  -d "password=${PASSWORD}" \
  "$TOKEN_ENDPOINT")

if command -v jq >/dev/null 2>&1; then
  echo "$response" | jq
else
  echo "$response"
fi

