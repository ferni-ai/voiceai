import SwiftUI

// MARK: - Avatar Soul - Superhuman Emotional Intelligence

/**
 * Pixar-Quality "Better Than Human" Animation System
 * Based on apps/web/src/ui/avatar-soul.ui.ts
 *
 * CAPABILITIES:
 * 1. PUPIL DILATION - Interest, connection, cognitive load
 * 2. GAZE PATTERNS - Natural saccades, thinking glances
 * 3. IRIS SHIMMER - "Wet eye" life-giving light reflection
 * 4. EMOTIONAL GLOW BLEEDING - Aura of intense emotions
 * 5. MEMORY SPARK - Shared history recognition flash
 * 6. COMFORT PULSE - Visual "hug" during heavy moments
 * 7. WARMTH BLOOM - Emotional warmth radiating outward
 * 8. GROWTH CELEBRATION - Celebrating user progress
 */
class AvatarSoul: ObservableObject {
    @Published var state = AnimationState()
    
    // Soul-specific state
    @Published var glowColor: Color = Color(hex: 0x4a6741).opacity(0.4)
    @Published var relationshipWarmth: Double = 0.3  // 0-1 baseline warmth
    
    private var shimmerTask: Task<Void, Never>?
    private var glowPulseTask: Task<Void, Never>?
    private var gazeTask: Task<Void, Never>?
    
    init() {
        startShimmer()
        startGlowPulse()
    }
    
    deinit {
        shimmerTask?.cancel()
        glowPulseTask?.cancel()
        gazeTask?.cancel()
    }
    
    // MARK: - Pupil Dilation
    
    /// Pupil sizes for different emotional states
    enum PupilState: CGFloat {
        case contracted = 0.7    // Analytical thinking
        case neutral = 1.0       // Default
        case interested = 1.15   // Engaged
        case connected = 1.25    // Deep connection
        case dilated = 1.35      // Peak interest/emotion
    }
    
    /// Dilate pupil to show interest or emotion
    func dilatePupil(to state: PupilState, duration: Double = 0.3) {
        withAnimation(.easeOut(duration: duration)) {
            self.state.pupilSize = state.rawValue
        }
    }
    
    /// Quick pupil response to surprise or interest
    func pupilFlash() {
        Task { @MainActor in
            withAnimation(.easeOut(duration: 0.15)) {
                state.pupilSize = PupilState.dilated.rawValue
            }
            try? await Task.sleep(nanoseconds: 200_000_000)
            withAnimation(.easeInOut(duration: 0.4)) {
                state.pupilSize = PupilState.neutral.rawValue
            }
        }
    }
    
    // MARK: - Iris Shimmer
    
    /// Continuous subtle iris shimmer - makes the eye feel alive
    func startShimmer() {
        shimmerTask?.cancel()
        shimmerTask = Task { @MainActor in
            while !Task.isCancelled {
                withAnimation(.easeInOut(duration: 2.0)) {
                    state.shimmerIntensity = 0.9
                }
                try? await Task.sleep(nanoseconds: 2_000_000_000)
                guard !Task.isCancelled else { return }
                
                withAnimation(.easeInOut(duration: 2.0)) {
                    state.shimmerIntensity = 0.5
                }
                try? await Task.sleep(nanoseconds: 2_000_000_000)
            }
        }
    }
    
    func stopShimmer() {
        shimmerTask?.cancel()
    }
    
    // MARK: - Glow Bleeding (Aura)
    
    /// Emotional glow colors
    enum GlowMood {
        case neutral
        case warm
        case concerned
        case excited
        case calm
        case protective
        
        var color: Color {
            switch self {
            case .neutral: return Color(hex: 0x4a6741).opacity(0.4)   // Sage
            case .warm: return Color(hex: 0xc4a265).opacity(0.5)      // Golden
            case .concerned: return Color(hex: 0xa67a6a).opacity(0.45) // Earthy
            case .excited: return Color(hex: 0xc4856a).opacity(0.5)   // Coral
            case .calm: return Color(hex: 0x3a6b73).opacity(0.45)     // Ocean
            case .protective: return Color(hex: 0x9a7b5a).opacity(0.5) // Embrace
            }
        }
    }
    
    /// Set the emotional glow aura
    func setGlowMood(_ mood: GlowMood, bleedAmount: CGFloat = 0.3) {
        withAnimation(.easeOut(duration: 0.6)) {
            glowColor = mood.color
            state.glowIntensity = 0.4 + Double(bleedAmount) * 0.4
            state.glowScale = 1.0 + bleedAmount * 0.5
        }
    }
    
    /// Continuous glow pulse for ambient life
    func startGlowPulse() {
        glowPulseTask?.cancel()
        glowPulseTask = Task { @MainActor in
            while !Task.isCancelled {
                // Fibonacci timing: 610ms cycle
                withAnimation(.easeInOut(duration: 0.61)) {
                    state.glowIntensity += 0.1
                    state.glowScale = 1.05
                }
                try? await Task.sleep(nanoseconds: 610_000_000)
                guard !Task.isCancelled else { return }
                
                withAnimation(.easeInOut(duration: 0.61)) {
                    state.glowIntensity -= 0.1
                    state.glowScale = 1.0
                }
                try? await Task.sleep(nanoseconds: 610_000_000)
            }
        }
    }
    
    // MARK: - Memory Spark
    
    /// Flash recognition when recalling shared history
    func playMemorySpark() {
        state.memorySparkActive = true
        
        Task { @MainActor in
            // Quick bright flash
            withAnimation(.easeOut(duration: AnimationTiming.memorySparkDuration)) {
                state.glowIntensity = 0.9
                state.glowScale = 1.3
            }
            try? await Task.sleep(nanoseconds: 300_000_000)
            
            // Fade back
            withAnimation(.easeOut(duration: 0.5)) {
                state.glowIntensity = 0.4
                state.glowScale = 1.0
                state.memorySparkActive = false
            }
        }
    }
    
    // MARK: - Comfort Pulse
    
    /// Visual "hug" during emotionally heavy moments
    func playComfortPulse(count: Int = 2) {
        state.comfortPulseActive = true
        
        Task { @MainActor in
            for _ in 0..<count {
                // Pulse outward with warmth
                withAnimation(.easeOut(duration: 0.5)) {
                    glowColor = GlowMood.protective.color
                    state.glowScale = 1.4
                    state.glowIntensity = 0.7
                }
                try? await Task.sleep(nanoseconds: 500_000_000)
                guard !Task.isCancelled else { return }
                
                // Contract back
                withAnimation(.easeInOut(duration: 0.5)) {
                    state.glowScale = 1.1
                    state.glowIntensity = 0.5
                }
                try? await Task.sleep(nanoseconds: 500_000_000)
            }
            
            // Return to normal
            withAnimation(.easeOut(duration: 0.3)) {
                glowColor = GlowMood.neutral.color
                state.glowScale = 1.0
                state.glowIntensity = 0.4
                state.comfortPulseActive = false
            }
        }
    }
    
    // MARK: - Warmth Bloom
    
    /// Emotional warmth radiating outward (for connection moments)
    func playWarmthBloom() {
        state.warmthBloomActive = true
        
        Task { @MainActor in
            // Expand with golden warmth
            withAnimation(.easeOut(duration: 0.6)) {
                glowColor = GlowMood.warm.color
                state.glowScale = 1.6
                state.glowIntensity = 0.8
            }
            try? await Task.sleep(nanoseconds: 600_000_000)
            
            // Fade out
            withAnimation(.easeOut(duration: 0.9)) {
                state.glowScale = 1.8
                state.glowIntensity = 0.0
            }
            try? await Task.sleep(nanoseconds: 900_000_000)
            
            // Reset
            withAnimation(.easeOut(duration: 0.3)) {
                glowColor = GlowMood.neutral.color
                state.glowScale = 1.0
                state.glowIntensity = 0.4
                state.warmthBloomActive = false
            }
        }
    }
    
    // MARK: - Growth Celebration
    
    /// Celebrate user progress with expanding burst
    func playGrowthCelebration() {
        Task { @MainActor in
            // Bright burst
            withAnimation(.easeOut(duration: 0.3)) {
                glowColor = GlowMood.warm.color
                state.glowScale = 2.0
                state.glowIntensity = 1.0
            }
            try? await Task.sleep(nanoseconds: 300_000_000)
            
            // Multiple ripples
            for i in 0..<3 {
                let delay = Double(i) * 0.15
                try? await Task.sleep(nanoseconds: UInt64(delay * 1_000_000_000))
                
                withAnimation(.easeOut(duration: 0.4)) {
                    state.glowScale = 1.5 + CGFloat(i) * 0.3
                    state.glowIntensity = 0.8 - Double(i) * 0.2
                }
            }
            
            try? await Task.sleep(nanoseconds: 600_000_000)
            
            // Settle
            withAnimation(.easeOut(duration: 0.4)) {
                glowColor = GlowMood.neutral.color
                state.glowScale = 1.0
                state.glowIntensity = 0.4
            }
        }
    }
    
    // MARK: - Gaze Patterns
    
    /// Natural eye movement - looking around with interest
    func startNaturalGaze() {
        gazeTask?.cancel()
        gazeTask = Task { @MainActor in
            while !Task.isCancelled {
                // Random saccade interval (2-5 seconds)
                let interval = Double.random(in: 2.0...5.0)
                try? await Task.sleep(nanoseconds: UInt64(interval * 1_000_000_000))
                guard !Task.isCancelled else { return }
                
                // Small random gaze shift
                let offsetX = CGFloat.random(in: -3...3)
                let offsetY = CGFloat.random(in: -2...2)
                
                withAnimation(.easeOut(duration: 0.05)) {
                    state.pupilOffsetX = offsetX
                    state.pupilOffsetY = offsetY
                }
                
                // Return to center after a moment
                try? await Task.sleep(nanoseconds: 800_000_000)
                withAnimation(.easeOut(duration: 0.2)) {
                    state.pupilOffsetX = 0
                    state.pupilOffsetY = 0
                }
            }
        }
    }
    
    func stopNaturalGaze() {
        gazeTask?.cancel()
        withAnimation(.easeOut(duration: 0.2)) {
            state.pupilOffsetX = 0
            state.pupilOffsetY = 0
        }
    }
    
    /// Look toward a direction (follow user's attention)
    func gazeTo(x: CGFloat, y: CGFloat) {
        let maxOffset: CGFloat = 4
        withAnimation(.easeOut(duration: 0.15)) {
            state.pupilOffsetX = max(-maxOffset, min(maxOffset, x))
            state.pupilOffsetY = max(-maxOffset, min(maxOffset, y))
        }
    }
    
    // MARK: - Relationship Warmth
    
    /// Update relationship warmth (affects baseline glow)
    func updateRelationshipWarmth(_ warmth: Double) {
        relationshipWarmth = max(0, min(1, warmth))
        
        // Warmer relationship = slightly larger, warmer glow
        withAnimation(.easeOut(duration: 1.0)) {
            state.glowIntensity = 0.3 + warmth * 0.3
        }
    }
}

// MARK: - Animated Glow View

/// View that renders the animated glow halo with soul effects
struct SoulGlowView: View {
    @ObservedObject var soul: AvatarSoul
    let persona: Persona
    let size: CGFloat
    
    var body: some View {
        ZStack {
            // Outer glow bleed
            Circle()
                .fill(
                    RadialGradient(
                        colors: [
                            soul.glowColor.opacity(soul.state.glowIntensity),
                            soul.glowColor.opacity(soul.state.glowIntensity * 0.5),
                            Color.clear
                        ],
                        center: .center,
                        startRadius: size * 0.4,
                        endRadius: size * 0.9
                    )
                )
                .frame(width: size * 1.8, height: size * 1.8)
                .scaleEffect(soul.state.glowScale)
            
            // Memory spark flash
            if soul.state.memorySparkActive {
                Circle()
                    .fill(Color(hex: 0xffd764).opacity(0.6))
                    .frame(width: size * 0.5, height: size * 0.5)
                    .blur(radius: 10)
            }
            
            // Comfort pulse rings
            if soul.state.comfortPulseActive {
                ForEach(0..<3, id: \.self) { i in
                    Circle()
                        .stroke(
                            Color(hex: 0x9a7b5a).opacity(0.3 - Double(i) * 0.1),
                            lineWidth: 2
                        )
                        .frame(width: size * (1.2 + CGFloat(i) * 0.2),
                               height: size * (1.2 + CGFloat(i) * 0.2))
                }
            }
        }
    }
}

