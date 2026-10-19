import XCTest
@testable import Ferni

/// Crash reporting is off unless a build carries a real DSN, and what it may
/// send never carries the person's words or identity.
final class CrashPolicyTests: XCTestCase {
    func testOnlyARealDSNTurnsCrashReportingOn() {
        let valid = "https://abc123@o1.ingest.sentry.io/42"
        XCTAssertEqual(CrashPolicy.dsn(from: ["SentryDSN": valid]), valid)
        for off: Any? in [nil, "", "   ", "$(SENTRY_DSN)", "http://abc@o1.ingest.sentry.io/42",
                          "https://o1.ingest.sentry.io/42", "https:/", 42] {
            XCTAssertNil(CrashPolicy.dsn(from: off.map { ["SentryDSN": $0] } ?? [:]), "\(String(describing: off))")
        }
        XCTAssertNil(CrashPolicy.dsn(from: nil))
    }

    /// The committed configuration ships with crash reporting off.
    func testThisBuildHasNoDSN() {
        XCTAssertNotNil(Bundle.main.infoDictionary?["SentryDSN"], "the key is wired through Info.plist")
        XCTAssertNil(CrashPolicy.dsn(from: Bundle.main.infoDictionary))
    }

    func testBreadcrumbsKeepTheKindOfThingNeverItsContent() {
        let kept = CrashPolicy.breadcrumbData([
            "method": "POST", "status_code": 503, "url": "https://app.ferni.ai/api/memories?q=ana",
            "body": "I told Ferni about Ana", "message": "Ferni's listening", "reason": "interrupted",
        ])
        XCTAssertEqual(Set(kept?.keys ?? [:].keys), ["method", "status_code", "reason"])
        XCTAssertNil(CrashPolicy.breadcrumbData(["url": "https://x", "body": "words"]))
        XCTAssertNil(CrashPolicy.breadcrumbData(nil))
    }
}
