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
/// When the system never activates a call's audio, the call takes it itself
/// (`activate(systemOwned: false)`), and a late word from the system's
/// abandoned call leaves that audio on.
// The observer token is only read in deinit; the call's state is behind a lock.
public final class SystemCallAudio: CallAudio, @unchecked Sendable {
    public let interruptions: AsyncStream<AudioInterruption>
    private let observer: NSObjectProtocol
    private let systemManagesCalls: Bool
    private let engine: @Sendable (AudioEngineAvailability) throws -> Void
    private let session: any AudioSessionSettings
    /// The app activated the session itself for a call (not the system).
    private let ownActive = OSAllocatedUnfairLock(initialState: false)
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
        // The system activates it and tells us (systemAudio(active:)).
        guard !systemOwned else { return }
        setEngine(.default)
        try session.setActive(true, options: [])
        ownActive.withLock { $0 = true }
    }

    public func deactivate(systemOwned: Bool) {
        if !systemOwned {
            ownActive.withLock { $0 = false }
            try? session.setActive(false, options: .notifyOthersOnDeactivation)
        }
        // Ready for the next call, which the system will own again.
        if systemManagesCalls { setEngine(.none) }
    }

    public func systemAudio(active: Bool) {
        if active { try? configure() }
        // The app took the audio over when the system never activated it: a
        // late word from the system's abandoned call leaves the engine on.
        setEngine(active || ownActive.withLock({ $0 }) ? .default : .none)
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
    }

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
    func setActive(_ active: Bool, options: AVAudioSession.SetActiveOptions) throws
}

extension AVAudioSession: AudioSessionSettings {}
