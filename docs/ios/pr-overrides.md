# iPhone app PRs over the 400-line review cap

The PR size gate (`~/.claude/hooks/pdlc/pr_size_gate.py`) counts added plus
deleted lines, leaving out tests, lockfiles and generated files. Four commits
in the iPhone rebuild chain are over 400 lines. The overrides below were
approved by the lead on 2026-10-19. Use each reason verbatim as
`PDLC_LARGE_PR="<reason>" gh pr create ...`, and say the same in the PR body.

| Commit | Change | Added | Deleted | Reason (verbatim) |
|---|---|---|---|---|
| `1cdaf4710` | Swift 6 app shell on local packages | 525 | 876 | `+525 is the minimal building shell; -876 is docs/config rewrites` |
| `5066c222f` | Remove the old iPhone app | 0 | 12,886 | `pure deletion of the unbuilt old app` |
| `5c817d152` | One Canvas avatar on one clock | 363 | 761 | `+363 added; -678 is deleting the replaced FerniWindowAvatar` |
| `59865de19` | The call happens in the same room | 312 | 161 | `+312 added; restyle replaces old views` |

## The shell PR: what a reviewer can skip

The shell's override holds only if its PR body lists the rewritten docs and
config, so a reviewer can skip them. Paste this list into that PR body:

- `apps/ios-native/README.md`: -282 / +3, the old app's README replaced by a pointer
- `apps/ios-native/project.yml`: -280 / +48, the old targets removed and the new shell's added
- `apps/ios-native/CLAUDE.md`: -104 / +33, the old app's notes replaced
- `apps/ios-native/Packages/FerniKit/Sources/FerniKit/Team/TeamUnlock.swift`: -101 / +20, moved from
  `Sources/Services/TeamUnlockService.swift` and trimmed to the unlock rules
- `apps/ios-native/Ferni.xcodeproj/xcshareddata/xcschemes/Ferni.xcscheme`: -48 / +32, renamed from the old scheme

The 525 added lines are the code to review: `App/` (FerniApp, HomeView,
SettingsView, Info.plist), the FerniKit and FerniVoice package manifests,
`Persona.swift` and `FerniConfig.swift`, and the CI and CLI build changes.
