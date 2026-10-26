import XCTest
@testable import FerniVoice

/// The sound director's rules (ios-motion-spec §7.1 #7).
final class EarconDirectorTests: XCTestCase {
    private func s(_ seconds: Int) -> Duration { .seconds(seconds) }

    func testTheFifthSoundInACallIsSuppressed() {
        var d = EarconDirector()
        let earcons: [Earcon] = [.arrival, .handoff(to: "maya"), .handoff(to: "alex"), .handoff(to: "peter"), .handoff(to: "jordan")]
        let played = earcons.enumerated().map { i, e in d.allow(e, now: s(i * 30), agentSpeaking: false, userSpeaking: false) }
        XCTAssertEqual(played, [true, true, true, true, false])
    }

    func testTwoWithin20SecondsPlayOnlyTheFirst() {
        var d = EarconDirector()
        XCTAssertTrue(d.allow(.arrival, now: s(0), agentSpeaking: false, userSpeaking: false))
        XCTAssertFalse(d.allow(.handoff(to: "maya"), now: s(10), agentSpeaking: false, userSpeaking: false))
        XCTAssertTrue(d.allow(.handoff(to: "maya"), now: s(21), agentSpeaking: false, userSpeaking: false))
    }

    func testNeverOverSomeoneTalking() {
        var d = EarconDirector()
        XCTAssertFalse(d.allow(.arrival, now: s(0), agentSpeaking: true, userSpeaking: false))
        XCTAssertFalse(d.allow(.arrival, now: s(0), agentSpeaking: false, userSpeaking: true))
        XCTAssertTrue(d.allow(.arrival, now: s(1), agentSpeaking: false, userSpeaking: false))
    }

    func testArrivalAndGoodbyeOncePerCallAndNoArrivalOnAQuickRejoin() {
        var d = EarconDirector()
        XCTAssertTrue(d.allow(.arrival, now: s(0), agentSpeaking: false, userSpeaking: false))
        XCTAssertFalse(d.allow(.arrival, now: s(30), agentSpeaking: false, userSpeaking: false))
        XCTAssertTrue(d.allow(.goodbye, now: s(60), agentSpeaking: false, userSpeaking: false))
        XCTAssertFalse(d.allow(.goodbye, now: s(90), agentSpeaking: false, userSpeaking: false))

        d.newCall()
        XCTAssertFalse(d.allow(.arrival, now: s(100), agentSpeaking: false, userSpeaking: false), "back within two minutes")
        d.newCall()
        XCTAssertTrue(d.allow(.arrival, now: s(200), agentSpeaking: false, userSpeaking: false))
    }

    func testFileNamesMatchTheBundledSounds() {
        XCTAssertEqual(Earcon.arrival.fileName, "arrival")
        XCTAssertEqual(Earcon.handoff(to: "maya").fileName, "handoff-to-maya")
        XCTAssertEqual(Earcon.goodbye.fileName, "goodbye")
    }
}
