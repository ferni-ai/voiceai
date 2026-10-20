import XCTest
@testable import FerniDesign

/// Expression audit P1 #4: each expression token names an `animation`
/// (eyerollArc, anxiousDart, winkPop, yawnCycle...); none of the 15 played.
/// Each now plays once as its expression arrives, then hands back to the pose.
@MainActor
final class ExpressionAnimationTests: XCTestCase {
    /// Every expression with an animation, and its name.
    static var animated: [(id: String, name: String)] {
        ExpressionTokens.all.keys.sorted().compactMap { id in Face.of(id).animation.map { (id, $0) } }
    }

    private func floats(_ u: AliveUniforms) -> [Float] {
        withUnsafeBytes(of: u) { Array($0.bindMemory(to: Float.self)) }
    }

    /// The same rig twice, `id` set on both at 1 s; only the first plays its
    /// animation. Per frame: seconds since, with and without.
    private func twins(_ id: String, reduceMotion: Bool = false, for seconds: Double = 3.5)
        -> [(t: Double, a: AliveUniforms, b: AliveUniforms)] {
        let a = AliveRig(persona: .ferni, seed: 71), b = AliveRig(persona: .ferni, seed: 71)
        b.playsExpressionAnimations = false
        for rig in [a, b] { rig.reduceMotion = reduceMotion }
        var t = 0.0
        while t < 1 { t += 1.0 / 60; _ = a.frame(at: t); _ = b.frame(at: t) }
        a.expression = id
        b.expression = id
        var out: [(Double, AliveUniforms, AliveUniforms)] = []
        while t < 1 + seconds {
            t += 1.0 / 60
            out.append((t - 1, a.frame(at: t), b.frame(at: t)))
        }
        return out
    }

    func testEveryNamedAnimationHasItsMotion() {
        XCTAssertEqual(Set(Self.animated.map(\.name)).count, 15, "the tokens name 15")
        for (id, name) in Self.animated {
            XCTAssertNotNil(ExpressionAnimation.all[name], "\(id)'s \(name)")
        }
    }

    /// Each one moves him visibly, then gives the pose back.
    func testEachPlaysOnceThenHandsBack() {
        for (id, name) in Self.animated {
            let frames = twins(id)
            let moved = frames.map { f in zip(floats(f.a), floats(f.b)).map { abs($0 - $1) }.max() ?? 0 }
            XCTAssertGreaterThan(moved.max() ?? 0, 0.01, "\(id): \(name) doesn't move him")
            XCTAssertLessThan(moved.last ?? 1, 0.005, "\(id): \(name) doesn't hand the pose back")
        }
    }

    /// The eyeroll's eyes travel up and across; a dart looks one way, then the other.
    func testTheEyesTravel() {
        let roll = twins("eyeroll").map { Double($0.a.gaze.y - $0.b.gaze.y) }
        XCTAssertGreaterThan(roll.max() ?? 0, 0.25, "the eyes roll up")
        let dart = twins("anxious").map { Double($0.a.gaze.x - $0.b.gaze.x) }
        XCTAssertGreaterThan(dart.max() ?? 0, 0.2, "a dart one way")
        XCTAssertLessThan(dart.min() ?? 0, -0.2, "and the other")
    }

    /// Reduce Motion: only motion, so none plays.
    func testReduceMotionPlaysNone() {
        for (id, _) in Self.animated {
            let frames = twins(id, reduceMotion: true, for: 1)
            let moved = frames.map { f in zip(floats(f.a), floats(f.b)).map { abs($0 - $1) }.max() ?? 0 }
            XCTAssertEqual(moved.max() ?? 1, 0, accuracy: 1e-6, id)
        }
    }
}
