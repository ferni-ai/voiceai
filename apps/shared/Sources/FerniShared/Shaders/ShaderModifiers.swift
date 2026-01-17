import SwiftUI

// MARK: - Shader View Modifiers
/// SwiftUI view modifiers for applying Ferni's Metal shaders.
/// These create GPU-accelerated visual effects for emotional presence.
///
/// Requires iOS 17+ / macOS 14+ for native shader support.
/// Falls back gracefully on older versions.

// MARK: - Breathing Glow Modifier

@available(iOS 17.0, macOS 14.0, *)
public struct BreathingGlowModifier: ViewModifier {
    let breathPhase: CGFloat
    let glowColor: Color
    let intensity: CGFloat

    @State private var time: CGFloat = 0
    private let timer = Timer.publish(every: 1/60, on: .main, in: .common).autoconnect()

    public func body(content: Content) -> some View {
        content
            .colorEffect(
                ShaderLibrary.breathingGlow(
                    .float(time),
                    .float(breathPhase),
                    .color(glowColor),
                    .float(intensity)
                )
            )
            .onReceive(timer) { _ in
                time += 1/60
            }
    }
}

@available(iOS 17.0, macOS 14.0, *)
public extension View {
    /// Apply breathing glow effect synchronized with breath phase
    func breathingGlow(
        phase: CGFloat,
        color: Color = Color(red: 0.29, green: 0.40, blue: 0.25),
        intensity: CGFloat = 0.5
    ) -> some View {
        self.modifier(BreathingGlowModifier(
            breathPhase: phase,
            glowColor: color,
            intensity: intensity
        ))
    }
}

// MARK: - Emotional Aura Modifier

@available(iOS 17.0, macOS 14.0, *)
public struct EmotionalAuraModifier: ViewModifier {
    let moodValue: CGFloat
    let primaryColor: Color
    let warmth: CGFloat

    @State private var time: CGFloat = 0
    private let timer = Timer.publish(every: 1/60, on: .main, in: .common).autoconnect()

    public func body(content: Content) -> some View {
        content
            .colorEffect(
                ShaderLibrary.emotionalAura(
                    .float(time),
                    .float(moodValue),
                    .color(primaryColor),
                    .float(warmth)
                )
            )
            .onReceive(timer) { _ in
                time += 1/60
            }
    }
}

@available(iOS 17.0, macOS 14.0, *)
public extension View {
    /// Apply emotional aura effect based on mood state
    func emotionalAura(
        mood: CGFloat,
        personaColor: Color = Color(red: 0.29, green: 0.40, blue: 0.25),
        warmth: CGFloat = 0
    ) -> some View {
        self.modifier(EmotionalAuraModifier(
            moodValue: mood,
            primaryColor: personaColor,
            warmth: warmth
        ))
    }
}

// MARK: - Memory Sparkle Modifier

@available(iOS 17.0, macOS 14.0, *)
public struct MemorySparkleModifier: ViewModifier {
    let intensity: CGFloat
    let sparkleColor: Color

    @State private var time: CGFloat = 0
    private let timer = Timer.publish(every: 1/60, on: .main, in: .common).autoconnect()

    public func body(content: Content) -> some View {
        content
            .colorEffect(
                ShaderLibrary.memorySparkle(
                    .float(time),
                    .float(intensity),
                    .color(sparkleColor)
                )
            )
            .onReceive(timer) { _ in
                time += 1/60
            }
    }
}

@available(iOS 17.0, macOS 14.0, *)
public extension View {
    /// Apply memory sparkle effect for recognition moments
    func memorySparkle(
        intensity: CGFloat = 0.8,
        color: Color = Color(red: 0.77, green: 0.63, blue: 0.40)  // Gold
    ) -> some View {
        self.modifier(MemorySparkleModifier(
            intensity: intensity,
            sparkleColor: color
        ))
    }
}

// MARK: - Warmth Wave Modifier

@available(iOS 17.0, macOS 14.0, *)
public struct WarmthWaveModifier: ViewModifier {
    let progress: CGFloat
    let warmthColor: Color

    @State private var time: CGFloat = 0
    private let timer = Timer.publish(every: 1/60, on: .main, in: .common).autoconnect()

    public func body(content: Content) -> some View {
        content
            .colorEffect(
                ShaderLibrary.warmthWave(
                    .float(time),
                    .float(progress),
                    .color(warmthColor)
                )
            )
            .onReceive(timer) { _ in
                time += 1/60
            }
    }
}

@available(iOS 17.0, macOS 14.0, *)
public extension View {
    /// Apply warmth wave effect for connection moments
    func warmthWave(
        progress: CGFloat,
        color: Color = Color(red: 1.0, green: 0.85, blue: 0.6)  // Amber
    ) -> some View {
        self.modifier(WarmthWaveModifier(
            progress: progress,
            warmthColor: color
        ))
    }
}

// MARK: - Concern Pulse Modifier

@available(iOS 17.0, macOS 14.0, *)
public struct ConcernPulseModifier: ViewModifier {
    let concernLevel: CGFloat
    let careColor: Color

    @State private var time: CGFloat = 0
    private let timer = Timer.publish(every: 1/60, on: .main, in: .common).autoconnect()

    public func body(content: Content) -> some View {
        content
            .colorEffect(
                ShaderLibrary.concernPulse(
                    .float(time),
                    .float(concernLevel),
                    .color(careColor)
                )
            )
            .onReceive(timer) { _ in
                time += 1/60
            }
    }
}

@available(iOS 17.0, macOS 14.0, *)
public extension View {
    /// Apply concern pulse effect for empathetic moments
    func concernPulse(
        level: CGFloat,
        color: Color = Color(red: 0.8, green: 0.6, blue: 0.7)  // Soft pink
    ) -> some View {
        self.modifier(ConcernPulseModifier(
            concernLevel: level,
            careColor: color
        ))
    }
}

// MARK: - Fallback for Pre-iOS 17

/// Fallback glow effect using SwiftUI's built-in capabilities
/// Used on devices that don't support custom Metal shaders
public struct FallbackGlowModifier: ViewModifier {
    let color: Color
    let radius: CGFloat
    let intensity: CGFloat

    public func body(content: Content) -> some View {
        content
            .shadow(color: color.opacity(intensity), radius: radius)
            .shadow(color: color.opacity(intensity * 0.5), radius: radius * 2)
    }
}

public extension View {
    /// Apply glow effect (uses shader on iOS 17+/macOS 14+, fallback otherwise)
    @ViewBuilder
    func ferniGlow(
        phase: CGFloat = 0.5,
        color: Color = Color(red: 0.29, green: 0.40, blue: 0.25),
        intensity: CGFloat = 0.5
    ) -> some View {
        if #available(iOS 17.0, macOS 14.0, *) {
            self.breathingGlow(phase: phase, color: color, intensity: intensity)
        } else {
            self.modifier(FallbackGlowModifier(
                color: color,
                radius: 20 * intensity,
                intensity: intensity
            ))
        }
    }
}

// MARK: - Shader Availability Check

public struct ShaderCapabilities {
    /// Check if device supports Metal shaders
    public static var supportsMetalShaders: Bool {
        if #available(iOS 17.0, *) {
            return true
        }
        return false
    }

    /// Recommended shader quality based on device
    public static var recommendedQuality: ShaderQuality {
        // Could add more sophisticated device detection here
        if #available(iOS 17.0, *) {
            return .high
        }
        return .fallback
    }

    public enum ShaderQuality {
        case high       // Full Metal shader effects
        case medium     // Reduced complexity shaders
        case fallback   // SwiftUI-only effects
    }
}

// MARK: - Preview

#if DEBUG
@available(iOS 17.0, macOS 14.0, *)
struct ShaderModifiers_Previews: PreviewProvider {
    static var previews: some View {
        VStack(spacing: 20) {
            // Breathing glow
            Circle()
                .fill(Color(red: 0.29, green: 0.40, blue: 0.25))
                .frame(width: 100, height: 100)
                .breathingGlow(phase: 0.5)

            // Memory sparkle
            RoundedRectangle(cornerRadius: 20)
                .fill(Color(red: 0.15, green: 0.13, blue: 0.11))
                .frame(width: 200, height: 100)
                .memorySparkle(intensity: 0.8)
        }
        .padding()
        .background(Color.black)
    }
}
#endif
