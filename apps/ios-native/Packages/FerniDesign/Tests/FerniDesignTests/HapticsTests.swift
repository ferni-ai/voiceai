import CoreHaptics
import XCTest
@testable import FerniDesign

/// The haptic patterns match the web's (ios-motion-spec §6.7) and build.
final class HapticsTests: XCTestCase {
    func testEveryCueBuildsAValidPattern() throws {
        for cue in HapticCue.allCases {
            let events = CoreHapticsPlayer.events(for: cue)
            XCTAssertFalse(events.isEmpty, "\(cue)")
            XCTAssertNoThrow(try CHHapticPattern(events: events, parameters: []), "\(cue)")
            XCTAssertLessThanOrEqual(events.map { $0.relativeTime + $0.duration }.max() ?? 0, 0.75, "\(cue) stays short")
        }
    }

    func testPresenceIsFourSoftTaps() {
        let shape = CoreHapticsPlayer.shape(of: .presence)
        XCTAssertEqual(shape.map(\.time), [0, 0.3, 0.5, 0.7])
        XCTAssertEqual(shape.map(\.intensity), [0.5, 0.4, 0.5, 0.4])
    }

    func testFirstWordsIsOneLightTap() {
        XCTAssertEqual(CoreHapticsPlayer.shape(of: .firstWord).count, 1)
        XCTAssertEqual(CoreHapticsPlayer.shape(of: .firstWord).first?.intensity, 0.35)
    }
}
