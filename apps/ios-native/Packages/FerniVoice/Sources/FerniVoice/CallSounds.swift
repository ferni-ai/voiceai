import AVFAudio
import LiveKit
import os

/// The call's few sounds, played inside LiveKit's own audio engine: a player
/// on the engine's main mixer, beside Ferni's voice. There they are part of
/// voice processing's echo reference, so the microphone's echo canceller
/// removes them as it removes his voice (a sound from another player reaches
/// the mic as if someone in the room had made it, and can read as the person
/// speaking), and voice processing doesn't duck them as other audio.
///
/// Not `mixer.capture(appAudio:)`: that feeds the microphone's side, so Ferni
/// would hear the sounds. Not LiveKit's SoundPlayer either: its local sounds
/// play on an engine of their own, outside the echo reference.
public final class CallSounds: AudioEngineObserver, @unchecked Sendable {
    public var next: (any AudioEngineObserver)? {
        get { state.withLockUnchecked { $0.next } }
        set { state.withLockUnchecked { $0.next = newValue } }
    }

    /// The format every sound is converted to, once, when it is first played.
    static let format = AVAudioFormat(standardFormatWithSampleRate: 48_000, channels: 1)!

    private struct State {
        var next: (any AudioEngineObserver)?
        weak var engine: AVAudioEngine?
        var buffers: [URL: AVAudioPCMBuffer] = [:]
    }

    private let player = AVAudioPlayerNode()
    private let state = OSAllocatedUnfairLock(uncheckedState: State()) // engine, buffers: AVFoundation types
    private let log = Logger(subsystem: "com.sethdford.ferni", category: "audio")

    public init() {}

    /// Adds these sounds after LiveKit's own observers (the session's and the
    /// mixer's, which keep doing what they did).
    public static func install(_ sounds: CallSounds) {
        #if os(iOS) || os(visionOS) || os(tvOS)
        AudioManager.shared.set(engineObservers: [AudioManager.shared.audioSession, AudioManager.shared.mixer, sounds])
        #else
        AudioManager.shared.set(engineObservers: [AudioManager.shared.mixer, sounds])
        #endif
    }

    /// Plays the sound at `url` in the call's engine. False when the engine
    /// isn't running (no call audio yet): the caller decides what else to do.
    @discardableResult
    public func play(_ url: URL, volume: Float) -> Bool {
        guard let engine = state.withLockUnchecked({ $0.engine }), engine.isRunning, isConnected(in: engine),
              let buffer = buffer(for: url) else { return false }
        player.volume = volume
        player.scheduleBuffer(buffer, at: nil, options: [], completionHandler: nil)
        if !player.isPlaying { player.play() }
        return true
    }

    // MARK: - The engine's life

    public func engineDidCreate(_ engine: AVAudioEngine) -> Int {
        engine.attach(player)
        state.withLockUnchecked { $0.engine = engine }
        return next?.engineDidCreate(engine) ?? 0
    }

    /// After the engine's own connections (made before it starts), so the
    /// player takes a free input of the main mixer and never one LiveKit uses.
    public func engineWillStart(_ engine: AVAudioEngine, isPlayoutEnabled: Bool, isRecordingEnabled: Bool) -> Int {
        if isPlayoutEnabled, player.engine === engine, !isConnected(in: engine) {
            let mixer = engine.mainMixerNode
            engine.connect(player, to: mixer, fromBus: 0, toBus: mixer.nextAvailableInputBus, format: Self.format)
        }
        return next?.engineWillStart(engine, isPlayoutEnabled: isPlayoutEnabled, isRecordingEnabled: isRecordingEnabled) ?? 0
    }

    public func engineDidStop(_ engine: AVAudioEngine, isPlayoutEnabled: Bool, isRecordingEnabled: Bool) -> Int {
        let result = next?.engineDidStop(engine, isPlayoutEnabled: isPlayoutEnabled, isRecordingEnabled: isRecordingEnabled) ?? 0
        player.stop()
        return result
    }

    public func engineWillRelease(_ engine: AVAudioEngine) -> Int {
        let result = next?.engineWillRelease(engine) ?? 0
        player.stop()
        if player.engine === engine { engine.detach(player) }
        state.withLockUnchecked { $0.engine = nil }
        return result
    }

    // MARK: -

    func isConnected(in engine: AVAudioEngine) -> Bool {
        player.engine === engine && !engine.outputConnectionPoints(for: player, outputBus: 0).isEmpty
    }

    /// The sound, decoded and converted once.
    private func buffer(for url: URL) -> AVAudioPCMBuffer? {
        if let buffer = state.withLockUnchecked({ $0.buffers[url] }) { return buffer }
        do {
            let file = try AVAudioFile(forReading: url)
            guard let read = AVAudioPCMBuffer(pcmFormat: file.processingFormat, frameCapacity: AVAudioFrameCount(file.length)) else { return nil }
            try file.read(into: read)
            guard let converted = Self.convert(read) else { return nil }
            state.withLockUnchecked { $0.buffers[url] = converted }
            return converted
        } catch {
            log.error("Sound not read: \(error.localizedDescription, privacy: .public)")
            return nil
        }
    }

    static func convert(_ buffer: AVAudioPCMBuffer) -> AVAudioPCMBuffer? {
        if buffer.format == format { return buffer }
        guard let converter = AVAudioConverter(from: buffer.format, to: format) else { return nil }
        let ratio = format.sampleRate / buffer.format.sampleRate
        let capacity = AVAudioFrameCount(Double(buffer.frameLength) * ratio) + 1024
        guard let out = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: capacity) else { return nil }
        var fed = false
        var error: NSError?
        let status = converter.convert(to: out, error: &error) { _, inputStatus in
            if fed { inputStatus.pointee = .endOfStream; return nil }
            fed = true
            inputStatus.pointee = .haveData
            return buffer
        }
        return status == .error ? nil : out
    }
}
