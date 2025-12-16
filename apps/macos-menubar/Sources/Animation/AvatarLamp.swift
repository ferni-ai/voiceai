import SwiftUI

// MARK: - Avatar Lamp - Pixar-Style Body Language

/**
 * Implements Luxo Jr.-style character animation for Ferni's avatar.
 * Based on frontend-typescript/src/ui/avatar-lamp.ui.ts
 *
 * AVATAR CAPABILITIES:
 * - Breathing: Gentle idle pulse (alive, not static)
 * - Bouncing: Excitement, acknowledgment, celebration
 * - Tilting: Curiosity, confusion, listening lean
 * - Nodding: Agreement, understanding, encouragement
 * - Shrinking: Concern, sadness, empathy
 * - Perking: Interest, realization, surprise
 * - Shaking: Playful disagreement, laughter
 * - Looking: Whole-body orientation toward interest
 */
class AvatarLamp: ObservableObject {
    @Published var state = AnimationState()
    
    private var breathingTask: Task<Void, Never>?
    private var emotionTask: Task<Void, Never>?
    
    init() {
        startBreathing()
    }
    
    deinit {
        breathingTask?.cancel()
        emotionTask?.cancel()
    }
    
    // MARK: - Breathing
    
    /// Start the breathing animation - makes the avatar feel alive
    func startBreathing() {
        guard state.isBreathing else { return }
        
        breathingTask?.cancel()
        breathingTask = Task { @MainActor in
            while !Task.isCancelled && state.isBreathing {
                // Inhale - expand (from avatar-lamp.ui.ts: scaleX: 1.025, scaleY: 1.035)
                withAnimation(.easeInOut(duration: AnimationTiming.breathInhaleDuration)) {
                    state.scaleX = 1.025
                    state.scaleY = 1.035
                }
                
                try? await Task.sleep(nanoseconds: UInt64(AnimationTiming.breathInhaleDuration * 1_000_000_000))
                guard !Task.isCancelled else { return }
                
                // Exhale - contract
                withAnimation(.easeInOut(duration: AnimationTiming.breathExhaleDuration)) {
                    state.scaleX = 1.0
                    state.scaleY = 1.0
                }
                
                try? await Task.sleep(nanoseconds: UInt64(AnimationTiming.breathExhaleDuration * 1_000_000_000))
            }
        }
    }
    
    func stopBreathing() {
        breathingTask?.cancel()
        withAnimation(.easeOut(duration: 0.3)) {
            state.scaleX = 1.0
            state.scaleY = 1.0
        }
    }
    
    func pauseBreathingFor(seconds: Double) {
        let wasBreathing = state.isBreathing
        breathingTask?.cancel()
        
        Task { @MainActor in
            try? await Task.sleep(nanoseconds: UInt64(seconds * 1_000_000_000))
            if wasBreathing {
                startBreathing()
            }
        }
    }
    
    // MARK: - Bounce - The signature Pixar lamp move!
    
    /// Bounce animation for excitement, acknowledgment, celebration
    func bounce(intensity: CGFloat = 0.5, count: Int = 1) {
        pauseBreathingFor(seconds: Double(count) * 0.4 + 0.3)
        state.isAnimating = true
        
        let bounceHeight = 8 + intensity * 12  // 8-20px
        let squashAmount: CGFloat = 0.85 + (1 - intensity) * 0.1  // 0.85-0.95
        let stretchAmount: CGFloat = 1.1 + intensity * 0.15  // 1.1-1.25
        
        emotionTask?.cancel()
        emotionTask = Task { @MainActor in
            for i in 0..<count {
                let decay = 1 - CGFloat(i) * 0.3
                
                // Anticipation - Squash down
                withAnimation(.easeIn(duration: 0.12)) {
                    state.scaleY = squashAmount * decay + (1 - decay)
                    state.scaleX = 1 + (1 - squashAmount) * decay * 0.5
                    state.offsetY = 3 * decay
                }
                try? await Task.sleep(nanoseconds: 120_000_000)
                guard !Task.isCancelled else { return }
                
                // Launch - Stretch up
                withAnimation(.easeOut(duration: 0.15)) {
                    state.scaleY = stretchAmount * decay + (1 - decay) * 0.5
                    state.scaleX = 1 - (stretchAmount - 1) * decay * 0.3
                    state.offsetY = -bounceHeight * decay
                }
                try? await Task.sleep(nanoseconds: 150_000_000)
                guard !Task.isCancelled else { return }
                
                // Fall - Return to squash
                withAnimation(.easeIn(duration: 0.12)) {
                    state.scaleY = squashAmount * decay * 0.5 + 0.5
                    state.scaleX = 1 + (1 - squashAmount) * decay * 0.3
                    state.offsetY = 2 * decay
                }
                try? await Task.sleep(nanoseconds: 120_000_000)
                guard !Task.isCancelled else { return }
            }
            
            // Settle back to normal with elastic ease
            withAnimation(.spring(response: 0.25, dampingFraction: 0.5)) {
                state.scaleY = 1
                state.scaleX = 1
                state.offsetY = 0
            }
            
            state.isAnimating = false
        }
    }
    
    // MARK: - Tilt - Curiosity and listening lean
    
    /// Tilt animation like Pixar lamp tilting its "head"
    func tilt(direction: TiltDirection = .right, intensity: CGFloat = 0.5) {
        pauseBreathingFor(seconds: 0.8)
        state.isAnimating = true
        
        let rotation = direction.rotationDegrees * intensity
        let xOffset = direction.xOffset * intensity
        let yOffset = direction.yOffset * intensity
        let scale = direction == .forward ? 1.03 : 1.0
        
        emotionTask?.cancel()
        emotionTask = Task { @MainActor in
            // Anticipation - slight opposite movement
            withAnimation(.easeIn(duration: 0.08)) {
                state.rotation = -rotation * 0.2
            }
            try? await Task.sleep(nanoseconds: 80_000_000)
            guard !Task.isCancelled else { return }
            
            // Main tilt with overshoot
            withAnimation(.spring(response: 0.25, dampingFraction: 0.6, blendDuration: 0.1)) {
                state.rotation = rotation * 1.15
                state.offsetX = xOffset
                state.offsetY = yOffset
                state.scaleX = scale
                state.scaleY = scale
            }
            try? await Task.sleep(nanoseconds: 250_000_000)
            guard !Task.isCancelled else { return }
            
            // Settle to final position
            withAnimation(.easeOut(duration: 0.15)) {
                state.rotation = rotation
            }
            
            state.isAnimating = false
        }
    }
    
    func untilt() {
        emotionTask?.cancel()
        withAnimation(.easeOut(duration: 0.3)) {
            state.rotation = 0
            state.offsetX = 0
            state.offsetY = 0
            state.scaleX = 1
            state.scaleY = 1
        }
    }
    
    // MARK: - Nod - Agreement and understanding
    
    /// Nod animation for agreement
    func nod(count: Int = 2, speed: NodSpeed = .normal) {
        pauseBreathingFor(seconds: Double(count) * 0.3 + 0.2)
        state.isAnimating = true
        
        let duration = speed.duration
        let distance = speed.distance
        
        emotionTask?.cancel()
        emotionTask = Task { @MainActor in
            for _ in 0..<count {
                // Down
                withAnimation(.easeIn(duration: duration)) {
                    state.offsetY = distance
                    state.scaleY = 0.97
                }
                try? await Task.sleep(nanoseconds: UInt64(duration * 1_000_000_000))
                guard !Task.isCancelled else { return }
                
                // Up with slight overshoot
                withAnimation(.easeOut(duration: duration)) {
                    state.offsetY = -2
                    state.scaleY = 1.02
                }
                try? await Task.sleep(nanoseconds: UInt64(duration * 1_000_000_000))
                guard !Task.isCancelled else { return }
            }
            
            // Settle
            withAnimation(.spring(response: 0.2, dampingFraction: 0.7)) {
                state.offsetY = 0
                state.scaleY = 1
            }
            
            state.isAnimating = false
        }
    }
    
    // MARK: - Perk Up - The "aha!" moment
    
    /// Perk up animation for sudden interest or realization
    func perkUp() {
        pauseBreathingFor(seconds: 0.6)
        state.isAnimating = true
        
        emotionTask?.cancel()
        emotionTask = Task { @MainActor in
            // Quick anticipation squash
            withAnimation(.easeIn(duration: 0.08)) {
                state.scaleY = 0.9
                state.scaleX = 1.08
                state.offsetY = 3
            }
            try? await Task.sleep(nanoseconds: 80_000_000)
            guard !Task.isCancelled else { return }
            
            // Pop up with stretch
            withAnimation(.easeOut(duration: 0.12)) {
                state.scaleY = 1.12
                state.scaleX = 0.94
                state.offsetY = -8
            }
            try? await Task.sleep(nanoseconds: 120_000_000)
            guard !Task.isCancelled else { return }
            
            // Settle with bounce
            withAnimation(.spring(response: 0.4, dampingFraction: 0.4)) {
                state.scaleY = 1
                state.scaleX = 1
                state.offsetY = 0
            }
            
            state.isAnimating = false
        }
    }
    
    // MARK: - Shrink - Empathy, concern, or sadness
    
    /// Shrink animation - avatar becomes smaller, more humble
    func shrink(intensity: CGFloat = 0.5) {
        pauseBreathingFor(seconds: 1.0)
        state.isAnimating = true
        
        let targetScale = 0.9 + (1 - intensity) * 0.08  // 0.9-0.98
        let droop = 4 + intensity * 4  // 4-8px
        
        emotionTask?.cancel()
        emotionTask = Task { @MainActor in
            withAnimation(.easeOut(duration: 0.4)) {
                state.scaleX = targetScale
                state.scaleY = targetScale
                state.offsetY = droop
            }
            state.isAnimating = false
        }
    }
    
    func unshrink() {
        emotionTask?.cancel()
        withAnimation(.spring(response: 0.5, dampingFraction: 0.6)) {
            state.scaleX = 1
            state.scaleY = 1
            state.offsetY = 0
        }
    }
    
    // MARK: - Shake - Playful disagreement or laughter
    
    /// Shake animation for playful disagreement
    func shake(intensity: CGFloat = 0.5) {
        pauseBreathingFor(seconds: 0.5)
        state.isAnimating = true
        
        let distance = 3 + intensity * 4  // 3-7px
        let shakes = 3 + Int(intensity * 2)  // 3-5 shakes
        
        emotionTask?.cancel()
        emotionTask = Task { @MainActor in
            for i in 0..<shakes {
                let decay = 1 - CGFloat(i) / CGFloat(shakes) * 0.5
                let dir: CGFloat = i % 2 == 0 ? 1 : -1
                
                withAnimation(.easeOut(duration: 0.06)) {
                    state.offsetX = dir * distance * decay
                    state.rotation = Double(dir * 3 * decay)
                }
                try? await Task.sleep(nanoseconds: 60_000_000)
                guard !Task.isCancelled else { return }
            }
            
            // Return to center
            withAnimation(.spring(response: 0.15, dampingFraction: 0.5)) {
                state.offsetX = 0
                state.rotation = 0
            }
            
            state.isAnimating = false
        }
    }
    
    // MARK: - Look - Whole body orientation
    
    /// Look animation - orientation toward a direction
    func look(direction: LookDirection) {
        emotionTask?.cancel()
        
        let transform = direction.transform
        
        withAnimation(.easeOut(duration: 0.25)) {
            state.offsetX = transform.x
            state.offsetY = transform.y
            state.rotation = transform.rotation
        }
    }
    
    func lookCenter() {
        withAnimation(.easeOut(duration: 0.2)) {
            state.offsetX = 0
            state.offsetY = 0
            state.rotation = 0
        }
    }
    
    // MARK: - Express Emotion
    
    /// Express an emotion through body language
    func express(_ emotion: LampEmotion) {
        state.currentEmotion = emotion
        
        switch emotion {
        case .happy:
            bounce(intensity: 0.4, count: 1)
            
        case .excited:
            bounce(intensity: 0.8, count: 2)
            
        case .curious:
            tilt(direction: .right, intensity: 0.6)
            
        case .confused:
            tilt(direction: .left, intensity: 0.4)
            Task { @MainActor in
                try? await Task.sleep(nanoseconds: 400_000_000)
                tilt(direction: .right, intensity: 0.3)
            }
            
        case .listening:
            tilt(direction: .forward, intensity: 0.5)
            
        case .thinking:
            look(direction: .up)
            Task { @MainActor in
                try? await Task.sleep(nanoseconds: 200_000_000)
                tilt(direction: .left, intensity: 0.3)
            }
            
        case .sad:
            shrink(intensity: 0.6)
            
        case .empathetic:
            shrink(intensity: 0.3)
            Task { @MainActor in
                try? await Task.sleep(nanoseconds: 400_000_000)
                nod(count: 1, speed: .slow)
            }
            
        case .proud:
            perkUp()
            Task { @MainActor in
                try? await Task.sleep(nanoseconds: 400_000_000)
                bounce(intensity: 0.3, count: 1)
            }
            
        case .surprised:
            perkUp()
            
        case .laughing:
            bounce(intensity: 0.3, count: 1)
            Task { @MainActor in
                try? await Task.sleep(nanoseconds: 300_000_000)
                shake(intensity: 0.6)
            }
            
        case .acknowledging:
            nod(count: 2, speed: .normal)
            
        case .encouraging:
            nod(count: 1, speed: .slow)
            Task { @MainActor in
                try? await Task.sleep(nanoseconds: 300_000_000)
                bounce(intensity: 0.2, count: 1)
            }
            
        case .celebrating:
            bounce(intensity: 0.9, count: 3)
            
        case .neutral:
            untilt()
            unshrink()
            lookCenter()
        }
    }
}

// MARK: - Supporting Types

enum TiltDirection {
    case left, right, forward
    
    var rotationDegrees: Double {
        switch self {
        case .left: return -8
        case .right: return 8
        case .forward: return 0
        }
    }
    
    var xOffset: CGFloat {
        switch self {
        case .left: return -3
        case .right: return 3
        case .forward: return 0
        }
    }
    
    var yOffset: CGFloat {
        switch self {
        case .forward: return -4
        default: return -2
        }
    }
}

enum NodSpeed {
    case slow, normal, fast
    
    var duration: Double {
        switch self {
        case .slow: return 0.25
        case .normal: return 0.15
        case .fast: return 0.1
        }
    }
    
    var distance: CGFloat {
        switch self {
        case .slow: return 4
        case .normal: return 5
        case .fast: return 6
        }
    }
}

enum LookDirection {
    case left, right, up, down
    
    var transform: (x: CGFloat, y: CGFloat, rotation: Double) {
        switch self {
        case .left: return (-4, 0, -4)
        case .right: return (4, 0, 4)
        case .up: return (0, -4, 0)
        case .down: return (0, 3, 0)
        }
    }
}

