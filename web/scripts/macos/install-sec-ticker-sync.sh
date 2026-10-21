#!/bin/bash
# Mac Mini: 한국시간 16:00에 SEC 티커 파일로 회사 목록을 맞춘다.
# 미국 프리마켓(04:00 ET, 한국시간 17:00)보다 한 시간 전이다.
# 맥 시계가 한국시간이어야 한다.
#
#   cd $HOME/stockteller/web && bash scripts/macos/install-sec-ticker-sync.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
WEB="$ROOT/web"
LABEL="com.whyup.sec-ticker-sync"
PLIST="$HOME/Library/LaunchAgents/${LABEL}.plist"
LOG_DIR="$HOME/Library/Logs"
OUT_LOG="$LOG_DIR/whyup-sec-ticker-sync.log"
ERR_LOG="$LOG_DIR/whyup-sec-ticker-sync.err.log"

if [ ! -f "$WEB/package.json" ]; then
  echo "stockteller/web 을 찾지 못했습니다. 저장소 루트에서 실행하세요."
  exit 1
fi
if [ ! -f "$WEB/.env.local" ]; then
  echo "web/.env.local 이 없습니다. Supabase 키를 넣은 뒤 다시 실행하세요."
  exit 1
fi

if [ -s "$HOME/.nvm/nvm.sh" ]; then
  # shellcheck disable=SC1091
  . "$HOME/.nvm/nvm.sh"
fi
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

NPM="$(command -v npm || true)"
if [ -z "$NPM" ]; then
  echo "npm 이 없습니다. Node LTS를 설치한 뒤 터미널을 다시 여세요."
  exit 1
fi
NODE_BIN="$(command -v node)"
NODE_DIR="$(cd "$(dirname "$NODE_BIN")" && pwd)"

mkdir -p "$HOME/Library/LaunchAgents" "$LOG_DIR"

UID_NUM="$(id -u)"
cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LABEL}</string>
  <key>WorkingDirectory</key>
  <string>${WEB}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${NPM}</string>
    <string>run</string>
    <string>sync:sec-tickers</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>${NODE_DIR}:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
    <key>HOME</key>
    <string>${HOME}</string>
    <key>LANG</key>
    <string>en_US.UTF-8</string>
  </dict>
  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key>
    <integer>16</integer>
    <key>Minute</key>
    <integer>0</integer>
  </dict>
  <key>StandardOutPath</key>
  <string>${OUT_LOG}</string>
  <key>StandardErrorPath</key>
  <string>${ERR_LOG}</string>
</dict>
</plist>
EOF

launchctl bootout "gui/${UID_NUM}" "$PLIST" 2>/dev/null || true
launchctl unload "$PLIST" 2>/dev/null || true
if launchctl bootstrap "gui/${UID_NUM}" "$PLIST"; then
  launchctl enable "gui/${UID_NUM}/${LABEL}" 2>/dev/null || true
else
  launchctl load -w "$PLIST"
fi

echo "SEC 티커 목록 갱신을 매일 16:00에 넣었습니다."
echo "  저장소  $WEB"
echo "  로그    tail -f $OUT_LOG"
echo "맥 시계가 한국시간인지 확인하세요. 지금 한 번 돌리려면:"
echo "  cd $WEB && npm run sync:sec-tickers"
