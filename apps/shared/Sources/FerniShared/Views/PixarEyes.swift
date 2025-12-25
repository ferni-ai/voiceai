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
            startBlinking()
            startLooking()
        }
    }

    private func startBlinking() {
        // Random blink interval
        let nextBlink = Double.random(in: 2.5...4.5)

        DispatchQueue.main.asyncAfter(deadline: .now() + nextBlink) {
            performBlink()
            startBlinking()
        }
    }

    private func performBlink() {
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
public enum SymbolicExpression: String, CaseIterable {
    case none
    case heart          // ❤️ Love/warmth
    case sparkle        // ✨ Excitement/joy
    case thinking       // 💭 Processing
    case listening      // 👂 Active listening
    case happy          // 😊 Happy (curved line like smile)
    case curious        // 🤔 Question mark

    /// SF Symbol name for this expression
    var symbolName: String? {
        switch self {
        case .none: return nil
        case .heart: return "heart.fill"
        case .sparkle: return "sparkles"
        case .thinking: return "thought.bubble.fill"
        case .listening: return "ear.fill"
        case .happy: return "face.smiling"
        case .curious: return "questionmark"
        }
    }

    /// Color for this expression
    var color: Color {
        switch self {
        case .none: return .clear
        case .heart: return Color(red: 1.0, green: 0.4, blue: 0.5)  // Warm pink
        case .sparkle: return Color(red: 1.0, green: 0.85, blue: 0.3)  // Gold
        case .thinking: return .white.opacity(0.8)
        case .listening: return .white.opacity(0.8)
        case .happy: return Color(red: 1.0, green: 0.85, blue: 0.3)  // Warm gold
        case .curious: return .white.opacity(0.9)
        }
    }
}

// MARK: - Symbolic Expression View

/// Renders a symbolic expression with animation
public struct SymbolicExpressionView: View {
    let expression: SymbolicExpression
    let size: CGFloat
    let isVisible: Bool

    @State private var scale: CGFloat = 0.5
    @State private var opacity: CGFloat = 0
    @State private var rotation: Double = -10

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
                    .shadow(color: expression.color.opacity(0.5), radius: 4)
            }
        }
        .scaleEffect(scale)
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
            } else {
                // Animate out
                withAnimation(.easeOut(duration: 0.2)) {
                    scale = 0.5
                    opacity = 0
                    rotation = 10
                }
            }
        }
        .onAppear {
            if isVisible {
                scale = 1.0
                opacity = 1.0
                rotation = 0
            }
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
        // Subtle look around
        scheduleLook()
        // Occasional squash (like breathing)
        scheduleBreath()
    }

    private func scheduleLook() {
        let delay = Double.random(in: 2.5...5.0)
        DispatchQueue.main.asyncAfter(deadline: .now() + delay) {
            withAnimation(.spring(response: 0.4, dampingFraction: 0.65)) {
                lookDirection = CGPoint(
                    x: CGFloat.random(in: -0.4...0.4),
                    y: CGFloat.random(in: -0.2...0.2)
                )
            }

            // Return to center
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.8) {
                withAnimation(.easeOut(duration: 0.4)) {
                    lookDirection = .zero
                }
            }

            scheduleLook()
        }
    }

    private func scheduleBreath() {
        let delay = Double.random(in: 3.0...5.0)
        DispatchQueue.main.asyncAfter(deadline: .now() + delay) {
            // Subtle squash (like a content sigh)
            withAnimation(.easeInOut(duration: 0.3)) {
                squash = 0.92
            }

            DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
                withAnimation(.spring(response: 0.4, dampingFraction: 0.5)) {
                    squash = 1.0
                }
            }

            scheduleBreath()
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
