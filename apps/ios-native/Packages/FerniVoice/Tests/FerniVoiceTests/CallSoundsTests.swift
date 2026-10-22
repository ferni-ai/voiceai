import AVFAudio
import LiveKit
import XCTest
@testable import FerniVoice

/// The call's sounds join LiveKit's engine on its output side: a player on
/// the main mixer (what reaches the speaker, so the echo canceller's
/// reference), never on the microphone's side.
final class CallSoundsTests: XCTestCase {
    func testThePlayerJoinsTheEnginesMainMixerOnAFreeInput() {
        let engine = AVAudioEngine()
        let voice = AVAudioPlayerNode() // stands in for Ferni's voice, on input 0
        engine.attach(voice)
        engine.connect(voice, to: engine.mainMixerNode, format: CallSounds.format)
        let sounds = CallSounds()
        _ = sounds.engineDidCreate(engine)
        XCTAssertFalse(sounds.isConnected(in: engine), "not before the engine starts")

        _ = sounds.engineWillStart(engine, isPlayoutEnabled: true, isRecordingEnabled: true)
        XCTAssertTrue(sounds.isConnected(in: engine))
        let player = engine.attachedNodes.compactMap { $0 as? AVAudioPlayerNode }.first { $0 !== voice }
        let points = player.map { engine.outputConnectionPoints(for: $0, outputBus: 0) } ?? []
        XCTAssertEqual(points.count, 1)
        XCTAssertTrue(points.first?.node === engine.mainMixerNode, "on the output side")
        XCTAssertNotEqual(points.first?.bus, 0, "Ferni's voice keeps its input")
        XCTAssertFalse(engine.outputConnectionPoints(for: voice, outputBus: 0).isEmpty, "and stays connected")

        _ = sounds.engineWillStart(engine, isPlayoutEnabled: true, isRecordingEnabled: true)
        XCTAssertEqual(player.map { engine.outputConnectionPoints(for: $0, outputBus: 0).count }, 1, "connected once")

        _ = sounds.engineWillRelease(engine)
        XCTAssertFalse(engine.attachedNodes.contains { $0 === player }, "gone with the engine")
    }

    /// Installed after LiveKit's own observers (the session's, then the
    /// mixer's), and reached through them: linked the way LiveKit links its
    /// chain, an engine handed to the first one ends with the sounds' player
    /// on the main mixer, beside the mixer observer's own nodes.
    func testTheSoundsComeAfterLiveKitsObserversAndAreReachedThroughThem() throws {
        AudioManager.shared.audioSession.isAutomaticConfigurationEnabled = false
        let sounds = CallSounds()
        var chain = CallSounds.chain(sounds)
        XCTAssertEqual(chain.count, 3)
        XCTAssertTrue(chain[0] as AnyObject === AudioManager.shared.audioSession, "the session's first")
        XCTAssertTrue(chain[1] as AnyObject === AudioManager.shared.mixer, "then the mixer's")
        XCTAssertTrue(chain.last as AnyObject === sounds, "the sounds last")
        defer { for i in chain.indices { chain[i].next = nil } }
        for i in 0 ..< chain.count - 1 { chain[i].next = chain[i + 1] } // as AudioManager.buildEngineObserverChain

        let engine = AVAudioEngine()
        _ = chain[0].engineDidCreate(engine)
        XCTAssertGreaterThan(engine.attachedNodes.count, 3, "the mixer observer attached its nodes")
        _ = chain[0].engineWillStart(engine, isPlayoutEnabled: true, isRecordingEnabled: true)
        XCTAssertTrue(sounds.isConnected(in: engine), "the sounds were reached and connected")
        _ = chain[0].engineWillRelease(engine)
        XCTAssertFalse(sounds.isConnected(in: engine))
    }

    func testNothingPlaysWithoutARunningEngine() throws {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("tick-\(UUID().uuidString).caf")
        defer { try? FileManager.default.removeItem(at: url) }
        let format = try XCTUnwrap(AVAudioFormat(standardFormatWithSampleRate: 48_000, channels: 1))
        let tick = try XCTUnwrap(AVAudioPCMBuffer(pcmFormat: format, frameCapacity: 480))
        tick.frameLength = 480
        try AVAudioFile(forWriting: url, settings: format.settings).write(from: tick)

        let sounds = CallSounds()
        XCTAssertFalse(sounds.play(url, volume: 0.6), "no engine")
        let engine = AVAudioEngine()
        _ = sounds.engineDidCreate(engine)
        _ = sounds.engineWillStart(engine, isPlayoutEnabled: true, isRecordingEnabled: true)
        XCTAssertFalse(sounds.play(url, volume: 0.6), "an engine that isn't running")
    }

    func testASoundIsConvertedToTheEnginesFormat() throws {
        let source = try XCTUnwrap(AVAudioFormat(standardFormatWithSampleRate: 44_100, channels: 2))
        let buffer = try XCTUnwrap(AVAudioPCMBuffer(pcmFormat: source, frameCapacity: 4410))
        buffer.frameLength = 4410
        let converted = try XCTUnwrap(CallSounds.convert(buffer))
        XCTAssertEqual(converted.format, CallSounds.format)
        XCTAssertEqual(Double(converted.frameLength), 4800, accuracy: 64, "0.1 s at 48 kHz")
    }
}
