import XCTest
@testable import FerniDesign

/// The rig, driven frame by frame at 60 fps with a fixed seed.
@MainActor
final class AliveRigTests: XCTestCase {
    private func run(_ rig: AliveRig, from t0: Double = 0, for seconds: Double, each: (Double, AliveUniforms) -> Void = { _, _ in }) -> AliveUniforms {
        var u = AliveUniforms()
        var t = t0
        while t < t0 + seconds {
            t += 1.0 / 60
            u = rig.frame(at: t)
            each(t, u)
        }
        return u
    }

    func testAStillFaceSitsExactlyOnItsTokens() {
        let rig = AliveRig(seed: 1)
        rig.still = true
        rig.expression = "joyful"
        let u = run(rig, for: 0.5)
        let f = Face.of("joyful")
        XCTAssertEqual(Double(u.lids.x), f.left.top, accuracy: 1e-4)
        XCTAssertEqual(Double(u.arch.x), f.left.arch, accuracy: 1e-4)
        XCTAssertEqual(Double(u.eyes.y), f.left.sy, accuracy: 1e-4)
        XCTAssertEqual(Double(u.lean.w), f.crease, accuracy: 1e-4)
    }

    func testListeningWithNoExpressionLooksAttentive() {
        let rig = AliveRig(seed: 1)
        rig.activity = .listening
        XCTAssertEqual(rig.faceID(), "attentive")
        rig.expression = "joyful"
        XCTAssertEqual(rig.faceID(), "joyful", "an expression from the agent wins")
    }

    func testTheArrivalRisesFromBelowAndSettles() {
        let rig = AliveRig(seed: 2)
        rig.play(.arrival)
        var cues: [KeyedCue] = []
        let first = rig.frame(at: 0.001)
        XCTAssertEqual(first.pos.y, -2.5, accuracy: 0.05, "starts below the frame")
        XCTAssertEqual(first.lids.x, 1, accuracy: 0.01, "eyes closed until it lands")
        let last = run(rig, from: 0.001, for: 3) { _, _ in cues += rig.cues }
        XCTAssertEqual(last.pos.y, 0, accuracy: 0.08, "settled at rest")
        XCTAssertLessThan(last.lids.x, 0.5, "eyes open")
        XCTAssertEqual(cues.filter { $0 == .arrivalChime }.count, 1)
        XCTAssertTrue(cues.contains(.pop))
    }

    /// Ferni's real voice level moves the body: louder means more glow and
    /// lower lids lifting (the speaking squint), silence leaves them be.
    func testTheVoiceLevelDrivesTheBody() {
        func glow(level: Float, activity: AvatarActivity) -> (glow: Float, bot: Float) {
            let rig = AliveRig(seed: 3)
            rig.activity = activity
            rig.voiceLevel = level
            var g: Float = 0, b: Float = 0
            _ = run(rig, for: 1.5) { t, u in if t > 1 { g = max(g, u.bg1.w); b = max(b, u.lids.z) } }
            return (g, b)
        }
        let loud = glow(level: 0.8, activity: .speaking), quiet = glow(level: 0, activity: .speaking)
        XCTAssertGreaterThan(loud.glow, quiet.glow + 0.2)
        XCTAssertGreaterThan(loud.bot, quiet.bot + 0.1)
        let notSpeaking = glow(level: 0.8, activity: .listening)
        XCTAssertLessThan(notSpeaking.glow, loud.glow - 0.2, "only Ferni's own speech moves Ferni")
    }

    func testTheEnvelopeIsTheRealVoicesLoudness() {
        XCTAssertEqual(AliveRig.envelopeTarget(0), 0)
        XCTAssertEqual(AliveRig.envelopeTarget(1), 1)
        let steps = stride(from: Float(0.05), through: 1, by: 0.05).map(AliveRig.envelopeTarget)
        XCTAssertEqual(steps, steps.sorted(), "louder is never smaller")
    }

    /// The family table: Maya peeks in, they greet, swap, and Ferni waits in the corner.
    func testAHandoffStagesTheFamilyTable() {
        let rig = AliveRig(persona: .ferni, seed: 4)
        _ = run(rig, for: 0.5)
        rig.handOff(to: .maya)
        var sawGuestWhileFerniLed = false
        var cues: [KeyedCue] = []
        _ = run(rig, from: 0.5, for: 1.5) { _, u in
            if u.guest.w == 1, rig.persona == .ferni { sawGuestWhileFerniLed = true }
            cues += rig.cues
        }
        XCTAssertTrue(sawGuestWhileFerniLed, "Maya appears before taking over")
        XCTAssertEqual(rig.persona, .ferni, "not yet")
        let settled = run(rig, from: 2, for: 3) { _, _ in cues += rig.cues }
        XCTAssertEqual(rig.persona, .maya)
        XCTAssertEqual(rig.guestPersona, .ferni)
        XCTAssertEqual(settled.body.x, AliveRig.colours(.maya).body.x, accuracy: 1e-5)
        XCTAssertEqual(settled.pos.x, 0, accuracy: 0.1, "Maya at centre")
        XCTAssertEqual(settled.guest.x, -1.2, accuracy: 0.1, "Ferni in the corner")
        XCTAssertEqual(settled.guest.z, 0.42, accuracy: 0.05, "small")
        XCTAssertEqual(cues.filter { $0 == .hop }.count, 2)
        XCTAssertTrue(cues.contains(.whoosh))
        XCTAssertEqual(cues.filter { $0 == .arrivalChime }.count, 1, "one chime per handoff")
    }

    func testTheCornerTeammateLeavesWhenAsked() {
        let rig = AliveRig(seed: 5)
        rig.handOff(to: .peter)
        _ = run(rig, for: 4)
        XCTAssertEqual(rig.guestPersona, .ferni)
        rig.dismissGuest()
        let u = run(rig, from: 4, for: 1)
        XCTAssertNil(rig.guestPersona)
        XCTAssertEqual(u.guest.w, 0)
    }

    func testReduceMotionKeepsTheBreathSmall() {
        func swing(_ reduce: Bool) -> Float {
            let rig = AliveRig(seed: 6)
            rig.reduceMotion = reduce
            var lo: Float = 9, hi: Float = -9
            _ = run(rig, for: 8) { t, u in if t > 2 { lo = min(lo, u.body.w); hi = max(hi, u.body.w) } }
            return hi - lo
        }
        let full = swing(false), reduced = swing(true)
        XCTAssertGreaterThan(full, 0.004)
        XCTAssertEqual(Double(reduced / full), 0.35, accuracy: 0.12)
    }
}
