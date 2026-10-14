#!/bin/sh
set -eu

PROJECT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
STAGING_DIR=$(mktemp -d "$PROJECT_DIR/.dist-staging.XXXXXX")
OUTPUT_DIR="$PROJECT_DIR/dist"

cleanup() {
  rm -rf "$STAGING_DIR"
}
trap cleanup EXIT INT TERM

for file in index.html styles.css app.js agent-demo.js server-api.js demo.html demo.css demo.js books.json manifest.webmanifest sw.js; do
  cp "$PROJECT_DIR/$file" "$STAGING_DIR/$file"
done

mkdir -p "$STAGING_DIR/assets" "$STAGING_DIR/.openai"
cp "$PROJECT_DIR/assets/school-logo.png" "$STAGING_DIR/assets/school-logo.png"
cp -R "$PROJECT_DIR/assets/web" "$STAGING_DIR/assets/web"
cp -R "$PROJECT_DIR/bookstore" "$STAGING_DIR/bookstore"
cp "$PROJECT_DIR/.openai/hosting.json" "$STAGING_DIR/.openai/hosting.json"

rm -rf "$OUTPUT_DIR"
mv "$STAGING_DIR" "$OUTPUT_DIR"
trap - EXIT INT TERM

printf 'Static site ready: %s\n' "$OUTPUT_DIR"
