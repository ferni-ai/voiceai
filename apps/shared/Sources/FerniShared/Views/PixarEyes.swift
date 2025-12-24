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
