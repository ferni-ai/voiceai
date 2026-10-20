import XCTest
@testable import FerniDesign

/// Parity item 2: the prototype's seven micro-expressions (80-120 ms, felt
/// more than seen): recognition and interest or warmth while Ferni listens,
/// and whatever the call sends.
@MainActor
final class MicroExpressionTests: XCTestCase {
    /// Runs frames at 60 fps and returns the face shown at each.
    private func faces(_ rig: AliveRig, from t0: Double, to t1: Double) -> [(t: Double, face: String)] {
        var out: [(Double, String)] = [], t = t0
        while t < t1 {
            t += 1.0 / 60
            _ = rig.frame(at: t)
            out.append((t, rig.faceID()))
        }
        return out
    }

    /// The bundled table is design-system/tokens/expressions.json's
    /// microExpressions (face and duration); rerun sync-expression-tokens.py.
    func testTheTableIsTheDesignSystems() throws {
        let repo = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
            .appending(path: "../../../../../../design-system/tokens/expressions.json").standardized
        guard let data = try? Data(contentsOf: repo) else { throw XCTSkip("design-system not reachable from here") }
        let source = try JSONDecoder().decode(ExpressionTokens.File.self, from: data).microExpressions
        XCTAssertEqual(ExpressionTokens.micro, source, "run apps/ios-native/scripts/sync-expression-tokens.py")
        XCTAssertEqual(Set(ExpressionTokens.micro.keys), Set(MicroExpression.allCases.map(\.rawValue)))
        for m in MicroExpression.allCases {
            let flash = try XCTUnwrap(m.flash, m.rawValue)
            XCTAssertNotNil(ExpressionTokens.all[flash.face], "\(m) flashes a face Ferni has")
            XCTAssertTrue((0.08...0.12).contains(flash.seconds), "\(m): \(flash.seconds) s")
        }
    }

    /// Over a face of its own (here happy), listening flashes recognition
    /// (attentive) at 0.3 s for 80 ms, then interest or warmth at 1.5 s.
    func testListeningFlashesRecognitionThenInterestOrWarmth() {
        let rig = AliveRig(seed: 7)
        rig.expression = "happy"
        _ = faces(rig, from: 0, to: 1)
        rig.activity = .listening
        let shown = faces(rig, from: 1, to: 3)
        let attentive = shown.filter { $0.face == "attentive" }.map(\.t)
        XCTAssertFalse(attentive.isEmpty, "recognition shows")
        // The frame after the change (1 + 1/60 s) starts the clock; within 1.5 frames.
        XCTAssertEqual(attentive.first ?? 0, 1.317, accuracy: 0.025)
        XCTAssertEqual((attentive.last ?? 0) - (attentive.first ?? 0), 0.08, accuracy: 0.034, "for 80 ms")
        let later = shown.filter { $0.face == "interested" || $0.face == "warm" }.map(\.t)
        XCTAssertEqual(later.first ?? 0, 2.517, accuracy: 0.025)
        XCTAssertLessThan((later.last ?? 0) - (later.first ?? 0), 0.13)
        XCTAssertEqual(shown.last?.face, "happy", "then the face he had")
    }

    func testWhenHeStopsListeningTheRestDoesNotPlay() {
        let rig = AliveRig(seed: 7)
        rig.expression = "happy"
        rig.activity = .listening
        _ = faces(rig, from: 0, to: 0.5)
        rig.activity = .speaking
        let shown = faces(rig, from: 0.5, to: 3)
        XCTAssertFalse(shown.contains { ["interested", "warm"].contains($0.face) && $0.t > 1.4 }, "nothing at 1.5 s")
    }

    func testAMicroNeverCutsALongerFlashShort() {
        let rig = AliveRig(seed: 8)
        _ = faces(rig, from: 0, to: 1)
        rig.poke(at: SIMD2(0.2, 0.2)) // happy for 0.7 s
        _ = faces(rig, from: 1, to: 1.1)
        let before = rig.faceID()
        rig.micro(.concern)
        XCTAssertEqual(before, "happy")
        XCTAssertEqual(Set(faces(rig, from: 1.1, to: 1.3).map(\.face)), [before])
    }

    func testAMicroFromTheCallFlashesAtThePersonasTempo() {
        let rig = AliveRig(persona: .peter, seed: 9) // tempo 0.85
        _ = faces(rig, from: 0, to: 1)
        rig.micro(.delight) // delighted, 120 ms
        let shown = faces(rig, from: 1, to: 1.5).filter { $0.face == "delighted" }.map(\.t)
        XCTAssertEqual((shown.last ?? 0) - 1, 0.102, accuracy: 0.017)
    }

    /// Expression audit P2 #5: recognition and interest were invisible (the
    /// eyes moved 0.017, a face he already wore). Now the eyes widen as on the
    /// web: recognition about 1.2 tall, interest about 1.12.
    func testRecognitionAndInterestWidenTheEyes() {
        func peak(_ micro: MicroExpression) -> Double {
            let a = AliveRig(seed: 31), b = AliveRig(seed: 31)
            for rig in [a, b] { rig.expression = "attentive" }
            var t = 0.0
            while t < 1 { t += 1.0 / 60; _ = a.frame(at: t); _ = b.frame(at: t) }
            a.micro(micro)
            var most = 0.0
            while t < 1.5 {
                t += 1.0 / 60
                let ua = a.frame(at: t), ub = b.frame(at: t)
                most = max(most, Double(ua.eyes.y / ub.eyes.y))
            }
            return most
        }
        XCTAssertGreaterThan(peak(.recognition), 1.15, "recognition")
        XCTAssertGreaterThan(peak(.interest), 1.08, "interest")
        XCTAssertLessThan(peak(.interest), peak(.recognition), "interest the smaller")
    }

    func testStillFramesPlayNone() {
        let rig = AliveRig(seed: 10)
        rig.still = true
        rig.micro(.surprise)
        XCTAssertEqual(rig.faceID(), "neutral")
    }
}
