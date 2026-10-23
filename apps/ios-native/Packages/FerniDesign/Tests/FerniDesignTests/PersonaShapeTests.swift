import simd
import XCTest
@testable import FerniDesign

/// Persona acting, shape (SPEC): each persona's eye spacing and size, body
/// height and resting lids, within the round family. Take the colour away
/// and the flag off, and the six are one orb; flag on, each is its own.
@MainActor
final class PersonaShapeTests: XCTestCase {
    private func uniforms(_ persona: WindowPersona, on: Bool) -> AliveUniforms {
        let rig = AliveRig(persona: persona, seed: 4)
        rig.personaActing = on
        var t = 0.0, u = AliveUniforms()
        while t < 1.5 { t += 1.0 / 60; u = rig.frame(at: t) }
        return u
    }

    func testTheUniformsCarryEachPersonasShape() {
        for p in WindowPersona.allCases {
            let a = PersonaActing.of(p), on = uniforms(p, on: true), off = uniforms(p, on: false)
            if a.eyeSpacing == 0.36 {
                XCTAssertTrue(on.caps.w == 0 || abs(on.caps.w - 0.36) < 1e-3, "\(p): the shader's own 0.36")
            } else {
                XCTAssertEqual(Double(on.caps.w), a.eyeSpacing, accuracy: 1e-3, "\(p) eye spacing")
            }
            XCTAssertEqual(Double(on.eyes.x / off.eyes.x), a.eyeSize.x, accuracy: 0.02, "\(p) eye width")
            XCTAssertEqual(Double(on.eyes.y / off.eyes.y), a.eyeSize.y, accuracy: 0.02, "\(p) eye height")
            XCTAssertEqual(off.caps.w, 0, "\(p) flag off: the shared spacing")
        }
    }

    func testTheShapeEasesInRatherThanSnapping() {
        var shape = PersonaShape(.shared)
        let target = PersonaShape(.of(.jordan))
        shape.ease(toward: target, dt: 1.0 / 60)
        XCTAssertGreaterThan(shape.eyeSpacing, 0.36)
        XCTAssertLessThan(shape.eyeSpacing, target.eyeSpacing, "not there in one frame")
        for _ in 0..<60 { shape.ease(toward: target, dt: 1.0 / 60) }
        XCTAssertEqual(shape, target, "there within a second, exactly")
    }

    /// The settled neutral face in one grey (colour removed), as the face crop.
    static func greyFace(_ persona: WindowPersona, on: Bool) throws -> [Float] {
        let rig = AliveRig(persona: persona, seed: 11)
        rig.still = true
        rig.personaActing = on
        _ = rig.frame(at: 0.016)
        var u = rig.frame(at: 0.032)
        let grey = linear(hex: "#7a7a7a")
        u.body = SIMD4(grey, u.body.w)
        u.glowCol = SIMD4(grey, u.glowCol.w)
        u.light(dark: false, roomTop: linear(hex: "#faf8f5"), roomBottom: linear(hex: "#efe9e0"))
        let w = ExpressionDistinctnessTests.width, h = ExpressionDistinctnessTests.height
        u.frame(size: SIMD2(Float(w), Float(h)), radius: Float(AvatarView.radius / AvatarView.canvas.width) * Float(w),
                below: Float(AvatarView.lift / AvatarView.canvas.width) * Float(w))
        return ExpressionDistinctnessTests.crop(try XCTUnwrap(AliveRenderer.shared?.image(u, width: w, height: h)))
    }

    func testWithoutColourTheFlagOffSixAreOneOrbAndOnSixDifferentOnes() throws {
        guard AliveRenderer.shared != nil else { throw XCTSkip("no Metal device") }
        let personas = WindowPersona.allCases
        let off = try personas.map { try Self.greyFace($0, on: false) }, on = try personas.map { try Self.greyFace($0, on: true) }
        var closest: (Float, String) = (1, "")
        for i in personas.indices {
            for j in personas.indices where j > i {
                XCTAssertLessThan(ExpressionDistinctnessTests.difference(off[i], off[j]), 0.001, "flag off: \(personas[i]) and \(personas[j]) are one orb")
                let d = ExpressionDistinctnessTests.difference(on[i], on[j])
                if d < closest.0 { closest = (d, "\(personas[i])/\(personas[j])") }
            }
        }
        XCTAssertGreaterThan(closest.0, Self.shapeLine, "the closest pair in grey, \(closest.1), at \(closest.0)")
    }

    /// The expression audit's line for "the same face" in a still (0.01), at
    /// half: shape is one channel of the tell-apart, motion is the other.
    static let shapeLine: Float = 0.005
}
