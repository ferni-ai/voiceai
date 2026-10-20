import Foundation
import XCTest
@testable import FerniKit

@MainActor
final class MinimumBuildTests: XCTestCase {
    private func check(answer status: Int, body: String, build: Int?) async -> MinimumBuild {
        let api = FerniAPI(baseURL: URL(string: "https://app.example.test")!, idToken: { _ in "t" }) { request in
            XCTAssertEqual(request.url?.path, "/api/app-config/ios")
            return (Data(body.utf8), HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: nil, headerFields: nil)!)
        }
        let gate = MinimumBuild(api: api, currentBuild: build)
        await gate.check()
        return gate
    }

    func testAnOlderBuildThanTheMinimumMustUpdate() async {
        let gate = await check(answer: 200, body: #"{"minimumBuild":12,"message":"This version is out of date."}"#, build: 9)
        XCTAssertTrue(gate.updateRequired)
        XCTAssertEqual(gate.message, "This version is out of date.")
    }

    func testTheMinimumItselfAndNewerAreFine() async {
        let same = await check(answer: 200, body: #"{"minimumBuild":12}"#, build: 12)
        let newer = await check(answer: 200, body: #"{"minimumBuild":12}"#, build: 13)
        XCTAssertFalse(same.updateRequired)
        XCTAssertFalse(newer.updateRequired)
    }

    /// No route (today), an error, nonsense or an unknown build never blocks anyone.
    func testNothingButAnExplicitMinimumBlocks() async {
        for (status, body, build) in [(404, "", 1), (500, "", 1), (200, "nonsense", 1), (200, "{}", 1), (200, #"{"minimumBuild":12}"#, nil)] as [(Int, String, Int?)] {
            let gate = await check(answer: status, body: body, build: build)
            XCTAssertFalse(gate.updateRequired, "\(status) \(body) \(String(describing: build))")
        }
    }

    /// Critic H3: the server can show or hide phone sign-in; silent, the app decides.
    func testThePhoneSignInFlagIsReadWhenSent() async {
        let on = await check(answer: 200, body: #"{"minimumBuild":null,"message":null,"phoneSignIn":true}"#, build: 1)
        let off = await check(answer: 200, body: #"{"phoneSignIn":false}"#, build: 1)
        let silent = await check(answer: 200, body: #"{"minimumBuild":null,"message":null}"#, build: 1)
        let down = await check(answer: 404, body: "", build: 1)
        XCTAssertEqual(on.phoneSignIn, true)
        XCTAssertEqual(off.phoneSignIn, false)
        XCTAssertNil(silent.phoneSignIn)
        XCTAssertNil(down.phoneSignIn)
    }
}
