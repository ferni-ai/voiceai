import SwiftUI
import XCTest
@testable import FerniDesign

/// Prototype parity (2026-10-19): the feelings with weight beyond sparkles.
/// When Ferni takes on an expression whose family has one, it appears once
/// (the prototype's playFx): z's drift up when tired, a bead of sweat when
/// nervous, a ? when confused, a ! when surprised, hearts when warm.
@MainActor
final class ExpressionParticleTests: XCTestCase {
    private typealias Kind = AliveRig.Particle.Kind

    /// The most of each kind on screen at once over `seconds` after the expression starts.
    private func shown(_ expression: String, seconds: Double = 2.5, reduceMotion: Bool = false,
                       each: (AliveRig) -> Void = { _ in }) -> [Kind: Int] {
        let rig = AliveRig(seed: 3)
        rig.reduceMotion = reduceMotion
        var t = 0.0
        while t < 0.5 { t += 1.0 / 60; _ = rig.frame(at: t) }
        rig.expression = expression
        var most: [Kind: Int] = [:]
        while t < 0.5 + seconds {
            t += 1.0 / 60
            _ = rig.frame(at: t)
            each(rig)
            for kind in Set(rig.particles.map(\.kind)) {
                most[kind] = max(most[kind] ?? 0, rig.particles.filter { $0.kind == kind }.count)
            }
        }
        return most
    }

    func testTiredDriftsZsUpward() {
        var heights: [Double] = []
        let most = shown("sleepy") { rig in
            if let z = rig.particles.first(where: { $0.kind == .z }) { heights.append(z.y) }
        }
        XCTAssertEqual(most[.z], 3, "three, one after another")
        XCTAssertGreaterThan(heights.last ?? 0, heights.first ?? 0, "drifting up")
    }

    func testNervousBeadsOneDropOfSweat() {
        XCTAssertEqual(shown("nervous")[.sweat], 1)
    }

    func testConfusedAsksAndSurprisedExclaims() {
        XCTAssertEqual(shown("confused")[.question], 1)
        XCTAssertEqual(shown("surprised")[.bang], 1)
    }

    /// Love floats hearts; the other warm faces don't (expression audit P1 #10).
    func testLoveFloatsHeartsAndSupportDoesNot() {
        XCTAssertGreaterThanOrEqual(shown("loving")[.heart] ?? 0, 2)
        XCTAssertEqual(shown("supportive")[.heart] ?? 0, 0)
        XCTAssertEqual(shown("warm")[.heart] ?? 0, 0)
    }

    /// Once when the feeling arrives, not a stream for as long as it lasts.
    func testOncePerExpressionNotAStream() {
        let rig = AliveRig(seed: 4)
        var t = 0.0
        while t < 0.5 { t += 1.0 / 60; _ = rig.frame(at: t) }
        rig.expression = "nervous"
        while t < 4 { t += 1.0 / 60; _ = rig.frame(at: t) }
        var later = false
        while t < 8 { t += 1.0 / 60; _ = rig.frame(at: t); later = later || rig.particles.contains { $0.kind == .sweat } }
        XCTAssertFalse(later)
    }

    func testANeutralFaceHasNone() {
        XCTAssertTrue(shown("neutral").isEmpty)
    }

    /// Each one is actually drawn: alone on a clear canvas, it leaves pixels.
    func testEachFeelingIsDrawn() throws {
        for kind in [Kind.z, .sweat, .question, .bang] {
            let particle = AliveRig.Particle(kind: kind, x: 0, y: 0, size: 0.3, alpha: 1)
            let view = AliveParticles(particles: [particle], centre: CGPoint(x: 50, y: 50), radius: 100)
                .frame(width: 100, height: 100)
            let renderer = ImageRenderer(content: view)
            renderer.scale = 1
            let image = try XCTUnwrap(renderer.cgImage, "\(kind)")
            XCTAssertGreaterThan(Self.inkedPixels(image), 20, "\(kind) draws something")
        }
        let none = ImageRenderer(content: AliveParticles(particles: [], centre: .zero, radius: 100).frame(width: 100, height: 100))
        XCTAssertEqual(Self.inkedPixels(try XCTUnwrap(none.cgImage)), 0)
    }

    private static func inkedPixels(_ image: CGImage) -> Int {
        let w = image.width, h = image.height
        var data = [UInt8](repeating: 0, count: w * h * 4)
        let context = CGContext(data: &data, width: w, height: h, bitsPerComponent: 8, bytesPerRow: w * 4,
                                space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
        context.draw(image, in: CGRect(x: 0, y: 0, width: w, height: h))
        return stride(from: 3, to: data.count, by: 4).filter { data[$0] > 32 }.count
    }

    /// Reduce Motion keeps the feelings, held still and faded in and out
    /// (it removed them all, so confused read as neutral: expression audit
    /// P1 #7). The sparkle bursts, which are only motion, don't play.
    func testReduceMotionHoldsTheFeelingsStill() {
        for (id, kind) in [("confused", Kind.question), ("sleepy", .z), ("nervous", .sweat), ("loving", .heart)] {
            var spots = Set<String>(), alphas: [Double] = [], frames = 0
            let most = shown(id, reduceMotion: true) { rig in
                let mine = rig.particles.filter { $0.kind == kind }
                if !mine.isEmpty { frames += 1 }
                for p in mine { spots.insert("\(p.x),\(p.y)"); alphas.append(p.alpha) }
            }
            XCTAssertGreaterThanOrEqual(most[kind] ?? 0, 1, "\(id): its \(kind) stays")
            XCTAssertGreaterThan(frames, 20, "\(id): on screen a while")
            // Each one where it appeared: as many places as there are of them.
            XCTAssertEqual(spots.count, most[kind] ?? 0, "\(id): they don't drift, rise or fall")
            XCTAssertGreaterThan(alphas.max() ?? 0, 0.9, "\(id): faded in")
            XCTAssertLessThan(alphas.min() ?? 1, 0.3, "\(id): from nothing")
        }
        XCTAssertNil(shown("joyful", reduceMotion: true)[.sparkle], "no sparkle bursts")
        XCTAssertNotNil(shown("joyful")[.sparkle], "which play with motion")
    }
}
