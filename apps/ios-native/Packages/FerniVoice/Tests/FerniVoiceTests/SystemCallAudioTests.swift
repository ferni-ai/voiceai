import LiveKit
import XCTest
@testable import FerniVoice

/// The real adapter against LiveKit's real audio manager: under the system's
/// call service the engine stays off until the system hands over the session
/// (LiveKit 2.12.1 README, "Integration with CallKit").
final class SystemCallAudioTests: XCTestCase {
    private var engine: (input: Bool, output: Bool) {
        let availability = AudioManager.shared.engineAvailability
        return (availability.isInputAvailable, availability.isOutputAvailable)
    }

    override func tearDown() {
        try? AudioManager.shared.setEngineAvailability(.default)
        super.tearDown()
    }

    func testTheEngineWaitsForTheSystemToActivateTheSession() {
        let audio = SystemCallAudio(systemManagesCalls: true)
        XCTAssertTrue(engine == (false, false), "off before any call")
        audio.systemAudio(active: true)
        XCTAssertTrue(engine == (true, true), "on once the system activates")
        audio.systemAudio(active: false)
        XCTAssertTrue(engine == (false, false), "off when the system takes it back")
        audio.systemAudio(active: true)
        audio.deactivate(systemOwned: true)
        XCTAssertTrue(engine == (false, false), "off again, ready for the next call")
    }

    func testWithoutTheSystemTheEngineIsLeftAlone() {
        try? AudioManager.shared.setEngineAvailability(.default)
        withExtendedLifetime(SystemCallAudio(systemManagesCalls: false)) {
            XCTAssertTrue(engine == (true, true))
        }
    }
}
