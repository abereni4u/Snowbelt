#!/bin/zsh
# Records one demo GIF from the running app (backend on :8000, frontend on :5173).
#   docs/media/recorder/record.sh storm        -> docs/media/storm.gif
# Scenes: storm, pins, gemini, route, readiness. Needs Google Chrome, Node 20+ and Pillow (pip install pillow).
set -e
HERE=${0:A:h}
SCENE=$1
WORK=$(mktemp -d)
export FRAMES=$WORK/frames
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --hide-scrollbars \
  --remote-debugging-port=9333 --user-data-dir=$WORK/profile about:blank >/dev/null 2>&1 &
CHROME=$!
for i in $(seq 1 30); do curl -s localhost:9333/json/list >/dev/null 2>&1 && break; sleep 0.5; done
node "$HERE/scenes/$SCENE.mjs"
kill $CHROME
python3 "$HERE/assemble.py" "$FRAMES/$SCENE" "$HERE/../$SCENE.gif"
rm -rf $WORK
