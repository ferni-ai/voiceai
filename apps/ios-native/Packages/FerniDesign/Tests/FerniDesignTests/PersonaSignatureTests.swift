import simd
import XCTest
@testable import FerniDesign

/// Maya's signature (persona acting, flag on). The caretaker's motion
/// classifier on the 36 grey panel clips named her 0 of 3, taken for Ferni,
/// Peter and Jordan: her breath (~2.5 s measured) sat on Peter's and she bobbed
/// as Peter and Jordan do. Now her breath sits between Peter's and Ferni's and
/// she sways side to side where they bob: calm, not flat, and her own.
@MainActor
final class PersonaSignatureTests: XCTestCase {
    /// Breaths this far apart (share of the other's period) at least: Maya's
    /// 3.3 s is 15% from Peter's 2.9 s; the old Maya's was 5%, and Peter's own
    /// value at her tempo would be 12%.
    static let apart = 0.14

    // MARK: The policy

    func testMayasBreathAndSwayDifferFromPetersAndJordans() {
        let maya = PersonaActing.restBreath(.maya, on: true), mayaAxis = PersonaActing.of(.maya).drift.axis
        XCTAssertEqual(mayaAxis, .sideways, "Maya sways")
        for other in [WindowPersona.peter, .jordan] {
            let o = PersonaActing.restBreath(other, on: true)
            XCTAssertGreaterThan(abs(maya - o) / o, Self.apart, "Maya's breath \(maya) s against \(other)'s \(o) s")
            XCTAssertNotEqual(mayaAxis, PersonaActing.of(other).drift.axis, "Maya sways where \(other) bobs")
        }
        let peter = PersonaActing.restBreath(.peter, on: true), ferni = PersonaActing.restBreath(.ferni, on: true)
        XCTAssertTrue(peter < maya && maya < ferni, "between Peter (\(peter) s) and Ferni (\(ferni) s): \(maya) s")
    }

    func testWithTheFlagOffMayaBobsAndBreathesAsBefore() {
        XCTAssertEqual(PersonaActing.resolved(.maya, on: false).drift, .bob)
        XCTAssertEqual(PersonaActing.restBreath(.maya, on: false), 4 * 0.95, accuracy: 1e-9)
        // The shared bob is the one from before the spec: 0.03 at 1.05 rad/s, straight up and down.
        for t in stride(from: 0.0, to: 12, by: 0.37) {
            let d = Drift.bob.offset(at: t)
            XCTAssertEqual(d.x, 0)
            XCTAssertEqual(d.y, sin(t * 1.05) * 0.03, accuracy: 1e-12)
        }
    }

    // MARK: Through the rig

    /// The orb's on-screen travel at rest over 12 s (reconnecting: no nods,
    /// no firefly, no thinking look), x and y (max - min).
    static func travel(_ persona: WindowPersona, on: Bool) -> (x: Double, y: Double) {
        let rig = AliveRig(persona: persona, seed: 3)
        rig.personaActing = on
        rig.activity = .reconnecting
        var t = 0.0, xs: [Double] = [], ys: [Double] = []
        while t < 14 {
            t += 1.0 / 60
            let u = rig.frame(at: t)
            guard t > 2 else { continue }
            xs.append(Double(u.pos.x)); ys.append(Double(u.pos.y))
        }
        return (xs.max()! - xs.min()!, ys.max()! - ys.min()!)
    }

    func testOnScreenMayaSwaysAndPeterAndJordanBob() {
        let maya = Self.travel(.maya, on: true)
        XCTAssertGreaterThan(maya.x, 0.035, "Maya sways visibly: \(maya)")
        XCTAssertGreaterThan(maya.x, maya.y * 2, "side to side more than up and down: \(maya)")
        for other in [WindowPersona.peter, .jordan] {
            let o = Self.travel(other, on: true)
            XCTAssertGreaterThan(o.y, o.x * 2, "\(other) bobs: \(o)")
        }
        let off = Self.travel(.maya, on: false)
        XCTAssertLessThan(off.x, 0.005, "flag off, no sway: \(off)")
        XCTAssertGreaterThan(off.y, off.x * 2, "flag off, she bobs: \(off)")
    }

    /// Calm: the sway is slow enough that it never by itself makes the rig
    /// count as moving, so the frame rate drops at rest as it does for everyone
    /// else. Its fastest (posX shows at 0.35 on screen) and the posX spring's
    /// own speed through 12 s at rest both stay under `AliveRig.settledSpeed`.
    func testMayasSwayStillSettles() {
        let d = PersonaActing.of(.maya).drift
        XCTAssertLessThan(d.sway / 0.35 * Drift.rate, AliveRig.settledSpeed * 0.95, "the sway's fastest")
        let rig = AliveRig(persona: .maya, seed: 3)
        rig.personaActing = true
        rig.activity = .reconnecting
        var t = 0.0, fastest = 0.0
        while t < 14 {
            t += 1.0 / 60
            _ = rig.frame(at: t)
            if t > 2 { fastest = max(fastest, abs(rig[.posX].v)) }
        }
        XCTAssertGreaterThan(fastest, 0.03, "she does sway")
        XCTAssertLessThan(fastest, AliveRig.settledSpeed, "posX at most \(fastest) a second")
    }

    func testMayasBreathThroughTheRigSitsBetweenPetersAndFernis() {
        let maya = PersonaActingTests.stats(.maya, on: true).breathPeriod
        let peter = PersonaActingTests.stats(.peter, on: true).breathPeriod
        let ferni = PersonaActingTests.stats(.ferni, on: true).breathPeriod
        XCTAssertGreaterThan(maya, peter * (1 + Self.apart), "Maya \(maya) s, Peter \(peter) s")
        XCTAssertLessThan(maya, ferni, "Maya \(maya) s, Ferni \(ferni) s")
    }
}
