import Foundation

/// Where the app talks to, read once from the app's Info.plist.
///
/// `FerniAPIBaseURL` comes from the `FERNI_API_BASE_URL` build setting
/// (project.yml). It is the same origin the web app uses in production
/// (https://app.ferni.ai serves both the web app and its JSON API), so the
/// phone and the browser hit the same `/token` and `/api/...` routes.
public struct FerniConfig: Sendable, Equatable {
    public let apiBaseURL: URL

    public static let production = FerniConfig(apiBaseURL: URL(string: "https://app.ferni.ai")!)

    public init(apiBaseURL: URL) {
        self.apiBaseURL = apiBaseURL
    }

    /// The app's configuration; production when the key is absent or not an https URL.
    public static func fromBundle(_ info: [String: Any]? = Bundle.main.infoDictionary) -> FerniConfig {
        guard let raw = info?["FerniAPIBaseURL"] as? String,
              let url = URL(string: raw), url.scheme == "https", url.host != nil
        else { return .production }
        return FerniConfig(apiBaseURL: url)
    }
}
