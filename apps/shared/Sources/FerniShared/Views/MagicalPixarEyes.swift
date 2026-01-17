import SwiftUI

// MARK: - Magical Pixar Eyes
/// Two expressive opaque oval eyes inspired by Pixar's Luxo Jr. and Disney animation.
///
/// Design Philosophy:
/// - Simple IS magical - solid opaque ovals, no realistic anatomy
/// - Eyes are the soul - they convey ALL emotion through position, shape, blink
/// - Synchronized movement - both eyes move together like a living character
/// - Above the text - eyes are the face, initials are below like a name badge
///
/// Expression Through Simplicity:
/// - Blinks: Quick close (squash to line), slower open - feels alive
/// - Looking: Eyes shift together, following interest
/// - Squash/Stretch: Emotions warp the eye shape (excited = taller, sad = flatter)
/// - Sparkle: Magical highlight that dances, showing inner light

public struct MagicalPixarEyes: View {
    let orbSize: CGFloat
    let personaColor: Color

    // MARK: - Expression State

    /// How closed are the eyes (0 = open, 1 = fully closed/blink)
    var blinkProgress: CGFloat = 0

    /// Where the eyes are looking (-1 to 1 on each axis)
    var lookDirection: CGPoint = .zero

    /// Vertical stretch factor (< 1 = squashed/sleepy, > 1 = excited/alert)
    var verticalStretch: CGFloat = 1.0

    /// Horizontal squash factor (compensates for vertical stretch)
    var horizontalSquash: CGFloat = 1.0

    /// Eyebrow-like tilt (-1 = worried inner, 0 = neutral, 1 = confident outer)
    var eyeTilt: CGFloat = 0

    /// Sparkle intensity (0 = none, 1 = full magical sparkle)
    var sparkleIntensity: CGFloat = 0.8

    /// Optional symbolic expression to show instead of eyes
    var symbolicExpression: SymbolicExpression = .none

    public init(
        orbSize: CGFloat,
        personaColor: Color,
        blinkProgress: CGFloat = 0,
        lookDirection: CGPoint = .zero,
        verticalStretch: CGFloat = 1.0,
        horizontalSquash: CGFloat = 1.0,
        eyeTilt: CGFloat = 0,
        sparkleIntensity: CGFloat = 0.8,
        symbolicExpression: SymbolicExpression = .none
    ) {
        self.orbSize = orbSize
        self.personaColor = personaColor
        self.blinkProgress = blinkProgress
        self.lookDirection = lookDirection
        self.verticalStretch = verticalStretch
        self.horizontalSquash = horizontalSquash
        self.eyeTilt = eyeTilt
        self.sparkleIntensity = sparkleIntensity
        self.symbolicExpression = symbolicExpression
    }

    // MARK: - Layout Constants

    /// Eye dimensions
    private var eyeWidth: CGFloat { orbSize * 0.18 }
    private var eyeHeight: CGFloat { orbSize * 0.22 }

    /// Spacing between eyes
    private var eyeSpacing: CGFloat { orbSize * 0.12 }

    /// How far eyes can move when looking
    private var lookRange: CGFloat { orbSize * 0.04 }

    /// Position above center (eyes are the "face", above where initials go)
    private var verticalOffset: CGFloat { -orbSize * 0.08 }

    // MARK: - Computed Eye Shape

    /// Final eye height after blink and stretch
    private var finalEyeHeight: CGFloat {
        let blinkClose = 1 - blinkProgress
        return eyeHeight * verticalStretch * blinkClose
    }

    /// Final eye width after squash compensation
    private var finalEyeWidth: CGFloat {
        eyeWidth * horizontalSquash
    }

    public var body: some View {
        ZStack {
            // Show eyes when no symbolic expression
            if symbolicExpression == .none {
                // The two magical eyes
                HStack(spacing: eyeSpacing) {
                    singleMagicalEye(isLeft: true)
                    singleMagicalEye(isLeft: false)
                }
                .offset(
                    x: lookDirection.x * lookRange,
                    y: lookDirection.y * lookRange * 0.5 + verticalOffset
                )
            }

            // Symbolic expression overlay (heart, sparkle, etc.)
            SymbolicExpressionView(
                expression: symbolicExpression,
                size: orbSize,
                isVisible: symbolicExpression != .none
            )
            .offset(y: verticalOffset)
        }
    }

    // MARK: - Single Magical Eye

    private func singleMagicalEye(isLeft: Bool) -> some View {
        let tiltAngle = eyeTilt * (isLeft ? -8 : 8) // Opposite tilt for each eye

        return ZStack {
            // Outer glow (magical aura)
            Ellipse()
                .fill(
                    RadialGradient(
                        colors: [
                            Color.white.opacity(0.5),
                            Color.white.opacity(0.2),
                            Color.clear
                        ],
                        center: .center,
                        startRadius: 0,
                        endRadius: eyeWidth * 0.9
                    )
                )
                .frame(width: finalEyeWidth * 1.6, height: finalEyeHeight * 1.4)
                .blur(radius: 4)

            // Main eye oval (solid, opaque, cartoon-style)
            Ellipse()
                .fill(
                    LinearGradient(
                        colors: [
                            Color.white,
                            Color.white.opacity(0.95)
                        ],
                        startPoint: .top,
                        endPoint: .bottom
                    )
                )
                .frame(width: finalEyeWidth, height: max(finalEyeHeight, 2))
                .shadow(color: Color.white.opacity(0.6), radius: 4, y: -1)
                .shadow(color: Color.black.opacity(0.1), radius: 2, y: 2)

            // Inner subtle gradient for depth
            Ellipse()
                .fill(
                    RadialGradient(
                        colors: [
                            Color.clear,
                            Color.black.opacity(0.03)
                        ],
                        center: .center,
                        startRadius: 0,
                        endRadius: finalEyeWidth * 0.5
                    )
                )
                .frame(width: finalEyeWidth * 0.9, height: max(finalEyeHeight * 0.9, 1.5))

            // Magical sparkle highlight (the life in the eye!)
            if blinkProgress < 0.5 && sparkleIntensity > 0 {
                sparkleHighlight(isLeft: isLeft)
            }
        }
        .rotationEffect(.degrees(Double(tiltAngle)))
    }

    // MARK: - Sparkle Highlight

    private func sparkleHighlight(isLeft: Bool) -> some View {
        let sparkleSize = finalEyeWidth * 0.2
        let sparkleX = isLeft ? -finalEyeWidth * 0.2 : -finalEyeWidth * 0.15
        let sparkleY = -finalEyeHeight * 0.2

        return ZStack {
            // Primary sparkle
            Circle()
                .fill(Color.white)
                .frame(width: sparkleSize, height: sparkleSize)
                .shadow(color: Color.white.opacity(0.8), radius: 2)

            // Secondary smaller sparkle
            Circle()
                .fill(Color.white.opacity(0.7))
                .frame(width: sparkleSize * 0.4, height: sparkleSize * 0.4)
                .offset(x: sparkleSize * 0.8, y: sparkleSize * 0.6)
        }
        .offset(x: sparkleX, y: sparkleY)
        .opacity(Double(sparkleIntensity))
    }
}

// MARK: - Animated Magical Eyes

/// Self-animating version with natural blinking, looking, and breathing
public struct AnimatedMagicalEyes: View {
    let orbSize: CGFloat
    let personaColor: Color

    /// Current emotion affects eye shape
    var emotionHint: EmotionHint = .neutral

    /// Active state (speaking, listening)
    var isActive: Bool = false

    /// Symbolic expression to show instead of eyes
    var symbolicExpression: SymbolicExpression = .none

    // MARK: - Animation State

    @State private var blinkProgress: CGFloat = 0
    @State private var lookDirection: CGPoint = .zero
    @State private var verticalStretch: CGFloat = 1.0
    @State private var horizontalSquash: CGFloat = 1.0
    @State private var eyeTilt: CGFloat = 0
    @State private var sparkleIntensity: CGFloat = 0.8
    @State private var breathPhase: CGFloat = 0

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    public init(
        orbSize: CGFloat,
        personaColor: Color,
        emotionHint: EmotionHint = .neutral,
        isActive: Bool = false,
        symbolicExpression: SymbolicExpression = .none
    ) {
        self.orbSize = orbSize
        self.personaColor = personaColor
        self.emotionHint = emotionHint
        self.isActive = isActive
        self.symbolicExpression = symbolicExpression
    }

    public var body: some View {
        MagicalPixarEyes(
            orbSize: orbSize,
            personaColor: personaColor,
            blinkProgress: blinkProgress,
            lookDirection: lookDirection,
            verticalStretch: verticalStretch,
            horizontalSquash: horizontalSquash,
            eyeTilt: eyeTilt,
            sparkleIntensity: sparkleIntensity,
            symbolicExpression: symbolicExpression
        )
        .onAppear {
            if !reduceMotion {
                startBlinking()
                startLooking()
                startBreathing()
            }
        }
        .onChange(of: emotionHint) { newEmotion in
            applyEmotion(newEmotion)
        }
        .onChange(of: isActive) { active in
            withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) {
                // Eyes get slightly more alert when active
                verticalStretch = active ? 1.08 : 1.0
                sparkleIntensity = active ? 1.0 : 0.8
            }
        }
    }

    // MARK: - Blinking

    private func startBlinking() {
        scheduleNextBlink()
    }

    private func scheduleNextBlink() {
        // Natural blink interval: 2-5 seconds, more frequent when active
        let interval = isActive ? Double.random(in: 2.0...3.5) : Double.random(in: 3.0...5.0)

        DispatchQueue.main.asyncAfter(deadline: .now() + interval) {
            performBlink()
            scheduleNextBlink()
        }
    }

    private func performBlink() {
        // Quick close (human blinks are ~100-150ms)
        withAnimation(.easeIn(duration: 0.06)) {
            blinkProgress = 1.0
        }

        // Slightly slower open (more natural)
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.08) {
            withAnimation(.easeOut(duration: 0.10)) {
                blinkProgress = 0.0
            }
        }
    }

    /// Double blink for emphasis or recognition
    private func performDoubleBlink() {
        performBlink()
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) {
            performBlink()
        }
    }

    // MARK: - Looking Around

    private func startLooking() {
        scheduleLookAround()
    }

    private func scheduleLookAround() {
        let interval = Double.random(in: 2.5...5.0)

        DispatchQueue.main.asyncAfter(deadline: .now() + interval) {
            performLookAround()
            scheduleLookAround()
        }
    }

    private func performLookAround() {
        // Look to a random direction
        withAnimation(.spring(response: 0.35, dampingFraction: 0.65)) {
            lookDirection = CGPoint(
                x: CGFloat.random(in: -0.6...0.6),
                y: CGFloat.random(in: -0.3...0.3)
            )
        }

        // Return to center after a moment
        DispatchQueue.main.asyncAfter(deadline: .now() + Double.random(in: 0.6...1.2)) {
            withAnimation(.easeOut(duration: 0.4)) {
                lookDirection = .zero
            }
        }
    }

    /// Look at something with interest
    private func lookAt(direction: CGPoint, duration: Double = 1.0) {
        withAnimation(.spring(response: 0.3, dampingFraction: 0.6)) {
            lookDirection = direction
        }

        DispatchQueue.main.asyncAfter(deadline: .now() + duration) {
            withAnimation(.easeOut(duration: 0.3)) {
                lookDirection = .zero
            }
        }
    }

    // MARK: - Breathing (Subtle Life)

    private func startBreathing() {
        // Continuous subtle breathing animation
        Timer.scheduledTimer(withTimeInterval: 1.0 / 30.0, repeats: true) { _ in
            let cycle = isActive ? 4.5 : 6.0 // Faster when active
            breathPhase += (1.0 / 30.0) / cycle
            if breathPhase > 1.0 { breathPhase = 0 }

            // Very subtle eye stretch with breathing
            let breathEffect = sin(breathPhase * .pi * 2) * 0.015
            verticalStretch = 1.0 + CGFloat(breathEffect) + (isActive ? 0.05 : 0)
            horizontalSquash = 1.0 - CGFloat(breathEffect) * 0.5
        }
    }

    // MARK: - Emotion Application

    private func applyEmotion(_ emotion: EmotionHint) {
        switch emotion {
        case .neutral:
            resetToNeutral()

        case .happy, .greeting:
            // Happy eyes: slightly taller, upward curve
            withAnimation(.spring(response: 0.4, dampingFraction: 0.6)) {
                verticalStretch = 1.15
                eyeTilt = 0.3
                sparkleIntensity = 1.0
            }
            performDoubleBlink()

        case .excited, .celebrating:
            // Excited: tall eyes, big sparkle
            withAnimation(.spring(response: 0.3, dampingFraction: 0.5)) {
                verticalStretch = 1.25
                horizontalSquash = 0.95
                sparkleIntensity = 1.0
            }
            // Quick look around with excitement
            lookAt(direction: CGPoint(x: 0.4, y: -0.2), duration: 0.3)
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) {
                lookAt(direction: CGPoint(x: -0.3, y: -0.1), duration: 0.25)
            }

        case .curious:
            // Curious: one eye slightly bigger, head tilt effect
            withAnimation(.spring(response: 0.35, dampingFraction: 0.65)) {
                eyeTilt = 0.6
                lookDirection = CGPoint(x: 0.3, y: -0.2)
            }

        case .thinking:
            // Thinking: looking up and to the side
            withAnimation(.easeInOut(duration: 0.4)) {
                lookDirection = CGPoint(x: 0.4, y: -0.4)
                verticalStretch = 0.95
            }

        case .empathetic, .connected:
            // Warm, soft eyes
            withAnimation(.easeInOut(duration: 0.5)) {
                verticalStretch = 1.05
                eyeTilt = -0.2 // Slight inner tilt = warmth
                sparkleIntensity = 0.9
            }

        case .encouraging, .energized:
            // Alert, bright eyes
            withAnimation(.spring(response: 0.3, dampingFraction: 0.6)) {
                verticalStretch = 1.12
                sparkleIntensity = 1.0
            }

        case .calm, .peaceful:
            // Relaxed, slightly closed
            withAnimation(.easeInOut(duration: 0.6)) {
                verticalStretch = 0.92
                sparkleIntensity = 0.6
            }

        case .listening:
            // Attentive, focused
            withAnimation(.easeInOut(duration: 0.3)) {
                verticalStretch = 1.05
                lookDirection = .zero // Direct eye contact
                sparkleIntensity = 0.85
            }

        case .remembering:
            // Recognition flash
            performDoubleBlink()
            withAnimation(.spring(response: 0.3, dampingFraction: 0.5)) {
                sparkleIntensity = 1.0
                verticalStretch = 1.1
            }

        case .vibing:
            // Relaxed happy
            withAnimation(.easeInOut(duration: 0.4)) {
                verticalStretch = 1.08
                eyeTilt = 0.2
                sparkleIntensity = 0.9
            }
        }

        // Auto-reset to neutral after emotion passes
        DispatchQueue.main.asyncAfter(deadline: .now() + 2.0) {
            if emotionHint == emotion {
                resetToNeutral()
            }
        }
    }

    private func resetToNeutral() {
        withAnimation(.easeInOut(duration: 0.5)) {
            verticalStretch = isActive ? 1.05 : 1.0
            horizontalSquash = 1.0
            eyeTilt = 0
            sparkleIntensity = isActive ? 0.9 : 0.8
            lookDirection = .zero
        }
    }
}

// MARK: - Preview

#if DEBUG
struct MagicalPixarEyesPreview: View {
    @State private var blinkProgress: CGFloat = 0
    @State private var lookX: CGFloat = 0
    @State private var lookY: CGFloat = 0
    @State private var stretch: CGFloat = 1.0
    @State private var tilt: CGFloat = 0
    @State private var sparkle: CGFloat = 0.8
    @State private var isActive = false
    @State private var emotion: EmotionHint = .neutral

    var body: some View {
        VStack(spacing: 30) {
            // Preview orb with eyes
            ZStack {
                // Orb background
                Circle()
                    .fill(
                        LinearGradient(
                            colors: [Color(hex: 0x4a6741), Color(hex: 0x3a5731)],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
                    .frame(width: 150, height: 150)
                    .shadow(color: Color(hex: 0x4a6741).opacity(0.5), radius: 15)

                // Static eyes for manual control
                MagicalPixarEyes(
                    orbSize: 150,
                    personaColor: Color(hex: 0x4a6741),
                    blinkProgress: blinkProgress,
                    lookDirection: CGPoint(x: lookX, y: lookY),
                    verticalStretch: stretch,
                    horizontalSquash: 1.0 + (1.0 - stretch) * 0.3,
                    eyeTilt: tilt,
                    sparkleIntensity: sparkle
                )

                // Initials below eyes
                Text("F")
                    .font(.system(size: 40, weight: .semibold, design: .rounded))
                    .foregroundColor(.white.opacity(0.9))
                    .offset(y: 20)
            }

            // Controls
            VStack(spacing: 12) {
                HStack {
                    Text("Blink:")
                    Slider(value: $blinkProgress, in: 0...1)
                    Button("Blink!") {
                        withAnimation(.easeIn(duration: 0.06)) { blinkProgress = 1 }
                        DispatchQueue.main.asyncAfter(deadline: .now() + 0.08) {
                            withAnimation(.easeOut(duration: 0.1)) { blinkProgress = 0 }
                        }
                    }
                }

                HStack {
                    Text("Look X:")
                    Slider(value: $lookX, in: -1...1)
                }

                HStack {
                    Text("Look Y:")
                    Slider(value: $lookY, in: -1...1)
                }

                HStack {
                    Text("Stretch:")
                    Slider(value: $stretch, in: 0.7...1.3)
                }

                HStack {
                    Text("Tilt:")
                    Slider(value: $tilt, in: -1...1)
                }

                HStack {
                    Text("Sparkle:")
                    Slider(value: $sparkle, in: 0...1)
                }
            }
            .padding(.horizontal)

            Divider()

            // Animated version
            Text("Animated Version:")
                .font(.headline)

            ZStack {
                Circle()
                    .fill(
                        LinearGradient(
                            colors: [Color(hex: 0x4a6741), Color(hex: 0x3a5731)],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
                    .frame(width: 120, height: 120)
                    .shadow(color: Color(hex: 0x4a6741).opacity(0.5), radius: 12)

                AnimatedMagicalEyes(
                    orbSize: 120,
                    personaColor: Color(hex: 0x4a6741),
                    emotionHint: emotion,
                    isActive: isActive
                )

                Text("F")
                    .font(.system(size: 32, weight: .semibold, design: .rounded))
                    .foregroundColor(.white.opacity(0.9))
                    .offset(y: 16)
            }

            HStack {
                Toggle("Active", isOn: $isActive)

                Picker("Emotion", selection: $emotion) {
                    Text("Neutral").tag(EmotionHint.neutral)
                    Text("Happy").tag(EmotionHint.happy)
                    Text("Excited").tag(EmotionHint.excited)
                    Text("Curious").tag(EmotionHint.curious)
                    Text("Thinking").tag(EmotionHint.thinking)
                }
                .pickerStyle(.menu)
            }
            .padding(.horizontal)
        }
        .padding()
    }
}

#Preview {
    MagicalPixarEyesPreview()
}
#endif
