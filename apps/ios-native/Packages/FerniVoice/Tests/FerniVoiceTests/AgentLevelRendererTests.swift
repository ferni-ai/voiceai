import AVFoundation
import XCTest
@testable import FerniVoice

/// Critic M11: the bridge from LiveKit's decoded audio to the level that
/// moves Ferni, for both sample formats LiveKit can hand over.
final class AgentLevelRendererTests: XCTestCase {
    private func buffer(_ format: AVAudioCommonFormat, amplitude: Float, frames: Int = 480) -> AVAudioPCMBuffer {
        let fmt = AVAudioFormat(commonFormat: format, sampleRate: 48_000, channels: 1, interleaved: false)!
        let buf = AVAudioPCMBuffer(pcmFormat: fmt, frameCapacity: AVAudioFrameCount(frames))!
        buf.frameLength = AVAudioFrameCount(frames)
        for i in 0..<frames {
            let x = amplitude * sin(2 * .pi * 440 * Float(i) / 48_000)
            if let f = buf.floatChannelData { f[0][i] = x } else { buf.int16ChannelData![0][i] = Int16(x * 32768) }
        }
        return buf
    }

    private func level(_ buf: AVAudioPCMBuffer) -> Float {
        let meter = AudioLevelMeter()
        AgentLevelRenderer(meter: meter).render(pcmBuffer: buf)
        return meter.level
    }

    func testFloatAudioSetsTheLevel() {
        XCTAssertEqual(level(buffer(.pcmFormatFloat32, amplitude: 0.05)), 0.061, accuracy: 0.003)
        XCTAssertEqual(level(buffer(.pcmFormatFloat32, amplitude: 0.5)), 1)
    }

    /// int16 is scaled to ±1 first: a quiet voice stays quiet rather than clamping to full.
    func testInt16AudioIsScaledLikeFloat() {
        XCTAssertEqual(level(buffer(.pcmFormatInt16, amplitude: 0.05)), 0.061, accuracy: 0.003)
        XCTAssertEqual(level(buffer(.pcmFormatInt16, amplitude: 0.5)), 1)
    }

    /// A long int16 buffer is measured on its first 4096 frames, not dropped.
    func testALongInt16BufferStillCounts() {
        XCTAssertEqual(level(buffer(.pcmFormatInt16, amplitude: 0.05, frames: 9600)), 0.061, accuracy: 0.003)
    }

    func testAnEmptyBufferLeavesTheLevelAlone() {
        let meter = AudioLevelMeter()
        let renderer = AgentLevelRenderer(meter: meter)
        renderer.render(pcmBuffer: buffer(.pcmFormatFloat32, amplitude: 0.5))
        renderer.render(pcmBuffer: buffer(.pcmFormatInt16, amplitude: 0, frames: 0))
        XCTAssertEqual(meter.level, 1)
    }
}
