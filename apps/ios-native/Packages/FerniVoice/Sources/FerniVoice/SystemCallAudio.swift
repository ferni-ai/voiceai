import AVFAudio
import Foundation
import LiveKit
import os

/// AVAudioSession set up for a conversation: voice-chat processing (echo
/// cancellation, voice-tuned gain), the speaker by default, and Bluetooth headsets and
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
///
/// After an interruption ends, a device comes or goes, or the media services
/// reset, the call is set up again: voice chat on the session, and LiveKit's
/// voice processing (its echo cancellation) back on if it dropped. Without it,
/// Ferni's own voice reaches the mic and reads as the person talking. Each time
/// is logged with its reason and whether voice processing had dropped.
///
/// When the system never activates a call's audio, the call takes it itself
/// (`activate(systemOwned: false)`), and a late word from the system's
/// abandoned call leaves that audio on.
// The observer tokens are set in init and read in deinit; the call's state is behind a lock.
public final class SystemCallAudio: CallAudio, @unchecked Sendable {
    public let interruptions: AsyncStream<AudioInterruption>
    private var observers: [NSObjectProtocol] = []
    private let notifications: NotificationCenter
    private let systemManagesCalls: Bool
    private let engine: @Sendable (AudioEngineAvailability) throws -> Void
    private let session: any AudioSessionSettings
    private let voiceProcessing: any VoiceProcessing
    /// The system has activated this call's session (and not taken it back).
    private let systemActive = OSAllocatedUnfairLock(initialState: false)
    /// The app activated the session itself for a call (not the system).
    private let ownActive = OSAllocatedUnfairLock(initialState: false)
    private let log = Logger(subsystem: "com.sethdford.ferni", category: "audio")

    /// - Parameters:
    ///   - systemManagesCalls: calls run on the system's call service
    ///     (false in the Simulator, which has none).
    ///   - engine: sets LiveKit's engine availability; tests record it.
    ///   - session: the audio session; tests record what is asked of it.
    ///   - notifications: where the session's notifications arrive; tests post their own.
    ///   - voiceProcessing: LiveKit's voice processing; tests fake it.
    public init(systemManagesCalls: Bool,
                engine: @escaping @Sendable (AudioEngineAvailability) throws -> Void = {
                    try AudioManager.shared.setEngineAvailability($0)
                },
                session: any AudioSessionSettings = AVAudioSession.sharedInstance(),
                notifications: NotificationCenter = .default,
                voiceProcessing: any VoiceProcessing = LiveKitVoiceProcessing()) {
        self.systemManagesCalls = systemManagesCalls
        self.engine = engine
        self.session = session
        self.voiceProcessing = voiceProcessing
        self.notifications = notifications
        AudioManager.shared.audioSession.isAutomaticConfigurationEnabled = false
        let (stream, continuation) = AsyncStream.makeStream(of: AudioInterruption.self)
        interruptions = stream
        observers = [
            notifications.addObserver(forName: AVAudioSession.interruptionNotification, object: nil, queue: nil) { [weak self] note in
                guard let raw = note.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt,
                      let type = AVAudioSession.InterruptionType(rawValue: raw) else { return }
                switch type {
                case .began:
                    continuation.yield(.began)
                case .ended:
                    // Another app may have changed the session meanwhile.
                    self?.reapply("interruption ended")
                    let options = (note.userInfo?[AVAudioSessionInterruptionOptionKey] as? UInt)
                        .map(AVAudioSession.InterruptionOptions.init(rawValue:)) ?? []
                    continuation.yield(.ended(shouldResume: options.contains(.shouldResume)))
                @unknown default:
                    break
                }
            },
            notifications.addObserver(forName: AVAudioSession.routeChangeNotification, object: nil, queue: nil) { [weak self] note in
                guard let raw = note.userInfo?[AVAudioSessionRouteChangeReasonKey] as? UInt,
                      let reason = AVAudioSession.RouteChangeReason(rawValue: raw) else { return }
                // A device came or went (AirPods in or out, a car). Never on
                // .categoryChange: setting the category posts that, and it would loop.
                if reason == .newDeviceAvailable || reason == .oldDeviceUnavailable {
                    self?.reapply("route changed")
                }
            },
            notifications.addObserver(forName: AVAudioSession.mediaServicesWereResetNotification, object: nil, queue: nil) { [weak self] _ in
                self?.rebuildAfterReset()
            }
        ]
        // As early as possible, before any room connects.
        if systemManagesCalls { setEngine(.none) }
    }

    deinit { for observer in observers { notifications.removeObserver(observer) } }

    /// In a call: the system or the app has the session active.
    private var inCall: Bool { systemActive.withLock { $0 } || ownActive.withLock { $0 } }

    /// The call's session settings again, in a call only (at rest the app
    /// leaves the session alone).
    private func reapply(_ why: StaticString) {
        guard inCall else { return }
        do {
            try setUpAgain(why)
        } catch {
            log.error("Session not set again (\(why, privacy: .public)): \(error.localizedDescription, privacy: .public)")
        }
    }

    /// Voice chat on the session and voice processing on, logged with the reason.
    private func setUpAgain(_ why: StaticString) throws {
        try configure()
        let processing = restoreVoiceProcessing()
        log.notice("Session set again (\(why, privacy: .public)); voice processing \(processing, privacy: .public)")
    }

    /// Turns LiveKit's voice processing back on only if it dropped: turning it
    /// on restarts the audio engine, so a call where it's on is left alone.
    private func restoreVoiceProcessing() -> StaticString {
        guard !voiceProcessing.isOn else { return "on" }
        do {
            try voiceProcessing.turnOn()
            return "was off, back on"
        } catch {
            log.error("Voice processing not back on: \(error.localizedDescription, privacy: .public)")
            return "off, not restored"
        }
    }

    /// The media services restarted: every session setting is gone. The
    /// settings come back, and the engine follows the same rule as always:
    /// on only once the call's session is active again; off at rest when the
    /// system owns calls.
    private func rebuildAfterReset() {
        log.error("Media services were reset; setting the session up again")
        if systemActive.withLock({ $0 }) {
            try? setUpAgain("media services reset")
            setEngine(.default)
        } else if ownActive.withLock({ $0 }) {
            // The app's own session (no system call service, or the system
            // never started this call's audio): the app activates it again.
            do {
                try setUpAgain("media services reset")
                try session.setActive(true, options: [])
                setEngine(.default)
            } catch {
                log.error("Session not active again after the reset: \(error.localizedDescription, privacy: .public)")
            }
        } else if systemManagesCalls {
            setEngine(.none)
        }
    }

    public func requestMicrophone() async -> Bool {
        await AVAudioApplication.requestRecordPermission()
    }

    public func activate(systemOwned: Bool) throws {
        try configure()
        if systemOwned {
            // The system activates it and tells us (systemAudio(active:)),
            // which is what turns the engine on, never before (C1). A later
            // room of the same call finds it still on: leaving a room doesn't
            // turn it off.
            return
        }
        setEngine(.default)
        try session.setActive(true, options: [])
        ownActive.withLock { $0 = true }
    }

    public func deactivate(systemOwned: Bool) {
        if !systemOwned {
            ownActive.withLock { $0 = false }
            try? session.setActive(false, options: .notifyOthersOnDeactivation)
        }
        // Between rooms the engine is left as it is: the system activates the
        // session once per call (callEnded and systemAudio(active: false) turn it off).
    }

    public func systemAudio(active: Bool) {
        systemActive.withLock { $0 = active }
        if active { try? configure() }
        // The app took the audio over when the system never activated it: a
        // late word from the system's abandoned call leaves the engine on.
        setEngine(active || ownActive.withLock({ $0 }) ? .default : .none)
    }

    public func callEnded() {
        systemActive.withLock { $0 = false }
        ownActive.withLock { $0 = false }
        // Ready for the next call, which the system will own again.
        if systemManagesCalls { setEngine(.none) }
    }

    public var engineState: String {
        let availability = AudioManager.shared.engineAvailability
        return "engine in \(availability.isInputAvailable) out \(availability.isOutputAvailable) running \(AudioManager.shared.isEngineRunning)"
    }

    private func configure() throws {
        // Bluetooth in headset mode only (HFP): the mic and Ferni's voice on
        // one link. A2DP (output only) is not a call route, so a Bluetooth
        // speaker with no mic isn't offered; the call plays on the phone.
        try session.setCategory(.playAndRecord, mode: .voiceChat, options: Self.options)
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

    /// The speaker by default, Bluetooth headsets and AirPlay.
    static let options: AVAudioSession.CategoryOptions = [.defaultToSpeaker, .allowBluetoothHFP, .allowAirPlay]

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

/// The echo cancellation and voice-tuned gain in LiveKit's audio engine;
/// LiveKit in the app, a fake in tests.
public protocol VoiceProcessing: AnyObject, Sendable {
    /// Enabled and not bypassed.
    var isOn: Bool { get }
    func turnOn() throws
}

/// LiveKit's own switches. Both default to on, and the app never turns them
/// off: this only puts back what something else changed.
public final class LiveKitVoiceProcessing: VoiceProcessing {
    public init() {}

    public var isOn: Bool {
        AudioManager.shared.isVoiceProcessingEnabled && !AudioManager.shared.isVoiceProcessingBypassed
    }

    public func turnOn() throws {
        let audio = AudioManager.shared
        if !audio.isVoiceProcessingEnabled { try audio.setVoiceProcessingEnabled(true) }
        if audio.isVoiceProcessingBypassed { audio.isVoiceProcessingBypassed = false }
    }
}
