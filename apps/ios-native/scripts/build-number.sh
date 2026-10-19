#!/bin/bash
# A unique, increasing build number for every archive, local or CI: the UTC
# hour as yyyymmddHH (fits a 32-bit integer until 2147) and the minute, so
# two archives in one hour still differ. App Store Connect takes up to three
# period-separated integers; the minute has no leading zero.
# Pass it to every archive: CURRENT_PROJECT_VERSION=$(scripts/build-number.sh)
# (all targets read CURRENT_PROJECT_VERSION, so they're stamped alike).
set -euo pipefail
echo "$(date -u +%Y%m%d%H).$((10#$(date -u +%M)))"
