import SwiftUI

// MARK: - Text Avatar (Like the TypeScript App)

/**
 * Text-based avatar matching the web app design:
 * - Two-letter initials (FN, MS, AC, etc.)
 * - Gradient background with persona colors
 * - Animated ring/halo that pulses with voice state
 * - Glow effects based on emotional state
 * - Pixar-style bounce and reaction animations
 */
struct TextAvatar: View {
    let persona: Persona
    let voiceState: VoiceState
    let size: CGFloat
    
    // Animation state
    @State private var ringScale: CGFloat = 1.0
    @State private var ringOpacity: Double = 0.4
    @State private var glowIntensity: Double = 0.3
    @State private var avatarScale: CGFloat = 1.0
    @State private var avatarOffset: CGFloat = 0
    @State private var isBreathing = false
    
    // Pixar lamp animation
    @StateObject private var lamp = AvatarLamp()
    
    var body: some View {
        ZStack {
            // Outer glow halo
            glowHalo
            
            // Animated ring
            avatarRing
            
            // Main avatar circle with initials
            avatarCircle
        }
        .frame(width: size * 2, height: size * 2)
        .scaleEffect(avatarScale)
        .offset(y: avatarOffset)
        .onChange(of: voiceState) { newState in
            handleStateChange(newState)
        }
        .onAppear {
            startBreathingAnimation()
            handleStateChange(voiceState)
        }
    }
    
    // MARK: - Glow Halo
    
    private var glowHalo: some View {
        ZStack {
            // Outer soft glow
            Circle()
                .fill(
                    RadialGradient(
                        colors: [
                            persona.glowColor.opacity(glowIntensity * 0.6),
                            persona.glowColor.opacity(glowIntensity * 0.3),
                            Color.clear
                        ],
                        center: .center,
                        startRadius: size * 0.4,
                        endRadius: size * 1.2
                    )
                )
                .frame(width: size * 2.4, height: size * 2.4)
            
            // Inner warm glow
            Circle()
                .fill(
                    RadialGradient(
                        colors: [
                            persona.primaryColor.opacity(glowIntensity * 0.4),
                            Color.clear
                        ],
                        center: .center,
                        startRadius: size * 0.3,
                        endRadius: size * 0.8
                    )
                )
                .frame(width: size * 1.6, height: size * 1.6)
        }
    }
    
    // MARK: - Avatar Ring
    
    private var avatarRing: some View {
        Circle()
            .stroke(
                LinearGradient(
                    colors: [
                        persona.primaryColor.opacity(0.8),
                        persona.secondaryColor.opacity(0.6)
                    ],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                ),
                lineWidth: 3
            )
            .frame(width: size * 1.15, height: size * 1.15)
            .scaleEffect(ringScale)
            .opacity(ringOpacity)
    }
    
    // MARK: - Avatar Circle with Initials
    
    private var avatarCircle: some View {
        ZStack {
            // Background gradient
            Circle()
                .fill(
                    LinearGradient(
                        colors: [
                            persona.primaryColor,
                            persona.secondaryColor
                        ],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )
                .frame(width: size, height: size)
                .shadow(color: persona.glowColor.opacity(0.5), radius: 10)
            
            // Initials text
            Text(persona.initials)
                .font(.system(size: size * 0.4, weight: .heavy, design: .rounded))
                .foregroundColor(.white)
                .shadow(color: .black.opacity(0.3), radius: 2, y: 2)
        }
    }
    
    // MARK: - State Handling
    
    private func handleStateChange(_ state: VoiceState) {
        switch state {
        case .disconnected:
            stopAnimations()
            setGlowIntensity(0.2)
            setRingPulse(false)
            
        case .connecting:
            startBreathingAnimation()
            setGlowIntensity(0.4)
            playReaction(.curious)
            
        case .connected:
            startBreathingAnimation()
            setGlowIntensity(0.5)
            setRingPulse(true)
            playReaction(.happy)
            
        case .listening:
            setGlowIntensity(0.6)
            setRingGlow(true)
            playReaction(.listening)
            
        case .speaking:
            setGlowIntensity(0.7)
            setRingPulse(true)
            startSpeakingPulse()
            
        case .thinking:
            setGlowIntensity(0.5)
            playReaction(.thinking)
            
        case .error:
            setGlowIntensity(0.3)
            playReaction(.sad)
        }
    }
    
    // MARK: - Animations
    
    private func startBreathingAnimation() {
        guard !isBreathing else { return }
        isBreathing = true
        
        // Subtle breathing scale
        withAnimation(
            .easeInOut(duration: 4.0)
            .repeatForever(autoreverses: true)
        ) {
            avatarScale = 1.02
        }
    }
    
    private func stopAnimations() {
        isBreathing = false
        withAnimation(.easeOut(duration: 0.3)) {
            avatarScale = 1.0
            ringScale = 1.0
        }
    }
    
    private func setGlowIntensity(_ intensity: Double) {
        withAnimation(.easeOut(duration: 0.5)) {
            glowIntensity = intensity
        }
    }
    
    private func setRingPulse(_ active: Bool) {
        if active {
            withAnimation(
                .easeInOut(duration: 1.5)
                .repeatForever(autoreverses: true)
            ) {
                ringScale = 1.08
                ringOpacity = 0.6
            }
        } else {
            withAnimation(.easeOut(duration: 0.3)) {
                ringScale = 1.0
                ringOpacity = 0.4
            }
        }
    }
    
    private func setRingGlow(_ active: Bool) {
        if active {
            withAnimation(
                .easeInOut(duration: 0.8)
                .repeatForever(autoreverses: true)
            ) {
                ringOpacity = 0.8
            }
        }
    }
    
    private func startSpeakingPulse() {
        withAnimation(
            .easeInOut(duration: 0.3)
            .repeatForever(autoreverses: true)
        ) {
            ringScale = 1.12
        }
    }
    
    // MARK: - Pixar Reactions
    
    private func playReaction(_ emotion: LampEmotion) {
        lamp.express(emotion)
        
        // Play Pixar-style reaction animation
        Task { @MainActor in
            // Get bounce parameters based on emotion
            let (bounceScale, bounceOffset): (CGFloat, CGFloat) = {
                switch emotion {
                case .happy, .excited: return (1.08, -6)
                case .curious: return (1.04, -3)
                case .listening: return (1.02, -2)
                case .thinking: return (0.98, 2)
                case .sad: return (0.96, 3)
                default: return (1.03, -2)
                }
            }()
            
            // Bounce up
            withAnimation(.spring(response: 0.4, dampingFraction: 0.6)) {
                avatarScale = bounceScale
                avatarOffset = bounceOffset
            }
            
            try? await Task.sleep(nanoseconds: 400_000_000)
            
            // Settle back
            withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                avatarScale = isBreathing ? 1.02 : 1.0
                avatarOffset = 0
            }
        }
    }
}

// MARK: - Full Avatar Composite (Text + Halo + Waveform + Name)

struct FullAvatarComposite: View {
    let persona: Persona
    let voiceState: VoiceState
    let size: CGFloat
    let showName: Bool
    let showWaveform: Bool
    
    init(
        persona: Persona,
        voiceState: VoiceState,
        size: CGFloat = 80,
        showName: Bool = true,
        showWaveform: Bool = true
    ) {
        self.persona = persona
        self.voiceState = voiceState
        self.size = size
        self.showName = showName
        self.showWaveform = showWaveform
    }
    
    var body: some View {
        VStack(spacing: 12) {
            ZStack {
                // Aurora edge effect (when active)
                if voiceState.isActive {
                    AuroraEdge(
                        persona: persona,
                        isActive: true,
                        cornerRadius: size
                    )
                    .frame(width: size * 1.4, height: size * 1.4)
                    .opacity(0.6)
                }
                
                // Waveform ring (when speaking/listening)
                if showWaveform && voiceState.showWaveform {
                    WaveformRing(
                        persona: persona,
                        size: size * 1.3,
                        isActive: true,
                        segmentCount: 24
                    )
                    .opacity(0.7)
                }
                
                // Main text avatar
                TextAvatar(
                    persona: persona,
                    voiceState: voiceState,
                    size: size
                )
            }
            
            // Name and subtitle
            if showName {
                VStack(spacing: 2) {
                    Text(persona.name)
                        .font(.system(size: 16, weight: .semibold, design: .rounded))
                        .foregroundColor(.white)
                    
                    Text(persona.tagline)
                        .font(.system(size: 12, weight: .medium))
                        .foregroundColor(.white.opacity(0.6))
                }
            }
        }
    }
}

// MARK: - Preview

#Preview("Text Avatar - All States") {
    VStack(spacing: 30) {
        HStack(spacing: 20) {
            TextAvatar(persona: PersonaRegistry.ferni, voiceState: .connected, size: 60)
            TextAvatar(persona: PersonaRegistry.maya, voiceState: .speaking, size: 60)
            TextAvatar(persona: PersonaRegistry.alex, voiceState: .listening, size: 60)
        }
        
        HStack(spacing: 20) {
            TextAvatar(persona: PersonaRegistry.jordan, voiceState: .thinking, size: 60)
            TextAvatar(persona: PersonaRegistry.peter, voiceState: .connecting, size: 60)
            TextAvatar(persona: PersonaRegistry.nayan, voiceState: .disconnected, size: 60)
        }
    }
    .padding(40)
    .background(Color(hex: 0x1a1612))
}

#Preview("Full Composite") {
    VStack(spacing: 30) {
        FullAvatarComposite(
            persona: PersonaRegistry.ferni,
            voiceState: .connected,
            size: 80
        )
        
        FullAvatarComposite(
            persona: PersonaRegistry.maya,
            voiceState: .speaking,
            size: 80
        )
    }
    .padding(40)
    .background(Color(hex: 0x1a1612))
}

