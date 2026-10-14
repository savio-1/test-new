#!/bin/bash
# Renders the Alaro home sequence (v2, clay statues) at 3840x2160 on this computer's GPU, then zips the
# WebP frames + track.json + render-info.txt into alaro-frames-4k.zip.
# macOS: double-click (or run `bash render_gpu.command` in Terminal). Linux: `bash render_gpu.command`.
# Running it again later resumes where it stopped. Extra options pass through, for example:
#   bash render_gpu.command --w 2560            (cheaper: 2560x1440, about 2.2x faster)
#   bash render_gpu.command --start 0 --end 239 (half the frames, for splitting across two computers)
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
echo "Rendering 479 frames at 3840x2160 (512 samples). Leave this window open; it prints a time estimate"
echo "after the first frames. Stopping is safe: run this again to continue."
"$BLENDER" -b -P "$(pwd)/build_home.py" -- --render --final --gpu --w 3840 --samples 512 --set 4k --zip "$@"

echo
echo "Done. Send this file back: $(pwd)/alaro-frames-4k.zip"
echo "(The full-quality PNG masters stay in $(pwd)/frames/4k/.)"
