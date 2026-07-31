#!/usr/bin/env bash
set -euo pipefail

OLD_DATE="Last updated July 15, 2026"
NEW_DATE="Last updated $(date '+%B %-d, %Y')"

git grep -lzF "$OLD_DATE" |
while IFS= read -r -d '' file; do
    sed -i "s|$OLD_DATE|$NEW_DATE|g" "$file"
    echo "Updated $file"
done
