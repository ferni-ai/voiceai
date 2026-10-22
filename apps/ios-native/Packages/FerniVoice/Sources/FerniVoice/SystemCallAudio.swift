import AVFAudio
import Foundation
import LiveKit
import os

/// AVAudioSession set up for a conversation: voice-chat processing (echo
/// cancellation, voice-tuned gain), the speaker by default, and Bluetooth and
/// AirPlay routes when connected. LiveKit's automatic setup would pick
/// `.videoChat` for the speaker, so the app configures the session itself.
///
/// Under LiveCommunicationKit the system owns activation. Per LiveKit's
/// CallKit contract (README, "Integration with CallKit") the audio engine is
/// unavailable until the system activates the session and again after it
/// takes it back; otherwise WebRTC can start its audio unit on a session the
/// system hasn't granted, and the call is deaf or silent (critic C1).
///
/// The system activates the session once per call, not once per room. So the
/// engine stays available between the rooms of one call (a rejoin after a
/// drop, the retry when Ferni didn't join) and goes off only when the call
/// ends or the system takes the audio back. It used to go off at every room's
/// end, and the next room, being system-owned, never turned it back on: no mic
/// and no speaker for the rest of a call that looked live.
// The observer token is only read in deinit; the system's state is behind a lock.
public final class SystemCallAudio: CallAudio, @unchecked Sendable {
    public let interruptions: AsyncStream<AudioInterruption>
    private let observer: NSObjectProtocol
    private let systemManagesCalls: Bool
    private let engine: @Sendable (AudioEngineAvailability) throws -> Void
    private let session: any AudioSessionSettings
    /// The system has activated this call's session (and not taken it back).
    private let systemActive = OSAllocatedUnfairLock(initialState: false)
    private let log = Logger(subsystem: "com.sethdford.ferni", category: "audio")

    /// - Parameters:
    ///   - systemManagesCalls: calls run on the system's call service
    ///     (false in the Simulator, which has none).
    ///   - engine: sets LiveKit's engine availability; tests record it.
    ///   - session: the audio session; tests record what is asked of it.
    public init(systemManagesCalls: Bool,
                engine: @escaping @Sendable (AudioEngineAvailability) throws -> Void = {
                    try AudioManager.shared.setEngineAvailability($0)
                },
                session: any AudioSessionSettings = AVAudioSession.sharedInstance()) {
        self.systemManagesCalls = systemManagesCalls
        self.engine = engine
        self.session = session
        AudioManager.shared.audioSession.isAutomaticConfigurationEnabled = false
        let (stream, continuation) = AsyncStream.makeStream(of: AudioInterruption.self)
        interruptions = stream
        observer = NotificationCenter.default.addObserver(
            forName: AVAudioSession.interruptionNotification, object: nil, queue: nil
        ) { note in
            guard let raw = note.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt,
                  let type = AVAudioSession.InterruptionType(rawValue: raw) else { return }
            switch type {
            case .began:
                continuation.yield(.began)
            case .ended:
                let options = (note.userInfo?[AVAudioSessionInterruptionOptionKey] as? UInt)
                    .map(AVAudioSession.InterruptionOptions.init(rawValue:)) ?? []
                continuation.yield(.ended(shouldResume: options.contains(.shouldResume)))
            @unknown default:
                break
            }
        }
        // As early as possible, before any room connects.
        if systemManagesCalls { setEngine(.none) }
    }

    deinit { NotificationCenter.default.removeObserver(observer) }

    public func requestMicrophone() async -> Bool {
        await AVAudioApplication.requestRecordPermission()
    }

    public func activate(systemOwned: Bool) throws {
        try configure()
        if systemOwned {
            // The system activates it and tells us (systemAudio(active:)). A
            // later room of the same call finds it already active: the engine
            // is available again for it. Never before the system's go (C1).
            if systemActive.withLock({ $0 }) { setEngine(.default) }
            return
        }
        setEngine(.default)
        try session.setActive(true, options: [])
    }

    public func deactivate(systemOwned: Bool) {
        if !systemOwned {
            try? session.setActive(false, options: .notifyOthersOnDeactivation)
        }
        // Between rooms the engine is left as it is: the system activates the
        // session once per call (callEnded and systemAudio(active: false) turn it off).
    }

    public func systemAudio(active: Bool) {
        systemActive.withLock { $0 = active }
        if active { try? configure() }
        setEngine(active ? .default : .none)
    }

    public func callEnded() {
        systemActive.withLock { $0 = false }
        // Ready for the next call, which the system will own again.
        if systemManagesCalls { setEngine(.none) }
    }

    public var engineState: String {
        let availability = AudioManager.shared.engineAvailability
        return "engine in \(availability.isInputAvailable) out \(availability.isOutputAvailable) running \(AudioManager.shared.isEngineRunning)"
    }

    private func configure() throws {
        try session.setCategory(
            .playAndRecord, mode: .voiceChat,
            options: [.defaultToSpeaker, .allowBluetoothHFP, .allowBluetoothA2DP, .allowAirPlay]
        )
        // Otherwise iOS silences every haptic while the mic records (B9).
        try session.setAllowHapticsAndSystemSoundsDuringRecording(true)
        // Automatic configuration is off, so the SDK never asks for a buffer.
        // 20 ms is the frame WebRTC processes; a larger one the system picks
        // on its own stutters the mixer. The sample rate is the system's.
        // A preference: the call still works if it's refused.
        do {
            try session.setPreferredIOBufferDuration(Self.ioBuffer)
        } catch {
            log.error("IO buffer not set: \(error.localizedDescription, privacy: .public)")
        }
    }

    /// The IO buffer a call asks for, in seconds.
    static let ioBuffer: TimeInterval = 0.02

    private func setEngine(_ availability: AudioEngineAvailability) {
        do {
            try engine(availability)
        } catch {
            log.error("Audio engine availability not set: \(error.localizedDescription, privacy: .public)")
        }
    }
}

/// What the call asks of the audio session; AVAudioSession in the app, a
/// recorder in tests.
public protocol AudioSessionSettings: AnyObject {
    func setCategory(_ category: AVAudioSession.Category, mode: AVAudioSession.Mode,
                     options: AVAudioSession.CategoryOptions) throws
    func setAllowHapticsAndSystemSoundsDuringRecording(_ inValue: Bool) throws
    func setPreferredIOBufferDuration(_ duration: TimeInterval) throws
    func setActive(_ active: Bool, options: AVAudioSession.SetActiveOptions) throws
}

extension AVAudioSession: AudioSessionSettings {}
