#!/usr/bin/env bash
# Userscript kaynağından Chrome/Chromium eklentisini üretir.
#
#   ./scripts/build-extension.sh
#
# Sonrasında: chrome://extensions → Geliştirici modu → "Paketlenmemiş öğe yükle"
# → smarttube-tv-sender/extension klasörünü seç. Güncellemeden sonra eklentinin
# "Yenile" düğmesine bas.
set -euo pipefail

cd "$(dirname "$0")/.."

SOURCE="smarttube-sender.user.js"
VERSION="$(sed -n 's|^// @version *||p' "$SOURCE" | head -1 | tr -d '[:space:]')"

if [ -z "$VERSION" ]; then
  echo "HATA: $SOURCE içinde @version bulunamadı." >&2
  exit 1
fi

mkdir -p extension/icons
node scripts/make-icons.cjs >/dev/null

{
  echo "// OTOMATİK ÜRETİLDİ — elle düzenlemeyin."
  echo "// Kaynak: smarttube-sender.user.js (v${VERSION}) — güncellemek için: ./scripts/build-extension.sh"
  sed '1,/^\/\/ ==\/UserScript==$/d' "$SOURCE"
} > extension/content.js

sed -i '' "s/\"version\": \"[^\"]*\"/\"version\": \"${VERSION}\"/" extension/manifest.json

echo "hazır: extension/ (v${VERSION})"
echo "  content.js : $(wc -l < extension/content.js | tr -d ' ') satır"
echo "  manifest   : $(grep -o '"version": "[^"]*"' extension/manifest.json)"
