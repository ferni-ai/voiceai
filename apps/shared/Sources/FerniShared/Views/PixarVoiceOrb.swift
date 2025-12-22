import SwiftUI

// MARK: - Pixar Voice Orb
/// World-class Pixar-inspired voice visualization.
/// Composes all animation layers into a unified, flicker-free experience.
///
/// Architecture:
/// ```
/// PixarVoiceOrb
/// ├── GlowHalo (behind - 3-ring breathing halo)
/// ├── AvatarBody (middle - orb with Lamp transforms)
/// │   ├── Wave ring (audio-reactive)
/// │   └── Core gradient circle
/// ├── AvatarSoul (overlays - shimmer/warmth)
/// └── Initials (top - persona letters)
/// ```
///
/// CRITICAL: Uses continuous timer animation - NEVER restarts on state changes.

public struct PixarVoiceOrb: View {
    public let persona: Persona
    public let isActive: Bool
    public let size: CGFloat
    public let emotionHint: EmotionHint?

    // Continuous animation driver
    @State private var time: Double = 0
    @State private var isTimerRunning = false

    // Smooth state transitions
    @State private var activeIntensity: CGFloat = 0

    // Lamp transforms (breathing + reactions)
    @State private var lampScaleX: CGFloat = 1.0
    @State private var lampScaleY: CGFloat = 1.0
    @State private var lampOffsetY: CGFloat = 0
    @State private var lampRotation: CGFloat = 0

    // Reaction overlays
    @State private var reactionOffset: CGPoint = .zero
    @State private var reactionScale: CGFloat = 1.0
    @State private var reactionRotation: CGFloat = 0

    // Soul effects
    @State private var warmthOpacity: CGFloat = 0
    @State private var warmthScale: CGFloat = 1.0
    @State private var sparkOpacity: CGFloat = 0

    public init(persona: Persona, isActive: Bool, size: CGFloat, emotionHint: EmotionHint? = nil) {
        self.persona = persona
        self.isActive = isActive
        self.size = size
        self.emotionHint = emotionHint
    }

    public var body: some View {
        ZStack {
            // Layer 1: Glow Halo (behind everything)
            GlowHalo(
                persona: persona,
                size: size,
                isActive: isActive
            )

            // Layer 2: Soul shimmer (behind body)
            soulShimmer

            // Layer 3: Soul warmth bloom (behind body)
            soulWarmth

            // Layer 4: Avatar body with Lamp transforms
            avatarBody

            // Layer 5: Wave ring
            waveRing

            // Layer 6: Memory spark (on top)
            memorySpark

            // Layer 7: Persona initials
            personaInitials
        }
        .frame(width: size * 2.2, height: size * 2.2)
        .onAppear {
            startContinuousAnimation()
        }
        .onChange(of: isActive) { newValue in
            withAnimation(.easeInOut(duration: 0.5)) {
                activeIntensity = newValue ? 1.0 : 0.0
            }
        }
        .onChange(of: emotionHint) { newEmotion in
            if let emotion = newEmotion {
                triggerEmotionReaction(emotion)
            }
        }
    }

    // MARK: - Soul Shimmer

    private var soulShimmer: some View {
        let phase = sin(time * .pi * 2 / PixarTiming.shimmerCycle)
        let opacity = (0.4 + phase * 0.2) * Double(activeIntensity)

        return Circle()
            .fill(
                RadialGradient(
                    colors: [
                        persona.glowColor.opacity(opacity),
                        persona.glowColor.opacity(opacity * 0.3),
                        Color.clear
                    ],
                    center: .center,
                    startRadius: size * 0.35,
                    endRadius: size * 0.75
                )
            )
            .frame(width: size * 1.5, height: size * 1.5)
            .blur(radius: 8)
    }

    // MARK: - Soul Warmth

    private var soulWarmth: some View {
        Circle()
            .fill(
                RadialGradient(
                    colors: [
                        Color(hex: 0xc4a265).opacity(warmthOpacity * 0.6),
                        Color(hex: 0xc4a265).opacity(warmthOpacity * 0.2),
                        Color.clear
                    ],
                    center: .center,
                    startRadius: size * 0.2,
                    endRadius: size * 0.9
                )
            )
            .frame(width: size * 1.6, height: size * 1.6)
            .scaleEffect(warmthScale)
            .blur(radius: 12)
    }

    // MARK: - Memory Spark

    private var memorySpark: some View {
        Circle()
            .fill(
                RadialGradient(
                    colors: [
                        Color(hex: 0xc4a265).opacity(sparkOpacity * 0.9),
                        Color(hex: 0xc4a265).opacity(sparkOpacity * 0.4),
                        Color.clear
                    ],
                    center: .center,
                    startRadius: 0,
                    endRadius: size * 0.6
                )
            )
            .frame(width: size * 1.2, height: size * 1.2)
            .blur(radius: 4)
    }

    // MARK: - Avatar Body

    private var avatarBody: some View {
        // Combined Lamp transforms
        let combinedScaleX = lampScaleX * reactionScale
        let combinedScaleY = lampScaleY * reactionScale
        let combinedOffsetY = lampOffsetY + reactionOffset.y
        let combinedRotation = lampRotation + reactionRotation

        return Circle()
            .fill(
                LinearGradient(
                    colors: [persona.primaryColor, persona.secondaryColor],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
            )
            .frame(width: size, height: size)
            .shadow(color: persona.glowColor.opacity(0.5), radius: 10)
            .scaleEffect(x: combinedScaleX, y: combinedScaleY)
            .offset(x: reactionOffset.x, y: combinedOffsetY)
            .rotationEffect(.degrees(Double(combinedRotation)))
    }

    // MARK: - Wave Ring

    private var waveRing: some View {
        let amplitude = simulatedAudioLevel * 12

        return WavePath(
            radius: size * 0.58,
            amplitude: amplitude,
            frequency: 4,
            phase: time * 1.8
        )
        .stroke(
            LinearGradient(
                colors: [
                    persona.primaryColor.opacity(0.9),
                    persona.secondaryColor.opacity(0.7)
                ],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            ),
            lineWidth: 3
        )
        .blur(radius: 1.5)
        .opacity(0.3 + Double(activeIntensity) * 0.7)
        // Apply Lamp transforms to wave ring too
        .scaleEffect(x: lampScaleX, y: lampScaleY)
        .offset(y: lampOffsetY)
    }

    // MARK: - Persona Initials

    private var personaInitials: some View {
        Text(persona.initials)
            .font(.system(size: size * 0.38, weight: .semibold, design: .rounded))
            .foregroundColor(.white.opacity(0.95))
            .shadow(color: .black.opacity(0.3), radius: 2, y: 1)
            // Apply Lamp transforms for that Pixar bounce!
            .scaleEffect(x: lampScaleX * reactionScale, y: lampScaleY * reactionScale)
            .offset(x: reactionOffset.x, y: lampOffsetY + reactionOffset.y)
            .rotationEffect(.degrees(Double(lampRotation + reactionRotation)))
    }

    // MARK: - Simulated Audio Level

    private var simulatedAudioLevel: CGFloat {
        let wave1 = sin(time * 2.5) * 0.3
        let wave2 = sin(time * 5.7) * 0.15
        let wave3 = sin(time * 11.3) * 0.08
        let combined = 0.5 + wave1 + wave2 + wave3
        return CGFloat(max(0.2, min(1.0, combined))) * activeIntensity
    }

    // MARK: - Continuous Animation

    private func startContinuousAnimation() {
        guard !isTimerRunning else { return }
        isTimerRunning = true

        activeIntensity = isActive ? 1.0 : 0.0

        // 60fps continuous timer
        Timer.scheduledTimer(withTimeInterval: 1.0 / 60.0, repeats: true) { _ in
            time += 1.0 / 60.0
            updateBreathing()
        }
    }

    private func updateBreathing() {
        let cycle = isActive ? PixarTiming.breathCycleActive : PixarTiming.breathCycleIdle
        let phase = sin(time * .pi * 2 / cycle)

        let intensity = isActive ? SquashStretch.active : SquashStretch.idle

        // Smooth breathing updates (no withAnimation needed - continuous)
        lampScaleY = 1.0 + (intensity.scaleY - 1.0) * CGFloat(phase)
        lampScaleX = 1.0 + (intensity.scaleX - 1.0) * CGFloat(phase)
        lampOffsetY = intensity.translateY * CGFloat(phase)
        lampRotation = intensity.rotation * CGFloat(phase)
    }

    // MARK: - Emotion Reactions

    private func triggerEmotionReaction(_ emotion: EmotionHint) {
        // Lamp animation
        switch emotion.lampAnimation {
        case .none:
            break
        case .nod:
            triggerNod()
        case .tiltRight:
            triggerTilt(direction: .right)
        case .tiltLeft:
            triggerTilt(direction: .left)
        case .bounce:
            triggerBounce()
        case .multiBounce:
            triggerBounce()
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) {
                triggerBounce()
            }
        case .perkUp:
            triggerPerkUp()
        case .shake:
            triggerTilt(direction: .left)
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) {
                triggerTilt(direction: .right)
            }
        }

        // Soul effect
        switch emotion.soulEffect {
        case .none:
            break
        case .warmthBloom:
            triggerWarmthBloom()
        case .warmthGlow:
            triggerWarmthGlow()
        case .memorySpark:
            triggerMemorySpark()
        case .shimmerIntensify:
            break  // Handled by shimmer layer
        }
    }

    // MARK: - Lamp Reactions

    private func triggerNod() {
        let duration = PixarTiming.nodDuration

        withAnimation(.easeOut(duration: duration * 0.2)) {
            reactionOffset.y = -3
            reactionScale = 0.98
        }

        DispatchQueue.main.asyncAfter(deadline: .now() + duration * 0.2) {
            withAnimation(SpringPreset.snappy) {
                reactionOffset.y = 4
                reactionScale = 1.02
                reactionRotation = 3
            }
        }

        DispatchQueue.main.asyncAfter(deadline: .now() + duration * 0.6) {
            withAnimation(SpringPreset.gentle) {
                reactionOffset = .zero
                reactionScale = 1.0
                reactionRotation = 0
            }
        }
    }

    private func triggerTilt(direction: TiltDirection) {
        let duration = PixarTiming.tiltDuration
        let sign: CGFloat = direction == .right ? 1 : -1

        withAnimation(SpringPreset.bouncy) {
            reactionRotation = 5 * sign
            reactionOffset.x = 3 * sign
        }

        DispatchQueue.main.asyncAfter(deadline: .now() + duration) {
            withAnimation(SpringPreset.gentle) {
                reactionRotation = 0
                reactionOffset.x = 0
            }
        }
    }

    private func triggerBounce() {
        let duration = PixarTiming.bounceDuration

        withAnimation(.easeIn(duration: duration * 0.15)) {
            reactionScale = 0.92
            reactionOffset.y = 2
        }

        DispatchQueue.main.asyncAfter(deadline: .now() + duration * 0.15) {
            withAnimation(SpringPreset.bouncy) {
                reactionScale = 1.08
                reactionOffset.y = -12
            }
        }

        DispatchQueue.main.asyncAfter(deadline: .now() + duration * 0.5) {
            withAnimation(SpringPreset.snappy) {
                reactionScale = 0.96
                reactionOffset.y = 2
            }
        }

        DispatchQueue.main.asyncAfter(deadline: .now() + duration * 0.7) {
            withAnimation(SpringPreset.gentle) {
                reactionScale = 1.0
                reactionOffset.y = 0
            }
        }
    }

    private func triggerPerkUp() {
        let duration = PixarTiming.perkUpDuration

        withAnimation(SpringPreset.snappy) {
            reactionScale = 1.05
            reactionOffset.y = -5
        }

        DispatchQueue.main.asyncAfter(deadline: .now() + duration) {
            withAnimation(SpringPreset.gentle) {
                reactionScale = 1.0
                reactionOffset.y = 0
            }
        }
    }

    private enum TiltDirection {
        case left, right
    }

    // MARK: - Soul Effects

    private func triggerWarmthBloom() {
        withAnimation(.easeOut(duration: PixarTiming.warmthBloom * 0.4)) {
            warmthOpacity = 1.0
            warmthScale = 1.0
        }

        withAnimation(.easeOut(duration: PixarTiming.warmthBloom * 0.6).delay(PixarTiming.warmthBloom * 0.4)) {
            warmthScale = 1.6
            warmthOpacity = 0
        }

        DispatchQueue.main.asyncAfter(deadline: .now() + PixarTiming.warmthBloom) {
            warmthScale = 1.0
        }
    }

    private func triggerWarmthGlow() {
        withAnimation(.easeInOut(duration: 0.3)) {
            warmthOpacity = 0.7
        }

        DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) {
            withAnimation(.easeOut(duration: 0.5)) {
                warmthOpacity = 0
            }
        }
    }

    private func triggerMemorySpark() {
        sparkOpacity = 0.9

        withAnimation(.easeOut(duration: PixarTiming.microExpression)) {
            sparkOpacity = 0
        }
    }
}

// MARK: - Stable Wrapper

/// Equatable wrapper to prevent parent re-renders from destroying animation
public struct StablePixarVoiceOrb: View, Equatable {
    public let personaId: String
    public let isActive: Bool
    public let size: CGFloat
    public let emotionHint: EmotionHint?

    public init(personaId: String, isActive: Bool, size: CGFloat, emotionHint: EmotionHint? = nil) {
        self.personaId = personaId
        self.isActive = isActive
        self.size = size
        self.emotionHint = emotionHint
    }

    public var body: some View {
        PixarVoiceOrb(
            persona: PersonaRegistry.get(personaId),
            isActive: isActive,
            size: size,
            emotionHint: emotionHint
        )
    }

    public static func == (lhs: StablePixarVoiceOrb, rhs: StablePixarVoiceOrb) -> Bool {
        lhs.personaId == rhs.personaId &&
        lhs.isActive == rhs.isActive &&
        lhs.size == rhs.size &&
        lhs.emotionHint == rhs.emotionHint
    }
}
