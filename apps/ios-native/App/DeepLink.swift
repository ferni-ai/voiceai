import Foundation

/// Links into the app (`ferniapp://`). Only one exists: the web's Apple
/// Health button sends iPhone users to `ferniapp://healthkit/authorize`
/// (apps/web/src/ui/apple-health-connect.ts). The iPhone app has no Health
/// integration, so that link opens it with a short note. Any other link only
/// opens the app; no link ever starts a call or changes anything.
enum DeepLink: Equatable {
    case healthNotYet

    static func parse(_ url: URL) -> DeepLink? {
        guard url.scheme == "ferniapp", url.host == "healthkit", url.path == "/authorize" else { return nil }
        return .healthNotYet
    }
}
