import SwiftUI

// MARK: - Avatar Composite

/// Complete avatar with eye, halo, and waveform
/// The full "soul" of Ferni as seen in the web app
struct AvatarComposite: View {
    let persona: Persona
    let state: VoiceState
    let size: CGFloat
    
    @State private var showWarmthBloom = false
    @State private var breatheScale: CGFloat = 1.0
    
    var body: some View {
        ZStack {
            // Background glow halo
            GlowHalo(persona: persona, size: size, state: state)
            
            // Warmth bloom (for special moments)
            WarmthBloom(persona: persona, size: size, isActive: $showWarmthBloom)
            
            // Waveform ring (when speaking/listening)
            if state.showWaveform {
                WaveformRing(persona: persona, size: size, isActive: state.isActive)
                    .transition(.opacity.combined(with: .scale(scale: 0.9)))
            }
            
            // Main avatar eye
            FerniEyeAvatar(persona: persona, size: size, isActive: state.isActive)
                .scaleEffect(breatheScale)
        }
        .frame(width: size * 1.8, height: size * 1.8)
        .onAppear {
            startBreathing()
        }
        .onChange(of: state) { newState in
            handleStateChange(newState)
        }
    }
    
    // MARK: - Animations
    
    private func startBreathing() {
        // Global breathing sync
        // From design-system/tokens/animation.json
        withAnimation(
            .easeInOut(duration: 5.0)
            .repeatForever(autoreverses: true)
        ) {
            breatheScale = 1.0 + (0.025 * state.breathingIntensity)
        }
    }
    
    private func handleStateChange(_ state: VoiceState) {
        // Update breathing intensity
        withAnimation(.easeInOut(duration: 0.5)) {
            breatheScale = 1.0
        }
        startBreathing()
        
        // Trigger warmth bloom on connection
        if state == .connected {
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
                showWarmthBloom = true
            }
        }
    }
    
    /// Trigger a warmth bloom (for emotional moments)
    func triggerWarmth() {
        showWarmthBloom = true
    }
}

// MARK: - Compact Avatar (for menubar)

/// Smaller avatar for menubar/compact displays
struct CompactAvatar: View {
    let persona: Persona
    let state: VoiceState
    let size: CGFloat
    
    @State private var pulseOpacity: Double = 0.3
    
    var body: some View {
        ZStack {
            // Simple glow ring
            Circle()
                .stroke(persona.primaryColor.opacity(pulseOpacity), lineWidth: 2)
                .frame(width: size + 4, height: size + 4)
            
            // Avatar
            FerniEyeAvatar(persona: persona, size: size, isActive: state.isActive)
        }
        .onAppear {
            startPulse()
        }
    }
    
    private func startPulse() {
        withAnimation(
            .easeInOut(duration: 2.0)
            .repeatForever(autoreverses: true)
        ) {
            pulseOpacity = state.isActive ? 0.6 : 0.3
        }
    }
}

// MARK: - Preview

#Preview("Full Avatar") {
    VStack(spacing: 40) {
        AvatarComposite(persona: PersonaRegistry.ferni, state: .connected, size: 100)
        AvatarComposite(persona: PersonaRegistry.maya, state: .speaking, size: 100)
        AvatarComposite(persona: PersonaRegistry.peter, state: .listening, size: 100)
    }
    .padding(60)
    .background(Color(hex: 0x584840))
}

#Preview("Compact") {
    HStack(spacing: 20) {
        ForEach(PersonaRegistry.all) { persona in
            CompactAvatar(persona: persona, state: .connected, size: 32)
        }
    }
    .padding(20)
    .background(Color(hex: 0x2c2520))
}

