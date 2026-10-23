import SwiftUI
import UIKit
import XCTest
@testable import FerniDesign

/// The renderer drawn to pixels (ios-motion-spec §7.2), without a snapshot
/// library: frames are built by hand, so every run draws the same image.
@MainActor
final class AvatarRendererTests: XCTestCase {
    private let side = 200

    private func pixels(_ frame: AvatarFrame, on background: Color) -> [UInt32] {
        let view = ZStack {
            background
            Canvas { context, size in AvatarRenderer.draw(frame, in: &context, size: size) }
        }
        .frame(width: CGFloat(side), height: CGFloat(side))
        let renderer = ImageRenderer(content: view)
        renderer.scale = 1
        guard let cg = renderer.cgImage else { XCTFail("no image"); return [] }
        var data = [UInt32](repeating: 0, count: side * side)
        let ctx = CGContext(data: &data, width: side, height: side, bitsPerComponent: 8, bytesPerRow: side * 4,
                            space: CGColorSpaceCreateDeviceRGB(),
                            bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
        ctx.draw(cg, in: CGRect(x: 0, y: 0, width: side, height: side))
        return data
    }

    private func frame(_ activity: AvatarActivity, _ expression: AvatarExpression, level: Double = 0) -> AvatarFrame {
        var f = AvatarFrame()
        f.activity = activity
        f.expression = expression
        f.level = level
        f.time = 10.0 // past the wake; no blink scheduled here
        f.lowPower = true // no glow, so only the face differs
        return f
    }

    private func differing(_ a: [UInt32], _ b: [UInt32]) -> Double {
        Double(zip(a, b).filter { $0 != $1 }.count) / Double(a.count)
    }

    /// B5: the lids are a clip, so outside the face the background shows through
    /// untouched, on black and on white alike.
    func testNothingIsDrawnOutsideTheFaceOnAnyBackground() {
        for (background, value) in [(Color.black, UInt32(0xFF00_0000)), (Color.white, UInt32(0xFFFF_FFFF))] {
            let px = pixels(frame(.listening, .listening), on: background)
            for (x, y) in [(0, 0), (199, 0), (0, 199), (199, 199), (100, 2), (2, 100)] {
                XCTAssertEqual(px[y * side + x], value, "pixel \(x),\(y) on \(background)")
            }
        }
    }

    /// B17: listening, thinking and speaking must look different at a glance.
    func testTurnFacesAreDistinct() {
        let listening = pixels(frame(.listening, .listening), on: .black)
        let thinking = pixels(frame(.thinking, .thinking), on: .black)
        let speaking = pixels(frame(.speaking, .speaking, level: 0.6), on: .black)
        XCTAssertGreaterThanOrEqual(differing(listening, thinking), 0.03)
        XCTAssertGreaterThanOrEqual(differing(listening, speaking), 0.03)
        XCTAssertGreaterThanOrEqual(differing(thinking, speaking), 0.03)
    }

    func testTheSameFrameAlwaysDrawsTheSameImage() {
        let f = frame(.speaking, .speaking, level: 0.4)
        XCTAssertEqual(pixels(f, on: .black), pixels(f, on: .black))
    }

    /// Inside the face only: the halo also follows the voice, the mouth must too.
    private func face(_ px: [UInt32]) -> [UInt32] {
        px.enumerated().compactMap { i, p in
            let dx = Double(i % side) - 100, dy = Double(i / side) - 100
            return (dx * dx + dy * dy).squareRoot() < 80 ? p : nil
        }
    }

    /// Under Reduce Motion the body doesn't squash, so only the mouth can differ.
    func testTheVoiceOpensTheMouth() {
        var quietFrame = frame(.speaking, .speaking, level: 0)
        quietFrame.reduceMotion = true
        var loudFrame = quietFrame
        loudFrame.level = 1
        let quiet = face(pixels(quietFrame, on: .black))
        let loud = face(pixels(loudFrame, on: .black))
        XCTAssertGreaterThanOrEqual(differing(quiet, loud), 0.01)
    }

    func testReduceMotionKeepsTheFaceStill() {
        var a = frame(.listening, .listening)
        var b = a
        a.reduceMotion = true
        b.reduceMotion = true
        b.time = a.time + 1.1 // a different breath and gaze moment
        XCTAssertLessThan(differing(pixels(a, on: .black), pixels(b, on: .black)), 0.005)
    }

    func testTheWakeOpensTheEyes() {
        var asleep = frame(.idle, .neutral)
        asleep.time = 0
        let awake = frame(.idle, .neutral)
        XCTAssertGreaterThanOrEqual(differing(pixels(asleep, on: .black), pixels(awake, on: .black)), 0.01)
    }

    func testBlinksAreBriefAndRoughlyEveryFewSeconds() {
        let samples = stride(from: 0.0, to: 60.0, by: 0.01).map { AvatarMotion.blink(at: $0) }
        let closedFraction = Double(samples.filter { $0 < 0.5 }.count) / Double(samples.count)
        XCTAssertGreaterThan(closedFraction, 0.005)
        XCTAssertLessThan(closedFraction, 0.05)
        XCTAssertEqual(AvatarMotion.blink(at: 12.34), AvatarMotion.blink(at: 12.34))
    }
}
