import FerniKit
import Foundation
import XCTest
@testable import FerniVoice

/// Opt-in, against production: a brand-new anonymous Firebase user gets a call
/// token from the real `/token`, exactly as a fresh install does. Skipped unless
/// FERNI_LIVE_TESTS=1 and FERNI_IT_FIREBASE_API_KEY (the iOS app's Firebase API
/// key, from App/GoogleService-Info.plist) are set; through xcodebuild, prefix
/// both with TEST_RUNNER_. Each run creates one anonymous user and dispatches an
/// agent to a room nobody joins.
final class LiveTokenTests: XCTestCase {
    private struct SignUp: Decodable { let idToken: String }

    func testAnonymousFreshInstallGetsACallToken() async throws {
        let env = ProcessInfo.processInfo.environment
        guard env["FERNI_LIVE_TESTS"] == "1", let key = env["FERNI_IT_FIREBASE_API_KEY"] else {
            throw XCTSkip("live test: set FERNI_LIVE_TESTS=1 and FERNI_IT_FIREBASE_API_KEY")
        }
        var signUp = URLRequest(url: URL(string: "https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=\(key)")!)
        signUp.httpMethod = "POST"
        signUp.setValue("application/json", forHTTPHeaderField: "Content-Type")
        // The key only answers the app's bundle id.
        signUp.setValue("com.sethdford.ferni", forHTTPHeaderField: "X-Ios-Bundle-Identifier")
        signUp.httpBody = Data(#"{"returnSecureToken":true}"#.utf8)
        let (body, response) = try await URLSession.shared.data(for: signUp)
        XCTAssertEqual((response as? HTTPURLResponse)?.statusCode, 200, String(decoding: body, as: UTF8.self))
        let idToken = try JSONDecoder().decode(SignUp.self, from: body).idToken

        let api = FerniAPI(baseURL: FerniConfig.production.apiBaseURL, idToken: { _ in idToken })
        let token = try await CallTokens.fetcher(api: api)("ferni")

        XCTAssertFalse(token.token.isEmpty)
        XCTAssertTrue(token.url.hasPrefix("wss://"), token.url)
        XCTAssertTrue(token.room.hasPrefix("ios-"), token.room)
        XCTAssertEqual(token.agentDispatched, true, "the server should dispatch Ferni")
    }
}
