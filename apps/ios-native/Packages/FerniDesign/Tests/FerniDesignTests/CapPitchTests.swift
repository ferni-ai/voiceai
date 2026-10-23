import XCTest
@testable import FerniDesign

/// A lid belongs to the face: the caps follow the head's pitch as they
/// follow its roll. They stayed flat on the screen while the eyes moved, so
/// the small win's nod opened a band between them (2026-10-20). Now they
/// stay inside the eyes (design panel, 2026-10-23), so through a nod or a
/// look up or down no cap pixel leaves the eye it belongs to.
@MainActor
final class CapPitchTests: XCTestCase {
    static let pitches: [Float] = [-0.1, -0.05, 0, 0.05, 0.1]

    /// The settled face at a pitch, light theme, the caps as given.
    func render(_ id: String, pitch: Float, caps: SIMD2<Float>?) throws -> LidCapTests.Render {
        let rig = AliveRig(persona: .ferni, seed: 11)
        rig.still = true
        rig.expression = id
        _ = rig.frame(at: 0.016)
        var u = rig.frame(at: 0.032)
        u.lean.y = pitch
        if let caps { u.caps.x = caps.x; u.caps.y = caps.y }
        let w = ExpressionDistinctnessTests.width, h = ExpressionDistinctnessTests.height
        u.light(dark: false, roomTop: linear(hex: "#faf8f5"), roomBottom: linear(hex: "#efe9e0"))
        u.frame(size: SIMD2(Float(w), Float(h)), radius: Float(AvatarView.radius / AvatarView.canvas.width) * Float(w),
                below: Float(AvatarView.lift / AvatarView.canvas.width) * Float(w))
        return (try XCTUnwrap(AliveRenderer.shared?.image(u, width: w, height: h)), w, h, u)
    }

    /// The eyes at this pitch, as drawn without caps: the eye-coloured pixels
    /// (lighter than his green ever gets), grown 3 px. `nearEye` doesn't turn
    /// with the pitch, so the bound comes from the render here.
    func eyes(_ bare: LidCapTests.Render) -> [Bool] {
        var eye = [Bool](repeating: false, count: bare.w * bare.h)
        for y in 0..<bare.h { for x in 0..<bare.w {
            let i = (y * bare.w + x) * 4
            guard bare.bytes[i + 3] == 255, min(bare.bytes[i], bare.bytes[i + 1], bare.bytes[i + 2]) > 150 else { continue }
            for dy in -3...3 { for dx in -3...3 where (0..<bare.w).contains(x + dx) && (0..<bare.h).contains(y + dy) {
                eye[(y + dy) * bare.w + x + dx] = true
            } }
        } }
        return eye
    }

    /// The face's own caps and the deepest the shader takes, at every pitch:
    /// every pixel the caps change is inside the eyes.
    func testTheCapsStayInTheEyesThroughANod() throws {
        guard AliveRenderer.shared != nil else { throw XCTSkip("no Metal device") }
        for id in ["happy", "sleepy"] {
            for caps in [nil, SIMD2<Float>(1, 1)] {
                var reached = 0
                for pitch in Self.pitches {
                    let r = try render(id, pitch: pitch, caps: caps), bare = try render(id, pitch: pitch, caps: .zero)
                    let inEye = eyes(bare)
                    var outside = 0
                    for y in 0..<r.h { for x in 0..<r.w {
                        let i = (y * r.w + x) * 4
                        let d = (0..<3).map { abs(Int(r.bytes[i + $0]) - Int(bare.bytes[i + $0])) }.max() ?? 0
                        guard d > CrescentCapTests.changed else { continue }
                        reached += 1
                        if !inEye[y * r.w + x] { outside += 1 }
                    } }
                    XCTAssertEqual(outside, 0, "\(id) caps \(caps.map { "\($0)" } ?? "own") pitch \(pitch): \(outside) cap pixels outside the eyes")
                }
                if caps != nil { XCTAssertGreaterThan(reached, 0, "\(id): the deepest caps reach into the eyes") }
            }
        }
    }
}
