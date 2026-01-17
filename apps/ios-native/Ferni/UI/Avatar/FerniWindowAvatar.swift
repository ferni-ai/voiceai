// MARK: - Ferni Window Avatar
// The signature "peeking through" avatar that makes Ferni feel present, not contained.
//
// Design Philosophy:
// Traditional avatars are trapped in circles - they feel flat, like profile pictures.
// The Window Avatar inverts this: Ferni exists BEHIND the interface, peeking through.
// The top and bottom "lids" are the same color as the background, creating the illusion
// of depth and presence.
//
// Core Capabilities:
// - Voice-reactive mouth (bottom lid opens/closes with speech volume)
// - Emotional expressions via lid shape changes
// - Persona color adaptation for team members
// - Smooth spring-based animations
//
// Reference: docs/vision/WINDOW-AVATAR-DESIGN-LANGUAGE.md

import SwiftUI

// MARK: - Avatar Mood

/// Emotional states that affect the window shape
enum AvatarMood: String, CaseIterable {
    case neutral
    case happy
    case delighted
    case surprised
    case sleepy
    case skeptical
    case sad
    case curious
    case excited
    case thinking
    case empathetic
    case listening
    
    /// Top lid cutoff amount (0 = none, 1 = fully covered)
    var topCutoff: CGFloat {
        switch self {
        case .neutral: return 0.12
        case .happy: return 0.14
        case .delighted: return 0.16
        case .surprised: return 0.06
        case .sleepy: return 0.22
        case .skeptical: return 0.11
        case .sad: return 0.12
        case .curious: return 0.10
        case .excited: return 0.08
        case .thinking: return 0.14
        case .empathetic: return 0.13
        case .listening: return 0.11
        }
    }
    
    /// Top lid curve (-1 = frown up, 1 = smile down)
    var topCurve: CGFloat {
        switch self {
        case .neutral: return 0
        case .happy: return 0.08
        case .delighted: return 0.12
        case .surprised: return 0.1
        case .sleepy: return -0.15
        case .skeptical: return 0
        case .sad: return -0.08
        case .curious: return 0.05
        case .excited: return 0.1
        case .thinking: return 0
        case .empathetic: return 0.05
        case .listening: return 0.03
        }
    }
    
    /// Bottom lid base cutoff (speaking adds to this)
    var bottomCutoff: CGFloat {
        switch self {
        case .neutral: return 0.12
        case .happy: return 0.14
        case .delighted: return 0.16
        case .surprised: return 0.18
        case .sleepy: return 0.10
        case .skeptical: return 0.11
        case .sad: return 0.10
        case .curious: return 0.13
        case .excited: return 0.15
        case .thinking: return 0.11
        case .empathetic: return 0.12
        case .listening: return 0.12
        }
    }
    
    /// Bottom lid curve (-1 = smile, 1 = frown)
    var bottomCurve: CGFloat {
        switch self {
        case .neutral: return 0
        case .happy: return -0.20
        case .delighted: return -0.30
        case .surprised: return 0
        case .sleepy: return 0.05
        case .skeptical: return 0.08
        case .sad: return 0.15
        case .curious: return 0
        case .excited: return -0.18
        case .thinking: return 0.05
        case .empathetic: return -0.10
        case .listening: return -0.05
        }
    }
    
    /// Asymmetry for expressions like skeptical (-1 left higher, 1 right higher)
    var asymmetry: CGFloat {
        switch self {
        case .skeptical: return 0.25
        case .curious: return 0.15
        case .thinking: return 0.08
        default: return 0
        }
    }
}

// MARK: - Window Persona Colors (local type to avoid conflict with FerniShared.Persona)

/// Team member persona colors for window avatar
enum WindowPersona {
    case ferni
    case peter
    case maya
    case jordan
    case nayan
    case alex
    
    var primaryColor: Color {
        switch self {
        case .ferni: return Color(hexString: "#4a6741")
        case .peter: return Color(hexString: "#3a6b73")
        case .maya: return Color(hexString: "#a67a6a")
        case .jordan: return Color(hexString: "#c4856a")
        case .nayan: return Color(hexString: "#b8956a")
        case .alex: return Color(hexString: "#5a6b8a")
        }
    }
    
    var secondaryColor: Color {
        switch self {
        case .ferni: return Color(hexString: "#3d5a35")
        case .peter: return Color(hexString: "#2d5359")
        case .maya: return Color(hexString: "#8a635a")
        case .jordan: return Color(hexString: "#a86d55")
        case .nayan: return Color(hexString: "#9a7a52")
        case .alex: return Color(hexString: "#4a5a73")
        }
    }
}

// MARK: - Main View

/// The signature Ferni Window Avatar
/// Creates the illusion of Ferni peeking through the interface
struct FerniWindowAvatar: View {
    // MARK: - Properties

    var size: CGFloat = 120
    var persona: WindowPersona = .ferni

    /// Expression (new data-driven system with 100 expressions)
    var expression: AvatarExpression = .neutral

    /// Legacy mood support (for backwards compatibility)
    var mood: AvatarMood = .neutral

    /// Use expression system instead of legacy mood
    var useExpressionSystem: Bool = true

    /// Binding to speaking state (from voice agent)
    @Binding var isSpeaking: Bool

    /// Binding to current voice volume (0-1)
    @Binding var volume: CGFloat

    // MARK: - Animation State

    @State private var animatedVolume: CGFloat = 0
    @State private var breathPhase: CGFloat = 0
    @State private var eyeGazeOffset: CGPoint = .zero
    @State private var sparklePhase: CGFloat = 0

    // MARK: - Computed Expression Config

    /// Get the active expression config (from expression or legacy mood)
    private var activeConfig: ExpressionConfig {
        if useExpressionSystem {
            return expression.config
        } else {
            return mood.expressionConfig
        }
    }
    
    // MARK: - Computed Properties

    /// Top lid cutoff from active expression config
    private var topCutoff: CGFloat {
        activeConfig.topCutoff
    }

    /// Top lid curve from active expression config
    private var topCurve: CGFloat {
        activeConfig.topCurve
    }

    /// Bottom lid cutoff, adjusted for expression and speaking
    private var bottomCutoff: CGFloat {
        let base = activeConfig.bottomCutoff
        let speakingAddition = isSpeaking ? animatedVolume * 0.23 : 0
        return min(base + speakingAddition, 0.35) // Max 35% open
    }

    /// Bottom lid curve from active expression config
    private var bottomCurve: CGFloat {
        activeConfig.bottomCurve
    }

    /// Asymmetry from active expression config
    private var asymmetry: CGFloat {
        activeConfig.asymmetry
    }

    /// Eye vertical scale from active expression config
    private var eyeScaleY: CGFloat {
        activeConfig.effectiveEyeScaleY
    }

    /// Eye horizontal scale from active expression config
    private var eyeScaleX: CGFloat {
        activeConfig.effectiveEyeScaleX
    }

    /// Whether to show sparkle effect
    private var showSparkle: Bool {
        activeConfig.sparkle
    }
    
    // MARK: - Body
    
    var body: some View {
        ZStack {
            // Avatar face (the "behind")
            avatarFace
            
            // Eyes
            eyes
            
            // Sparkle overlay (for delighted/excited expressions)
            if showSparkle {
                SparkleOverlay(size: size, phase: sparklePhase)
            }

            // Top window mask
            WindowMask(
                edge: .top,
                cutoff: topCutoff,
                curve: topCurve,
                asymmetry: asymmetry
            )

            // Bottom window mask (voice-reactive)
            WindowMask(
                edge: .bottom,
                cutoff: bottomCutoff,
                curve: bottomCurve,
                asymmetry: asymmetry * 0.5
            )
            .animation(
                .spring(response: 0.08, dampingFraction: 0.8),
                value: animatedVolume
            )
        }
        .frame(width: size, height: size)
        .onAppear {
            startBreathing()
            startGazeMovement()
            startSparkleAnimation()
        }
        .onChange(of: volume) { newVolume in
            updateVolume(newVolume)
        }
        .onChange(of: isSpeaking) { speaking in
            if !speaking {
                withAnimation(.easeOut(duration: 0.2)) {
                    animatedVolume = 0
                }
            }
        }
    }
    
    // MARK: - Avatar Face
    
    private var avatarFace: some View {
        Circle()
            .fill(
                LinearGradient(
                    colors: [persona.primaryColor, persona.secondaryColor],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
            )
            .overlay {
                // Shine overlay
                Circle()
                    .fill(
                        LinearGradient(
                            colors: [
                                Color.white.opacity(0.2),
                                Color.clear
                            ],
                            startPoint: .topLeading,
                            endPoint: .center
                        )
                    )
            }
            .scaleEffect(1.0 + breathPhase * 0.015)
    }
    
    // MARK: - Eyes

    private var eyes: some View {
        HStack(spacing: size * 0.2) {
            EyeView(
                size: size * 0.18,
                gazeOffset: eyeGazeOffset,
                scaleX: eyeScaleX,
                scaleY: eyeScaleY
            )
            EyeView(
                size: size * 0.18,
                gazeOffset: eyeGazeOffset,
                scaleX: eyeScaleX,
                scaleY: eyeScaleY
            )
        }
        .offset(y: -size * 0.05)
    }
    
    // MARK: - Animations
    
    private func startBreathing() {
        withAnimation(
            .easeInOut(duration: 4)
            .repeatForever(autoreverses: true)
        ) {
            breathPhase = 1
        }
    }
    
    private func startGazeMovement() {
        // Natural gaze shifts
        Timer.scheduledTimer(withTimeInterval: 2.5, repeats: true) { _ in
            withAnimation(.easeInOut(duration: 0.4)) {
                eyeGazeOffset = CGPoint(
                    x: CGFloat.random(in: -1...1),
                    y: CGFloat.random(in: -0.5...0.5)
                )
            }
        }
    }
    
    private func updateVolume(_ newVolume: CGFloat) {
        // Different smoothing for attack vs release
        let smoothing: CGFloat = newVolume > animatedVolume ? 0.25 : 0.12

        withAnimation(.linear(duration: 0.05)) {
            animatedVolume += (newVolume - animatedVolume) * smoothing
        }
    }

    private func startSparkleAnimation() {
        withAnimation(
            .easeInOut(duration: 1.5)
            .repeatForever(autoreverses: true)
        ) {
            sparklePhase = 1
        }
    }
}

// MARK: - Sparkle Overlay

/// Animated sparkle effect for delighted/excited expressions
struct SparkleOverlay: View {
    let size: CGFloat
    var phase: CGFloat = 0

    var body: some View {
        ZStack {
            // Top-right sparkle
            SparkleShape()
                .fill(Color.white.opacity(0.6 + phase * 0.3))
                .frame(width: size * 0.08, height: size * 0.08)
                .offset(x: size * 0.25, y: -size * 0.2)
                .scaleEffect(0.8 + phase * 0.4)

            // Top-left sparkle (smaller, offset timing)
            SparkleShape()
                .fill(Color.white.opacity(0.4 + (1 - phase) * 0.3))
                .frame(width: size * 0.05, height: size * 0.05)
                .offset(x: -size * 0.22, y: -size * 0.15)
                .scaleEffect(0.6 + (1 - phase) * 0.3)

            // Bottom sparkle (subtle)
            SparkleShape()
                .fill(Color.white.opacity(0.3 + phase * 0.2))
                .frame(width: size * 0.04, height: size * 0.04)
                .offset(x: size * 0.15, y: size * 0.18)
                .scaleEffect(0.5 + phase * 0.3)
        }
        .animation(.easeInOut(duration: 1.5), value: phase)
    }
}

// MARK: - Sparkle Shape

/// Four-pointed star shape for sparkle effects
struct SparkleShape: Shape {
    func path(in rect: CGRect) -> Path {
        var path = Path()
        let center = CGPoint(x: rect.midX, y: rect.midY)
        let w = rect.width
        let h = rect.height

        // Four-pointed star
        path.move(to: CGPoint(x: center.x, y: rect.minY))
        path.addQuadCurve(
            to: CGPoint(x: rect.maxX, y: center.y),
            control: CGPoint(x: center.x + w * 0.1, y: center.y - h * 0.1)
        )
        path.addQuadCurve(
            to: CGPoint(x: center.x, y: rect.maxY),
            control: CGPoint(x: center.x + w * 0.1, y: center.y + h * 0.1)
        )
        path.addQuadCurve(
            to: CGPoint(x: rect.minX, y: center.y),
            control: CGPoint(x: center.x - w * 0.1, y: center.y + h * 0.1)
        )
        path.addQuadCurve(
            to: CGPoint(x: center.x, y: rect.minY),
            control: CGPoint(x: center.x - w * 0.1, y: center.y - h * 0.1)
        )

        return path
    }
}

// MARK: - Eye View

struct EyeView: View {
    let size: CGFloat
    var gazeOffset: CGPoint = .zero
    var scaleX: CGFloat = 1.0
    var scaleY: CGFloat = 1.0

    var body: some View {
        ZStack {
            // Sclera (white) - opaque, no iris/pupil visible (Luxo style)
            Circle()
                .fill(Color.white)
                .shadow(color: .black.opacity(0.1), radius: 2, y: 1)

            // Catchlight for life
            Circle()
                .fill(Color.white.opacity(0.9))
                .frame(width: size * 0.15, height: size * 0.15)
                .offset(x: size * 0.1, y: -size * 0.1)
        }
        .frame(width: size, height: size)
        .scaleEffect(x: scaleX, y: scaleY)
        .offset(
            x: gazeOffset.x * size * 0.15,
            y: gazeOffset.y * size * 0.15
        )
        .animation(.spring(response: 0.3, dampingFraction: 0.7), value: scaleX)
        .animation(.spring(response: 0.3, dampingFraction: 0.7), value: scaleY)
    }
}

// MARK: - Window Mask

/// The background-colored mask that creates the "window" effect
struct WindowMask: View {
    enum Edge { case top, bottom }
    
    let edge: Edge
    let cutoff: CGFloat
    var curve: CGFloat = 0
    var asymmetry: CGFloat = 0
    
    @Environment(\.colorScheme) var colorScheme
    
    var body: some View {
        GeometryReader { geo in
            Path { path in
                generatePath(in: geo.size, path: &path)
            }
            .fill(backgroundColor)
        }
    }
    
    private func generatePath(in size: CGSize, path: inout Path) {
        let w = size.width
        let h = size.height
        
        // Curve modifier affects the control point
        let curveOffset = curve * 30
        
        switch edge {
        case .top:
            let controlY = h * cutoff + curveOffset
            let leftY = asymmetry * 8
            let rightY = -asymmetry * 8
            
            path.move(to: CGPoint(x: 0, y: leftY))
            path.addQuadCurve(
                to: CGPoint(x: w, y: rightY),
                control: CGPoint(x: w/2, y: controlY)
            )
            path.addLine(to: CGPoint(x: w, y: 0))
            path.addLine(to: CGPoint(x: 0, y: 0))
            path.closeSubpath()
            
        case .bottom:
            let controlY = h - (h * cutoff) + curveOffset
            let leftY = h + asymmetry * 8
            let rightY = h - asymmetry * 8
            
            path.move(to: CGPoint(x: 0, y: leftY))
            path.addQuadCurve(
                to: CGPoint(x: w, y: rightY),
                control: CGPoint(x: w/2, y: controlY)
            )
            path.addLine(to: CGPoint(x: w, y: h))
            path.addLine(to: CGPoint(x: 0, y: h))
            path.closeSubpath()
        }
    }
    
    private var backgroundColor: Color {
        // Use system background color to match the surrounding UI
        colorScheme == .dark
            ? Color(hexString: "#1a1612")
            : Color(hexString: "#F5F1E8") // Paper Cream
    }
}

// Color extension removed - using FerniShared's Color(hexString:) instead

// MARK: - Preview

struct FerniWindowAvatar_Previews: PreviewProvider {
    static var previews: some View {
        ScrollView {
            VStack(spacing: 30) {
                Text("Expression System Preview")
                    .font(.headline)
                    .padding(.top)

                // Expression family showcase
                LazyVGrid(columns: [
                    GridItem(.flexible()),
                    GridItem(.flexible()),
                    GridItem(.flexible())
                ], spacing: 20) {
                    // Core expressions
                    ExpressionPreview(expression: .neutral, label: "Neutral")
                    ExpressionPreview(expression: .listening, label: "Listening")
                    ExpressionPreview(expression: .speaking, label: "Speaking")

                    // Happy family
                    ExpressionPreview(expression: .happy, label: "Happy")
                    ExpressionPreview(expression: .joyful, label: "Joyful")
                    ExpressionPreview(expression: .delighted, label: "Delighted")

                    // Warmth family
                    ExpressionPreview(expression: .warm, label: "Warm")
                    ExpressionPreview(expression: .caring, label: "Caring")
                    ExpressionPreview(expression: .empathetic, label: "Empathetic")

                    // Playful family
                    ExpressionPreview(expression: .playful, label: "Playful")
                    ExpressionPreview(expression: .winking, label: "Winking")
                    ExpressionPreview(expression: .mischievous, label: "Mischievous")

                    // Surprised family
                    ExpressionPreview(expression: .surprised, label: "Surprised")
                    ExpressionPreview(expression: .curious, label: "Curious")
                    ExpressionPreview(expression: .amazed, label: "Amazed")

                    // Thinking family
                    ExpressionPreview(expression: .thinking, label: "Thinking")
                    ExpressionPreview(expression: .pondering, label: "Pondering")
                    ExpressionPreview(expression: .focused, label: "Focused")

                    // Tired family
                    ExpressionPreview(expression: .sleepy, label: "Sleepy")
                    ExpressionPreview(expression: .drowsy, label: "Drowsy")
                    ExpressionPreview(expression: .yawning, label: "Yawning")

                    // Sad family
                    ExpressionPreview(expression: .sad, label: "Sad")
                    ExpressionPreview(expression: .disappointed, label: "Disappointed")
                    ExpressionPreview(expression: .melancholy, label: "Melancholy")

                    // Cool family
                    ExpressionPreview(expression: .confident, label: "Confident")
                    ExpressionPreview(expression: .smirking, label: "Smirking")
                    ExpressionPreview(expression: .cool, label: "Cool")
                }
                .padding()

                Divider()

                // Persona colors
                Text("Persona Colors")
                    .font(.headline)

                HStack(spacing: 20) {
                    ForEach([WindowPersona.ferni, .peter, .maya, .jordan, .nayan, .alex], id: \.self) { persona in
                        VStack {
                            FerniWindowAvatar(
                                size: 60,
                                persona: persona,
                                expression: .happy,
                                isSpeaking: .constant(false),
                                volume: .constant(0)
                            )
                            Text(String(describing: persona))
                                .font(.caption)
                        }
                    }
                }
                .padding()
            }
        }
        .background(Color(hexString: "#F5F1E8"))
    }
}

/// Helper view for expression preview grid
struct ExpressionPreview: View {
    let expression: AvatarExpression
    let label: String

    var body: some View {
        VStack(spacing: 4) {
            FerniWindowAvatar(
                size: 80,
                persona: .ferni,
                expression: expression,
                isSpeaking: .constant(false),
                volume: .constant(0)
            )
            Text(label)
                .font(.caption2)
                .foregroundColor(.secondary)
        }
    }
}

extension WindowPersona: Hashable {}
