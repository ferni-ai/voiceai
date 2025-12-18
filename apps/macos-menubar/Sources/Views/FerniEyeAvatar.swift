import SwiftUI

// MARK: - Ferni Eye Avatar

/// The iconic Ferni eye avatar - a "thinking stone" with soul
/// Matches the SVG from apps/web/src/ui/ferni-logo.ui.ts
struct FerniEyeAvatar: View {
    let persona: Persona
    let size: CGFloat
    let isActive: Bool
    
    @State private var breatheScale: CGFloat = 1.0
    @State private var pupilOffset: CGPoint = .zero
    @State private var irisShimmer: Double = 0.6
    
    // Animation timing from design-system/tokens/animation.json
    private let breatheDuration: Double = 5.0
    private let shimmerDuration: Double = 3.0
    
    var body: some View {
        ZStack {
            // Outer stone (persona color)
            Circle()
                .fill(
                    RadialGradient(
                        colors: [
                            persona.primaryColor.opacity(0.95),
                            persona.secondaryColor
                        ],
                        center: .center,
                        startRadius: 0,
                        endRadius: size / 2
                    )
                )
                .frame(width: size, height: size)
            
            // Eye white (sclera)
            Circle()
                .fill(
                    RadialGradient(
                        colors: [
                            Color.white,
                            Color(white: 0.95)
                        ],
                        center: .topLeading,
                        startRadius: 0,
                        endRadius: size * 0.4
                    )
                )
                .frame(width: size * 0.36, height: size * 0.36)
            
            // Iris with shimmer
            Circle()
                .fill(
                    RadialGradient(
                        colors: [
                            persona.primaryColor.opacity(0.9),
                            persona.primaryColor.opacity(0.7)
                        ],
                        center: .topLeading,
                        startRadius: 0,
                        endRadius: size * 0.15
                    )
                )
                .frame(width: size * 0.24, height: size * 0.24)
                .overlay(
                    // Iris shimmer highlight
                    Circle()
                        .fill(
                            RadialGradient(
                                colors: [
                                    Color.white.opacity(0.3 * irisShimmer),
                                    Color.clear
                                ],
                                center: .topLeading,
                                startRadius: 0,
                                endRadius: size * 0.12
                            )
                        )
                )
                .offset(x: pupilOffset.x * 2, y: pupilOffset.y * 2)
            
            // Pupil
            Circle()
                .fill(Color(hex: 0x1a1612))
                .frame(width: size * 0.12, height: size * 0.12)
                .offset(x: pupilOffset.x * 3, y: pupilOffset.y * 3)
            
            // Catchlight (eye reflection)
            Circle()
                .fill(Color.white.opacity(0.85))
                .frame(width: size * 0.04, height: size * 0.04)
                .offset(x: -size * 0.03 + pupilOffset.x * 2, y: -size * 0.03 + pupilOffset.y * 2)
        }
        .scaleEffect(breatheScale)
        .onAppear {
            startBreathingAnimation()
            startShimmerAnimation()
        }
        .onChange(of: isActive) { active in
            if active {
                startBreathingAnimation()
            }
        }
    }
    
    // MARK: - Animations
    
    private func startBreathingAnimation() {
        guard isActive else { return }
        
        // Human-like breathing: inhale is slightly faster than exhale
        // From apps/web/src/ui/presence.ui.ts
        withAnimation(
            .easeInOut(duration: breatheDuration * 0.4)
            .repeatForever(autoreverses: true)
        ) {
            breatheScale = 1.025
        }
    }
    
    private func startShimmerAnimation() {
        // Subtle iris shimmer - makes the eye feel alive
        withAnimation(
            .easeInOut(duration: shimmerDuration)
            .repeatForever(autoreverses: true)
        ) {
            irisShimmer = 0.9
        }
    }
    
    /// Move pupil to track something (creates life)
    func trackPoint(_ point: CGPoint, in bounds: CGRect) {
        let center = CGPoint(x: bounds.midX, y: bounds.midY)
        let dx = (point.x - center.x) / bounds.width
        let dy = (point.y - center.y) / bounds.height
        
        // Limit movement to small range
        let maxOffset: CGFloat = 3
        withAnimation(.easeOut(duration: 0.15)) {
            pupilOffset = CGPoint(
                x: max(-maxOffset, min(maxOffset, dx * maxOffset * 2)),
                y: max(-maxOffset, min(maxOffset, dy * maxOffset * 2))
            )
        }
    }
}

// MARK: - Preview

#Preview {
    VStack(spacing: 40) {
        ForEach([PersonaRegistry.ferni, PersonaRegistry.maya, PersonaRegistry.peter]) { persona in
            HStack(spacing: 20) {
                FerniEyeAvatar(persona: persona, size: 80, isActive: true)
                VStack(alignment: .leading) {
                    Text(persona.name)
                        .font(.headline)
                    Text(persona.role)
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
            }
        }
    }
    .padding(40)
    .background(Color(hex: 0x584840))
}

