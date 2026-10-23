import XCTest
@testable import FerniDesign

/// Blinks come at changes of thought: as a turn changes hands and as one of
/// Ferni's phrases ends, with a slow random floor (avatar red team
/// 2026-10-22). They came every 3-7 s at random.
@MainActor
final class BlinkTimingTests: XCTestCase {
    // MARK: The policy

    func testACueOrTheFloorStartsABlink() {
        XCTAssertTrue(BlinkTiming.due(now: 10, lastBlink: 5, cue: 9.9, floorAt: 20), "a cue come due")
        XCTAssertFalse(BlinkTiming.due(now: 10, lastBlink: 5, cue: 10.1, floorAt: 20), "a cue not due yet")
        XCTAssertTrue(BlinkTiming.due(now: 10, lastBlink: 5, cue: nil, floorAt: 10), "the floor")
        XCTAssertFalse(BlinkTiming.due(now: 10, lastBlink: 5, cue: nil, floorAt: 11))
    }

    func testNeverTwoBlinksAtOnce() {
        XCTAssertFalse(BlinkTiming.due(now: 10, lastBlink: 9.5, cue: 9.9, floorAt: 9), "within the gap")
        XCTAssertTrue(BlinkTiming.due(now: 10.3, lastBlink: 9.5, cue: 9.9, floorAt: 20), "the cue waits for it")
    }

    func testTurnChangesAreBetweenListeningThinkingAndSpeaking() {
        XCTAssertTrue(BlinkTiming.isTurnChange(from: .listening, to: .speaking))
        XCTAssertTrue(BlinkTiming.isTurnChange(from: .speaking, to: .listening))
        XCTAssertTrue(BlinkTiming.isTurnChange(from: .listening, to: .thinking))
        XCTAssertFalse(BlinkTiming.isTurnChange(from: .listening, to: .listening))
        XCTAssertFalse(BlinkTiming.isTurnChange(from: .idle, to: .listening), "arriving isn't a turn")
        XCTAssertFalse(BlinkTiming.isTurnChange(from: .arriving, to: .listening))
        XCTAssertFalse(BlinkTiming.isTurnChange(from: .speaking, to: .idle))
    }

    func testAPhraseEndsWhenHisVoiceGoesQuiet() {
        let on = BlinkTiming.phrase(env: 0.6, voicedSince: nil, now: 1)
        XCTAssertEqual(on.voicedSince, 1)
        XCTAssertFalse(on.ended)
        XCTAssertEqual(BlinkTiming.phrase(env: 0.6, voicedSince: 1, now: 1.4).voicedSince, 1, "still voiced")
        XCTAssertEqual(BlinkTiming.phrase(env: 0.2, voicedSince: 1, now: 1.5).voicedSince, 1, "between: undecided")
        XCTAssertTrue(BlinkTiming.phrase(env: 0.05, voicedSince: 1, now: 1.7).ended, "quiet after 0.7 s of voice")
        XCTAssertFalse(BlinkTiming.phrase(env: 0.05, voicedSince: 1, now: 1.3).ended, "a 0.3 s blip isn't a phrase")
        XCTAssertNil(BlinkTiming.phrase(env: 0.05, voicedSince: 1, now: 1.3).voicedSince)
    }

    // MARK: Through the rig

    /// Steps the rig at 120 fps; `script(t)` sets its inputs. Returns blink starts.
    private func blinks(seed: UInt64, until end: Double, script: (AliveRig, Double) -> Void) -> [Double] {
        let rig = AliveRig(persona: .ferni, seed: seed)
        var t = 0.0, starts: [Double] = [], last = rig.lastBlinkAt
        while t < end {
            t += 1.0 / 120
            script(rig, t)
            _ = rig.frame(at: t)
            if rig.lastBlinkAt != last { last = rig.lastBlinkAt; starts.append(last) }
        }
        return starts
    }

    func testHeBlinksAsTheTurnChangesHands() {
        for seed: UInt64 in 1...8 {
            let change = 6.0
            let starts = blinks(seed: seed, until: 8) { rig, t in rig.activity = t < change ? .listening : .speaking }
            let before = starts.last { $0 <= change } ?? -.infinity
            // Due 0.05-0.2 s after the change, or as soon as the gap since the last allows.
            let latest = max(change + 0.2, before + BlinkTiming.minGap) + 0.02
            XCTAssertTrue(starts.contains { $0 > change && $0 <= latest }, "seed \(seed): blinks \(starts), change at \(change)")
        }
    }

    func testHisBlinksFollowTheEndsOfHisPhrases() {
        // Phrases: 1.5 s of voice, 0.6 s quiet, for 30 s.
        let cycle = 2.1, voiced = 1.5
        var near = 0, total = 0
        for seed: UInt64 in 1...4 {
            let starts = blinks(seed: seed, until: 30) { rig, t in
                rig.activity = .speaking
                rig.voiceLevel = t.truncatingRemainder(dividingBy: cycle) < voiced ? 0.6 : 0
            }
            for s in starts where s > 2 {
                total += 1
                let sinceQuiet = s.truncatingRemainder(dividingBy: cycle) - voiced
                if sinceQuiet >= 0, sinceQuiet <= 0.5 { near += 1 }
            }
        }
        XCTAssertGreaterThan(total, 20, "he blinks")
        XCTAssertGreaterThan(Double(near) / Double(total), 0.6, "\(near) of \(total) blinks within 0.5 s of a phrase's end")
    }

    func testALongTurnStillGetsBlinks() {
        for seed: UInt64 in 1...4 {
            let starts = blinks(seed: seed, until: 60) { rig, _ in rig.activity = .listening }
            let gaps = zip(starts.dropFirst(), starts).map { $0 - $1 }
            XCTAssertGreaterThan(starts.count, 5, "seed \(seed)")
            XCTAssertLessThanOrEqual(gaps.max() ?? 0, BlinkTiming.floor.upperBound * 1.25 + 0.05, "seed \(seed): gaps \(gaps)")
        }
    }
}
