import XCTest
@testable import Ferni

/// The Lock Screen's buttons reach the call (gap 6): End and Mute run in the
/// app through the handlers it installs at launch.
@MainActor
final class CallIntentTests: XCTestCase {
    func testMuteFromTheLockScreenReachesTheCall() async throws {
        var mutes = 0
        let before = MuteCallIntent.mute
        defer { MuteCallIntent.mute = before }
        MuteCallIntent.mute = { mutes += 1 }
        _ = try await MuteCallIntent().perform()
        XCTAssertEqual(mutes, 1)
    }

    func testTheAppInstallsBothHandlers() {
        XCTAssertNotNil(EndCallIntent.end, "End always reaches the call")
        XCTAssertNotNil(MuteCallIntent.mute)
    }
}
