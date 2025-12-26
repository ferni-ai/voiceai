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

    // MARK: - Better Than Human Integration
    /// Optional state from BetterThanHumanEngine for superhuman EQ
    public var betterThanHumanState: BetterThanHumanState?

    // MARK: - Pixar Personality
    /// Optional personality engine for Luxo Jr.-style behaviors
    public var personalityEngine: PixarPersonalityEngine?

    /// Whether to show expressive eyes
    public var showEyes: Bool = true

    /// Use new Pixar Lamp style (single oval eye + initials)
    /// When true, shows simplified lamp eye with initials below
    /// When false, uses legacy two-eye system
    public var useLampStyle: Bool = true

    /// Use magical two-eye style (overrides useLampStyle when true)
    /// Two expressive opaque oval eyes positioned above initials
    public var useMagicalEyes: Bool = true

    /// Current symbolic expression (heart, sparkle, etc.)
    /// When set, replaces the eye with the symbolic icon
    public var symbolicExpression: SymbolicExpression = .none

    // MARK: - Accessibility
    /// Respect user's reduce motion preference
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

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

    // Better Than Human effects
    @State private var listeningOffset: CGPoint = .zero
    @State private var listeningScale: CGFloat = 1.0
    @State private var listeningRotation: CGFloat = 0
    @State private var microWarmth: CGFloat = 0
    @State private var microSpark: CGFloat = 0
    @State private var microGlowColor: Color = Color(hex: 0xc4a265)  // Dynamic per expression
    @State private var anticipationLean: CGFloat = 0
    @State private var anticipationWarmth: CGFloat = 0

    public init(
        persona: Persona,
        isActive: Bool,
        size: CGFloat,
        emotionHint: EmotionHint? = nil,
        betterThanHumanState: BetterThanHumanState? = nil,
        personalityEngine: PixarPersonalityEngine? = nil,
        showEyes: Bool = true,
        useLampStyle: Bool = true,
        useMagicalEyes: Bool = true,
        symbolicExpression: SymbolicExpression = .none
    ) {
        self.persona = persona
        self.isActive = isActive
        self.size = size
        self.emotionHint = emotionHint
        self.betterThanHumanState = betterThanHumanState
        self.personalityEngine = personalityEngine
        self.showEyes = showEyes
        self.useLampStyle = useLampStyle
        self.useMagicalEyes = useMagicalEyes
        self.symbolicExpression = symbolicExpression
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

            // Layer 6.5: Micro-expression glow (subliminal color flash)
            microExpressionGlow

            // Layer 7 & 8: Eye + Initials
            if useMagicalEyes {
                // NEW: Magical two-eye style (most expressive!)
                if showEyes {
                    magicalEyes
                }
                // Initials below the eyes
                personaInitialsMagicalStyle
            } else if useLampStyle {
                // Single lamp eye + initials
                if showEyes {
                    lampEye
                }
                personaInitialsLampStyle
            } else {
                // Legacy style: Two expressive eyes OR initials
                if showEyes {
                    pixarEyes
                } else {
                    personaInitials
                }
            }
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
        // MARK: - Better Than Human State Changes
        .onChange(of: betterThanHumanState?.listeningGesture) { gesture in
            if let gesture = gesture {
                applyListeningGesture(gesture)
            }
        }
        .onChange(of: betterThanHumanState?.microExpression) { expression in
            if let expression = expression {
                applyMicroExpression(expression)
            }
        }
        .onChange(of: betterThanHumanState?.anticipatedEmotion) { emotion in
            if let emotion = emotion {
                applyAnticipation(emotion)
            } else {
                clearAnticipation()
            }
        }
        .onChange(of: betterThanHumanState?.concernLevel) { level in
            if let level = level, level != .none {
                applyConcern(level)
            }
        }
    }

    // MARK: - Soul Shimmer

    private var soulShimmer: some View {
        // Reduce motion: static shimmer
        let phase = reduceMotion ? 0.5 : sin(time * .pi * 2 / PixarTiming.shimmerCycle)

        // Apply time-aware brightness for contextual presence
        let baseOpacity = (0.4 + phase * 0.2) * Double(activeIntensity)
        let opacity = baseOpacity * Double(timeAwareBrightness)

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
        // Combined warmth from reactions + micro-expressions + anticipation
        let totalWarmth = warmthOpacity + microWarmth + anticipationWarmth

        return Circle()
            .fill(
                RadialGradient(
                    colors: [
                        Color(hex: 0xc4a265).opacity(totalWarmth * 0.6),
                        Color(hex: 0xc4a265).opacity(totalWarmth * 0.2),
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
        // Combined spark from reactions + micro-expressions
        let totalSpark = sparkOpacity + microSpark

        return Circle()
            .fill(
                RadialGradient(
                    colors: [
                        Color(hex: 0xc4a265).opacity(totalSpark * 0.9),
                        Color(hex: 0xc4a265).opacity(totalSpark * 0.4),
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

    // MARK: - Micro-Expression Glow (Expression-specific color)

    private var microExpressionGlow: some View {
        // Subliminal glow using expression-specific color
        Circle()
            .fill(
                RadialGradient(
                    colors: [
                        microGlowColor.opacity(microWarmth * 0.7),
                        microGlowColor.opacity(microWarmth * 0.3),
                        Color.clear
                    ],
                    center: .center,
                    startRadius: size * 0.15,
                    endRadius: size * 0.8
                )
            )
            .frame(width: size * 1.5, height: size * 1.5)
            .blur(radius: 10)
    }

    // MARK: - Avatar Body

    private var avatarBody: some View {
        // Combined Lamp transforms (base breathing + reactions + listening + anticipation)
        let combinedScaleX = lampScaleX * reactionScale * listeningScale
        let combinedScaleY = lampScaleY * reactionScale * listeningScale
        let combinedOffsetY = lampOffsetY + reactionOffset.y + listeningOffset.y + anticipationLean
        let combinedOffsetX = reactionOffset.x + listeningOffset.x
        let combinedRotation = lampRotation + reactionRotation + listeningRotation

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
            .offset(x: combinedOffsetX, y: combinedOffsetY)
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

    // MARK: - Persona Initials (Lamp Style - with eye above)

    private var personaInitialsLampStyle: some View {
        Text(persona.initials)
            .font(.system(size: size * 0.32, weight: .semibold, design: .rounded))
            .foregroundColor(.white.opacity(0.9))
            .shadow(color: .black.opacity(0.25), radius: 2, y: 1)
            // Positioned slightly lower to make room for the eye
            .offset(y: size * 0.12)
            // Apply Lamp transforms for that Pixar bounce!
            .scaleEffect(x: lampScaleX * reactionScale, y: lampScaleY * reactionScale)
            .offset(x: reactionOffset.x, y: lampOffsetY + reactionOffset.y)
            .rotationEffect(.degrees(Double(lampRotation + reactionRotation)))
    }

    // MARK: - Lamp Eye (Pixar Lamp Style)

    @ViewBuilder
    private var lampEye: some View {
        // Combined transforms for the eye
        let fidgetOffset = personalityEngine?.fidgetOffset ?? .zero

        // Use the new simplified Pixar Lamp-style eye with symbolic expression support
        AnimatedLampEye(
            orbSize: size,
            personaColor: persona.primaryColor,
            isExpressing: isActive || emotionHint != nil,
            symbolicExpression: symbolicExpression
        )
        // Apply Lamp transforms to the eye
        .scaleEffect(
            x: lampScaleX * reactionScale * listeningScale,
            y: lampScaleY * reactionScale * listeningScale
        )
        .offset(
            x: reactionOffset.x + listeningOffset.x + fidgetOffset.x,
            y: lampOffsetY + reactionOffset.y + listeningOffset.y + anticipationLean + fidgetOffset.y
        )
        .rotationEffect(.degrees(Double(lampRotation + reactionRotation + listeningRotation)))
    }

    // MARK: - Magical Pixar Eyes (Two expressive eyes - THE BEST!)

    @ViewBuilder
    private var magicalEyes: some View {
        let fidgetOffset = personalityEngine?.fidgetOffset ?? .zero

        AnimatedMagicalEyes(
            orbSize: size,
            personaColor: persona.primaryColor,
            emotionHint: emotionHint ?? .neutral,
            isActive: isActive,
            symbolicExpression: symbolicExpression
        )
        // Apply all the Lamp transforms for that Pixar bounce!
        .scaleEffect(
            x: lampScaleX * reactionScale * listeningScale,
            y: lampScaleY * reactionScale * listeningScale
        )
        .offset(
            x: reactionOffset.x + listeningOffset.x + fidgetOffset.x,
            y: lampOffsetY + reactionOffset.y + listeningOffset.y + anticipationLean + fidgetOffset.y
        )
        .rotationEffect(.degrees(Double(lampRotation + reactionRotation + listeningRotation)))
    }

    // MARK: - Persona Initials (Magical Style - eyes above, initials below)

    private var personaInitialsMagicalStyle: some View {
        Text(persona.initials)
            .font(.system(size: size * 0.30, weight: .semibold, design: .rounded))
            .foregroundColor(.white.opacity(0.92))
            .shadow(color: .black.opacity(0.2), radius: 2, y: 1)
            .shadow(color: persona.glowColor.opacity(0.3), radius: 4)  // Subtle persona glow
            // Positioned below the eyes
            .offset(y: size * 0.18)
            // Apply Lamp transforms for synchronized bounce
            .scaleEffect(x: lampScaleX * reactionScale, y: lampScaleY * reactionScale)
            .offset(x: reactionOffset.x, y: lampOffsetY + reactionOffset.y)
            .rotationEffect(.degrees(Double(lampRotation + reactionRotation)))
    }

    // MARK: - Legacy Pixar Eyes (for backward compatibility)

    @ViewBuilder
    private var pixarEyes: some View {
        // Combined personality transforms
        let squishFactor = personalityEngine?.squishFactor ?? 0
        let curiousLean = personalityEngine?.curiousLean ?? 0
        let fidgetOffset = personalityEngine?.fidgetOffset ?? .zero

        Group {
            if let personality = personalityEngine {
                // Full personality-driven eyes
                ExpressivePixarEyes(
                    orbSize: size,
                    personaColor: persona.primaryColor,
                    personality: personality
                )
            } else {
                // Simple self-animating eyes
                SimpleAnimatedEyes(
                    orbSize: size,
                    personaColor: persona.primaryColor
                )
            }
        }
        // Apply Lamp + personality transforms
        .scaleEffect(
            x: (lampScaleX * reactionScale * listeningScale) * (1 - squishFactor * 0.3),
            y: (lampScaleY * reactionScale * listeningScale) * (1 + squishFactor * 0.3)
        )
        .offset(
            x: reactionOffset.x + listeningOffset.x + fidgetOffset.x,
            y: lampOffsetY + reactionOffset.y + listeningOffset.y + anticipationLean + fidgetOffset.y
        )
        .rotationEffect(.degrees(Double(lampRotation + reactionRotation + listeningRotation + curiousLean)))
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

        // Respect reduce motion preference
        if reduceMotion {
            // Static orb - no continuous animation
            // Just set static values and return
            lampScaleX = 1.0
            lampScaleY = 1.0
            lampOffsetY = 0
            lampRotation = 0
            return
        }

        // 60fps continuous timer
        Timer.scheduledTimer(withTimeInterval: 1.0 / 60.0, repeats: true) { _ in
            time += 1.0 / 60.0
            updateBreathing()
        }
    }

    private func updateBreathing() {
        // Skip if reduce motion is enabled
        guard !reduceMotion else { return }

        // Use synced breath rate from BetterThanHuman if available
        let defaultCycle = isActive ? PixarTiming.breathCycleActive : PixarTiming.breathCycleIdle
        let cycle = betterThanHumanState?.breathRate ?? defaultCycle

        let phase = sin(time * .pi * 2 / cycle)

        // Use lamp-style values for more dramatic Pixar animation
        let intensity: SquashStretch.Values
        if useLampStyle {
            intensity = isActive ? SquashStretch.lampActive : SquashStretch.lampIdle
        } else {
            intensity = isActive ? SquashStretch.active : SquashStretch.idle
        }

        // Smooth breathing updates (no withAnimation needed - continuous)
        lampScaleY = 1.0 + (intensity.scaleY - 1.0) * CGFloat(phase)
        lampScaleX = 1.0 + (intensity.scaleX - 1.0) * CGFloat(phase)
        lampOffsetY = intensity.translateY * CGFloat(phase)
        lampRotation = intensity.rotation * CGFloat(phase)
    }

    // MARK: - Time-Aware Context

    /// Adjust glow brightness based on time of day
    private var timeAwareBrightness: CGFloat {
        let hour = Calendar.current.component(.hour, from: Date())

        // Morning (6-12): Full brightness, fresh energy
        // Afternoon (12-18): Slightly reduced
        // Evening (18-22): Warm, softer
        // Night (22-6): Gentle, calming
        switch hour {
        case 6..<12:
            return 1.0
        case 12..<18:
            return 0.95
        case 18..<22:
            return 0.85
        default:
            return 0.75  // Late night - calming presence
        }
    }

    // MARK: - Emotion Reactions

    private func triggerEmotionReaction(_ emotion: EmotionHint) {
        // Skip complex animations if reduce motion is enabled
        // (Still allow simple opacity changes)
        guard !reduceMotion else {
            // Just trigger soul effects (opacity-based, not motion)
            switch emotion.soulEffect {
            case .warmthBloom, .warmthGlow:
                warmthOpacity = 0.5
                DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) {
                    warmthOpacity = 0
                }
            case .memorySpark:
                sparkOpacity = 0.6
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
                    sparkOpacity = 0
                }
            default:
                break
            }
            return
        }

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

        // Use more dramatic values for lamp style
        let anticipationSquash: CGFloat = useLampStyle ? 0.85 : 0.92
        let launchStretch: CGFloat = useLampStyle ? 1.15 : 1.08
        let launchHeight: CGFloat = useLampStyle ? -18 : -12
        let landingSquash: CGFloat = useLampStyle ? 0.90 : 0.96
        let landingOffset: CGFloat = useLampStyle ? 4 : 2

        // Phase 1: Anticipation (squash down before launch)
        withAnimation(.easeIn(duration: duration * 0.15)) {
            reactionScale = anticipationSquash
            reactionOffset.y = landingOffset
        }

        // Phase 2: Launch (stretch up)
        DispatchQueue.main.asyncAfter(deadline: .now() + duration * 0.15) {
            withAnimation(SpringPreset.bouncy) {
                reactionScale = launchStretch
                reactionOffset.y = launchHeight
            }
        }

        // Phase 3: Landing squash
        DispatchQueue.main.asyncAfter(deadline: .now() + duration * 0.5) {
            withAnimation(SpringPreset.snappy) {
                reactionScale = landingSquash
                reactionOffset.y = landingOffset
            }
        }

        // Phase 4: Settle back to normal
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

    // MARK: - Better Than Human Methods

    /// Apply active listening gesture transform
    private func applyListeningGesture(_ gesture: ListeningGesture) {
        guard gesture != .none else {
            // Reset listening state
            withAnimation(SpringPreset.gentle) {
                listeningOffset = .zero
                listeningScale = 1.0
                listeningRotation = 0
            }
            return
        }

        let transform = gesture.transform

        withAnimation(.easeOut(duration: gesture.duration * 0.4)) {
            listeningOffset.y = transform.translateY
            listeningRotation = transform.rotate
            listeningScale = transform.scale
        }

        // Return to neutral after gesture
        DispatchQueue.main.asyncAfter(deadline: .now() + gesture.duration) { [self] in
            withAnimation(SpringPreset.gentle) {
                listeningOffset = .zero
                listeningScale = 1.0
                listeningRotation = 0
            }
        }
    }

    /// Apply micro-expression soul effect (subliminal 40-150ms)
    private func applyMicroExpression(_ type: MicroExpressionType) {
        let effect = type.soulEffect

        // Instant application (no animation - subliminal)
        // Set expression-specific glow color for enhanced emotional resonance
        microGlowColor = type.glowColor
        microWarmth = effect.warmthOpacity
        microSpark = effect.sparkOpacity

        // Fade out over expression duration
        DispatchQueue.main.asyncAfter(deadline: .now() + type.duration) { [self] in
            withAnimation(.easeOut(duration: type.duration / 2)) {
                microWarmth = 0
                microSpark = 0
            }
        }
    }

    /// Apply anticipation visual shift (lean toward user)
    private func applyAnticipation(_ emotion: AnticipatedEmotion) {
        let visual = emotion.visualShift

        withAnimation(.easeOut(duration: 0.3)) {
            anticipationLean = visual.leanY
            anticipationWarmth = visual.warmth
        }
    }

    /// Clear anticipation state
    private func clearAnticipation() {
        withAnimation(.easeOut(duration: 0.4)) {
            anticipationLean = 0
            anticipationWarmth = 0
        }
    }

    /// Apply concern visual response
    private func applyConcern(_ level: ConcernLevel) {
        switch level {
        case .none:
            break
        case .mild:
            withAnimation(.easeInOut(duration: 0.3)) {
                anticipationWarmth = 0.3
                anticipationLean = -2
            }
        case .moderate:
            withAnimation(.easeInOut(duration: 0.3)) {
                anticipationWarmth = 0.5
                anticipationLean = -3
            }
        case .high:
            withAnimation(.easeInOut(duration: 0.3)) {
                anticipationWarmth = 0.7
                anticipationLean = -4
            }
        }

        // Auto-clear after 2 seconds
        DispatchQueue.main.asyncAfter(deadline: .now() + 2.0) { [self] in
            clearAnticipation()
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
    public var betterThanHumanState: BetterThanHumanState?
    public var useLampStyle: Bool
    public var useMagicalEyes: Bool
    public var symbolicExpression: SymbolicExpression

    public init(
        personaId: String,
        isActive: Bool,
        size: CGFloat,
        emotionHint: EmotionHint? = nil,
        betterThanHumanState: BetterThanHumanState? = nil,
        useLampStyle: Bool = true,
        useMagicalEyes: Bool = true,
        symbolicExpression: SymbolicExpression = .none
    ) {
        self.personaId = personaId
        self.isActive = isActive
        self.size = size
        self.emotionHint = emotionHint
        self.betterThanHumanState = betterThanHumanState
        self.useLampStyle = useLampStyle
        self.useMagicalEyes = useMagicalEyes
        self.symbolicExpression = symbolicExpression
    }

    public var body: some View {
        PixarVoiceOrb(
            persona: PersonaRegistry.get(personaId),
            isActive: isActive,
            size: size,
            emotionHint: emotionHint,
            betterThanHumanState: betterThanHumanState,
            useLampStyle: useLampStyle,
            useMagicalEyes: useMagicalEyes,
            symbolicExpression: symbolicExpression
        )
    }

    public static func == (lhs: StablePixarVoiceOrb, rhs: StablePixarVoiceOrb) -> Bool {
        lhs.personaId == rhs.personaId &&
        lhs.isActive == rhs.isActive &&
        lhs.size == rhs.size &&
        lhs.emotionHint == rhs.emotionHint &&
        lhs.useMagicalEyes == rhs.useMagicalEyes &&
        lhs.useLampStyle == rhs.useLampStyle &&
        lhs.symbolicExpression == rhs.symbolicExpression
        // Note: BetterThanHumanState changes frequently, so we don't compare it
        // The orb handles state changes via onChange internally
    }
}
