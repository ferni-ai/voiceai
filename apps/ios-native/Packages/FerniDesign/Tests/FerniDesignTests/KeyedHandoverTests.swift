import CoreGraphics
import ImageIO
import UniformTypeIdentifiers
import XCTest
@testable import FerniDesign

/// A keyed moment ends on the pose the face rests in, so the springs take
/// over without a jump. Expression audit P0 #2 (2026-10-20): every goodbye
/// closed Ferni's eyes, then they snapped open ~2.8 s later (lid 1.00 → 0.13
/// in 0.2 s) when the keys let go.
@MainActor
final class KeyedHandoverTests: XCTestCase {
    struct Trace { var top: [Double] = [], posY: [Double] = [], endIndex = 0 }

    /// The lid and height springs at 60 fps from the moment's start until
    /// 1.5 s after its last frame.
    func trace(_ moment: KeyedMoment) -> Trace {
        let rig = AliveRig(persona: .ferni, seed: 11)
        var t = 0.0
        while t < 1 { t += 1.0 / 60; _ = rig.frame(at: t) }
        rig.play(moment)
        let start = t, end = start + moment.end / 60 * rig.tempo
        var out = Trace()
        while t < end + 1.5 {
            t += 1.0 / 60
            _ = rig.frame(at: t)
            out.top.append((rig[.topL].x + rig[.topR].x) / 2)
            out.posY.append(rig[.posY].x)
            if t <= end { out.endIndex = out.top.count - 1 }
        }
        return out
    }

    func testEveryMomentHandsBackWithoutAJump() {
        for moment in KeyedMoment.allCases {
            let tr = trace(moment)
            let after = Array(tr.top[tr.endIndex...])
            let jump = zip(after, after.dropFirst()).map { abs($1 - $0) }.max() ?? 0
            XCTAssertLessThan(jump, 0.03, "\(moment): the lids move \(jump) in one frame after the keys let go")
            XCTAssertEqual(tr.top[tr.endIndex], after.last ?? 0, accuracy: 0.06,
                           "\(moment): the keys end at lid \(tr.top[tr.endIndex]), the face rests at \(after.last ?? 0)")
            let posAfter = Array(tr.posY[tr.endIndex...])
            XCTAssertEqual(tr.posY[tr.endIndex], posAfter.last ?? 0, accuracy: 0.05, "\(moment): the height hands back too")
        }
    }

    /// Evidence (FERNI_AUDIT_DIR, FERNI_AUDIT_TAG): goodbye rendered every
    /// 0.2 s from 2.0 s to 4.2 s after it starts, one PNG per frame.
    func testWriteGoodbyeFrames() throws {
        let env = ProcessInfo.processInfo.environment
        guard let dir = env["FERNI_AUDIT_DIR"] else { throw XCTSkip("FERNI_AUDIT_DIR unset") }
        let tag = env["FERNI_AUDIT_TAG"] ?? "frame"
        try FileManager.default.createDirectory(atPath: dir, withIntermediateDirectories: true)
        let rig = AliveRig(persona: .ferni, seed: 11)
        var t = 0.0
        while t < 1 { t += 1.0 / 60; _ = rig.frame(at: t) }
        rig.play(.goodbye)
        let start = t
        var shots = stride(from: 2.0, through: 4.2, by: 0.2).map { $0 }
        while let next = shots.first {
            t += 1.0 / 60
            var u = rig.frame(at: t)
            guard t - start >= next else { continue }
            shots.removeFirst()
            let w = ExpressionDistinctnessTests.width, h = ExpressionDistinctnessTests.height
            u.light(dark: false, roomTop: linear(hex: "#faf8f5"), roomBottom: linear(hex: "#efe9e0"))
            u.frame(size: SIMD2(Float(w), Float(h)), radius: Float(AvatarView.radius / AvatarView.canvas.width) * Float(w),
                    below: Float(AvatarView.lift / AvatarView.canvas.width) * Float(w))
            let bytes = try XCTUnwrap(AliveRenderer.shared?.image(u, width: w, height: h))
            let info = CGBitmapInfo(rawValue: CGImageAlphaInfo.premultipliedFirst.rawValue | CGBitmapInfo.byteOrder32Little.rawValue)
            let image = try XCTUnwrap(CGImage(width: w, height: h, bitsPerComponent: 8, bitsPerPixel: 32, bytesPerRow: w * 4,
                                              space: CGColorSpace(name: CGColorSpace.sRGB)!, bitmapInfo: info,
                                              provider: try XCTUnwrap(CGDataProvider(data: Data(bytes) as CFData)),
                                              decode: nil, shouldInterpolate: false, intent: .defaultIntent))
            let ctx = try XCTUnwrap(CGContext(data: nil, width: w, height: h, bitsPerComponent: 8, bytesPerRow: 0,
                                              space: CGColorSpace(name: CGColorSpace.sRGB)!, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue))
            ctx.setFillColor(red: 0.98, green: 0.973, blue: 0.961, alpha: 1)
            ctx.fill(CGRect(x: 0, y: 0, width: w, height: h))
            ctx.draw(image, in: CGRect(x: 0, y: 0, width: w, height: h))
            let name = String(format: "goodbye-%@-%.1fs.png", tag, next)
            let dest = try XCTUnwrap(CGImageDestinationCreateWithURL(URL(fileURLWithPath: dir).appending(path: name) as CFURL,
                                                                     UTType.png.identifier as CFString, 1, nil))
            CGImageDestinationAddImage(dest, try XCTUnwrap(ctx.makeImage()), nil)
            XCTAssertTrue(CGImageDestinationFinalize(dest))
        }
    }

    /// Goodbye still closes the eyes (it's a goodbye), and opens them again
    /// slowly, the way waking does, before the keys let go.
    func testGoodbyeClosesTheEyesThenOpensThemSlowly() {
        let tr = trace(.goodbye)
        let closed = tr.top.firstIndex { $0 > 0.95 }
        XCTAssertNotNil(closed, "the eyes close")
        guard let closed else { return }
        let reopen = tr.top[closed...].firstIndex { $0 < 0.3 }
        XCTAssertNotNil(reopen, "and open again")
        guard let reopen else { return }
        XCTAssertGreaterThanOrEqual(reopen - closed, 24, "closed for a beat (\(reopen - closed) frames), not a blink")
        XCTAssertLessThanOrEqual(reopen, tr.endIndex, "open before the keys let go")
    }

    /// Critic M4: keep the drooped-lid goodbye. He settles with his lids down
    /// (the settle face, serene), not back at neutral's, and holds it.
    func testGoodbyeSettlesWithDroopedLids() {
        let tr = trace(.goodbye)
        XCTAssertGreaterThan(tr.top[tr.endIndex], 0.2, "the keys end drooped: \(tr.top[tr.endIndex])")
        XCTAssertGreaterThan(tr.top.last ?? 0, 0.2, "and 1.5 s later he's still settled: \(tr.top.last ?? 0) (neutral is 0.108)")
    }
}
