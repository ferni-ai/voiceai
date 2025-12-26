import SwiftUI

// MARK: - Pixar Eyes
/// Expressive eyes that give the orb Luxo Jr.-like personality.
///
/// Design Philosophy:
/// - Eyes are the window to the soul
/// - Blinks must be natural (quick close, slightly slower open)
/// - Look direction adds life and attention
/// - Eyebrows express emotion without a face
///
/// The eyes are rendered as subtle glowing spots that:
/// - Blink periodically
/// - Track the user's voice direction
/// - Express emotions through position and shape

public struct PixarEyes: View {
    /// Size of the parent orb
    let orbSize: CGFloat

    /// Persona color for the glow
    let personaColor: Color

    // MARK: - Expression State

    /// How closed are the eyes (0 = open, 1 = closed)
    var blinkProgress: CGFloat = 0

    /// Where the eyes are looking (-1 to 1 on each axis)
    var lookDirection: CGPoint = .zero

    /// Eyebrow expression (-1 = worried, 0 = neutral, 1 = raised)
    var eyebrowPosition: CGFloat = 0

    /// Eye state (wide, squinting, etc.)
    var eyeState: EyeState = .open

    public init(
        orbSize: CGFloat,
        personaColor: Color,
        blinkProgress: CGFloat = 0,
        lookDirection: CGPoint = .zero,
        eyebrowPosition: CGFloat = 0,
        eyeState: EyeState = .open
    ) {
        self.orbSize = orbSize
        self.personaColor = personaColor
        self.blinkProgress = blinkProgress
        self.lookDirection = lookDirection
        self.eyebrowPosition = eyebrowPosition
        self.eyeState = eyeState
    }

    public var body: some View {
        ZStack {
            // Eyebrows (subtle arc shapes)
            eyebrows

            // Eyes
            HStack(spacing: eyeSpacing) {
                singleEye(isLeft: true)
                singleEye(isLeft: false)
            }
            .offset(
                x: lookDirection.x * lookRange,
                y: lookDirection.y * lookRange * 0.5 - eyeVerticalOffset
            )
        }
        .frame(width: orbSize, height: orbSize)
    }

    // MARK: - Computed Layout

    private var eyeSize: CGFloat {
        orbSize * 0.08
    }

    private var eyeSpacing: CGFloat {
        orbSize * 0.18
    }

    private var eyeVerticalOffset: CGFloat {
        orbSize * 0.05
    }

    private var lookRange: CGFloat {
        orbSize * 0.03
    }

    private var pupilSize: CGFloat {
        eyeSize * 0.5
    }

    // MARK: - Single Eye

    private func singleEye(isLeft: Bool) -> some View {
        let heightMultiplier = eyeHeightMultiplier
        let widthMultiplier = eyeWidthMultiplier

        return ZStack {
            // Eye glow (outer)
            Ellipse()
                .fill(
                    RadialGradient(
                        colors: [
                            .white.opacity(0.9),
                            .white.opacity(0.4),
                            .clear
                        ],
                        center: .center,
                        startRadius: 0,
                        endRadius: eyeSize * 0.8
                    )
                )
                .frame(
                    width: eyeSize * 1.4 * widthMultiplier,
                    height: eyeSize * 1.4 * heightMultiplier
                )
                .blur(radius: 1)

            // Eye white (core)
            Ellipse()
                .fill(.white.opacity(0.95))
                .frame(
                    width: eyeSize * widthMultiplier,
                    height: eyeSize * heightMultiplier
                )
                .shadow(color: .white.opacity(0.5), radius: 2)

            // Pupil
            Circle()
                .fill(
                    RadialGradient(
                        colors: [
                            Color(hex: 0x1a1a1a),
                            Color(hex: 0x2a2a2a)
                        ],
                        center: .center,
                        startRadius: 0,
                        endRadius: pupilSize
                    )
                )
                .frame(width: pupilSize, height: pupilSize)
                .offset(
                    x: lookDirection.x * pupilSize * 0.4,
                    y: lookDirection.y * pupilSize * 0.3
                )
                .opacity(blinkProgress < 0.7 ? 1 : 0)

            // Highlight (gives life to the eye)
            Circle()
                .fill(.white.opacity(0.9))
                .frame(width: pupilSize * 0.3, height: pupilSize * 0.3)
                .offset(x: -pupilSize * 0.15, y: -pupilSize * 0.15)
                .opacity(blinkProgress < 0.7 ? 0.8 : 0)
        }
    }

    // MARK: - Eyebrows

    private var eyebrows: some View {
        let browOffset = eyebrowPosition * orbSize * 0.02
        let browRotation = eyebrowPosition * 10  // Degrees

        return HStack(spacing: eyeSpacing * 0.8) {
            // Left eyebrow
            Capsule()
                .fill(.white.opacity(0.4))
                .frame(width: eyeSize * 0.8, height: eyeSize * 0.15)
                .rotationEffect(.degrees(-browRotation))
                .offset(y: -eyeSize * 0.6 + browOffset)

            // Right eyebrow
            Capsule()
                .fill(.white.opacity(0.4))
                .frame(width: eyeSize * 0.8, height: eyeSize * 0.15)
                .rotationEffect(.degrees(browRotation))
                .offset(y: -eyeSize * 0.6 + browOffset)
        }
        .offset(y: -eyeVerticalOffset - eyeSize * 0.3)
        .blur(radius: 0.5)
    }

    // MARK: - Eye Shape Modifiers

    private var eyeHeightMultiplier: CGFloat {
        // Blink closes the eye
        let blinkClose = 1 - blinkProgress

        // Eye state affects shape
        let stateMultiplier: CGFloat = {
            switch eyeState {
            case .open: return 1.0
            case .closed: return 0.1
            case .blinking: return blinkClose
            case .wide: return 1.3
            case .squinting: return 0.6
            case .opening: return blinkClose * 0.8
            }
        }()

        return blinkClose * stateMultiplier
    }

    private var eyeWidthMultiplier: CGFloat {
        switch eyeState {
        case .wide: return 1.15
        case .squinting: return 1.1
        default: return 1.0
        }
    }
}

// MARK: - Expressive Eyes Wrapper

/// Combines PixarEyes with PixarPersonalityEngine for auto-animation
public struct ExpressivePixarEyes: View {
    let orbSize: CGFloat
    let personaColor: Color
    @ObservedObject var personality: PixarPersonalityEngine

    public init(
        orbSize: CGFloat,
        personaColor: Color,
        personality: PixarPersonalityEngine
    ) {
        self.orbSize = orbSize
        self.personaColor = personaColor
        self.personality = personality
    }

    public var body: some View {
        PixarEyes(
            orbSize: orbSize,
            personaColor: personaColor,
            blinkProgress: personality.blinkProgress,
            lookDirection: personality.eyeLookDirection,
            eyebrowPosition: personality.eyebrowPosition,
            eyeState: personality.eyeState
        )
    }
}

// MARK: - Simple Animated Eyes

/// Self-contained eyes with basic blinking (no external personality engine)
public struct SimpleAnimatedEyes: View {
    let orbSize: CGFloat
    let personaColor: Color

    // MARK: - Accessibility
    /// Respect user's reduce motion preference
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    @State private var blinkProgress: CGFloat = 0
    @State private var lookDirection: CGPoint = .zero

    public init(orbSize: CGFloat, personaColor: Color) {
        self.orbSize = orbSize
        self.personaColor = personaColor
    }

    public var body: some View {
        PixarEyes(
            orbSize: orbSize,
            personaColor: personaColor,
            blinkProgress: blinkProgress,
            lookDirection: lookDirection
        )
        .onAppear {
            // Skip continuous animations when reduce motion is enabled
            guard !reduceMotion else { return }
            startBlinking()
            startLooking()
        }
    }

    private func startBlinking() {
        // Skip if reduce motion is enabled
        guard !reduceMotion else { return }

        // Random blink interval
        let nextBlink = Double.random(in: 2.5...4.5)

        DispatchQueue.main.asyncAfter(deadline: .now() + nextBlink) {
            performBlink()
            startBlinking()
        }
    }

    private func performBlink() {
        // Skip if reduce motion is enabled
        guard !reduceMotion else { return }

        withAnimation(.easeIn(duration: 0.06)) {
            blinkProgress = 1.0
        }

        DispatchQueue.main.asyncAfter(deadline: .now() + 0.08) {
            withAnimation(.easeOut(duration: 0.08)) {
                blinkProgress = 0.0
            }
        }
    }

    private func startLooking() {
        // Skip if reduce motion is enabled
        guard !reduceMotion else { return }

        // Occasional look around
        let nextLook = Double.random(in: 3...6)

        DispatchQueue.main.asyncAfter(deadline: .now() + nextLook) {
            withAnimation(.spring(response: 0.3, dampingFraction: 0.6)) {
                lookDirection = CGPoint(
                    x: CGFloat.random(in: -0.5...0.5),
                    y: CGFloat.random(in: -0.3...0.3)
                )
            }

            DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) {
                withAnimation(.easeOut(duration: 0.3)) {
                    lookDirection = .zero
                }
            }

            startLooking()
        }
    }
}

// MARK: - Lamp Eye (Pixar Lamp Style)

/// Single oval eye inspired by Pixar's Luxo Jr. lamp
/// - More stylized and cartoony than realistic eyes
/// - Appears/emphasizes during expressions
/// - Works with initials showing through
public struct LampEye: View {
    let orbSize: CGFloat
    let personaColor: Color

    /// How visible the eye is (0 = hidden, 1 = fully visible)
    var visibility: CGFloat = 0.8

    /// Expression intensity affects opacity and size
    var expressionIntensity: CGFloat = 0

    /// Vertical squash (< 1 = squashed, > 1 = stretched)
    var squash: CGFloat = 1.0

    /// Look direction for subtle movement
    var lookDirection: CGPoint = .zero

    public init(
        orbSize: CGFloat,
        personaColor: Color,
        visibility: CGFloat = 0.8,
        expressionIntensity: CGFloat = 0,
        squash: CGFloat = 1.0,
        lookDirection: CGPoint = .zero
    ) {
        self.orbSize = orbSize
        self.personaColor = personaColor
        self.visibility = visibility
        self.expressionIntensity = expressionIntensity
        self.squash = squash
        self.lookDirection = lookDirection
    }

    // MARK: - Computed Properties

    private var eyeWidth: CGFloat {
        orbSize * 0.35  // Wider, more prominent eye
    }

    private var eyeHeight: CGFloat {
        orbSize * 0.22 * squash  // Responds to squash/stretch
    }

    private var pupilSize: CGFloat {
        min(eyeWidth, eyeHeight) * 0.25
    }

    /// Opacity increases with expression intensity
    private var effectiveOpacity: CGFloat {
        let base = visibility * 0.6
        let expressionBoost = expressionIntensity * 0.4
        return min(base + expressionBoost, 1.0)
    }

    public var body: some View {
        ZStack {
            // Eye glow (soft halo)
            Ellipse()
                .fill(
                    RadialGradient(
                        colors: [
                            Color.white.opacity(0.4),
                            Color.white.opacity(0.1),
                            Color.clear
                        ],
                        center: .center,
                        startRadius: 0,
                        endRadius: eyeWidth * 0.8
                    )
                )
                .frame(width: eyeWidth * 1.6, height: eyeHeight * 1.6)
                .blur(radius: 4)

            // Main eye oval (opaque, stylized)
            Ellipse()
                .fill(
                    LinearGradient(
                        colors: [
                            Color.white.opacity(0.95),
                            Color.white.opacity(0.85)
                        ],
                        startPoint: .top,
                        endPoint: .bottom
                    )
                )
                .frame(width: eyeWidth, height: eyeHeight)
                .shadow(color: Color.white.opacity(0.3), radius: 3, y: -1)

            // Inner shadow (gives depth)
            Ellipse()
                .stroke(
                    LinearGradient(
                        colors: [
                            Color.black.opacity(0.15),
                            Color.clear,
                            Color.black.opacity(0.05)
                        ],
                        startPoint: .top,
                        endPoint: .bottom
                    ),
                    lineWidth: 2
                )
                .frame(width: eyeWidth - 2, height: eyeHeight - 2)

            // Pupil (simple dot, follows look direction)
            Circle()
                .fill(
                    RadialGradient(
                        colors: [
                            Color(hex: 0x1a1a2e),
                            Color(hex: 0x2a2a3e)
                        ],
                        center: .center,
                        startRadius: 0,
                        endRadius: pupilSize
                    )
                )
                .frame(width: pupilSize, height: pupilSize)
                .offset(
                    x: lookDirection.x * eyeWidth * 0.2,
                    y: lookDirection.y * eyeHeight * 0.15
                )

            // Highlight (the spark of life)
            Circle()
                .fill(Color.white.opacity(0.95))
                .frame(width: pupilSize * 0.35, height: pupilSize * 0.35)
                .offset(
                    x: -pupilSize * 0.2 + lookDirection.x * eyeWidth * 0.1,
                    y: -pupilSize * 0.2 + lookDirection.y * eyeHeight * 0.08
                )
        }
        .offset(y: -orbSize * 0.08)  // Position slightly above center
        .opacity(effectiveOpacity)
    }
}

// MARK: - Symbolic Expressions

/// Types of symbolic expressions that can overlay the avatar
/// These are moments of connection expressed through simple symbols
public enum SymbolicExpression: String, CaseIterable {
    case none

    // MARK: - Connection & Warmth
    case heart          // Deep connection, empathy, "I'm here for you"
    case heartSpark     // Recognition of returning user, "I remember you"
    case warmth         // Gentle care, comfort

    // MARK: - Joy & Celebration
    case sparkle        // Excitement, celebration, achievement
    case star           // You did great! Pride moment
    case confetti       // Big celebration, milestone reached

    // MARK: - Attention & Presence
    case listening      // Active listening, "I hear you"
    case focus          // Deep attention, processing something important
    case thinking       // Working on something, contemplating

    // MARK: - Curiosity & Discovery
    case curious        // Question, wondering
    case lightbulb      // Idea! Realization moment
    case discover       // Found something interesting

    // MARK: - Calm & Comfort
    case peace          // Calm, zen, breathing together
    case moon           // Late night presence, gentle
    case wave           // Greeting, hello, welcome back

    // MARK: - Energy & Encouragement
    case bolt           // Energy, motivation, let's go!
    case flame          // Passion, fired up
    case music          // Vibing, enjoying music together

    /// SF Symbol name for this expression
    public var symbolName: String? {
        switch self {
        case .none: return nil

        // Connection & Warmth
        case .heart: return "heart.fill"
        case .heartSpark: return "heart.circle.fill"
        case .warmth: return "hands.and.sparkles.fill"

        // Joy & Celebration
        case .sparkle: return "sparkles"
        case .star: return "star.fill"
        case .confetti: return "party.popper.fill"

        // Attention & Presence
        case .listening: return "ear.fill"
        case .focus: return "eye.fill"
        case .thinking: return "ellipsis.circle.fill"

        // Curiosity & Discovery
        case .curious: return "questionmark.circle.fill"
        case .lightbulb: return "lightbulb.fill"
        case .discover: return "magnifyingglass"

        // Calm & Comfort
        case .peace: return "leaf.fill"
        case .moon: return "moon.fill"
        case .wave: return "hand.wave.fill"

        // Energy & Encouragement
        case .bolt: return "bolt.fill"
        case .flame: return "flame.fill"
        case .music: return "music.note"
        }
    }

    /// Color for this expression
    public var color: Color {
        switch self {
        case .none: return .clear

        // Connection & Warmth - warm pinks and golds
        case .heart: return Color(red: 1.0, green: 0.4, blue: 0.5)
        case .heartSpark: return Color(red: 1.0, green: 0.5, blue: 0.6)
        case .warmth: return Color(red: 1.0, green: 0.75, blue: 0.5)

        // Joy & Celebration - bright golds and yellows
        case .sparkle: return Color(red: 1.0, green: 0.85, blue: 0.3)
        case .star: return Color(red: 1.0, green: 0.9, blue: 0.4)
        case .confetti: return Color(red: 1.0, green: 0.7, blue: 0.3)

        // Attention & Presence - soft whites
        case .listening: return .white.opacity(0.9)
        case .focus: return .white.opacity(0.85)
        case .thinking: return .white.opacity(0.7)

        // Curiosity & Discovery - curious blues
        case .curious: return Color(red: 0.6, green: 0.8, blue: 1.0)
        case .lightbulb: return Color(red: 1.0, green: 0.95, blue: 0.5)
        case .discover: return Color(red: 0.7, green: 0.85, blue: 1.0)

        // Calm & Comfort - peaceful greens and soft blues
        case .peace: return Color(red: 0.5, green: 0.8, blue: 0.6)
        case .moon: return Color(red: 0.8, green: 0.85, blue: 1.0)
        case .wave: return .white.opacity(0.9)

        // Energy & Encouragement - vibrant oranges and reds
        case .bolt: return Color(red: 1.0, green: 0.8, blue: 0.2)
        case .flame: return Color(red: 1.0, green: 0.5, blue: 0.2)
        case .music: return Color(red: 0.8, green: 0.6, blue: 1.0)
        }
    }

    /// Duration this expression should show (in seconds)
    public var displayDuration: Double {
        switch self {
        case .none: return 0
        case .heartSpark, .lightbulb: return 1.5  // Quick recognition
        case .confetti, .star: return 2.5  // Celebration lingers
        case .thinking, .focus: return 0  // Until state changes
        default: return 2.0  // Standard duration
        }
    }

    /// Whether this expression pulses/animates while visible
    public var shouldPulse: Bool {
        switch self {
        case .heart, .heartSpark, .flame, .bolt, .music:
            return true
        default:
            return false
        }
    }
}

// MARK: - Symbolic Expression View

/// Renders a symbolic expression with animation
public struct SymbolicExpressionView: View {
    let expression: SymbolicExpression
    let size: CGFloat
    let isVisible: Bool

    // MARK: - Accessibility
    /// Respect user's reduce motion preference
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    @State private var scale: CGFloat = 0.5
    @State private var opacity: CGFloat = 0
    @State private var rotation: Double = -10
    @State private var pulseScale: CGFloat = 1.0

    public init(expression: SymbolicExpression, size: CGFloat, isVisible: Bool) {
        self.expression = expression
        self.size = size
        self.isVisible = isVisible
    }

    public var body: some View {
        Group {
            if let symbolName = expression.symbolName {
                Image(systemName: symbolName)
                    .font(.system(size: size * 0.35, weight: .medium))
                    .foregroundColor(expression.color)
                    .shadow(color: expression.color.opacity(0.6), radius: 6)
                    .shadow(color: expression.color.opacity(0.3), radius: 12)  // Outer glow
            }
        }
        .scaleEffect(scale * pulseScale)
        .opacity(opacity)
        .rotationEffect(.degrees(rotation))
        .onChange(of: isVisible) { visible in
            if visible {
                // Animate in with bounce
                withAnimation(.spring(response: 0.35, dampingFraction: 0.6)) {
                    scale = 1.0
                    opacity = 1.0
                    rotation = 0
                }
                // Start pulsing if needed
                if expression.shouldPulse {
                    startPulsing()
                }
            } else {
                // Animate out
                withAnimation(.easeOut(duration: 0.2)) {
                    scale = 0.5
                    opacity = 0
                    rotation = 10
                    pulseScale = 1.0
                }
            }
        }
        .onChange(of: expression) { newExpression in
            // Reset pulse when expression changes
            pulseScale = 1.0
            if newExpression.shouldPulse && isVisible {
                startPulsing()
            }
        }
        .onAppear {
            if isVisible {
                scale = 1.0
                opacity = 1.0
                rotation = 0
                if expression.shouldPulse {
                    startPulsing()
                }
            }
        }
    }

    private func startPulsing() {
        // Skip pulsing animation when reduce motion is enabled
        guard !reduceMotion else { return }

        // Gentle heartbeat-like pulse
        withAnimation(
            .easeInOut(duration: 0.6)
            .repeatForever(autoreverses: true)
        ) {
            pulseScale = 1.15
        }
    }
}

// MARK: - Animated Lamp Eye

/// Self-animating version of LampEye with natural movements
public struct AnimatedLampEye: View {
    let orbSize: CGFloat
    let personaColor: Color
    let isExpressing: Bool

    /// Optional symbolic expression to show instead of the eye
    var symbolicExpression: SymbolicExpression = .none

    // MARK: - Accessibility
    /// Respect user's reduce motion preference
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    @State private var lookDirection: CGPoint = .zero
    @State private var squash: CGFloat = 1.0
    @State private var expressionIntensity: CGFloat = 0

    public init(
        orbSize: CGFloat,
        personaColor: Color,
        isExpressing: Bool = false,
        symbolicExpression: SymbolicExpression = .none
    ) {
        self.orbSize = orbSize
        self.personaColor = personaColor
        self.isExpressing = isExpressing
        self.symbolicExpression = symbolicExpression
    }

    public var body: some View {
        ZStack {
            // Show eye when no symbolic expression
            if symbolicExpression == .none {
                LampEye(
                    orbSize: orbSize,
                    personaColor: personaColor,
                    visibility: 0.85,
                    expressionIntensity: expressionIntensity,
                    squash: squash,
                    lookDirection: lookDirection
                )
            }

            // Show symbolic expression when active
            SymbolicExpressionView(
                expression: symbolicExpression,
                size: orbSize,
                isVisible: symbolicExpression != .none
            )
        }
        .onAppear {
            startIdleAnimations()
        }
        .onChange(of: isExpressing) { newValue in
            withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) {
                expressionIntensity = newValue ? 1.0 : 0.0
            }
        }
    }

    private func startIdleAnimations() {
        // Skip continuous animations when reduce motion is enabled
        guard !reduceMotion else { return }

        // Subtle look around
        scheduleLook()
        // Occasional squash (like breathing)
        scheduleBreath()
    }

    private func scheduleLook() {
        // Skip when reduce motion is enabled
        guard !reduceMotion else { return }

        let delay = Double.random(in: 2.5...5.0)
        DispatchQueue.main.asyncAfter(deadline: .now() + delay) {
            withAnimation(.spring(response: 0.4, dampingFraction: 0.65)) {
                self.lookDirection = CGPoint(
                    x: CGFloat.random(in: -0.4...0.4),
                    y: CGFloat.random(in: -0.2...0.2)
                )
            }

            // Return to center
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.8) {
                withAnimation(.easeOut(duration: 0.4)) {
                    self.lookDirection = .zero
                }
            }

            self.scheduleLook()
        }
    }

    private func scheduleBreath() {
        // Skip when reduce motion is enabled
        guard !reduceMotion else { return }

        let delay = Double.random(in: 3.0...5.0)
        DispatchQueue.main.asyncAfter(deadline: .now() + delay) {
            // Subtle squash (like a content sigh)
            withAnimation(.easeInOut(duration: 0.3)) {
                self.squash = 0.92
            }

            DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
                withAnimation(.spring(response: 0.4, dampingFraction: 0.5)) {
                    self.squash = 1.0
                }
            }

            self.scheduleBreath()
        }
    }
}

// MARK: - Preview

#if DEBUG
struct PixarEyesPreview: View {
    @State private var blinkProgress: CGFloat = 0
    @State private var lookDirection: CGPoint = .zero
    @State private var eyebrowPosition: CGFloat = 0
    @State private var eyeState: EyeState = .open

    var body: some View {
        VStack(spacing: 30) {
            // Orb with eyes
            ZStack {
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

                PixarEyes(
                    orbSize: 150,
                    personaColor: Color(hex: 0x4a6741),
                    blinkProgress: blinkProgress,
                    lookDirection: lookDirection,
                    eyebrowPosition: eyebrowPosition,
                    eyeState: eyeState
                )
            }

            // Controls
            VStack(spacing: 15) {
                HStack {
                    Text("Blink:")
                    Slider(value: $blinkProgress, in: 0...1)
                }

                HStack {
                    Text("Look X:")
                    Slider(value: $lookDirection.x, in: -1...1)
                }

                HStack {
                    Text("Look Y:")
                    Slider(value: $lookDirection.y, in: -1...1)
                }

                HStack {
                    Text("Eyebrow:")
                    Slider(value: $eyebrowPosition, in: -1...1)
                }

                HStack {
                    ForEach([EyeState.open, .wide, .squinting, .closed], id: \.self) { state in
                        Button(state.rawValue) {
                            withAnimation { eyeState = state }
                        }
                        .buttonStyle(.bordered)
                    }
                }
            }
            .padding()
        }
    }
}

#Preview {
    PixarEyesPreview()
}
#endif
