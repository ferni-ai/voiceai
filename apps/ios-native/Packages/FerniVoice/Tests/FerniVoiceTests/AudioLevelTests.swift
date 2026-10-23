import Synchronization
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

    /// The first audible buffer after arming runs the action once; silence
    /// and later buffers don't (tap to first word on the device).
    func testTheFirstSoundIsReportedOnce() {
        let meter = AudioLevelMeter()
        let heard = Mutex(0)
        meter.onFirstSound { heard.withLock { $0 += 1 } }
        Array(repeating: Float(0), count: 480).withUnsafeBufferPointer { meter.feed($0) }
        XCTAssertEqual(heard.withLock { $0 }, 0, "silence isn't a sound")
        sine(amplitude: 0.5).withUnsafeBufferPointer { meter.feed($0) }
        sine(amplitude: 0.5).withUnsafeBufferPointer { meter.feed($0) }
        XCTAssertEqual(heard.withLock { $0 }, 1, "once")
        meter.onFirstSound { heard.withLock { $0 += 10 } }
        sine(amplitude: 0.5).withUnsafeBufferPointer { meter.feed($0) }
        XCTAssertEqual(heard.withLock { $0 }, 11, "armed again, for the next call")
    }
}
