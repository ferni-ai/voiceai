import XCTest
@testable import FerniDesign

/// Parity item 1: the design system's choreographed sequences
/// (sequences.json), played on Ferni's body as the prototype's playSequence does.
@MainActor
final class SequenceTests: XCTestCase {
    @discardableResult
    private func run(_ rig: AliveRig, from t0: Double, to t1: Double, each: (Double, AliveUniforms) -> Void = { _, _ in }) -> AliveUniforms {
        var u = AliveUniforms(), t = t0
        while t < t1 { t += 1.0 / 60; u = rig.frame(at: t); each(t, u) }
        return u
    }

    /// The same rig twice from the same seed; `play` runs on the first at 1 s.
    /// Returns per-frame (with, without) uniforms for the window after.
    private func twins(_ play: (AliveRig) -> Void, persona: WindowPersona = .ferni, for seconds: Double = 1.5,
                       setup: (AliveRig) -> Void = { _ in }) -> [(t: Double, a: AliveUniforms, b: AliveUniforms, face: String, sparkles: Int)] {
        let a = AliveRig(persona: persona, seed: 51), b = AliveRig(persona: persona, seed: 51)
        setup(a); setup(b)
        run(a, from: 0, to: 1); run(b, from: 0, to: 1)
        play(a)
        var out: [(Double, AliveUniforms, AliveUniforms, String, Int)] = [], t = 1.0
        while t < 1 + seconds {
            t += 1.0 / 60
            let ua = a.frame(at: t), ub = b.frame(at: t)
            out.append((t, ua, ub, a.faceID(), a.particles.filter { $0.kind == .sparkle }.count))
        }
        return out
    }

    func testTheBundledSequencesAreTheDesignSystems() throws {
        let repo = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
            .appending(path: "../../../../../../design-system/tokens/sequences.json").standardized
        guard let data = try? Data(contentsOf: repo) else { throw XCTSkip("design-system not reachable from here") }
        let source = try JSONDecoder().decode(SequenceTokens.File.self, from: data)
        let bundled = try XCTUnwrap(SequenceTokens.file)
        XCTAssertEqual(bundled.sequences, source.sequences, "run apps/ios-native/scripts/sync-expression-tokens.py")
        XCTAssertEqual(bundled.orchestration, source.orchestration)
        let removed = { (f: SequenceTokens.File) in (f.reducedMotion?.simplifications ?? [:]).compactMapValues(\.removeSteps) }
        XCTAssertEqual(removed(bundled), removed(source))
        for id in ["connection_success", "session_end", "handoff_transition", "error_recovery", "deep_moment", "celebration_small"] {
            XCTAssertNotNil(SequenceTokens.sequence(id), id)
        }
    }

    /// celebration_small: an approving nod (up 4 px, a 2° turn), the glow
    /// lifting, and sparkles.
    func testASmallWinNodsGlowsAndSparkles() {
        let frames = twins { $0.play(sequence: "celebration_small") }
        XCTAssertGreaterThan(frames.map { $0.a.pos.y - $0.b.pos.y }.max() ?? 0, 0.02, "up")
        XCTAssertGreaterThan(frames.map { $0.a.lean.x - $0.b.lean.x }.max() ?? 0, 0.01, "a turn (the roll spring lags the 2°)")
        let glow = frames.map { $0.a.bg1.w - $0.b.bg1.w }.max() ?? 0
        // The glow track is opacity 0.6 → 1 → 0.6: light adds its change (+0.4), not 1.
        XCTAssertTrue((0.1...0.4).contains(glow), "glow lifts by its change: \(glow)")
        XCTAssertGreaterThanOrEqual(frames.map(\.sparkles).max() ?? 0, 6, "sparkles")
        let last = frames.last!
        XCTAssertEqual(last.a.pos.y, last.b.pos.y, accuracy: 0.01, "and back")
    }

    /// Expression audit P2 #9: celebration_big's confetti rendered as cream
    /// sparkles. It's paper in the team's colours, thrown up and falling.
    func testABigWinThrowsConfetti() {
        let rig = AliveRig(seed: 57)
        run(rig, from: 0, to: 1)
        rig.play(sequence: "celebration_big")
        var most = 0, tones = Set<Int>(), heights: [Double] = [], sparkles = 0
        run(rig, from: 1, to: 4.5) { _, _ in
            let confetti = rig.particles.filter { $0.kind == .confetti }
            most = max(most, confetti.count)
            confetti.forEach { tones.insert($0.tone % WindowPersona.allCases.count) }
            if let first = confetti.first { heights.append(first.y) }
            sparkles = max(sparkles, rig.particles.filter { $0.kind == .sparkle }.count)
        }
        XCTAssertGreaterThanOrEqual(most, 20, "a handful of confetti")
        XCTAssertGreaterThanOrEqual(tones.count, 4, "in the team's colours")
        XCTAssertLessThan(heights.last ?? 9, heights.max() ?? 0, "falling")
        XCTAssertEqual(sparkles, 0, "not cream sparkles")
    }

    /// deep_moment: the empathetic face over the whole moment, a warm, slow glow.
    func testABreakthroughSoftensAndWarms() {
        let frames = twins({ $0.play(sequence: "deep_moment") }, for: 4)
        XCTAssertTrue(frames.filter { $0.t > 1.1 && $0.t < 4.3 }.allSatisfy { $0.face == "empathetic" })
        XCTAssertNotEqual(frames.last?.face, "empathetic", "then his own face")
        XCTAssertGreaterThan(frames.map { $0.a.bg1.w - $0.b.bg1.w }.max() ?? 0, 0.15, "warmer light")
    }

    /// At Peter's tempo (0.85) everything comes sooner.
    func testThePersonasTempo() {
        let frames = twins({ $0.play(sequence: "deep_moment") }, persona: .peter, for: 4)
        let lastEmpathetic = frames.last { $0.face == "empathetic" }?.t ?? 0
        XCTAssertEqual(lastEmpathetic - 1, 3.0 * 0.85 + 0.4, accuracy: 0.05)
    }

    /// One at a time: a lower priority doesn't interrupt; a higher one does;
    /// once a moment ends anything plays.
    func testPriorityDecidesWhoPlays() {
        let rig = AliveRig(seed: 52)
        run(rig, from: 0, to: 1)
        XCTAssertTrue(rig.play(sequence: "celebration_small"))        // normal
        XCTAssertFalse(rig.play(sequence: "deep_moment"), "low waits") // low
        XCTAssertEqual(rig.playingSequence, "celebration_small")
        XCTAssertTrue(rig.play(sequence: "error_recovery"), "critical interrupts")
        XCTAssertEqual(rig.playingSequence, "error_recovery")
        run(rig, from: 1, to: 2.6)
        XCTAssertNil(rig.playingSequence)
        XCTAssertTrue(rig.play(sequence: "deep_moment"))
        XCTAssertFalse(rig.play(sequence: "no_such_moment"))
    }

    /// Under Reduce Motion the steps the tokens remove are left out:
    /// arrival_ready's breath in (its eyes' look stays).
    func testReduceMotionLeavesOutTheRemovedSteps() {
        let breath = twins { $0.play(sequence: "arrival_ready") }
        XCTAssertGreaterThan(breath.map { $0.a.body.w - $0.b.body.w }.max() ?? 0, 0.004, "a breath in")
        let reduced = twins({ $0.play(sequence: "arrival_ready") }, setup: { $0.reduceMotion = true })
        XCTAssertLessThan(reduced.map { abs($0.a.body.w - $0.b.body.w) }.max() ?? 1, 0.0005, "none")
        XCTAssertGreaterThan(reduced.map { abs($0.a.gaze.y - $0.b.gaze.y) }.max() ?? 0, 0.005, "the look stays")
    }

    func testAStillFramePlaysNone() {
        let rig = AliveRig(seed: 53)
        rig.still = true
        XCTAssertFalse(rig.play(sequence: "celebration_small"))
    }

    /// The handoff plays handoff_transition as the two swap places.
    func testTheHandoffPlaysItsTransition() {
        let rig = AliveRig(seed: 54)
        rig.activity = .listening
        run(rig, from: 0, to: 1)
        rig.handOff(to: .maya)
        var seen: Double?
        run(rig, from: 1, to: 4) { t, _ in if seen == nil, rig.playingSequence == "handoff_transition" { seen = t } }
        XCTAssertEqual(seen ?? 0, 1 + 1.45, accuracy: 0.05)
    }

    /// Which sequence a change in what he's doing plays (AvatarView).
    func testWhatPlaysWhen() {
        XCTAssertEqual(AvatarView.sequence(from: .arriving, to: .listening, join: .settle, reduceMotion: false), "connection_success")
        XCTAssertNil(AvatarView.sequence(from: .arriving, to: .listening, join: .hop, reduceMotion: false), "the hop is the arrival")
        XCTAssertEqual(AvatarView.sequence(from: .reconnecting, to: .speaking, join: .none, reduceMotion: false), "error_recovery")
        XCTAssertNil(AvatarView.sequence(from: .reconnecting, to: .idle, join: .none, reduceMotion: false))
        XCTAssertEqual(AvatarView.sequence(from: .listening, to: .idle, join: .none, reduceMotion: true), "session_end")
        XCTAssertNil(AvatarView.sequence(from: .listening, to: .idle, join: .none, reduceMotion: false), "the keyed goodbye")
        XCTAssertNil(AvatarView.sequence(from: .arriving, to: .idle, join: .none, reduceMotion: true), "no call, no goodbye")
    }
}
