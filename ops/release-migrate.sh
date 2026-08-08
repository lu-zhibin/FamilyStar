#!/bin/sh

set -eu

USAGE='usage: release-migrate.sh --env-file ABS_PATH --compose-file ABS_PATH --compose-project NAME --backup-dir ABS_PATH --release-id ID --web-health-url URL --api-health-url URL [--git-commit SHA] [--timeout SECONDS] [--interval SECONDS]'
SCRIPT_DIR=$(CDPATH= cd "$(dirname "$0")" && pwd)
PROJECT_ROOT=$(CDPATH= cd "$SCRIPT_DIR/.." && pwd)
METADATA_HELPER="$SCRIPT_DIR/release-metadata.mjs"
TIMEOUT=60
INTERVAL=2
ENV_FILE=
COMPOSE_FILE=
COMPOSE_PROJECT=
BACKUP_DIR=
RELEASE_ID=
WEB_HEALTH_URL=
API_HEALTH_URL=
GIT_COMMIT=
STAGE=arguments
BACKUP_VERIFIED=0
STATE_DIR=
METADATA_PATH=

fail() {
  FAILURE_CODE=$1
  printf '%s\n' "$FAILURE_CODE" >&2
  exit 1
}

require_value() {
  [ "$#" -ge 2 ] || {
    printf '%s\n' "$USAGE" >&2
    exit 64
  }
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --env-file)
      require_value "$@"
      ENV_FILE=$2
      shift 2
      ;;
    --compose-file)
      require_value "$@"
      COMPOSE_FILE=$2
      shift 2
      ;;
    --compose-project)
      require_value "$@"
      COMPOSE_PROJECT=$2
      shift 2
      ;;
    --backup-dir)
      require_value "$@"
      BACKUP_DIR=$2
      shift 2
      ;;
    --release-id)
      require_value "$@"
      RELEASE_ID=$2
      shift 2
      ;;
    --web-health-url)
      require_value "$@"
      WEB_HEALTH_URL=$2
      shift 2
      ;;
    --api-health-url)
      require_value "$@"
      API_HEALTH_URL=$2
      shift 2
      ;;
    --git-commit)
      require_value "$@"
      GIT_COMMIT=$2
      shift 2
      ;;
    --timeout)
      require_value "$@"
      TIMEOUT=$2
      shift 2
      ;;
    --interval)
      require_value "$@"
      INTERVAL=$2
      shift 2
      ;;
    *)
      printf '%s\n' "$USAGE" >&2
      exit 64
      ;;
  esac
done

[ -n "$ENV_FILE" ] && [ -n "$COMPOSE_FILE" ] && [ -n "$COMPOSE_PROJECT" ] && \
  [ -n "$BACKUP_DIR" ] && [ -n "$RELEASE_ID" ] && [ -n "$WEB_HEALTH_URL" ] && \
  [ -n "$API_HEALTH_URL" ] || {
  printf '%s\n' "$USAGE" >&2
  exit 64
}

case "$BACKUP_DIR" in
  /*) ;;
  *) fail 'E_UNSAFE_BACKUP_PATH' ;;
esac

case "$BACKUP_DIR" in
  /|/root|/root/*|*/../*|*/..|*/./*|*/.) fail 'E_UNSAFE_BACKUP_PATH' ;;
esac

if [ -n "${HOME:-}" ]; then
  case "$BACKUP_DIR" in
    "$HOME") fail 'E_UNSAFE_BACKUP_PATH' ;;
  esac
fi

[ -d "$BACKUP_DIR" ] && [ ! -L "$BACKUP_DIR" ] || fail 'E_UNSAFE_BACKUP_PATH'
CANONICAL_BACKUP_DIR=$(CDPATH= cd "$BACKUP_DIR" && pwd -P) || fail 'E_UNSAFE_BACKUP_PATH'
[ "$CANONICAL_BACKUP_DIR" = "$BACKUP_DIR" ] || fail 'E_UNSAFE_BACKUP_PATH'

case "$ENV_FILE" in
  /*) [ -f "$ENV_FILE" ] && [ ! -L "$ENV_FILE" ] || fail 'E_ENV_FILE' ;;
  *) fail 'E_ENV_FILE' ;;
esac

case "$COMPOSE_FILE" in
  /*) [ -f "$COMPOSE_FILE" ] && [ ! -L "$COMPOSE_FILE" ] || fail 'E_COMPOSE_FILE' ;;
  *) fail 'E_COMPOSE_FILE' ;;
esac

case "$COMPOSE_PROJECT" in
  ''|*[!A-Za-z0-9_.-]*) fail 'E_COMPOSE_PROJECT' ;;
esac

case "$RELEASE_ID" in
  ''|.*|*[!A-Za-z0-9_.-]*) fail 'E_RELEASE_ID' ;;
esac

if [ -n "$GIT_COMMIT" ]; then
  [ "${#GIT_COMMIT}" -eq 40 ] || fail 'E_GIT_COMMIT'
  case "$GIT_COMMIT" in
    *[!0-9A-Fa-f]*) fail 'E_GIT_COMMIT' ;;
  esac
fi

for HEALTH_URL in "$WEB_HEALTH_URL" "$API_HEALTH_URL"; do
  case "$HEALTH_URL" in
    http://*|https://*) ;;
    *) fail 'E_HEALTH_URL' ;;
  esac
  case "$HEALTH_URL" in
    *\?*|*\#*|*://*@*) fail 'E_HEALTH_URL' ;;
  esac
done

case "$TIMEOUT:$INTERVAL" in
  *[!0-9:]*|:*|*:) fail 'E_TIMEOUT' ;;
esac
[ "$TIMEOUT" -gt 0 ] && [ "$INTERVAL" -gt 0 ] || fail 'E_TIMEOUT'

BACKUP_PATH="$BACKUP_DIR/$RELEASE_ID.dump"
METADATA_PATH="$BACKUP_DIR/$RELEASE_ID.rollback.json"
[ ! -e "$BACKUP_PATH" ] && [ ! -e "$METADATA_PATH" ] || fail 'E_RELEASE_EXISTS'

STATE_DIR=$(mktemp -d "$BACKUP_DIR/.release-$RELEASE_ID.XXXXXX") || fail 'E_TEMP_STATE'
STARTED_AT=$(date -u '+%Y-%m-%dT%H:%M:%SZ')
printf '%s\n' "$RELEASE_ID" > "$STATE_DIR/release-id"
printf '%s\n' "$COMPOSE_PROJECT" > "$STATE_DIR/compose-project"
printf '%s\n' "$COMPOSE_FILE" > "$STATE_DIR/compose-file"
printf '%s\n' "$STARTED_AT" > "$STATE_DIR/started-at"
printf '%s\n' "$BACKUP_PATH" > "$STATE_DIR/backup-path"
printf '%s\n' 'preparing' > "$STATE_DIR/status"
: > "$STATE_DIR/deployment-services.tsv"
: > "$STATE_DIR/health.tsv"

compose() {
  docker compose --env-file "$ENV_FILE" -p "$COMPOSE_PROJECT" -f "$COMPOSE_FILE" "$@"
}

write_metadata() {
  METADATA_TEMP=$(mktemp "$METADATA_PATH.tmp.XXXXXX") || fail 'E_METADATA_TEMP'
  chmod 600 "$METADATA_TEMP" || fail 'E_METADATA_PERMISSION'
  node "$METADATA_HELPER" write "$STATE_DIR" "$METADATA_TEMP" >/dev/null 2>&1 || \
    fail 'E_METADATA_WRITE'
  mv "$METADATA_TEMP" "$METADATA_PATH" || fail 'E_METADATA_COMMIT'
}

on_exit() {
  EXIT_CODE=$1
  trap - EXIT
  if [ "$EXIT_CODE" -ne 0 ] && [ "$BACKUP_VERIFIED" -eq 1 ]; then
    printf '%s\n' 'failed' > "$STATE_DIR/status"
    printf '%s\n' "$STAGE" > "$STATE_DIR/failure-stage"
    printf '%s\n' "${FAILURE_CODE:-E_RELEASE_FAILED}" > "$STATE_DIR/failure-message"
    date -u '+%Y-%m-%dT%H:%M:%SZ' > "$STATE_DIR/failed-at"
    write_metadata
  fi
  exit "$EXIT_CODE"
}

trap 'on_exit $?' EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM

STAGE=source
if [ -z "$GIT_COMMIT" ]; then
  GIT_COMMIT=$(git -C "$PROJECT_ROOT" rev-parse HEAD 2>/dev/null) || fail 'E_GIT_COMMIT'
  if [ -n "$(git -C "$PROJECT_ROOT" status --porcelain 2>/dev/null)" ]; then
    GIT_DIRTY=true
  else
    GIT_DIRTY=false
  fi
else
  GIT_DIRTY=false
fi
printf '%s\n' "$GIT_COMMIT" > "$STATE_DIR/git-commit"
printf '%s\n' "$GIT_DIRTY" > "$STATE_DIR/git-dirty"

STAGE=compose_config
compose config --format json 2>/dev/null | \
  node "$METADATA_HELPER" extract-services > "$STATE_DIR/config-services.tsv" 2>/dev/null || \
  fail 'E_COMPOSE_CONFIG'
compose config --hash '*' > "$STATE_DIR/compose-hashes" 2>/dev/null || fail 'E_COMPOSE_CONFIG'
COMPOSE_SHA256=$(sha256sum "$STATE_DIR/config-services.tsv" "$STATE_DIR/compose-hashes" | \
  sha256sum | cut -d ' ' -f 1) || fail 'E_COMPOSE_CONFIG'
printf '%s\n' "$COMPOSE_SHA256" > "$STATE_DIR/compose-sha256"

STAGE=migrations
: > "$STATE_DIR/migrations"
for MIGRATION_PATH in "$PROJECT_ROOT"/apps/api/prisma/migrations/*; do
  if [ -d "$MIGRATION_PATH" ]; then
    basename "$MIGRATION_PATH" >> "$STATE_DIR/migrations"
  fi
done

snapshot_services() {
  OUTPUT_FILE=$1
  : > "$OUTPUT_FILE"
  while IFS="$(printf '\t')" read -r SERVICE IMAGE_REF; do
    [ -n "$SERVICE" ] || continue
    IMAGE_ID=$(docker image inspect --format '{{.Id}}' "$IMAGE_REF" 2>/dev/null) || \
      fail 'E_IMAGE_MISSING'
    CONTAINER_ID=$(compose ps -q "$SERVICE" 2>/dev/null || true)
    if [ -n "$CONTAINER_ID" ]; then
      INSPECTED=$(docker inspect --format '{{.State.Status}}|{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$CONTAINER_ID" 2>/dev/null) || \
        fail 'E_CONTAINER_INSPECT'
      CONTAINER_STATE=${INSPECTED%%|*}
      CONTAINER_HEALTH=${INSPECTED#*|}
    else
      CONTAINER_STATE=absent
      CONTAINER_HEALTH=absent
    fi
    printf '%s\t%s\t%s\t%s\t%s\t%s\n' "$SERVICE" "$IMAGE_REF" "$IMAGE_ID" \
      "$CONTAINER_ID" "$CONTAINER_STATE" "$CONTAINER_HEALTH" >> "$OUTPUT_FILE"
  done < "$STATE_DIR/config-services.tsv"
}

STAGE=rollback_snapshot
snapshot_services "$STATE_DIR/rollback-services.tsv"

STAGE=data_service_start
compose up -d postgres redis >/dev/null 2>&1 || fail 'E_DATA_SERVICE_START'
DEADLINE=$(( $(date +%s) + TIMEOUT ))
while :; do
  DATA_SERVICES_HEALTHY=true
  for SERVICE in postgres redis; do
    CONTAINER_ID=$(compose ps -q "$SERVICE" 2>/dev/null || true)
    if [ -z "$CONTAINER_ID" ]; then
      DATA_SERVICES_HEALTHY=false
      continue
    fi
    HEALTH=$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$CONTAINER_ID" 2>/dev/null || true)
    [ "$HEALTH" = healthy ] || DATA_SERVICES_HEALTHY=false
  done
  if [ "$DATA_SERVICES_HEALTHY" = true ]; then
    break
  fi
  [ "$(date +%s)" -lt "$DEADLINE" ] || fail 'E_DATA_HEALTH_TIMEOUT'
  sleep "$INTERVAL"
done

STAGE=backup
BACKUP_TEMP=$(mktemp "$BACKUP_PATH.partial.XXXXXX") || fail 'E_BACKUP_TEMP'
chmod 600 "$BACKUP_TEMP" || fail 'E_BACKUP_PERMISSION'
compose exec -T postgres sh -c \
  'PGUSER=$POSTGRES_USER PGDATABASE=$POSTGRES_DB exec pg_dump --format=custom --file=-' \
  > "$BACKUP_TEMP" 2>/dev/null || fail 'E_BACKUP_FAILED'
[ -s "$BACKUP_TEMP" ] || fail 'E_BACKUP_EMPTY'
mv "$BACKUP_TEMP" "$BACKUP_PATH" || fail 'E_BACKUP_COMMIT'
chmod 600 "$BACKUP_PATH" || fail 'E_BACKUP_PERMISSION'
date -u '+%Y-%m-%dT%H:%M:%SZ' > "$STATE_DIR/backup-created-at"

STAGE=backup_manifest
BACKUP_LIST=$(mktemp "$BACKUP_PATH.list.XXXXXX") || fail 'E_BACKUP_LIST_TEMP'
compose exec -T postgres pg_restore --list < "$BACKUP_PATH" > "$BACKUP_LIST" 2>/dev/null || \
  fail 'E_BACKUP_MANIFEST'
[ -s "$BACKUP_LIST" ] || fail 'E_BACKUP_MANIFEST_EMPTY'
BACKUP_LIST_ENTRIES=$(wc -l < "$BACKUP_LIST" | tr -d ' ')
printf '%s\n' "$BACKUP_LIST_ENTRIES" > "$STATE_DIR/backup-list-entries"

STAGE=backup_checksum
BACKUP_SHA256=$(sha256sum "$BACKUP_PATH" | cut -d ' ' -f 1) || fail 'E_BACKUP_CHECKSUM'
printf '%s\n' "$BACKUP_SHA256" > "$STATE_DIR/backup-sha256"
date -u '+%Y-%m-%dT%H:%M:%SZ' > "$STATE_DIR/backup-verified-at"
printf '%s\n' 'backup_verified' > "$STATE_DIR/status"
BACKUP_VERIFIED=1
write_metadata

STAGE=migration
compose run --rm -e RUN_MIGRATIONS=1 migrate >/dev/null 2>&1 || fail 'E_MIGRATION_FAILED'
printf '%s\n' 'migration_completed' > "$STATE_DIR/status"
write_metadata

STAGE=service_start
compose up -d postgres redis api worker web >/dev/null 2>&1 || fail 'E_SERVICE_START'

STAGE=health
DEADLINE=$(( $(date +%s) + TIMEOUT ))
while :; do
  ALL_HEALTHY=true
  for SERVICE in web api worker postgres redis; do
    CONTAINER_ID=$(compose ps -q "$SERVICE" 2>/dev/null || true)
    if [ -z "$CONTAINER_ID" ]; then
      ALL_HEALTHY=false
      continue
    fi
    HEALTH=$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$CONTAINER_ID" 2>/dev/null || true)
    [ "$HEALTH" = healthy ] || ALL_HEALTHY=false
  done
  if [ "$ALL_HEALTHY" = true ]; then
    break
  fi
  if [ "$(date +%s)" -ge "$DEADLINE" ]; then
    snapshot_services "$STATE_DIR/deployment-services.tsv"
    fail 'E_HEALTH_TIMEOUT'
  fi
  sleep "$INTERVAL"
done

: > "$STATE_DIR/health.tsv"
for HEALTH_URL in "$WEB_HEALTH_URL" "$API_HEALTH_URL"; do
  if HTTP_STATUS=$(curl --silent --show-error --fail --max-time 10 --output /dev/null \
    --write-out '%{http_code}' "$HEALTH_URL" 2>/dev/null); then
    :
  else
    HTTP_STATUS=${HTTP_STATUS:-000}
    CHECKED_AT=$(date -u '+%Y-%m-%dT%H:%M:%SZ')
    printf '%s\t%s\t%s\n' "$HEALTH_URL" "$HTTP_STATUS" "$CHECKED_AT" >> "$STATE_DIR/health.tsv"
    fail 'E_HTTP_HEALTH'
  fi
  CHECKED_AT=$(date -u '+%Y-%m-%dT%H:%M:%SZ')
  printf '%s\t%s\t%s\n' "$HEALTH_URL" "$HTTP_STATUS" "$CHECKED_AT" >> "$STATE_DIR/health.tsv"
done

STAGE=deployment_snapshot
snapshot_services "$STATE_DIR/deployment-services.tsv"
printf '%s\n' 'healthy' > "$STATE_DIR/status"
date -u '+%Y-%m-%dT%H:%M:%SZ' > "$STATE_DIR/completed-at"
write_metadata

printf '%s\n' "release metadata: $METADATA_PATH"
printf '%s\n' 'manual restore template: docker compose --env-file <ENV_FILE> -p <COMPOSE_PROJECT> -f <COMPOSE_FILE> exec -T postgres pg_restore --no-owner --dbname "$POSTGRES_DB" < <BACKUP_FILE>'
