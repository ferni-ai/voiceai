import Foundation
import AVFoundation

#if os(iOS)
import CoreMotion

// MARK: - Spatial Audio Manager
/// Creates immersive 3D audio positioning for Ferni's voice with AirPods.
/// Transforms the experience from "voice in my ears" to "presence in my space."
///
/// Features:
/// - Head-tracked spatial audio (AirPods Pro/Max)
/// - Configurable voice positioning (in front, beside, surrounding)
/// - Dynamic positioning based on context (calming = enveloping, alert = directional)
/// - Graceful fallback for non-spatial hardware

public class SpatialAudioManager: ObservableObject {

    // MARK: - State

    /// Whether spatial audio is available on current device
    @Published public private(set) var isAvailable: Bool = false

    /// Whether spatial audio is currently enabled
    @Published public var isEnabled: Bool = true

    /// Current voice position preset
    @Published public var positionPreset: VoicePosition = .inFront

    // MARK: - Audio Engine

    private var audioEngine: AVAudioEngine?
    private var environmentNode: AVAudioEnvironmentNode?
    private var playerNode: AVAudioPlayerNode?

    // MARK: - Head Tracking

    private var motionManager: CMHeadphoneMotionManager?
    private var isHeadTrackingActive = false

    // MARK: - Voice Position Presets

    public enum VoicePosition: String, CaseIterable {
        case inFront        // Directly in front (default conversation)
        case slightlyLeft   // Natural conversation position
        case slightlyRight  // Alternative conversation position
        case surrounding    // Enveloping (calming/meditation)
        case above          // Gentle presence from above
        case floating       // Slowly moving (dreamlike)

        /// 3D position coordinates
        var position: AVAudio3DPoint {
            switch self {
            case .inFront:
                return AVAudio3DPoint(x: 0, y: 0, z: -1.5)  // 1.5m in front
            case .slightlyLeft:
                return AVAudio3DPoint(x: -0.5, y: 0, z: -1.2)
            case .slightlyRight:
                return AVAudio3DPoint(x: 0.5, y: 0, z: -1.2)
            case .surrounding:
                return AVAudio3DPoint(x: 0, y: 0, z: -0.3)  // Close, intimate
            case .above:
                return AVAudio3DPoint(x: 0, y: 1.0, z: -0.5)  // Above and slightly forward
            case .floating:
                return AVAudio3DPoint(x: 0, y: 0.3, z: -1.0)
            }
        }

        /// Room reverb amount (0-1)
        var reverbAmount: Float {
            switch self {
            case .inFront, .slightlyLeft, .slightlyRight:
                return 0.1
            case .surrounding:
                return 0.3  // More reverb for enveloping effect
            case .above:
                return 0.2
            case .floating:
                return 0.25
            }
        }
    }

    // MARK: - Initialization

    public init() {
        checkAvailability()
        setupHeadTracking()
    }

    private func checkAvailability() {
        // Check for spatial audio support
        let audioSession = AVAudioSession.sharedInstance()

        // Spatial audio requires compatible AirPods
        // We check for the capability
        if #available(iOS 15.0, *) {
            isAvailable = audioSession.currentRoute.outputs.contains { output in
                // AirPods Pro, AirPods Max, and newer models support spatial audio
                output.portType == .bluetoothA2DP || output.portType == .bluetoothHFP
            }
        }

        // Listen for route changes
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(handleRouteChange),
            name: AVAudioSession.routeChangeNotification,
            object: nil
        )
    }

    @objc private func handleRouteChange(_ notification: Notification) {
        checkAvailability()
    }

    // MARK: - Audio Engine Setup

    /// Setup spatial audio engine for voice playback
    public func setupEngine() {
        guard isAvailable && isEnabled else { return }

        audioEngine = AVAudioEngine()
        environmentNode = AVAudioEnvironmentNode()
        playerNode = AVAudioPlayerNode()

        guard let engine = audioEngine,
              let environment = environmentNode,
              let player = playerNode else { return }

        // Attach nodes
        engine.attach(environment)
        engine.attach(player)

        // Configure environment
        environment.listenerPosition = AVAudio3DPoint(x: 0, y: 0, z: 0)
        environment.listenerAngularOrientation = AVAudio3DAngularOrientation(yaw: 0, pitch: 0, roll: 0)

        // Configure reverb for natural room sound
        environment.reverbParameters.enable = true
        environment.reverbParameters.level = positionPreset.reverbAmount * 20 - 20  // Convert to dB

        // Set rendering algorithm for high quality
        environment.renderingAlgorithm = .HRTFHQ  // Head-Related Transfer Function, High Quality

        // Connect nodes
        let format = AVAudioFormat(standardFormatWithSampleRate: 44100, channels: 1)!
        engine.connect(player, to: environment, format: format)
        engine.connect(environment, to: engine.mainMixerNode, format: nil)

        // Set initial position
        player.position = positionPreset.position

        do {
            try engine.start()
        } catch {
            print("SpatialAudioManager: Failed to start engine - \(error)")
        }
    }

    /// Update voice position
    public func setPosition(_ preset: VoicePosition, animated: Bool = true) {
        positionPreset = preset

        guard let player = playerNode else { return }

        if animated {
            // Animate position change over 0.5 seconds
            animatePosition(to: preset.position, duration: 0.5)
        } else {
            player.position = preset.position
        }

        // Update reverb
        environmentNode?.reverbParameters.level = preset.reverbAmount * 20 - 20
    }

    private func animatePosition(to target: AVAudio3DPoint, duration: TimeInterval) {
        guard let player = playerNode else { return }

        let start = player.position
        let steps = 30
        let interval = duration / Double(steps)

        for i in 0...steps {
            let progress = Float(i) / Float(steps)
            let eased = easeInOutCubic(progress)

            DispatchQueue.main.asyncAfter(deadline: .now() + interval * Double(i)) { [weak player] in
                let x = start.x + (target.x - start.x) * eased
                let y = start.y + (target.y - start.y) * eased
                let z = start.z + (target.z - start.z) * eased
                player?.position = AVAudio3DPoint(x: x, y: y, z: z)
            }
        }
    }

    private func easeInOutCubic(_ t: Float) -> Float {
        if t < 0.5 {
            return 4 * t * t * t
        } else {
            let f = 2 * t - 2
            return 0.5 * f * f * f + 1
        }
    }

    // MARK: - Head Tracking

    private func setupHeadTracking() {
        let manager = CMHeadphoneMotionManager()
        guard manager.isDeviceMotionAvailable else { return }
        motionManager = manager
    }

    /// Start head tracking for spatial audio
    public func startHeadTracking() {
        guard let manager = motionManager,
              manager.isDeviceMotionAvailable,
              !isHeadTrackingActive else { return }

        manager.startDeviceMotionUpdates(to: .main) { [weak self] motion, error in
            guard let motion = motion, error == nil else { return }

            // Update listener orientation based on head movement
            let yaw = Float(motion.attitude.yaw * 180 / .pi)
            let pitch = Float(motion.attitude.pitch * 180 / .pi)
            let roll = Float(motion.attitude.roll * 180 / .pi)

            self?.environmentNode?.listenerAngularOrientation = AVAudio3DAngularOrientation(
                yaw: yaw,
                pitch: pitch,
                roll: roll
            )
        }

        isHeadTrackingActive = true
    }

    /// Stop head tracking
    public func stopHeadTracking() {
        motionManager?.stopDeviceMotionUpdates()
        isHeadTrackingActive = false

        // Reset orientation
        environmentNode?.listenerAngularOrientation = AVAudio3DAngularOrientation(yaw: 0, pitch: 0, roll: 0)
    }

    // MARK: - Context-Aware Positioning

    /// Set position based on emotional context
    public func setContextualPosition(for context: EmotionalContext) {
        switch context {
        case .calming:
            setPosition(.surrounding, animated: true)
        case .conversation:
            setPosition(.inFront, animated: true)
        case .intimate:
            setPosition(.slightlyLeft, animated: true)
        case .meditation:
            setPosition(.surrounding, animated: true)
        case .alert:
            setPosition(.inFront, animated: true)
        case .dreamlike:
            setPosition(.floating, animated: true)
            startFloatingAnimation()
        }
    }

    public enum EmotionalContext {
        case calming
        case conversation
        case intimate
        case meditation
        case alert
        case dreamlike
    }

    private var floatingTimer: Timer?

    private func startFloatingAnimation() {
        floatingTimer?.invalidate()

        var angle: Float = 0

        floatingTimer = Timer.scheduledTimer(withTimeInterval: 0.1, repeats: true) { [weak self] _ in
            guard let self = self, let player = self.playerNode else { return }

            angle += 0.02
            let x = sin(angle) * 0.3
            let y = 0.3 + sin(angle * 2) * 0.1
            let z: Float = -1.0

            player.position = AVAudio3DPoint(x: x, y: y, z: z)
        }
    }

    // MARK: - Lifecycle

    public func stop() {
        floatingTimer?.invalidate()
        stopHeadTracking()
        audioEngine?.stop()
        playerNode?.stop()
    }

    deinit {
        stop()
        NotificationCenter.default.removeObserver(self)
    }
}

#else

// MARK: - macOS Stub

/// Stub implementation for macOS (no spatial audio support)
public class SpatialAudioManager: ObservableObject {
    public enum VoicePosition: String, CaseIterable {
        case inFront, slightlyLeft, slightlyRight, surrounding, above, floating
    }

    public enum EmotionalContext {
        case calming, conversation, intimate, meditation, alert, dreamlike
    }

    @Published public private(set) var isAvailable: Bool = false
    @Published public var isEnabled: Bool = false
    @Published public var positionPreset: VoicePosition = .inFront

    public init() {}
    public func setupEngine() {}
    public func setPosition(_ preset: VoicePosition, animated: Bool = true) {}
    public func startHeadTracking() {}
    public func stopHeadTracking() {}
    public func setContextualPosition(for context: EmotionalContext) {}
    public func stop() {}
}

#endif
