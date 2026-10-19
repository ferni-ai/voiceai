import SwiftUI
import XCTest
@testable import Ferni

/// Critic M5: one haptic per event. The controls tap once when a call
/// starts; hanging up and failing are the avatar's haptics, not a second one.
final class CallHapticTests: XCTestCase {
    func testOnlyStartingACallTaps() {
        XCTAssertNotNil(CallControls.startHaptic(from: false, to: true))
        XCTAssertNil(CallControls.startHaptic(from: true, to: false), "ending: the avatar's goodbye haptic only")
        XCTAssertNil(CallControls.startHaptic(from: true, to: true))
    }
}
