import FerniKit
import XCTest
@testable import Ferni

/// Blocker (2): the web's Apple Health button sends iPhone users to
/// ferniapp://healthkit/authorize. The new app has no Health integration, so
/// the link opens Ferni with a calm note instead of Safari's "invalid
/// address", and no link ever starts anything.
@MainActor
final class DeepLinkTests: XCTestCase {
    func testTheWebsHealthLinkIsRecognised() {
        XCTAssertEqual(DeepLink.parse(URL(string: "ferniapp://healthkit/authorize")!), .healthNotYet)
        XCTAssertEqual(DeepLink.parse(URL(string: "ferniapp://healthkit/authorize?state=abc")!), .healthNotYet)
    }

    func testAnythingElseOnlyOpensTheApp() {
        for link in ["ferniapp://", "ferniapp://talk", "ferniapp://healthkit", "https://ferni.ai/healthkit/authorize", "other://healthkit/authorize"] {
            XCTAssertNil(DeepLink.parse(URL(string: link)!), link)
        }
    }

    func testOpeningItShowsANoteAndStartsNothing() {
        let model = AppModel(config: .production, firebaseReady: false)
        model.consent.use(uid: nil)
        model.open(URL(string: "ferniapp://healthkit/authorize")!)
        XCTAssertEqual(model.notice, "Health sharing isn't in the iPhone app yet.")
        XCTAssertFalse(model.call.isActive)
        XCTAssertFalse(model.isAskingConsent)
        model.notice = nil
        model.open(URL(string: "ferniapp://talk")!)
        XCTAssertNil(model.notice)
        XCTAssertFalse(model.call.isActive, "no link starts a call")
    }

    /// ferniapp, plus sign-in's two return trips, both read from the Firebase
    /// config the app ships (so the two can't drift apart), and nothing else.
    func testTheAppAnswersFerniappLinksAndSignInReturns() throws {
        let types = Bundle.main.object(forInfoDictionaryKey: "CFBundleURLTypes") as? [[String: Any]] ?? []
        let schemes = types.flatMap { $0["CFBundleURLSchemes"] as? [String] ?? [] }
        let path = try XCTUnwrap(Bundle.main.path(forResource: "GoogleService-Info", ofType: "plist"))
        let firebase = try XCTUnwrap(NSDictionary(contentsOfFile: path) as? [String: Any])
        let reversedClientID = try XCTUnwrap(firebase["REVERSED_CLIENT_ID"] as? String)
        let appID = try XCTUnwrap(firebase["GOOGLE_APP_ID"] as? String)
        XCTAssertEqual(schemes, ["ferniapp", reversedClientID, "app-" + appID.replacingOccurrences(of: ":", with: "-")])
        XCTAssertEqual(Bundle.main.object(forInfoDictionaryKey: "GIDClientID") as? String, firebase["CLIENT_ID"] as? String)
    }
}
