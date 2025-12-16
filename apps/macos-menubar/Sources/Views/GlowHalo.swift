import SwiftUI

// MARK: - Glow Halo

/// Animated glow rings around the avatar
/// Matches the halo effect from frontend-typescript/src/ui/avatar-soul.ui.ts
struct GlowHalo: View {
    let persona: Persona
    let size: CGFloat
    let state: VoiceState
    
    @State private var innerScale: CGFloat = 1.0
    @State private var outerScale: CGFloat = 1.0
    @State private var innerOpacity: Double = 0.3
    @State private var outerOpacity: Double = 0.15
    @State private var pulseScale: CGFloat = 1.0
    
    // Ring sizes relative to avatar
    private let innerRingSize: CGFloat = 1.2
    private let outerRingSize: CGFloat = 1.5
    
    var body: some View {
        ZStack {
            // Outer glow (ambient)
            Circle()
                .fill(
                    RadialGradient(
                        colors: [
                            persona.glowColor.opacity(outerOpacity),
                            persona.glowColor.opacity(outerOpacity * 0.5),
                            Color.clear
                        ],
                        center: .center,
                        startRadius: size * 0.4,
                        endRadius: size * outerRingSize / 2
                    )
                )
                .frame(width: size * outerRingSize, height: size * outerRingSize)
                .scaleEffect(outerScale)
            
            // Inner presence ring
            Circle()
                .stroke(persona.primaryColor.opacity(innerOpacity), lineWidth: 2)
                .frame(width: size * innerRingSize, height: size * innerRingSize)
                .scaleEffect(innerScale)
            
            // Pulse ring (only when speaking/active)
            if state == .speaking {
                Circle()
                    .stroke(persona.primaryColor.opacity(0.4), lineWidth: 3)
                    .frame(width: size * 1.1, height: size * 1.1)
                    .scaleEffect(pulseScale)
                    .opacity(2 - pulseScale) // Fade as it expands
            }
        }
        .onAppear {
            startAnimations()
        }
        .onChange(of: state) { newState in
            updateAnimations(for: newState)
        }
    }
    
    // MARK: - Animations
    
    private func startAnimations() {
        // Breathing sync for inner ring
        // From design-system/tokens/animation.json: breathDuration = 5000ms
        withAnimation(
            .easeInOut(duration: 5.0)
            .repeatForever(autoreverses: true)
        ) {
            innerScale = 1.03
            innerOpacity = 0.4
        }
        
        // Slower ambient glow for outer ring
        withAnimation(
            .easeInOut(duration: 8.0)
            .repeatForever(autoreverses: true)
        ) {
            outerScale = 1.05
            outerOpacity = 0.2
        }
        
        updateAnimations(for: state)
    }
    
    private func updateAnimations(for state: VoiceState) {
        switch state {
        case .speaking:
            // Pulsing outward when speaking
            withAnimation(
                .easeOut(duration: 1.2)
                .repeatForever(autoreverses: false)
            ) {
                pulseScale = 1.8
            }
            
        case .listening:
            // Gentle inward focus when listening
            withAnimation(.easeInOut(duration: 0.3)) {
                innerScale = 1.05
                innerOpacity = 0.5
            }
            
        case .thinking:
            // Subtle pulse when thinking
            withAnimation(
                .easeInOut(duration: 1.5)
                .repeatForever(autoreverses: true)
            ) {
                innerOpacity = 0.35
            }
            
        case .connected:
            // Steady warm glow when connected
            withAnimation(.easeOut(duration: 0.5)) {
                innerOpacity = 0.35
                outerOpacity = 0.2
            }
            
        default:
            // Dim when inactive
            withAnimation(.easeOut(duration: 0.3)) {
                innerOpacity = 0.2
                outerOpacity = 0.1
            }
        }
    }
}

// MARK: - Warmth Bloom

/// Emotional warmth burst animation
/// From frontend-typescript/src/ui/avatar-soul.ui.ts: soul-warmth-bloom
struct WarmthBloom: View {
    let persona: Persona
    let size: CGFloat
    @Binding var isActive: Bool
    
    @State private var scale: CGFloat = 0.95
    @State private var opacity: Double = 0
    
    var body: some View {
        Circle()
            .fill(
                RadialGradient(
                    colors: [
                        Color(hex: 0xc4a265).opacity(0.4),
                        Color(hex: 0xc4a265).opacity(0.2),
                        Color.clear
                    ],
                    center: .center,
                    startRadius: 0,
                    endRadius: size * 0.7
                )
            )
            .frame(width: size * 1.4, height: size * 1.4)
            .scaleEffect(scale)
            .opacity(opacity)
            .onChange(of: isActive) { active in
                if active {
                    playBloom()
                }
            }
    }
    
    private func playBloom() {
        // Reset
        scale = 0.95
        opacity = 0
        
        // Animate bloom
        withAnimation(.easeOut(duration: 0.6)) {
            scale = 1.05
            opacity = 0.4
        }
        
        // Fade out
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.6) {
            withAnimation(.easeOut(duration: 0.9)) {
                scale = 1.2
                opacity = 0
            }
        }
        
        // Reset active flag
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) {
            isActive = false
        }
    }
}

// MARK: - Preview

#Preview {
    ZStack {
        Color(hex: 0x584840)
        
        GlowHalo(
            persona: PersonaRegistry.ferni,
            size: 100,
            state: .speaking
        )
    }
    .frame(width: 300, height: 300)
}

