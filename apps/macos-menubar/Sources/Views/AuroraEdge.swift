import SwiftUI

// MARK: - Aurora Edge Animation (Like Gemini)

/// Beautiful rotating gradient animation around the edges.
/// Uses continuous timer animation - NEVER restarts on state changes.
/// Fades opacity instead of restarting to prevent flickering.
struct AuroraEdge: View {
    let persona: Persona
    let isActive: Bool
    let cornerRadius: CGFloat

    // Continuous animation - NEVER restarts
    @State private var time: Double = 0
    @State private var isTimerRunning = false

    var body: some View {
        GeometryReader { geometry in
            ZStack {
                // Animated conic gradient border
                RoundedRectangle(cornerRadius: cornerRadius)
                    .strokeBorder(
                        AngularGradient(
                            gradient: Gradient(colors: auroraColors),
                            center: .center,
                            startAngle: .degrees(rotationAngle),
                            endAngle: .degrees(rotationAngle + 360)
                        ),
                        lineWidth: 3
                    )
                    .blur(radius: 4)

                // Second layer with offset rotation for depth
                RoundedRectangle(cornerRadius: cornerRadius)
                    .strokeBorder(
                        AngularGradient(
                            gradient: Gradient(colors: auroraColors.reversed()),
                            center: .center,
                            startAngle: .degrees(-rotationAngle * 0.7),
                            endAngle: .degrees(-rotationAngle * 0.7 + 360)
                        ),
                        lineWidth: 2
                    )
                    .blur(radius: 6)
                    .opacity(0.6)

                // Glow effect
                RoundedRectangle(cornerRadius: cornerRadius)
                    .stroke(
                        AngularGradient(
                            gradient: Gradient(colors: auroraColors),
                            center: .center,
                            startAngle: .degrees(rotationAngle),
                            endAngle: .degrees(rotationAngle + 360)
                        ),
                        lineWidth: 1
                    )
            }
        }
        // FADE opacity instead of restarting animation - NO FLICKER!
        .opacity(isActive ? 1 : 0.3)
        .onAppear {
            startContinuousTimer()
        }
    }

    // Continuous rotation angle from time (90°/sec = 4sec per revolution)
    private var rotationAngle: Double {
        time * 90
    }

    // Color phase shifts smoothly over time
    private var colorPhase: Double {
        sin(time * 0.5) * 0.5 + 0.5  // 0-1 oscillation
    }

    // Dynamic aurora colors based on persona and phase
    private var auroraColors: [Color] {
        let baseColors = personaAuroraColors

        // Shift colors based on phase for dynamic effect
        let shiftAmount = Int(colorPhase * 3) % baseColors.count
        var shifted = baseColors
        for _ in 0..<shiftAmount {
            if let first = shifted.first {
                shifted.removeFirst()
                shifted.append(first)
            }
        }

        return shifted
    }

    // Start continuous timer that NEVER restarts
    private func startContinuousTimer() {
        guard !isTimerRunning else { return }
        isTimerRunning = true

        Timer.scheduledTimer(withTimeInterval: 1.0 / 30.0, repeats: true) { _ in
            time += 1.0 / 30.0  // Advance time at 30fps
        }
    }
    
    // Persona-specific aurora color palettes
    private var personaAuroraColors: [Color] {
        switch persona.id {
        case "ferni":
            // Sage greens and earth tones
            return [
                Color(hex: 0x4a6741),  // Sage green
                Color(hex: 0x6b8f65),  // Light sage
                Color(hex: 0xc4a265),  // Gold
                Color(hex: 0x3d5a35),  // Deep green
                Color(hex: 0x9a7b5a),  // Warm brown
                Color(hex: 0x4a6741),  // Sage (wrap)
            ]
            
        case "maya":
            // Rose and terracotta warmth
            return [
                Color(hex: 0xa67a6a),  // Rose
                Color(hex: 0xc4856a),  // Coral
                Color(hex: 0xd4a84a),  // Golden
                Color(hex: 0x8a635a),  // Deep rose
                Color(hex: 0xc4a265),  // Warm gold
                Color(hex: 0xa67a6a),  // Rose (wrap)
            ]
            
        case "alex":
            // Slate blue and professional
            return [
                Color(hex: 0x5a6b8a),  // Slate blue
                Color(hex: 0x7a8ba8),  // Light slate
                Color(hex: 0x3a6b73),  // Teal accent
                Color(hex: 0x4a5a73),  // Deep slate
                Color(hex: 0x6b8f8f),  // Teal
                Color(hex: 0x5a6b8a),  // Slate (wrap)
            ]
            
        case "jordan":
            // Coral and energy
            return [
                Color(hex: 0xc4856a),  // Coral
                Color(hex: 0xe0a060),  // Bright orange
                Color(hex: 0xd4a84a),  // Gold
                Color(hex: 0xa86d55),  // Deep coral
                Color(hex: 0xf0b870),  // Light gold
                Color(hex: 0xc4856a),  // Coral (wrap)
            ]
            
        case "peter":
            // Ocean teal and analytical
            return [
                Color(hex: 0x3a6b73),  // Teal
                Color(hex: 0x5a8b93),  // Light teal
                Color(hex: 0x2d5359),  // Deep teal
                Color(hex: 0x4a7a82),  // Medium teal
                Color(hex: 0x6b9ba3),  // Bright teal
                Color(hex: 0x3a6b73),  // Teal (wrap)
            ]
            
        case "nayan":
            // Golden wisdom
            return [
                Color(hex: 0x9a7b5a),  // Warm brown
                Color(hex: 0xb8956a),  // Gold brown
                Color(hex: 0xd4a84a),  // Bright gold
                Color(hex: 0x7a5b3a),  // Deep brown
                Color(hex: 0xc4a265),  // Light gold
                Color(hex: 0x9a7b5a),  // Brown (wrap)
            ]
            
        default:
            // Default Ferni colors
            return [
                Color(hex: 0x4a6741),
                Color(hex: 0x6b8f65),
                Color(hex: 0xc4a265),
                Color(hex: 0x3d5a35),
                Color(hex: 0x9a7b5a),
                Color(hex: 0x4a6741),
            ]
        }
    }
    
}

// MARK: - Aurora Window Background

/// Full window background with aurora effect.
/// Uses continuous timer - NEVER restarts on state changes.
struct AuroraBackground: View {
    let persona: Persona
    let isActive: Bool

    // Continuous animation - NEVER restarts
    @State private var time: Double = 0
    @State private var isTimerRunning = false

    var body: some View {
        ZStack {
            // Dark base
            Color(hex: 0x1a1612)

            // Subtle aurora glow in background - always present, fades with isActive
            RadialGradient(
                colors: [
                    persona.primaryColor.opacity(glowOpacity),
                    persona.primaryColor.opacity(glowOpacity * 0.5),
                    Color.clear
                ],
                center: .center,
                startRadius: 50,
                endRadius: 200
            )
            .blur(radius: 30)
            .opacity(isActive ? 1 : 0)  // Fade instead of conditional
        }
        .onAppear {
            startContinuousTimer()
        }
    }

    // Smooth oscillating glow (0.3 - 0.5)
    private var glowOpacity: Double {
        0.3 + sin(time * 1.5) * 0.1
    }

    private func startContinuousTimer() {
        guard !isTimerRunning else { return }
        isTimerRunning = true

        Timer.scheduledTimer(withTimeInterval: 1.0 / 30.0, repeats: true) { _ in
            time += 1.0 / 30.0
        }
    }
}

// MARK: - Aurora Frame Modifier

/// Add aurora edge to any view
struct AuroraFrameModifier: ViewModifier {
    let persona: Persona
    let isActive: Bool
    let cornerRadius: CGFloat
    let padding: CGFloat
    
    func body(content: Content) -> some View {
        content
            .background(
                RoundedRectangle(cornerRadius: cornerRadius)
                    .fill(Color(hex: 0x1a1612).opacity(0.85))
            )
            .overlay(
                AuroraEdge(
                    persona: persona,
                    isActive: isActive,
                    cornerRadius: cornerRadius
                )
                .padding(-padding)
            )
    }
}

extension View {
    /// Add an aurora edge effect around the view
    func auroraFrame(
        persona: Persona,
        isActive: Bool = true,
        cornerRadius: CGFloat = 24,
        padding: CGFloat = 2
    ) -> some View {
        modifier(AuroraFrameModifier(
            persona: persona,
            isActive: isActive,
            cornerRadius: cornerRadius,
            padding: padding
        ))
    }
}

// MARK: - Preview

#Preview("Aurora Edge") {
    VStack(spacing: 30) {
        ForEach(PersonaRegistry.all.prefix(3)) { persona in
            RoundedRectangle(cornerRadius: 20)
                .fill(Color(hex: 0x2a2420))
                .frame(width: 200, height: 100)
                .overlay(
                    Text(persona.name)
                        .foregroundColor(.white)
                )
                .auroraFrame(persona: persona, isActive: true)
        }
    }
    .padding(40)
    .background(Color(hex: 0x1a1612))
}

#Preview("Full Window") {
    ZStack {
        AuroraBackground(persona: PersonaRegistry.ferni, isActive: true)
        
        VStack {
            Text("Ferni Voice")
                .font(.title)
                .foregroundColor(.white)
        }
        .frame(width: 200, height: 280)
        .auroraFrame(persona: PersonaRegistry.ferni, isActive: true)
    }
    .frame(width: 300, height: 400)
}

