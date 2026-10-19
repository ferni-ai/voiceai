import Foundation
#if canImport(Sentry)
import Sentry
#endif

/// What crash reports may carry, as plain rules (tested without the SDK).
///
/// Nothing that identifies or quotes the person: no user, no screenshots, no
/// view hierarchy (it holds caption and memory text), no session replay, and
/// breadcrumbs keep only their kind, never words or URLs.
enum CrashPolicy {
    /// The DSN from Info.plist (`SentryDSN`, set from the uncommitted
    /// xcconfig), or nil, which keeps crash reporting off.
    static func dsn(from info: [String: Any]?) -> String? {
        guard let raw = (info?["SentryDSN"] as? String)?.trimmingCharacters(in: .whitespaces),
              raw.hasPrefix("https://"), let url = URL(string: raw), url.host() != nil,
              url.user() != nil // the public key
        else { return nil }
        return raw
    }

    /// Breadcrumb data kept: what kind of thing happened, never its content.
    static let keptBreadcrumbKeys: Set<String> = ["method", "status_code", "reason", "state"]

    static func breadcrumbData(_ data: [String: Any]?) -> [String: Any]? {
        guard let data else { return nil }
        let kept = data.filter { keptBreadcrumbKeys.contains($0.key) }
        return kept.isEmpty ? nil : kept
    }
}

/// Crash reporting, off unless this build carries a DSN.
enum CrashReporting {
    /// Whether the SDK is compiled into this build at all.
    static var isLinked: Bool {
        #if canImport(Sentry)
        true
        #else
        false
        #endif
    }

    /// Whether the SDK is running (it never is without a DSN).
    @MainActor static var isRunning: Bool {
        #if canImport(Sentry)
        SentrySDK.isEnabled
        #else
        false
        #endif
    }

    static func start(info: [String: Any]? = Bundle.main.infoDictionary) {
        guard let dsn = CrashPolicy.dsn(from: info) else { return }
        #if canImport(Sentry)
        SentrySDK.start { options in
            options.dsn = dsn
            options.sendDefaultPii = false
            options.attachScreenshot = false
            options.attachViewHierarchy = false
            options.sessionReplay.sessionSampleRate = 0
            options.sessionReplay.onErrorSampleRate = 0
            options.tracesSampleRate = 0
            options.enableUserInteractionTracing = false
            options.enableCaptureFailedRequests = false
            options.beforeBreadcrumb = { crumb in
                crumb.message = nil
                crumb.data = CrashPolicy.breadcrumbData(crumb.data)
                return crumb
            }
            options.beforeSend = { event in
                event.user = nil
                event.request = nil
                event.serverName = nil
                return event
            }
        }
        #else
        _ = dsn // the SDK isn't linked into this build
        #endif
    }
}
