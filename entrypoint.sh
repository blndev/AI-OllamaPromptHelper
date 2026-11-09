#!/bin/sh
# Seed a freshly (bind-)mounted, empty /app/presets with the bundled example
# presets from the image, so mounting an empty host folder over /app/presets
# doesn't leave the app without any presets on first run. Never overwrites
# files that already exist (e.g. user-edited or previously seeded presets).
set -e

if [ -d /app/presets_defaults ] && [ -z "$(ls -A /app/presets 2>/dev/null)" ]; then
    cp -n /app/presets_defaults/*.json /app/presets/ 2>/dev/null || true
fi

exec "$@"
