#!/bin/sh

set -eu

USAGE='usage: verify-release.sh --env-file ABS_PATH --compose-file ABS_PATH --compose-project NAME --metadata ABS_PATH'
SCRIPT_DIR=$(CDPATH= cd "$(dirname "$0")" && pwd)
METADATA_HELPER="$SCRIPT_DIR/release-metadata.mjs"
ENV_FILE=
COMPOSE_FILE=
COMPOSE_PROJECT=
METADATA_PATH=

fail() {
  printf '%s\n' "$1" >&2
  exit 1
}

while [ "$#" -gt 0 ]; do
  [ "$#" -ge 2 ] || {
    printf '%s\n' "$USAGE" >&2
    exit 64
  }
  case "$1" in
    --env-file) ENV_FILE=$2 ;;
    --compose-file) COMPOSE_FILE=$2 ;;
    --compose-project) COMPOSE_PROJECT=$2 ;;
    --metadata) METADATA_PATH=$2 ;;
    *)
      printf '%s\n' "$USAGE" >&2
      exit 64
      ;;
  esac
  shift 2
done

[ -n "$ENV_FILE" ] && [ -n "$COMPOSE_FILE" ] && [ -n "$COMPOSE_PROJECT" ] && \
  [ -n "$METADATA_PATH" ] || {
  printf '%s\n' "$USAGE" >&2
  exit 64
}

case "$ENV_FILE:$COMPOSE_FILE:$METADATA_PATH" in
  /*:/*:/*) ;;
  *) fail 'E_VERIFY_PATH' ;;
esac

[ -f "$ENV_FILE" ] && [ -f "$COMPOSE_FILE" ] && [ -f "$METADATA_PATH" ] || \
  fail 'E_VERIFY_PATH'

case "$COMPOSE_PROJECT" in
  ''|*[!A-Za-z0-9_.-]*) fail 'E_COMPOSE_PROJECT' ;;
esac

STATE_DIR=$(mktemp -d "${TMPDIR:-/tmp}/familystar-verify.XXXXXX") || fail 'E_TEMP_STATE'
node "$METADATA_HELPER" prepare-verification "$METADATA_PATH" "$STATE_DIR" 2>/dev/null || \
  fail 'E_METADATA_INVALID'

compose() {
  docker compose --env-file "$ENV_FILE" -p "$COMPOSE_PROJECT" -f "$COMPOSE_FILE" "$@"
}

BACKUP_PATH=$(sed -n '1p' "$STATE_DIR/backup-path")
EXPECTED_SHA256=$(sed -n '1p' "$STATE_DIR/backup-sha256")
[ -f "$BACKUP_PATH" ] && [ -s "$BACKUP_PATH" ] || fail 'E_BACKUP_MISSING'
ACTUAL_SHA256=$(sha256sum "$BACKUP_PATH" | cut -d ' ' -f 1) || fail 'E_BACKUP_CHECKSUM'
[ "$ACTUAL_SHA256" = "$EXPECTED_SHA256" ] || fail 'E_BACKUP_CHECKSUM_MISMATCH'

BACKUP_LIST=$(mktemp "${TMPDIR:-/tmp}/familystar-backup-list.XXXXXX") || \
  fail 'E_BACKUP_LIST_TEMP'
compose exec -T postgres pg_restore --list < "$BACKUP_PATH" > "$BACKUP_LIST" 2>/dev/null || \
  fail 'E_BACKUP_MANIFEST'
[ -s "$BACKUP_LIST" ] || fail 'E_BACKUP_MANIFEST_EMPTY'

while IFS="$(printf '\t')" read -r SERVICE IMAGE_REF EXPECTED_IMAGE_ID EXPECTED_STATE EXPECTED_HEALTH; do
  [ -n "$SERVICE" ] || continue
  ACTUAL_IMAGE_ID=$(docker image inspect --format '{{.Id}}' "$IMAGE_REF" 2>/dev/null) || \
    fail 'E_IMAGE_MISSING'
  [ "$ACTUAL_IMAGE_ID" = "$EXPECTED_IMAGE_ID" ] || fail 'E_IMAGE_ID_MISMATCH'
  if [ "$EXPECTED_STATE" = absent ] && [ "$EXPECTED_HEALTH" = absent ]; then
    continue
  fi
  CONTAINER_ID=$(compose ps -q "$SERVICE" 2>/dev/null || true)
  [ -n "$CONTAINER_ID" ] || fail 'E_CONTAINER_MISSING'
  HEALTH=$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$CONTAINER_ID" 2>/dev/null || true)
  [ "$HEALTH" = healthy ] || fail 'E_CONTAINER_UNHEALTHY'
done < "$STATE_DIR/services.tsv"

while IFS= read -r HEALTH_URL; do
  [ -n "$HEALTH_URL" ] || continue
  curl --silent --show-error --fail --max-time 10 --output /dev/null "$HEALTH_URL" 2>/dev/null || \
    fail 'E_HTTP_HEALTH'
done < "$STATE_DIR/health-urls"

printf '%s\n' 'verification: ok'
printf '%s\n' 'manual restore template: docker compose --env-file <ENV_FILE> -p <COMPOSE_PROJECT> -f <COMPOSE_FILE> exec -T postgres pg_restore --no-owner --dbname "$POSTGRES_DB" < <BACKUP_FILE>'
