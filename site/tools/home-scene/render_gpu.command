#!/bin/bash
# Renders the Alaro home sequence at 1920x1080 on this computer's GPU, then zips the frames.
# macOS: double-click (or run `bash render_gpu.command` in Terminal). Linux: `bash render_gpu.command`.
# Rendering again later resumes where it stopped. Extra options pass through, e.g. --start 0 --end 119
set -e
cd "$(dirname "$0")"

BLENDER="${BLENDER:-}"
if [ -z "$BLENDER" ]; then
  for c in "$(command -v blender || true)" /Applications/Blender.app/Contents/MacOS/Blender \
           "$HOME/Applications/Blender.app/Contents/MacOS/Blender" /snap/bin/blender; do
    if [ -n "$c" ] && [ -x "$c" ]; then BLENDER="$c"; break; fi
  done
fi
if [ -z "$BLENDER" ]; then
  echo "Could not find Blender. Run again with its path, for example:"
  echo "  BLENDER=/path/to/blender bash render_gpu.command"
  exit 1
fi

echo "Using Blender: $BLENDER"
echo "Rendering 240 frames at 1920x1080. Leave this window open."
"$BLENDER" -b -P "$(pwd)/build_home.py" -- --render --final --gpu "$@"

echo "Zipping the frames..."
rm -f alaro-frames-hd.zip
(cd frames/hd && zip -q -r ../../alaro-frames-hd.zip .)
echo "Done. Send this file back: $(pwd)/alaro-frames-hd.zip"
