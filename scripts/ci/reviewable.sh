# shellcheck shell=bash
# What counts toward a PR's size: lines a reviewer has to read. Shared by the
# PR Flow check (CI) and the pre-push hook so both give the same number.

# Paths that don't count: tests, fixtures, snapshots, lockfiles, generated files, media.
# Lockfiles include pinned pip requirements (any requirements*.txt); the hand-written
# requirements.in they're compiled from still counts.
NOT_REVIEWED='(__tests__/|\.test\.|\.spec\.|/fixtures/|__screenshots__/|__snapshots__/|\.snap$|pnpm-lock\.yaml$|package-lock\.json$|(^|/)requirements[^/]*\.txt$|\.generated\.|\.(png|jpg|jpeg|gif|webp|svg|mp3|wav)$)'
SIZE_WARN="${SIZE_WARN:-400}"
SIZE_FAIL="${SIZE_FAIL:-1000}"

# stdin: "<path>\t<changed lines>" per file (deleted files already 0); stdout: total.
# The pattern reaches awk through ENVIRON, not `awk -v`: -v runs escape processing on
# its value, so BSD awk and gawk turn `\.` into `.` and every dot matches any character.
reviewable_lines() {
  skip="$NOT_REVIEWED" awk -F'\t' '$1 !~ ENVIRON["skip"] { n += $2 } END { print n + 0 }'
}
