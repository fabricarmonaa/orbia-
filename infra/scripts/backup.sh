#!/usr/bin/env bash
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/var/backups/orbia}"
RETENTION_DAYS="${RETENTION_DAYS:-7}"
TS="$(date +%Y%m%d_%H%M%S)"

mkdir -p "$BACKUP_DIR"

if [[ -z "${POSTGRES_DB:-}" || -z "${POSTGRES_USER:-}" || -z "${POSTGRES_PASSWORD:-}" ]]; then
  echo "POSTGRES_DB, POSTGRES_USER y POSTGRES_PASSWORD son requeridos" >&2
  exit 1
fi

export PGPASSWORD="$POSTGRES_PASSWORD"

OUT_FILE="$BACKUP_DIR/orbia_${POSTGRES_DB}_${TS}.sql.gz"
pg_dump -h "${POSTGRES_HOST:-127.0.0.1}" -p "${POSTGRES_PORT:-5432}" -U "$POSTGRES_USER" "$POSTGRES_DB" | gzip > "$OUT_FILE"

find "$BACKUP_DIR" -type f -name '*.sql.gz' -mtime +"$RETENTION_DAYS" -delete

echo "Backup generado: $OUT_FILE"
