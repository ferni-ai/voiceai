import XCTest
@testable import FerniDesign

/// A lid belongs to the face: the caps follow the head's pitch as they
/// follow its roll, so the gap between an eye and its cap holds through a
/// nod or a look up or down. They stayed flat on the screen while the eyes
/// moved, so the small win's nod opened a band between them (2026-10-20).
@MainActor
final class CapPitchTests: XCTestCase {
    static let pitches: [Float] = [-0.1, -0.05, 0, 0.05, 0.1]

    /// The settled face at a pitch, light theme: grey per pixel, row-major, y down.
    func render(_ id: String, pitch: Float, caps: Bool = true) throws -> (luma: [Float], w: Int, h: Int) {
        let rig = AliveRig(persona: .ferni, seed: 11)
        rig.still = true
        rig.expression = id
        _ = rig.frame(at: 0.016)
        var u = rig.frame(at: 0.032)
        u.lean.y = pitch
        if !caps { u.caps = .zero }
        let w = ExpressionDistinctnessTests.width, h = ExpressionDistinctnessTests.height
        u.light(dark: false, roomTop: linear(hex: "#faf8f5"), roomBottom: linear(hex: "#efe9e0"))
        u.frame(size: SIMD2(Float(w), Float(h)), radius: Float(AvatarView.radius / AvatarView.canvas.width) * Float(w),
                below: Float(AvatarView.lift / AvatarView.canvas.width) * Float(w))
        let bytes = try XCTUnwrap(AliveRenderer.shared?.image(u, width: w, height: h))
        var luma = [Float](repeating: 0, count: w * h)
        for i in 0..<(w * h) {
            luma[i] = (0.0722 * Float(bytes[i * 4]) + 0.7152 * Float(bytes[i * 4 + 1]) + 0.2126 * Float(bytes[i * 4 + 2])) / 255
        }
        return (luma, w, h)
    }

    /// Rows from the left eye's white to the top cap's edge, and from its white
    /// to the bottom cap's edge, down the eye's middle column.
    func gaps(_ id: String, pitch: Float) throws -> (top: Int?, bottom: Int?) {
        let (l, w, h) = try render(id, pitch: pitch)
        // The left eye: the white pixels left of the middle.
        var xs: [Int] = []
        for y in 0..<h { for x in 0..<(w / 2) where l[y * w + x] > 0.8 { xs.append(x) } }
        let xs0 = try XCTUnwrap(xs.min(), "\(id) has a white"), x = (xs0 + (xs.max() ?? xs0)) / 2
        let col = (0..<h).map { l[$0 * w + x] }
        // The white's edges are its steepest steps (where a threshold crosses moves
        // with the light as the head turns under it).
        let whites = col.indices.filter { col[$0] > 0.7 }
        let top0 = try XCTUnwrap(whites.first), bottom0 = try XCTUnwrap(whites.last)
        let eyeTop = (top0 - 6...top0 + 6).max { col[$0 + 1] - col[$0 - 1] < col[$1 + 1] - col[$1 - 1] } ?? top0
        let eyeBottom = (bottom0 - 6...bottom0 + 6).max { col[$0 - 1] - col[$0 + 1] < col[$1 - 1] - col[$1 + 1] } ?? bottom0
        // The caps are what changes when they're taken away: their edges are the
        // last changed rows above the eye and the first below it.
        let bare = try render(id, pitch: pitch, caps: false).luma
        let capped = (0..<h).map { abs(l[$0 * w + x] - bare[$0 * w + x]) > 0.02 }
        let topEdge = (0..<eyeTop).last { capped[$0] }, bottomEdge = (eyeBottom + 1..<h).first { capped[$0] }
        return (topEdge.map { eyeTop - $0 }, bottomEdge.map { $0 - eyeBottom })
    }

    /// Before: the gaps changed by 27-30 px across these pitches. At pitch 0
    /// nothing moves: LidCapTests pins the approved web geometry there.
    func testTheGapBetweenEyeAndCapHoldsThroughANod() throws {
        for id in ["happy", "sleepy"] {
            let all = try Self.pitches.map { try gaps(id, pitch: $0) }
            let tops = all.compactMap(\.top), bottoms = all.compactMap(\.bottom)
            // Happy's bottom cap is shallow under the eye: a nod down carries it off
            // the outline there, so it's measured where it's still on the orb.
            XCTAssertGreaterThanOrEqual(tops.count, 5, "\(id): a top cap at every pitch")
            XCTAssertGreaterThanOrEqual(bottoms.count, 3, "\(id): a bottom cap at 3 pitches at least: \(all)")
            XCTAssertLessThanOrEqual((tops.max() ?? 0) - (tops.min() ?? 0), 2, "\(id): eye to top cap across pitch \(Self.pitches): \(tops)")
            XCTAssertLessThanOrEqual((bottoms.max() ?? 0) - (bottoms.min() ?? 0), 2, "\(id): eye to bottom cap: \(bottoms)")
        }
    }
}
