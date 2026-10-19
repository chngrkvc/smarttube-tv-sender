#!/usr/bin/env bash
# GitHub Releases için dağıtılabilir eklenti zip'ini üretir.
#
#   ./scripts/package.sh
#   → dist/smarttube-tv-sender-v<surum>.zip
set -euo pipefail

cd "$(dirname "$0")/.."

./scripts/build-extension.sh >/dev/null
node test/extension.test.cjs >/dev/null

VERSION="$(sed -n 's|^// @version *||p' smarttube-sender.user.js | head -1 | tr -d '[:space:]')"
NAME="smarttube-tv-sender-v${VERSION}"
mkdir -p dist

rm -f "dist/${NAME}.zip"
(cd extension && zip -qr "../dist/${NAME}.zip" . -x '.DS_Store' '*/.*')

echo "hazır: dist/${NAME}.zip"
unzip -l "dist/${NAME}.zip" | tail -n +2 | head -20
