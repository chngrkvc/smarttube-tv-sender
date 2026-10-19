#!/usr/bin/env bash
# Çalışan userscript'i sürüm numarasıyla backups/ klasörüne kopyalar.
#
#   ./scripts/backup.sh
#
# Geri yüklemek için:  ./scripts/restore.sh <sürüm>
set -euo pipefail

cd "$(dirname "$0")/.."

SOURCE="smarttube-sender.user.js"
VERSION="$(sed -n 's|^// @version *||p' "$SOURCE" | head -1 | tr -d '[:space:]')"

if [ -z "$VERSION" ]; then
  echo "HATA: $SOURCE içinde @version bulunamadı." >&2
  exit 1
fi

mkdir -p backups
TARGET="backups/smarttube-sender-v${VERSION}.user.js"

cp -p "$SOURCE" "$TARGET"

HASH="$(shasum -a 256 "$SOURCE" | awk '{print $1}')"
if [ -f backups/SHA256SUMS ]; then
  grep -v "  $(basename "$TARGET")\$" backups/SHA256SUMS > backups/SHA256SUMS.tmp || true
  mv backups/SHA256SUMS.tmp backups/SHA256SUMS
fi
printf '%s  %s\n' "$HASH" "$(basename "$TARGET")" >> backups/SHA256SUMS

echo "yedeklendi: $TARGET"
echo "sha256    : $HASH"
