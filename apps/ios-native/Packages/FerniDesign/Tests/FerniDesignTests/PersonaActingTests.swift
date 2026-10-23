import simd
import XCTest
@testable import FerniDesign

/// Persona acting (the SPEC): each teammate blinks, looks around and breathes
/// its own way, behind a flag that's off by default. Off, everyone is `shared`.
@MainActor
final class PersonaActingTests: XCTestCase {
    // MARK: The table

    func testFlagOffEveryoneActsAsBefore() {
        for p in WindowPersona.allCases { XCTAssertEqual(PersonaActing.resolved(p, on: false), .shared, "\(p)") }
        XCTAssertEqual(PersonaActing.shared.blinkFloor, BlinkTiming.floor)
        XCTAssertEqual(PersonaActing.shared.saccadeEvery, 1.1...3.4)
        XCTAssertEqual(PersonaActing.shared.eyeSpacing, 0.36)
    }

    func testEveryRowIsInRange() {
        for p in WindowPersona.allCases {
            let a = PersonaActing.of(p)
            XCTAssertTrue((2.0...12).contains(a.blinkFloor.lowerBound) && a.blinkFloor.upperBound <= 12, "\(p) blinks")
            XCTAssertTrue((0.5...6).contains(a.saccadeEvery.lowerBound) && a.saccadeEvery.upperBound <= 6, "\(p) saccades")
            XCTAssertTrue((0.05...0.3).contains(a.saccadeRange.x), "\(p) saccade range")
            XCTAssertTrue((0.6...1.5).contains(a.nod), "\(p) nod")
            XCTAssertTrue((0.6...1.6).contains(a.breathPeriod), "\(p) breath")
            XCTAssertTrue((0.3...0.4).contains(a.eyeSpacing), "\(p) eyes stay in the round family")
            XCTAssertTrue((0.9...1.15).contains(a.eyeSize.x) && (0.9...1.15).contains(a.eyeSize.y), "\(p) eye size")
            XCTAssertTrue((0.94...1.07).contains(a.bodyHeight), "\(p) body stays round-ish")
        }
    }

    func testNoTwoPersonasActTheSame() {
        let rows = WindowPersona.allCases.map { ($0, PersonaActing.of($0)) }
        for (i, a) in rows.enumerated() {
            for b in rows[(i + 1)...] { XCTAssertNotEqual(a.1, b.1, "\(a.0) and \(b.0)") }
        }
    }

    // MARK: Through the rig

    struct Stats { var blinksPerMin = 0.0, saccadesPerMin = 0.0, saccadeSize = 0.0, breathPeriod = 0.0 }

    /// A minute at 120 fps: blinks, saccades (gaze target jumps) and the
    /// breath's period (the body's squash crossing its mean). Reconnecting:
    /// ordinary saccades and the breath at rest, with no firefly (home), no
    /// nods (listening) and no thinking look to muddy them.
    static func stats(_ persona: WindowPersona, on: Bool, seed: UInt64 = 3) -> Stats {
        let rig = AliveRig(persona: persona, seed: seed)
        rig.personaActing = on
        rig.activity = .reconnecting
        var t = 0.0, last = rig.lastBlinkAt, blinks = 0, jumps: [Double] = []
        var prev = SIMD2<Double>(rig[.gx].t, rig[.gy].t), squash: [(Double, Double)] = []
        while t < 62 {
            t += 1.0 / 120
            _ = rig.frame(at: t)
            guard t > 2 else { prev = SIMD2(rig[.gx].t, rig[.gy].t); last = rig.lastBlinkAt; continue }
            if rig.lastBlinkAt != last { last = rig.lastBlinkAt; blinks += 1 }
            let g = SIMD2(rig[.gx].t, rig[.gy].t)
            if simd_distance(g, prev) > 0.02 { jumps.append(simd_distance(g, prev)) }
            prev = g
            squash.append((t, rig[.squash].t))
        }
        let mean = squash.map(\.1).reduce(0, +) / Double(squash.count)
        let ups = zip(squash.dropFirst(), squash).filter { $0.1.1 < mean && $0.0.1 >= mean }.map { $0.0.0 }
        let period = ups.count > 1 ? (ups.last! - ups.first!) / Double(ups.count - 1) : 0
        return Stats(blinksPerMin: Double(blinks), saccadesPerMin: Double(jumps.count),
                     saccadeSize: jumps.isEmpty ? 0 : jumps.reduce(0, +) / Double(jumps.count), breathPeriod: period)
    }

    func testCalmIsNotFlatButEachCalmIsItsOwn() {
        let maya = Self.stats(.maya, on: true), nayan = Self.stats(.nayan, on: true), alex = Self.stats(.alex, on: true)
        let peter = Self.stats(.peter, on: true), jordan = Self.stats(.jordan, on: true)
        XCTAssertGreaterThan(maya.blinksPerMin, nayan.blinksPerMin * 1.5, "Maya bright, Nayan slow: \(maya) \(nayan)")
        XCTAssertGreaterThan(peter.saccadesPerMin, alex.saccadesPerMin * 1.5, "Peter scans, Alex few moves: \(peter) \(alex)")
        XCTAssertGreaterThan(jordan.saccadeSize, alex.saccadeSize * 1.5, "Jordan wide, Alex small: \(jordan) \(alex)")
        XCTAssertGreaterThan(nayan.breathPeriod, jordan.breathPeriod * 1.6, "Nayan deep and slow, Jordan quick: \(nayan) \(jordan)")
    }

    func testWithTheFlagOffAPersonaActsAsBefore() {
        // Tempo still differs by persona (it did before); acting doesn't: Alex
        // and Peter look around alike with the flag off, not with it on.
        let alexOff = Self.stats(.alex, on: false), peterOff = Self.stats(.peter, on: false)
        XCTAssertEqual(alexOff.saccadeSize, peterOff.saccadeSize, accuracy: 0.05)
        XCTAssertEqual(alexOff.saccadesPerMin, peterOff.saccadesPerMin, accuracy: 8)
    }

    func testAlexsEyesAreQuickerThanNayans() {
        for (persona, k) in [(WindowPersona.alex, 900.0), (.nayan, 260)] {
            let rig = AliveRig(persona: persona, seed: 1)
            rig.personaActing = true
            _ = rig.frame(at: 0.02)
            XCTAssertEqual(rig[.gx].k, k, "\(persona)")
        }
        let rig = AliveRig(persona: .alex, seed: 1)
        _ = rig.frame(at: 0.02)
        XCTAssertEqual(rig[.gx].k, 650, "flag off: the shared eye spring")
    }
}
