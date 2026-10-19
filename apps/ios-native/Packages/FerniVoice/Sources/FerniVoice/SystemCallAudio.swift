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
// Immutable after init (the observer token is only read in deinit).
public final class SystemCallAudio: CallAudio, @unchecked Sendable {
    public let interruptions: AsyncStream<AudioInterruption>
    private let observer: NSObjectProtocol
    private let systemManagesCalls: Bool
    private let log = Logger(subsystem: "com.sethdford.ferni", category: "audio")

    /// - Parameter systemManagesCalls: calls run on the system's call service
    ///   (false in the Simulator, which has none).
    public init(systemManagesCalls: Bool) {
        self.systemManagesCalls = systemManagesCalls
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
        let session = AVAudioSession.sharedInstance()
        try configure(session)
        // The system activates it and tells us (systemAudio(active:)).
        guard !systemOwned else { return }
        setEngine(.default)
        try session.setActive(true)
    }

    public func deactivate(systemOwned: Bool) {
        if !systemOwned {
            try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
        }
        // Ready for the next call, which the system will own again.
        if systemManagesCalls { setEngine(.none) }
    }

    public func systemAudio(active: Bool) {
        if active { try? configure(AVAudioSession.sharedInstance()) }
        setEngine(active ? .default : .none)
    }

    private func configure(_ session: AVAudioSession) throws {
        try session.setCategory(
            .playAndRecord, mode: .voiceChat,
            options: [.defaultToSpeaker, .allowBluetoothHFP, .allowBluetoothA2DP, .allowAirPlay]
        )
        // Otherwise iOS silences every haptic while the mic records (B9).
        try session.setAllowHapticsAndSystemSoundsDuringRecording(true)
    }

    private func setEngine(_ availability: AudioEngineAvailability) {
        do {
            try AudioManager.shared.setEngineAvailability(availability)
        } catch {
            log.error("Audio engine availability not set: \(error.localizedDescription, privacy: .public)")
        }
    }
}
