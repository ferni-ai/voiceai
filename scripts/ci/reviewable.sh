# shellcheck shell=bash
# What counts toward a PR's size: lines a reviewer has to read. Shared by the
# PR Flow check (CI) and the pre-push hook so both give the same number.

# Paths that don't count: tests, fixtures, snapshots, lockfiles, generated files, media.
NOT_REVIEWED='(__tests__/|\.test\.|\.spec\.|/fixtures/|__screenshots__/|__snapshots__/|\.snap$|pnpm-lock\.yaml$|package-lock\.json$|\.generated\.|\.(png|jpg|jpeg|gif|webp|svg|mp3|wav)$)'
SIZE_WARN="${SIZE_WARN:-400}"
SIZE_FAIL="${SIZE_FAIL:-1000}"

# stdin: "<path>\t<changed lines>" per file (deleted files already 0); stdout: total.
reviewable_lines() {
  awk -F'\t' -v skip="$NOT_REVIEWED" '$1 !~ skip { n += $2 } END { print n + 0 }'
}
