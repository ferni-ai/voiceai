import AVFAudio
import FerniDesign
import XCTest
@testable import Ferni

/// Parity item 8: two quiet sounds at rest (the prototype's synthesised
/// poke and huh), only with Sounds on, without Reduce Motion, never in a call.
@MainActor
final class FoleyTests: XCTestCase {
    func testTwoSoundsAndWhatMakesThem() {
        XCTAssertEqual(CallFeedback.foley(for: .touch), .poke)
        XCTAssertEqual(CallFeedback.foley(for: .notice), .huh)
        XCTAssertEqual(CallFeedback.foley(for: .startle), .huh)
        for cue in [KeyedCue.arrivalChime, .pop, .sparkle, .land, .hop, .whoosh, .giggle, .heart] {
            XCTAssertNil(CallFeedback.foley(for: cue), "\(cue) stays silent")
        }
        XCTAssertEqual(Foley.allCases.count, 2)
    }

    func testTheGates() {
        XCTAssertTrue(CallFeedback.foleyPlays(soundsOn: true, reduceMotion: false, atRest: true, sinceLast: nil))
        XCTAssertFalse(CallFeedback.foleyPlays(soundsOn: false, reduceMotion: false, atRest: true, sinceLast: nil), "Sounds off")
        XCTAssertFalse(CallFeedback.foleyPlays(soundsOn: true, reduceMotion: true, atRest: true, sinceLast: nil), "Reduce Motion")
        XCTAssertFalse(CallFeedback.foleyPlays(soundsOn: true, reduceMotion: false, atRest: false, sinceLast: nil), "in a call")
        XCTAssertFalse(CallFeedback.foleyPlays(soundsOn: true, reduceMotion: false, atRest: true, sinceLast: .milliseconds(300)))
        XCTAssertTrue(CallFeedback.foleyPlays(soundsOn: true, reduceMotion: false, atRest: true, sinceLast: .milliseconds(600)))
    }

    /// Quiet (the prototype's gains: peak under 0.16 of full scale), short,
    /// and starting and ending in silence (no click).
    func testTheyAreQuietShortAndClickFree() {
        for (foley, length) in [(Foley.poke, 0.32), (.huh, 0.18)] {
            let s = foley.samples
            XCTAssertEqual(Double(s.count) / Foley.sampleRate, length, accuracy: 0.01, "\(foley)")
            let peak = s.map(abs).max() ?? 0
            XCTAssertGreaterThan(peak, 0.03, "\(foley) is heard")
            XCTAssertLessThan(peak, 0.16, "\(foley) stays quiet")
            XCTAssertLessThan(abs(s.first ?? 1), 0.001)
            XCTAssertLessThan(s.suffix(20).map(abs).max() ?? 1, 0.002)
        }
    }

    /// The poke's pitch falls (a boop); the huh's rises (a question).
    func testThePokeFallsAndTheHuhRises() {
        func pitch(_ s: ArraySlice<Float>) -> Double {
            let crossings = zip(s, s.dropFirst()).filter { $0 < 0 && $1 >= 0 }.count
            return Double(crossings) / (Double(s.count) / Foley.sampleRate)
        }
        let poke = Foley.poke.samples, huh = Foley.huh.samples
        XCTAssertGreaterThan(pitch(poke[500..<4000]), pitch(poke[9000..<12500]) * 1.3)
        XCTAssertLessThan(pitch(huh[300..<2500]) * 1.2, pitch(huh[5000..<7500]))
    }

    func testTheWavePlays() throws {
        for foley in Foley.allCases {
            let player = try AVAudioPlayer(data: foley.wav)
            XCTAssertEqual(player.duration, Double(foley.samples.count) / Foley.sampleRate, accuracy: 0.01)
        }
    }

    /// CallFeedback sends a cue's foley through the gates to the player.
    func testTheFeedbackPlaysThroughTheGates() async {
        let key = CallFeedback.soundsKey, saved = UserDefaults.standard.object(forKey: key)
        defer { UserDefaults.standard.set(saved, forKey: key) }
        UserDefaults.standard.set(true, forKey: key)
        let feedback = CallFeedback()
        var heard: [Foley] = []
        feedback.playFoley = { heard.append($0) }
        feedback.reduceMotion = { false }
        feedback.isAtRest = { true }
        feedback.play(.touch)
        feedback.play(.notice) // within half a second
        feedback.play(.whoosh)
        XCTAssertEqual(heard, [.poke])
        try? await Task.sleep(for: .milliseconds(600))
        feedback.play(.startle)
        XCTAssertEqual(heard, [.poke, .huh])

        try? await Task.sleep(for: .milliseconds(600))
        feedback.isAtRest = { false }
        feedback.play(.touch)
        feedback.isAtRest = { true }
        feedback.reduceMotion = { true }
        feedback.play(.touch)
        feedback.reduceMotion = { false }
        UserDefaults.standard.set(false, forKey: key)
        feedback.play(.touch)
        XCTAssertEqual(heard, [.poke, .huh], "not in a call, under Reduce Motion, or with Sounds off")
    }
}
