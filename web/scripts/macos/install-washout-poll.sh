#!/bin/bash
# Mac Mini: 설거지 지수를 매분 55초에 찍어 Supabase에 넣는다.
# 사용:
#   cd ~/stockteller/web && bash scripts/macos/install-washout-poll.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
WEB="$ROOT/web"
LABEL="com.whyup.washout-poll"
PLIST="$HOME/Library/LaunchAgents/${LABEL}.plist"
LOG_DIR="$HOME/Library/Logs"
OUT_LOG="$LOG_DIR/whyup-washout-poll.log"
ERR_LOG="$LOG_DIR/whyup-washout-poll.err.log"

if [ ! -f "$WEB/package.json" ]; then
  echo "stockteller/web 을 찾지 못했습니다. 저장소 루트에서 실행하세요."
  exit 1
fi
if [ ! -f "$WEB/.env.local" ]; then
  echo "web/.env.local 이 없습니다. Polygon·Supabase 키를 넣은 뒤 다시 실행하세요."
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

cd "$WEB"
if [ -f package-lock.json ]; then
  npm ci
else
  npm install
fi

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
    <string>/usr/bin/caffeinate</string>
    <string>-i</string>
    <string>${NPM}</string>
    <string>run</string>
    <string>poll:washout</string>
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
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
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
  launchctl kickstart -k "gui/${UID_NUM}/${LABEL}" 2>/dev/null || true
else
  launchctl load -w "$PLIST"
fi

echo "설거지 폴러를 맥 로그인 항목으로 넣었습니다."
echo "  저장소  $WEB"
echo "  로그    tail -f $OUT_LOG"
echo "Mac Mini는 전원 연결 + 시스템 설정에서 디스플레이가 꺼져도 잠들지 않게 해 두세요."
