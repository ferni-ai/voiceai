import XCTest
@testable import FerniVoice

/// The local duck's decisions against a fake clock, frame by frame (10 ms,
/// LiveKit's buffer size): when Ferni ducks, when it doesn't, and when the
/// volume comes back.
final class LocalDuckControllerTests: XCTestCase {
    private let quiet: Float = -70
    private let voice: Float = -20
    private let t0 = ContinuousClock.now
    private var duck = LocalDuckController()
    /// Every action so far, with the millisecond it happened at.
    private var heard: [(ms: Int, action: LocalDuckController.Action)] = []

    private func at(_ ms: Int) -> ContinuousClock.Instant { t0 + .milliseconds(ms) }

    /// The mic at `level` for each 10 ms frame from `from` through `to`.
    private func mic(_ level: Float, from: Int, to: Int) {
        for ms in stride(from: from, through: to, by: 10) {
            heard += duck.level(level, at: at(ms)).map { (ms, $0) }
        }
    }

    private func ferni(speaking: Bool, at ms: Int) {
        heard += duck.agentSpeaking(speaking, at: at(ms)).map { (ms, $0) }
    }

    private var actions: [LocalDuckController.Action] { heard.map(\.action) }
    private var interruptCount: Int { actions.filter { $0 == .sendInterrupt }.count }

    /// Ferni speaking since 0 in a quiet room, past the echo settle.
    private func ferniTalkingInAQuietRoom() {
        ferni(speaking: true, at: 0)
        mic(quiet, from: 0, to: 400)
    }

    func testAVoiceHeld150msDucksAtOnceAndInterruptsOnce() {
        ferniTalkingInAQuietRoom()
        mic(voice, from: 410, to: 800)

        XCTAssertEqual(actions, [.duck(db: -18), .sendInterrupt])
        XCTAssertEqual(heard.first?.ms, 560, "150 ms after the voice began, not before")
    }

    func testA120msBurstDoesNothing() {
        ferniTalkingInAQuietRoom()
        mic(voice, from: 410, to: 530) // a cough
        mic(quiet, from: 540, to: 1500)

        XCTAssertTrue(heard.isEmpty)
    }

    func testWithoutAConfirmTheVolumeComesBackThenRearms() {
        ferniTalkingInAQuietRoom()
        mic(voice, from: 410, to: 700)
        mic(quiet, from: 710, to: 1300) // Ferni kept talking

        XCTAssertEqual(actions, [.duck(db: -18), .sendInterrupt, .restore(over: .milliseconds(120))])
        XCTAssertEqual(heard.last?.ms, 1160, "600 ms after the duck")

        // Re-armed: the next real onset ducks again.
        mic(voice, from: 1310, to: 1600)
        XCTAssertEqual(interruptCount, 2)
        XCTAssertEqual(heard.last?.ms, 1460)
    }

    func testAVoiceThatNeverStopsDucksOnlyOnce() {
        ferniTalkingInAQuietRoom()
        mic(voice, from: 410, to: 2500) // the server chose not to stop Ferni

        XCTAssertEqual(actions, [.duck(db: -18), .sendInterrupt, .restore(over: .milliseconds(120))],
                       "restored, then waits for the voice to drop before ducking again")
    }

    func testAConfirmKeepsFerniDownWithNoSecondInterrupt() {
        ferniTalkingInAQuietRoom()
        mic(voice, from: 410, to: 600)
        ferni(speaking: false, at: 610) // the server stopped Ferni
        mic(voice, from: 620, to: 2500)

        XCTAssertEqual(actions, [.duck(db: -18), .sendInterrupt], "no restore, no second interrupt")

        // Ferni's next turn starts at full volume.
        ferni(speaking: true, at: 3000)
        XCTAssertEqual(actions.last, .restore(over: .zero))
    }

    func testNothingWhileFerniIsNotSpeaking() {
        mic(quiet, from: 0, to: 400)
        mic(voice, from: 410, to: 2000)
        ferni(speaking: false, at: 2010)

        XCTAssertTrue(heard.isEmpty)
    }

    func testNothingWhileTheEchoSettles() {
        mic(quiet, from: 0, to: 490)
        ferni(speaking: true, at: 500)
        mic(voice, from: 500, to: 790) // Ferni's own first syllables leaking through

        XCTAssertTrue(heard.isEmpty)

        // The onset counts from the end of the settle, not from Ferni's start.
        mic(voice, from: 800, to: 1100)
        XCTAssertEqual(heard.first?.ms, 950)
    }

    func testTheNoiseFloorFollowsTheRoom() {
        ferni(speaking: true, at: 0)
        mic(-40, from: 0, to: 400) // a loud room: a fan, a car
        mic(-32, from: 410, to: 800) // louder, but not 12 dB over the room

        XCTAssertTrue(heard.isEmpty)
    }

    // MARK: - The flag

    func testTheFlagIsOnOnlyWhenTheBuildSaysYes() {
        XCTAssertFalse(LocalDuckFlag.isOn(nil))
        XCTAssertFalse(LocalDuckFlag.isOn([:]))
        XCTAssertFalse(LocalDuckFlag.isOn([LocalDuckFlag.infoKey: "NO"]))
        XCTAssertFalse(LocalDuckFlag.isOn([LocalDuckFlag.infoKey: "$(IOS_LOCAL_DUCK)"]), "an unset build setting")
        XCTAssertTrue(LocalDuckFlag.isOn([LocalDuckFlag.infoKey: "YES"]))
        XCTAssertTrue(LocalDuckFlag.isOn([LocalDuckFlag.infoKey: true]))
    }

    func testTheShippedAppHasItOff() throws {
        // The app target's Info.plist value comes from project.yml (IOS_LOCAL_DUCK: "NO").
        let project = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().appendingPathComponent("../../../../project.yml")
        let yml = try String(contentsOf: project, encoding: .utf8)
        XCTAssertTrue(yml.contains("IOS_LOCAL_DUCK: \"NO\""))
        XCTAssertTrue(yml.contains("FerniLocalDuck: $(IOS_LOCAL_DUCK)"))
    }
}
