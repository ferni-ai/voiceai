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

// MARK: - Persona Colors

/// Team member persona colors
enum Persona {
    case ferni
    case peter
    case maya
    case jordan
    case nayan
    case alex
    
    var primaryColor: Color {
        switch self {
        case .ferni: return Color(hex: "#4a6741")
        case .peter: return Color(hex: "#3a6b73")
        case .maya: return Color(hex: "#a67a6a")
        case .jordan: return Color(hex: "#c4856a")
        case .nayan: return Color(hex: "#b8956a")
        case .alex: return Color(hex: "#5a6b8a")
        }
    }
    
    var secondaryColor: Color {
        switch self {
        case .ferni: return Color(hex: "#3d5a35")
        case .peter: return Color(hex: "#2d5359")
        case .maya: return Color(hex: "#8a635a")
        case .jordan: return Color(hex: "#a86d55")
        case .nayan: return Color(hex: "#9a7a52")
        case .alex: return Color(hex: "#4a5a73")
        }
    }
}

// MARK: - Main View

/// The signature Ferni Window Avatar
/// Creates the illusion of Ferni peeking through the interface
struct FerniWindowAvatar: View {
    // MARK: - Properties
    
    var size: CGFloat = 120
    var persona: Persona = .ferni
    var mood: AvatarMood = .neutral
    
    /// Binding to speaking state (from voice agent)
    @Binding var isSpeaking: Bool
    
    /// Binding to current voice volume (0-1)
    @Binding var volume: CGFloat
    
    // MARK: - Animation State
    
    @State private var animatedVolume: CGFloat = 0
    @State private var breathPhase: CGFloat = 0
    @State private var eyeGazeOffset: CGPoint = .zero
    
    // MARK: - Computed Properties
    
    /// Top lid cutoff, adjusted for mood
    private var topCutoff: CGFloat {
        mood.topCutoff
    }
    
    /// Bottom lid cutoff, adjusted for mood and speaking
    private var bottomCutoff: CGFloat {
        let base = mood.bottomCutoff
        let speakingAddition = isSpeaking ? animatedVolume * 0.23 : 0
        return min(base + speakingAddition, 0.35) // Max 35% open
    }
    
    // MARK: - Body
    
    var body: some View {
        ZStack {
            // Avatar face (the "behind")
            avatarFace
            
            // Eyes
            eyes
            
            // Top window mask
            WindowMask(
                edge: .top,
                cutoff: topCutoff,
                curve: mood.topCurve,
                asymmetry: mood.asymmetry
            )
            
            // Bottom window mask (voice-reactive)
            WindowMask(
                edge: .bottom,
                cutoff: bottomCutoff,
                curve: mood.bottomCurve,
                asymmetry: mood.asymmetry * 0.5
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
            EyeView(size: size * 0.18, gazeOffset: eyeGazeOffset)
            EyeView(size: size * 0.18, gazeOffset: eyeGazeOffset)
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
}

// MARK: - Eye View

struct EyeView: View {
    let size: CGFloat
    var gazeOffset: CGPoint = .zero
    
    var body: some View {
        ZStack {
            // Sclera (white)
            Circle()
                .fill(Color.white)
                .shadow(color: .black.opacity(0.1), radius: 2, y: 1)
            
            // Iris + Pupil
            Circle()
                .fill(Color(hex: "#1a1612"))
                .frame(width: size * 0.5, height: size * 0.5)
                .offset(
                    x: gazeOffset.x * size * 0.1,
                    y: gazeOffset.y * size * 0.1
                )
            
            // Catchlight
            Circle()
                .fill(Color.white.opacity(0.9))
                .frame(width: size * 0.15, height: size * 0.15)
                .offset(x: size * 0.1, y: -size * 0.1)
        }
        .frame(width: size, height: size)
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
            ? Color(hex: "#1a1612")
            : Color(hex: "#F5F1E8") // Paper Cream
    }
}

// MARK: - Color Extension

extension Color {
    init(hex: String) {
        let hex = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        var int: UInt64 = 0
        Scanner(string: hex).scanHexInt64(&int)
        let a, r, g, b: UInt64
        switch hex.count {
        case 3: // RGB (12-bit)
            (a, r, g, b) = (255, (int >> 8) * 17, (int >> 4 & 0xF) * 17, (int & 0xF) * 17)
        case 6: // RGB (24-bit)
            (a, r, g, b) = (255, int >> 16, int >> 8 & 0xFF, int & 0xFF)
        case 8: // ARGB (32-bit)
            (a, r, g, b) = (int >> 24, int >> 16 & 0xFF, int >> 8 & 0xFF, int & 0xFF)
        default:
            (a, r, g, b) = (1, 1, 1, 0)
        }
        self.init(
            .sRGB,
            red: Double(r) / 255,
            green: Double(g) / 255,
            blue:  Double(b) / 255,
            opacity: Double(a) / 255
        )
    }
}

// MARK: - Preview

struct FerniWindowAvatar_Previews: PreviewProvider {
    static var previews: some View {
        VStack(spacing: 40) {
            // Static preview
            FerniWindowAvatar(
                size: 160,
                persona: .ferni,
                mood: .happy,
                isSpeaking: .constant(false),
                volume: .constant(0)
            )
            
            // Speaking preview
            FerniWindowAvatar(
                size: 160,
                persona: .maya,
                mood: .neutral,
                isSpeaking: .constant(true),
                volume: .constant(0.6)
            )
        }
        .padding(40)
        .background(Color(hex: "#F5F1E8"))
    }
}
