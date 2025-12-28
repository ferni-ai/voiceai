// MARK: - Ferni Ambient Mode
// A calming presence screen - Ferni is here, available when needed
// Perfect for meditation, background companionship, or just feeling less alone
//
// Design Philosophy:
// - Presence without interruption
// - Gentle, living animation that doesn't demand attention
// - Syncs with time of day for natural warmth
// - Optional breathing haptics for physical connection

import SwiftUI

// MARK: - Ambient Mode

struct FerniAmbientView: View {
    var enableHapticBreathing: Bool = false
    var showTime: Bool = true
    var onTap: (() -> Void)? = nil

    @State private var breathPhase: CGFloat = 0
    @State private var ambientPhase: CGFloat = 0
    @State private var starPhase: CGFloat = 0
    @State private var currentTime = Date()
    @State private var idleMinutes: Int = 0

    @StateObject private var haptics = FerniHapticManager.shared

    private let timer = Timer.publish(every: 60, on: .main, in: .common).autoconnect()
    private let breathDuration: Double = 5.0 // Slower, more meditative

    private var timeOfDay: TimeOfDay {
        let hour = Calendar.current.component(.hour, from: currentTime)
        if hour >= 5 && hour < 12 {
            return .morning
        } else if hour >= 12 && hour < 17 {
            return .afternoon
        } else if hour >= 17 && hour < 21 {
            return .evening
        } else {
            return .night
        }
    }

    var body: some View {
        GeometryReader { geometry in
            ZStack {
                // Animated background gradient
                animatedBackground(size: geometry.size)
                    .ignoresSafeArea()

                // Ambient particles (stars at night, soft light during day)
                ambientParticles(size: geometry.size)

                // Main content
                VStack(spacing: 0) {
                    Spacer()

                    // Ferni avatar - breathing, peaceful
                    ambientAvatar

                    // Gentle message
                    presenceMessage
                        .padding(.top, 32)

                    Spacer()

                    // Time display
                    if showTime {
                        timeDisplay
                            .padding(.bottom, 60)
                    }
                }
            }
        }
        .onTapGesture {
            onTap?()
        }
        .onAppear {
            startAnimations()
        }
        .onDisappear {
            if enableHapticBreathing {
                haptics.stopBreathing()
            }
        }
        .onReceive(timer) { _ in
            currentTime = Date()
            idleMinutes += 1
        }
    }

    // MARK: - Background

    private func animatedBackground(size: CGSize) -> some View {
        let colors = timeOfDay.gradientColors

        return ZStack {
            // Base gradient
            LinearGradient(
                colors: colors,
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )

            // Breathing glow overlay
            RadialGradient(
                colors: [
                    colors[0].opacity(0.3 * breathPhase),
                    Color.clear
                ],
                center: .center,
                startRadius: 100,
                endRadius: size.width
            )
        }
    }

    // MARK: - Ambient Particles

    private func ambientParticles(size: CGSize) -> some View {
        ZStack {
            switch timeOfDay {
            case .night:
                // Stars
                ForEach(0..<30, id: \.self) { i in
                    let x = CGFloat.random(in: 0...size.width)
                    let y = CGFloat.random(in: 0...(size.height * 0.6))
                    let starSize = CGFloat.random(in: 2...4)
                    let delay = Double.random(in: 0...2)

                    Circle()
                        .fill(Color.white)
                        .frame(width: starSize, height: starSize)
                        .position(x: x, y: y)
                        .opacity(0.3 + 0.7 * sin(starPhase + delay))
                }

            case .evening:
                // Warm floating particles
                ForEach(0..<15, id: \.self) { i in
                    let x = CGFloat.random(in: 0...size.width)
                    let y = CGFloat.random(in: 0...size.height)

                    Circle()
                        .fill(Color.orange.opacity(0.2))
                        .frame(width: CGFloat.random(in: 10...30))
                        .position(x: x, y: y + ambientPhase * 20)
                        .blur(radius: 10)
                }

            case .morning, .afternoon:
                // Soft light rays
                ForEach(0..<5, id: \.self) { i in
                    let angle = Double(i) * 15 - 30

                    Rectangle()
                        .fill(
                            LinearGradient(
                                colors: [Color.white.opacity(0.1), Color.clear],
                                startPoint: .top,
                                endPoint: .bottom
                            )
                        )
                        .frame(width: 40, height: size.height * 0.7)
                        .rotationEffect(.degrees(angle))
                        .offset(y: -size.height * 0.15)
                        .opacity(0.5 + 0.5 * sin(ambientPhase + Double(i) * 0.5))
                }
            }
        }
    }

    // MARK: - Avatar

    private var ambientAvatar: some View {
        let avatarSize: CGFloat = 160
        let glowRadius = 30 + breathPhase * 20

        return ZStack {
            // Ambient glow - larger, softer
            Circle()
                .fill(
                    RadialGradient(
                        colors: [
                            FerniColors.ferni.opacity(0.25),
                            FerniColors.ferni.opacity(0.1),
                            Color.clear
                        ],
                        center: .center,
                        startRadius: avatarSize * 0.4,
                        endRadius: avatarSize * 1.2 + glowRadius
                    )
                )
                .frame(width: avatarSize * 2.5, height: avatarSize * 2.5)
                .blur(radius: 25)

            // The avatar itself
            FerniAvatarView(
                size: avatarSize,
                mood: .calm,
                showBreathing: true
            )
        }
    }

    // MARK: - Presence Message

    private var presenceMessage: some View {
        VStack(spacing: 8) {
            Text(timeOfDay.greeting)
                .font(.system(size: 24, weight: .medium, design: .rounded))
                .foregroundColor(.white.opacity(0.9))

            Text(presenceSubtitle)
                .font(.system(size: 15, weight: .regular))
                .foregroundColor(.white.opacity(0.6))
        }
        .opacity(0.8 + breathPhase * 0.2)
    }

    private var presenceSubtitle: String {
        if idleMinutes < 5 {
            return "I'm here with you"
        } else if idleMinutes < 15 {
            return "Take your time"
        } else if idleMinutes < 30 {
            return "Just breathing together"
        } else {
            return "Always here when you need me"
        }
    }

    // MARK: - Time Display

    private var timeDisplay: some View {
        Text(currentTime, style: .time)
            .font(.system(size: 48, weight: .thin, design: .rounded))
            .foregroundColor(.white.opacity(0.4))
    }

    // MARK: - Animations

    private func startAnimations() {
        // Slow breathing
        withAnimation(.easeInOut(duration: breathDuration).repeatForever(autoreverses: true)) {
            breathPhase = 1
        }

        // Ambient movement
        withAnimation(.easeInOut(duration: 8).repeatForever(autoreverses: true)) {
            ambientPhase = 1
        }

        // Star twinkle
        withAnimation(.linear(duration: 3).repeatForever(autoreverses: false)) {
            starPhase = .pi * 2
        }

        // Start haptic breathing if enabled
        if enableHapticBreathing {
            haptics.startBreathing(breathDuration: breathDuration)
        }
    }
}

// MARK: - Time of Day

private enum TimeOfDay {
    case morning
    case afternoon
    case evening
    case night

    var greeting: String {
        switch self {
        case .morning: return "Good morning"
        case .afternoon: return "Good afternoon"
        case .evening: return "Good evening"
        case .night: return "Peaceful night"
        }
    }

    var gradientColors: [Color] {
        switch self {
        case .morning:
            return [
                Color(red: 0.98, green: 0.85, blue: 0.75), // Warm peach
                Color(red: 0.95, green: 0.90, blue: 0.85), // Soft cream
                Color(red: 0.85, green: 0.88, blue: 0.95)  // Light blue
            ]
        case .afternoon:
            return [
                Color(red: 0.70, green: 0.85, blue: 0.95), // Sky blue
                Color(red: 0.85, green: 0.92, blue: 0.98), // Light azure
                Color(red: 0.95, green: 0.95, blue: 0.98)  // Almost white
            ]
        case .evening:
            return [
                Color(red: 0.95, green: 0.60, blue: 0.50), // Sunset coral
                Color(red: 0.85, green: 0.50, blue: 0.55), // Dusty rose
                Color(red: 0.35, green: 0.30, blue: 0.50)  // Twilight purple
            ]
        case .night:
            return [
                Color(red: 0.08, green: 0.08, blue: 0.18), // Deep night
                Color(red: 0.12, green: 0.12, blue: 0.25), // Navy
                Color(red: 0.05, green: 0.05, blue: 0.12)  // Almost black
            ]
        }
    }
}

// MARK: - Ambient Mode Container (Full Screen)

struct FerniAmbientModeSheet: View {
    @Binding var isPresented: Bool
    @State private var enableHaptics = false

    var body: some View {
        ZStack(alignment: .topTrailing) {
            FerniAmbientView(
                enableHapticBreathing: enableHaptics,
                onTap: nil
            )

            // Controls overlay
            VStack(alignment: .trailing, spacing: 16) {
                // Close button
                Button(action: { isPresented = false }) {
                    Image(systemName: "xmark")
                        .font(.system(size: 17, weight: .medium))
                        .foregroundColor(.white.opacity(0.7))
                        .frame(width: 36, height: 36)
                        .background(Circle().fill(.white.opacity(0.1)))
                }

                // Haptic toggle
                Button(action: { enableHaptics.toggle() }) {
                    Image(systemName: enableHaptics ? "hand.raised.fill" : "hand.raised")
                        .font(.system(size: 17, weight: .medium))
                        .foregroundColor(.white.opacity(0.7))
                        .frame(width: 36, height: 36)
                        .background(Circle().fill(.white.opacity(enableHaptics ? 0.2 : 0.1)))
                }
            }
            .padding(.top, 60)
            .padding(.trailing, 20)
        }
    }
}

// MARK: - Mini Ambient (Widget-like)

struct FerniMiniAmbientView: View {
    var size: CGFloat = 160

    @State private var breathPhase: CGFloat = 0

    private var timeOfDay: TimeOfDay {
        let hour = Calendar.current.component(.hour, from: Date())
        if hour >= 5 && hour < 12 {
            return .morning
        } else if hour >= 12 && hour < 17 {
            return .afternoon
        } else if hour >= 17 && hour < 21 {
            return .evening
        } else {
            return .night
        }
    }

    var body: some View {
        ZStack {
            // Background
            RoundedRectangle(cornerRadius: 24)
                .fill(
                    LinearGradient(
                        colors: timeOfDay.gradientColors,
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )

            // Avatar
            VStack(spacing: 8) {
                FerniCompactAvatarView(size: size * 0.35, mood: .calm)

                Text(timeOfDay.greeting)
                    .font(.system(size: 13, weight: .medium))
                    .foregroundColor(.white.opacity(0.8))
            }
        }
        .frame(width: size, height: size)
        .shadow(color: .black.opacity(0.2), radius: 10, y: 5)
    }
}

// MARK: - Preview

#Preview("Ambient Mode - Night") {
    FerniAmbientView()
        .preferredColorScheme(.dark)
}

#Preview("Ambient Mode - Morning") {
    // Simulate morning by showing the view
    FerniAmbientView()
}

#Preview("Ambient Mode Sheet") {
    struct PreviewWrapper: View {
        @State private var isShowing = true

        var body: some View {
            Button("Show Ambient") {
                isShowing = true
            }
            .fullScreenCover(isPresented: $isShowing) {
                FerniAmbientModeSheet(isPresented: $isShowing)
            }
        }
    }

    return PreviewWrapper()
}

#Preview("Mini Ambient") {
    HStack(spacing: 20) {
        FerniMiniAmbientView(size: 160)
        FerniMiniAmbientView(size: 120)
    }
    .padding(40)
    .background(Color.gray.opacity(0.2))
}
