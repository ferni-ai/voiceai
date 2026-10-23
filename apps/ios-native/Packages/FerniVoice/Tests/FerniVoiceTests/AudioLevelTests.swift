import XCTest
@testable import FerniVoice

/// The gated RMS level and its smoothing (ios-motion-spec §7.1 #8).
final class AudioLevelTests: XCTestCase {
    private func sine(amplitude: Float, frames: Int = 480) -> [Float] {
        (0..<frames).map { amplitude * sin(2 * .pi * 440 * Float($0) / 48_000) }
    }

    private func level(of samples: [Float]) -> Float {
        let meter = AudioLevelMeter()
        samples.withUnsafeBufferPointer { meter.feed($0) }
        return meter.level
    }

    func testSilenceIsZero() {
        XCTAssertEqual(level(of: Array(repeating: 0, count: 480)), 0)
    }

    func testAtTheGateIsZero() {
        XCTAssertEqual(level(of: Array(repeating: 0.02, count: 480)), 0, accuracy: 0.0001)
    }

    func testALoudVoiceClampsToOne() {
        XCTAssertEqual(level(of: sine(amplitude: 0.5)), 1)
    }

    func testAQuietVoiceIsSmallButThere() {
        // RMS of a 0.05 sine is 0.0354: (0.0354 - 0.02) * 4 ≈ 0.061.
        XCTAssertEqual(level(of: sine(amplitude: 0.05)), 0.061, accuracy: 0.003)
    }

    func testResetGoesQuiet() {
        let meter = AudioLevelMeter()
        sine(amplitude: 0.5).withUnsafeBufferPointer { meter.feed($0) }
        meter.reset()
        XCTAssertEqual(meter.level, 0)
    }
}
