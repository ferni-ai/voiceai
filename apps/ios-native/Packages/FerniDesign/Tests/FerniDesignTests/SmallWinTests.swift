import CoreGraphics
import ImageIO
import UniformTypeIdentifiers
import XCTest
@testable import FerniDesign

/// Expression audit P1 #13 (2026-10-20): the small win (celebration_small,
/// what high engagement plays) showed nothing at phone size: the listening
/// face, a 4 px hop and a 2° turn. It now shows: a happy face for the beat
/// and a nod, on top of the tokens' hop, glow and sparkles.
@MainActor
final class SmallWinTests: XCTestCase {
    /// The face a light-theme render of these uniforms shows (the audit's crop).
    private func crop(_ u: AliveUniforms) throws -> [Float] {
        var u = u
        let w = ExpressionDistinctnessTests.width, h = ExpressionDistinctnessTests.height
        u.light(dark: false, roomTop: linear(hex: "#faf8f5"), roomBottom: linear(hex: "#efe9e0"))
        u.frame(size: SIMD2(Float(w), Float(h)), radius: Float(AvatarView.radius / AvatarView.canvas.width) * Float(w),
                below: Float(AvatarView.lift / AvatarView.canvas.width) * Float(w))
        let bytes = try XCTUnwrap(AliveRenderer.shared?.image(u, width: w, height: h))
        return ExpressionDistinctnessTests.crop(bytes)
    }

    /// The same rig twice from one seed, listening; the first plays the small
    /// win at 1 s. Per frame: the time since, both rigs' uniforms and the face.
    private func twins(reduceMotion: Bool = false) -> [(t: Double, a: AliveUniforms, b: AliveUniforms, face: String)] {
        let a = AliveRig(persona: .ferni, seed: 51), b = AliveRig(persona: .ferni, seed: 51)
        for rig in [a, b] {
            rig.activity = .listening
            rig.expression = "listening"
            rig.reduceMotion = reduceMotion
        }
        var t = 0.0
        while t < 1 { t += 1.0 / 60; _ = a.frame(at: t); _ = b.frame(at: t) }
        a.play(sequence: "celebration_small")
        var out: [(Double, AliveUniforms, AliveUniforms, String)] = []
        while t < 2.6 {
            t += 1.0 / 60
            out.append((t - 1, a.frame(at: t), b.frame(at: t), a.faceID()))
        }
        return out
    }

    func testTheSmallWinShowsAHappyFaceThenHisOwn() {
        let frames = twins()
        XCTAssertTrue(frames.filter { $0.t < 0.8 }.allSatisfy { $0.face == "happy" },
                      "happy through the beat: \(Set(frames.filter { $0.t < 0.8 }.map(\.face)))")
        XCTAssertEqual(frames.last?.face, "listening", "then back to listening")
    }

    /// A nod: the head dips, comes up, dips less, and settles.
    func testTheSmallWinNods() {
        let frames = twins()
        let pitch = frames.map { Double($0.a.lean.y - $0.b.lean.y) }
        let deepest = pitch.min() ?? 0
        XCTAssertLessThan(deepest, -0.07, "the head dips (radians): \(deepest)")
        XCTAssertEqual(pitch.last ?? 1, 0, accuracy: 0.01, "and settles")
    }

    /// The point of the item: the change is visible in the rendered face,
    /// well past the distinctness gate's "near-identical" line.
    func testTheSmallWinIsVisible() throws {
        let frames = twins()
        var peak: Float = 0
        for f in frames where Int(f.t * 60) % 6 == 0 {
            peak = max(peak, ExpressionDistinctnessTests.difference(try crop(f.a), try crop(f.b)))
        }
        XCTAssertGreaterThan(peak, ExpressionDistinctnessTests.twinThreshold * 4, "peak face change \(peak)")
    }

    /// Reduce Motion keeps the happy face (a pose, not motion).
    func testReduceMotionKeepsTheFace() {
        let frames = twins(reduceMotion: true)
        XCTAssertTrue(frames.filter { $0.t < 0.8 }.allSatisfy { $0.face == "happy" })
    }

    /// Evidence (FERNI_AUDIT_DIR, FERNI_AUDIT_TAG): the face with the small
    /// win every 0.1 s for its first second, then the same frames without it,
    /// and the measured peak change and dip in a text file.
    func testWriteSmallWinFrames() throws {
        let env = ProcessInfo.processInfo.environment
        guard let dir = env["FERNI_AUDIT_DIR"] else { throw XCTSkip("FERNI_AUDIT_DIR unset") }
        let tag = env["FERNI_AUDIT_TAG"] ?? "frame"
        try FileManager.default.createDirectory(atPath: dir, withIntermediateDirectories: true)
        let w = ExpressionDistinctnessTests.width, h = ExpressionDistinctnessTests.height
        func png(_ u: AliveUniforms, _ name: String) throws {
            var u = u
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
            let dest = try XCTUnwrap(CGImageDestinationCreateWithURL(URL(fileURLWithPath: dir).appending(path: name) as CFURL,
                                                                     UTType.png.identifier as CFString, 1, nil))
            CGImageDestinationAddImage(dest, try XCTUnwrap(ctx.makeImage()), nil)
            XCTAssertTrue(CGImageDestinationFinalize(dest))
        }
        let frames = twins()
        var peak: Float = 0
        for f in frames where Int((f.t * 60).rounded()) % 6 == 0 {
            peak = max(peak, ExpressionDistinctnessTests.difference(try crop(f.a), try crop(f.b)))
            guard f.t <= 1.05 else { continue }
            try png(f.a, String(format: "smallwin-%@-with-%.1fs.png", tag, f.t))
            try png(f.b, String(format: "smallwin-%@-without-%.1fs.png", tag, f.t))
        }
        let dip = frames.map { Double($0.a.lean.y - $0.b.lean.y) }.min() ?? 0
        try "peak face change \(peak)\ndeepest dip \(dip) rad\n".write(toFile: dir + "/smallwin-\(tag).txt", atomically: true, encoding: .utf8)
    }
}
