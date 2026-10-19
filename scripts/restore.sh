#!/usr/bin/env bash
# backups/ içindeki bir sürümü çalışma dosyasına geri yükler (üzerine yazmadan önce yedek alır).
#
#   ./scripts/restore.sh            # mevcut yedekleri listeler
#   ./scripts/restore.sh 1.0.1      # 1.0.1 sürümünü geri yükler
set -euo pipefail

cd "$(dirname "$0")/.."

if [ $# -eq 0 ]; then
  echo "Mevcut yedekler:"
  ls -1 backups/smarttube-sender-v*.user.js 2>/dev/null | sed 's|backups/smarttube-sender-v||; s|\.user\.js||; s|^|  |' || true
  echo
  echo "Kullanım: ./scripts/restore.sh <sürüm>"
  exit 0
fi

VERSION="$1"
BACKUP="backups/smarttube-sender-v${VERSION}.user.js"

if [ ! -f "$BACKUP" ]; then
  echo "HATA: $BACKUP bulunamadı." >&2
  exit 1
fi

# Geri yüklemeden önce mevcut hâli de yedekle
./scripts/backup.sh >/dev/null

cp -p "$BACKUP" smarttube-sender.user.js
echo "geri yüklendi: $BACKUP -> smarttube-sender.user.js"
echo "hatırlatma: Tampermonkey panelinde script içeriğini yeni hâliyle değiştir."
