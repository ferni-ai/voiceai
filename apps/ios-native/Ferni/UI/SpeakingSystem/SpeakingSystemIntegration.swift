import SwiftUI
import Combine

/// Integration layer for the Three-Layer Speaking System
/// Bridges audio level from IOSLiveKitSession to avatar animations
///
/// Usage:
/// ```swift
/// @StateObject private var speakingSystem = SpeakingSystemManager()
///
/// FerniSpeakingAvatar(size: 140, volume: $speakingSystem.smoothedVolume)
///     .onReceive(session.$audioLevel) { level in
///         speakingSystem.updateVolume(level)
///     }
/// ```
///
/// @see design-system/brand/SPEAKING-SYSTEM.md

public class SpeakingSystemManager: ObservableObject {
    
    // MARK: - Published State
    
    /// Smoothed volume for avatar animations (0.0 - 1.0)
    @Published public var smoothedVolume: CGFloat = 0
    
    /// Whether Ferni is currently speaking
    @Published public var isSpeaking: Bool = false
    
    // MARK: - Configuration
    
    private let smoothingAttack: CGFloat = 0.25
    private let smoothingRelease: CGFloat = 0.08
    
    // MARK: - Internal State
    
    private var rawVolume: CGFloat = 0
    private var displayLink: CADisplayLink?
    
    // MARK: - Initialization
    
    public init() {}
    
    deinit {
        stopAnimation()
    }
    
    // MARK: - Public Methods
    
    /// Start speaking mode - activates animation loop
    public func startSpeaking() {
        guard !isSpeaking else { return }
        isSpeaking = true
        startAnimation()
    }
    
    /// Stop speaking mode - animation decays to zero
    public func stopSpeaking() {
        isSpeaking = false
        // Animation loop will decay and stop itself
    }
    
    /// Update the raw voice volume (called from audio analysis)
    public func updateVolume(_ volume: Float) {
        rawVolume = CGFloat(max(0, min(1, volume)))
        
        // Auto-start animation if not running
        if rawVolume > 0.05 && displayLink == nil {
            startAnimation()
        }
    }
    
    // MARK: - Animation Loop
    
    private func startAnimation() {
        guard displayLink == nil else { return }
        
        displayLink = CADisplayLink(target: self, selector: #selector(updateAnimation))
        displayLink?.add(to: .main, forMode: .common)
    }
    
    private func stopAnimation() {
        displayLink?.invalidate()
        displayLink = nil
    }
    
    @objc private func updateAnimation() {
        let targetVolume = isSpeaking ? rawVolume : 0
        let smoothingFactor = targetVolume > smoothedVolume ? smoothingAttack : smoothingRelease
        
        smoothedVolume += (targetVolume - smoothedVolume) * smoothingFactor
        
        // Stop animation when idle and volume near zero
        if !isSpeaking && smoothedVolume < 0.001 {
            smoothedVolume = 0
            stopAnimation()
        }
    }
}

// MARK: - SwiftUI Environment

/// Environment key for accessing the speaking system
public struct SpeakingSystemKey: EnvironmentKey {
    public static let defaultValue: SpeakingSystemManager? = nil
}

public extension EnvironmentValues {
    var speakingSystem: SpeakingSystemManager? {
        get { self[SpeakingSystemKey.self] }
        set { self[SpeakingSystemKey.self] = newValue }
    }
}

// MARK: - View Extension

public extension View {
    /// Injects the speaking system into the view hierarchy
    func withSpeakingSystem(_ manager: SpeakingSystemManager) -> some View {
        environment(\.speakingSystem, manager)
    }
}

// MARK: - Usage Example

/// Example integration showing how to wire up the speaking system
/// This is the pattern to use in VoiceView.swift
///
/// ```swift
/// struct VoiceViewWithSpeaking: View {
///     @EnvironmentObject var session: IOSLiveKitSession
///     @StateObject private var speakingSystem = SpeakingSystemManager()
///     
///     var body: some View {
///         FerniSpeakingAvatar(
///             size: 260,
///             volume: $speakingSystem.smoothedVolume
///         )
///         .onChange(of: session.state) { newState in
///             if newState == .speaking {
///                 speakingSystem.startSpeaking()
///             } else {
///                 speakingSystem.stopSpeaking()
///             }
///         }
///         .onChange(of: session.audioLevel) { level in
///             speakingSystem.updateVolume(level)
///         }
///     }
/// }
/// ```
