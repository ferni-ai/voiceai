import Foundation
import AVFoundation

#if os(iOS)
import UIKit
#endif

// MARK: - Emotional Sound Engine
/// Subliminal audio feedback for Better Than Human emotional intelligence.
/// Creates the auditory dimension that completes the visual + haptic experience.
///
/// Sound Design Philosophy:
/// - Sounds are **subliminal** (40-200ms) - felt more than heard
/// - Tones are warm, organic, never jarring
/// - Matches haptic patterns for sensory coherence
/// - Can be disabled for accessibility

public class EmotionalSoundEngine: ObservableObject {

    // MARK: - State

    private var audioEngine: AVAudioEngine?
    private var toneNode: AVAudioSourceNode?
    private var isEngineRunning = false

    /// Whether sound is enabled (user preference)
    @Published public var isEnabled: Bool = true

    /// Master volume (0-1)
    @Published public var volume: Float = 0.15

    // MARK: - Tone Generation State

    private var currentFrequency: Float = 0
    private var targetFrequency: Float = 0
    private var currentAmplitude: Float = 0
    private var targetAmplitude: Float = 0
    private var phase: Float = 0
    private let sampleRate: Float = 44100

    // MARK: - Initialization

    public init() {
        setupAudioEngine()
    }

    // MARK: - Engine Setup

    private func setupAudioEngine() {
        audioEngine = AVAudioEngine()

        guard let engine = audioEngine else { return }

        // Create tone generator node
        let format = AVAudioFormat(standardFormatWithSampleRate: Double(sampleRate), channels: 1)!

        toneNode = AVAudioSourceNode { [weak self] _, _, frameCount, audioBufferList -> OSStatus in
            guard let self = self else { return noErr }

            let ablPointer = UnsafeMutableAudioBufferListPointer(audioBufferList)
            let buffer = ablPointer[0]
            let ptr = buffer.mData?.assumingMemoryBound(to: Float.self)

            for frame in 0..<Int(frameCount) {
                // Smooth frequency/amplitude transitions
                self.currentFrequency += (self.targetFrequency - self.currentFrequency) * 0.01
                self.currentAmplitude += (self.targetAmplitude - self.currentAmplitude) * 0.01

                // Generate sine wave
                let sample = sin(self.phase * 2 * .pi) * self.currentAmplitude * self.volume
                ptr?[frame] = sample

                // Advance phase
                self.phase += self.currentFrequency / self.sampleRate
                if self.phase > 1 { self.phase -= 1 }
            }

            return noErr
        }

        guard let node = toneNode else { return }

        engine.attach(node)
        engine.connect(node, to: engine.mainMixerNode, format: format)

        do {
            try engine.start()
            isEngineRunning = true
        } catch {
            print("EmotionalSoundEngine: Failed to start - \(error)")
        }
    }

    // MARK: - Micro-Expression Sounds

    /// Play subliminal sound for micro-expression
    public func playMicroExpression(_ type: MicroExpressionType) {
        guard isEnabled, isEngineRunning else { return }

        switch type {
        // Recognition & Connection
        case .recognition:
            // Rising tone (C5 → E5) - 80ms
            playTone(startHz: 523, endHz: 659, duration: 0.08, amplitude: 0.12)

        case .memorySpark:
            // Memory sparkle (high shimmer) - 100ms
            playTone(startHz: 1047, endHz: 1319, duration: 0.10, amplitude: 0.12)

        case .insider:
            // Knowing tone (gentle rise) - 90ms
            playTone(startHz: 440, endHz: 523, duration: 0.09, amplitude: 0.10)

        // Concern & Care
        case .concern:
            // Falling tone (E5 → C5) - 60ms, softer
            playTone(startHz: 659, endHz: 523, duration: 0.06, amplitude: 0.08)

        case .protective:
            // Gentle enveloping (warm low) - 70ms
            playTone(startHz: 330, endHz: 294, duration: 0.07, amplitude: 0.08)

        // Interest & Engagement
        case .interest:
            // Curious chirp (E5 → G5) - 70ms
            playTone(startHz: 659, endHz: 784, duration: 0.07, amplitude: 0.10)

        case .curiosityPeak:
            // Quick bright chirp - 50ms (fastest!)
            playTone(startHz: 784, endHz: 880, duration: 0.05, amplitude: 0.10)

        case .delight:
            // Sparkle (G5 → C6) - 100ms
            playTone(startHz: 784, endHz: 1047, duration: 0.10, amplitude: 0.15)

        // Understanding
        case .epiphany:
            // "Aha!" bright burst - 60ms
            playTone(startHz: 880, endHz: 1175, duration: 0.06, amplitude: 0.14)

        case .connection:
            // Mutual understanding (warm harmonic) - 80ms
            playTone(startHz: 392, endHz: 523, duration: 0.08, amplitude: 0.11)

        // Warmth
        case .warmth:
            // Warm pad (C4) - 120ms (warmest)
            playTone(startHz: 262, endHz: 262, duration: 0.12, amplitude: 0.10)

        case .affection:
            // Gentle caring tone - 80ms
            playTone(startHz: 330, endHz: 349, duration: 0.08, amplitude: 0.09)
        }
    }

    // MARK: - Listening Acknowledgment

    /// Play subtle listening acknowledgment sound
    public func playListeningAck(_ gesture: ListeningGesture) {
        guard isEnabled, isEngineRunning else { return }
        guard gesture != .none else { return }

        // Very subtle click/tick - like a soft "mm-hmm"
        let intensity: Float = {
            switch gesture {
            case .none: return 0
            case .microNod: return 0.05
            case .subtleNod: return 0.08
            case .visibleNod: return 0.10
            case .listeningLean: return 0.08
            case .contemplative: return 0.06
            }
        }()

        // Short tick at 800Hz
        playTone(startHz: 800, endHz: 700, duration: 0.03, amplitude: intensity)
    }

    // MARK: - Concern Response

    /// Play empathetic sound for concern detection
    public func playConcern(level: ConcernLevel) {
        guard isEnabled, isEngineRunning else { return }

        switch level {
        case .none:
            break
        case .mild:
            // Gentle descending (E4 → C4) - "I'm here"
            playTone(startHz: 330, endHz: 262, duration: 0.15, amplitude: 0.08)
        case .moderate:
            // Warmer, longer (E4 → C4 → G3)
            playTone(startHz: 330, endHz: 262, duration: 0.20, amplitude: 0.10)
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.20) { [weak self] in
                self?.playTone(startHz: 262, endHz: 196, duration: 0.15, amplitude: 0.08)
            }
        case .high:
            // Full care chord
            playTone(startHz: 330, endHz: 262, duration: 0.25, amplitude: 0.12)
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) { [weak self] in
                self?.playTone(startHz: 262, endHz: 196, duration: 0.20, amplitude: 0.10)
            }
        }
    }

    // MARK: - Connection Events

    /// Play warm rising chord on connection
    public func playConnectionEstablished() {
        guard isEnabled, isEngineRunning else { return }

        // Rising arpeggio: C4 → E4 → G4 → C5
        playTone(startHz: 262, endHz: 262, duration: 0.12, amplitude: 0.10)

        DispatchQueue.main.asyncAfter(deadline: .now() + 0.10) { [weak self] in
            self?.playTone(startHz: 330, endHz: 330, duration: 0.12, amplitude: 0.12)
        }

        DispatchQueue.main.asyncAfter(deadline: .now() + 0.20) { [weak self] in
            self?.playTone(startHz: 392, endHz: 392, duration: 0.12, amplitude: 0.12)
        }

        DispatchQueue.main.asyncAfter(deadline: .now() + 0.30) { [weak self] in
            self?.playTone(startHz: 523, endHz: 523, duration: 0.20, amplitude: 0.15)
        }
    }

    /// Play gentle closing chord on disconnect
    public func playConnectionClosed() {
        guard isEnabled, isEngineRunning else { return }

        // Descending resolution: C5 → G4 → E4 → C4
        playTone(startHz: 523, endHz: 523, duration: 0.12, amplitude: 0.10)

        DispatchQueue.main.asyncAfter(deadline: .now() + 0.10) { [weak self] in
            self?.playTone(startHz: 392, endHz: 392, duration: 0.12, amplitude: 0.10)
        }

        DispatchQueue.main.asyncAfter(deadline: .now() + 0.20) { [weak self] in
            self?.playTone(startHz: 330, endHz: 330, duration: 0.15, amplitude: 0.08)
        }

        DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) { [weak self] in
            self?.playTone(startHz: 262, endHz: 262, duration: 0.25, amplitude: 0.06)
        }
    }

    // MARK: - Anticipation

    /// Play subtle anticipatory sound
    public func playAnticipation(_ emotion: AnticipatedEmotion) {
        guard isEnabled, isEngineRunning else { return }

        switch emotion {
        case .excited:
            // Rising energy
            playTone(startHz: 400, endHz: 600, duration: 0.10, amplitude: 0.08)
        case .concerned:
            // Gentle attention
            playTone(startHz: 350, endHz: 300, duration: 0.12, amplitude: 0.06)
        case .nostalgic:
            // Warm memory
            playTone(startHz: 280, endHz: 260, duration: 0.15, amplitude: 0.07)
        case .curious:
            // Question lilt
            playTone(startHz: 350, endHz: 450, duration: 0.08, amplitude: 0.06)
        case .reflective:
            // Deep thought
            playTone(startHz: 220, endHz: 200, duration: 0.15, amplitude: 0.05)
        case .vulnerable:
            // Gentle presence
            playTone(startHz: 260, endHz: 240, duration: 0.12, amplitude: 0.06)
        case .uncertain:
            // Supportive tone
            playTone(startHz: 300, endHz: 280, duration: 0.10, amplitude: 0.05)
        case .attentive:
            // Focused listening
            playTone(startHz: 380, endHz: 400, duration: 0.08, amplitude: 0.06)
        case .warm:
            // Rising warmth
            playTone(startHz: 350, endHz: 420, duration: 0.12, amplitude: 0.08)
        }
    }

    // MARK: - Memory Spark

    /// Play sparkle sound for memory recognition
    public func playMemorySpark() {
        guard isEnabled, isEngineRunning else { return }

        // Quick sparkle: high bell-like tone
        playTone(startHz: 1200, endHz: 1800, duration: 0.06, amplitude: 0.08)
    }

    // MARK: - Breath Sync

    /// Play subtle breath-aligned pulse
    public func playBreathPulse(phase: CGFloat) {
        guard isEnabled, isEngineRunning else { return }

        // Only at breath peak
        guard phase > 0.48 && phase < 0.52 else { return }

        // Very gentle low tone
        playTone(startHz: 150, endHz: 140, duration: 0.10, amplitude: 0.03)
    }

    // MARK: - Core Tone Generation

    private func playTone(startHz: Float, endHz: Float, duration: TimeInterval, amplitude: Float) {
        targetFrequency = startHz
        currentFrequency = startHz
        targetAmplitude = amplitude * volume

        // Fade out at end
        DispatchQueue.main.asyncAfter(deadline: .now() + duration * 0.7) { [weak self] in
            self?.targetFrequency = endHz
        }

        DispatchQueue.main.asyncAfter(deadline: .now() + duration) { [weak self] in
            self?.targetAmplitude = 0
        }
    }

    // MARK: - Lifecycle

    public func stop() {
        targetAmplitude = 0
        audioEngine?.stop()
        isEngineRunning = false
    }

    deinit {
        stop()
    }
}

// MARK: - Preview/Testing

#if DEBUG
extension EmotionalSoundEngine {
    /// Test all sounds in sequence
    public func playTestSequence() {
        playConnectionEstablished()

        DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) { [weak self] in
            self?.playMicroExpression(.recognition)
        }

        DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) { [weak self] in
            self?.playMicroExpression(.delight)
        }

        DispatchQueue.main.asyncAfter(deadline: .now() + 2.0) { [weak self] in
            self?.playListeningAck(.visibleNod)
        }

        DispatchQueue.main.asyncAfter(deadline: .now() + 2.5) { [weak self] in
            self?.playConcern(level: .moderate)
        }

        DispatchQueue.main.asyncAfter(deadline: .now() + 3.5) { [weak self] in
            self?.playMemorySpark()
        }

        DispatchQueue.main.asyncAfter(deadline: .now() + 4.0) { [weak self] in
            self?.playConnectionClosed()
        }
    }
}
#endif
