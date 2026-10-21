import SwiftUI
import XCTest
@testable import FerniDesign

/// Critic M5: the screen intros' small Ferni rendered on the main actor and
/// kept blinking in the background.
final class QuietAvatarTests: XCTestCase {
    func testHeBlinksOnlyWhileTheAppIsInFront() {
        XCTAssertTrue(QuietAvatar.blinks(in: .active))
        XCTAssertFalse(QuietAvatar.blinks(in: .inactive), "the app switcher")
        XCTAssertFalse(QuietAvatar.blinks(in: .background))
    }

    /// The picture is drawn off the main thread (it asserts as much in Debug).
    func testAPictureIsDrawnOffTheMainThread() async throws {
        let u = await MainActor.run { () -> AliveUniforms in
            let rig = AliveRig(persona: .ferni, seed: 3)
            var u = rig.frame(at: 0.5)
            u.light(dark: false, roomTop: linear(hex: "#faf8f5"), roomBottom: linear(hex: "#efe9e0"))
            u.frame(size: SIMD2(96, 96), radius: 38)
            return u
        }
        let picture = await Task.detached { QuietAvatar.picture(u, width: 96, height: 96) }.value
        let image = try XCTUnwrap(picture)
        XCTAssertEqual(image.width, 96)
    }
}
