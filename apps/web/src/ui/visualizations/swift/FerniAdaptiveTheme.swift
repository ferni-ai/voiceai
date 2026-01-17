// MARK: - Ferni Adaptive Theme
// Colors and styling that subtly shift based on user's emotional state
// The app should feel warmer when you need comfort, calmer when you're anxious
//
// Design Philosophy:
// - Changes should be subtle, almost subliminal
// - Energy levels affect vibrancy and saturation
// - Time of day influences warmth
// - Mood affects accent color temperature
// - Transitions should be slow and gentle (no jarring changes)

import SwiftUI
import Combine

// MARK: - Adaptive Theme Manager

@MainActor
class FerniAdaptiveTheme: ObservableObject {
    static let shared = FerniAdaptiveTheme()

    // Current state
    @Published var currentMood: AvatarMood = .neutral
    @Published var energyLevel: Int = 75 // 0-100
    @Published var emotionalState: EmotionalState = .balanced

    // Computed theme properties
    @Published private(set) var currentTheme: AdaptiveThemeColors

    private var cancellables = Set<AnyCancellable>()

    enum EmotionalState {
        case anxious      // Needs calming
        case stressed     // Needs soothing
        case balanced     // Neutral
        case content      // Warm feeling
        case joyful       // Elevated mood
        case tired        // Needs gentle support
        case reflective   // Introspective
    }

    init() {
        // Initialize with default theme
        currentTheme = AdaptiveThemeColors.forState(.balanced, energy: 75, timeOfDay: .afternoon)

        // React to state changes
        Publishers.CombineLatest3($currentMood, $energyLevel, $emotionalState)
            .debounce(for: .milliseconds(300), scheduler: RunLoop.main)
            .sink { [weak self] mood, energy, state in
                self?.updateTheme(mood: mood, energy: energy, state: state)
            }
            .store(in: &cancellables)

        // Update for time of day every 15 minutes
        Timer.publish(every: 900, on: .main, in: .common)
            .autoconnect()
            .sink { [weak self] _ in
                self?.refreshTimeBasedColors()
            }
            .store(in: &cancellables)
    }

    // MARK: - Public API

    /// Update the theme based on detected emotional signals
    func updateEmotionalState(_ state: EmotionalState, animated: Bool = true) {
        if animated {
            withAnimation(.easeInOut(duration: 2.0)) {
                emotionalState = state
            }
        } else {
            emotionalState = state
        }
    }

    /// Update energy level (from energy rings data)
    func updateEnergy(_ level: Int, animated: Bool = true) {
        let clamped = min(max(level, 0), 100)
        if animated {
            withAnimation(.easeInOut(duration: 1.5)) {
                energyLevel = clamped
            }
        } else {
            energyLevel = clamped
        }
    }

    /// Update mood (from conversation or avatar state)
    func updateMood(_ mood: AvatarMood, animated: Bool = true) {
        if animated {
            withAnimation(.easeInOut(duration: 1.0)) {
                currentMood = mood
            }
        } else {
            currentMood = mood
        }
    }

    // MARK: - Private

    private func updateTheme(mood: AvatarMood, energy: Int, state: EmotionalState) {
        withAnimation(.easeInOut(duration: 2.0)) {
            currentTheme = AdaptiveThemeColors.forState(state, energy: energy, timeOfDay: currentTimeOfDay)
        }
    }

    private func refreshTimeBasedColors() {
        updateTheme(mood: currentMood, energy: energyLevel, state: emotionalState)
    }

    private var currentTimeOfDay: TimeOfDayTheme {
        let hour = Calendar.current.component(.hour, from: Date())
        if hour >= 5 && hour < 9 {
            return .earlyMorning
        } else if hour >= 9 && hour < 12 {
            return .morning
        } else if hour >= 12 && hour < 17 {
            return .afternoon
        } else if hour >= 17 && hour < 20 {
            return .evening
        } else if hour >= 20 && hour < 23 {
            return .night
        } else {
            return .lateNight
        }
    }
}

// MARK: - Time of Day Theme

enum TimeOfDayTheme {
    case earlyMorning   // Soft, warm awakening
    case morning        // Fresh, energizing
    case afternoon      // Neutral, clear
    case evening        // Warm, winding down
    case night          // Calm, soothing
    case lateNight      // Deep, peaceful

    var warmthOffset: CGFloat {
        switch self {
        case .earlyMorning: return 0.08
        case .morning: return 0.03
        case .afternoon: return 0
        case .evening: return 0.1
        case .night: return 0.05
        case .lateNight: return 0.02
        }
    }

    var saturationMultiplier: CGFloat {
        switch self {
        case .earlyMorning: return 0.85
        case .morning: return 1.0
        case .afternoon: return 1.0
        case .evening: return 0.95
        case .night: return 0.8
        case .lateNight: return 0.7
        }
    }

    var brightnessOffset: CGFloat {
        switch self {
        case .earlyMorning: return 0.02
        case .morning: return 0.05
        case .afternoon: return 0
        case .evening: return -0.02
        case .night: return -0.05
        case .lateNight: return -0.08
        }
    }
}

// MARK: - Adaptive Theme Colors

struct AdaptiveThemeColors {
    // Primary colors
    let background: Color
    let backgroundElevated: Color
    let backgroundSubtle: Color

    // Text
    let textPrimary: Color
    let textSecondary: Color
    let textMuted: Color

    // Accents
    let accent: Color
    let accentSoft: Color
    let accentGlow: Color

    // Avatar
    let avatarPrimary: Color
    let avatarGlow: Color

    // Cards
    let cardBackground: Color
    let cardBorder: Color

    // Status
    let statusPositive: Color
    let statusNeutral: Color
    let statusConcern: Color

    // MARK: - Factory

    static func forState(
        _ state: FerniAdaptiveTheme.EmotionalState,
        energy: Int,
        timeOfDay: TimeOfDayTheme
    ) -> AdaptiveThemeColors {

        // Energy affects vibrancy (lower energy = more muted)
        let energyFactor = CGFloat(energy) / 100.0
        let vibrancy = 0.6 + (energyFactor * 0.4) // 0.6 to 1.0

        // State affects color temperature
        let warmth: CGFloat
        let calmness: CGFloat

        switch state {
        case .anxious:
            warmth = 0.05     // Slightly cool
            calmness = 0.3    // More muted
        case .stressed:
            warmth = 0.1      // Warm
            calmness = 0.4    // Softer
        case .balanced:
            warmth = 0.15     // Natural warmth
            calmness = 0.5    // Balanced
        case .content:
            warmth = 0.2      // Warm
            calmness = 0.6    // Slightly richer
        case .joyful:
            warmth = 0.25     // Very warm
            calmness = 0.8    // Vibrant
        case .tired:
            warmth = 0.15     // Gentle warmth
            calmness = 0.3    // Very soft
        case .reflective:
            warmth = 0.1      // Neutral-cool
            calmness = 0.5    // Thoughtful
        }

        // Combine with time of day
        let totalWarmth = warmth + timeOfDay.warmthOffset
        let totalSaturation = vibrancy * timeOfDay.saturationMultiplier * calmness

        // Generate colors
        return AdaptiveThemeColors(
            background: adaptiveBackground(warmth: totalWarmth, brightness: timeOfDay.brightnessOffset),
            backgroundElevated: adaptiveBackgroundElevated(warmth: totalWarmth),
            backgroundSubtle: adaptiveBackgroundSubtle(warmth: totalWarmth),
            textPrimary: adaptiveTextPrimary(warmth: totalWarmth),
            textSecondary: adaptiveTextSecondary(warmth: totalWarmth),
            textMuted: adaptiveTextMuted(warmth: totalWarmth),
            accent: adaptiveAccent(warmth: totalWarmth, saturation: totalSaturation),
            accentSoft: adaptiveAccentSoft(warmth: totalWarmth, saturation: totalSaturation),
            accentGlow: adaptiveAccentGlow(warmth: totalWarmth, saturation: totalSaturation),
            avatarPrimary: adaptiveAvatarPrimary(warmth: totalWarmth, saturation: totalSaturation),
            avatarGlow: adaptiveAvatarGlow(warmth: totalWarmth, saturation: totalSaturation),
            cardBackground: adaptiveCardBackground(warmth: totalWarmth),
            cardBorder: adaptiveCardBorder(warmth: totalWarmth),
            statusPositive: adaptiveStatusPositive(saturation: totalSaturation),
            statusNeutral: adaptiveStatusNeutral(warmth: totalWarmth),
            statusConcern: adaptiveStatusConcern(saturation: totalSaturation)
        )
    }

    // MARK: - Color Generators

    private static func adaptiveBackground(warmth: CGFloat, brightness: CGFloat) -> Color {
        // Base: warm off-white (#fffdfb)
        Color(
            red: 1.0 + brightness,
            green: 0.992 + brightness - warmth * 0.02,
            blue: 0.984 + brightness - warmth * 0.04
        )
    }

    private static func adaptiveBackgroundElevated(warmth: CGFloat) -> Color {
        Color(
            red: 1.0,
            green: 1.0 - warmth * 0.01,
            blue: 1.0 - warmth * 0.02
        )
    }

    private static func adaptiveBackgroundSubtle(warmth: CGFloat) -> Color {
        Color(
            red: 0.98,
            green: 0.97 - warmth * 0.01,
            blue: 0.96 - warmth * 0.02
        )
    }

    private static func adaptiveTextPrimary(warmth: CGFloat) -> Color {
        // Base: natural ink (#2C2520)
        Color(
            red: 0.173 + warmth * 0.02,
            green: 0.145,
            blue: 0.125
        )
    }

    private static func adaptiveTextSecondary(warmth: CGFloat) -> Color {
        Color(
            red: 0.36 + warmth * 0.02,
            green: 0.33,
            blue: 0.29
        )
    }

    private static func adaptiveTextMuted(warmth: CGFloat) -> Color {
        Color(
            red: 0.6 + warmth * 0.02,
            green: 0.56,
            blue: 0.52
        )
    }

    private static func adaptiveAccent(warmth: CGFloat, saturation: CGFloat) -> Color {
        // Base: Ferni green (#3D5A45)
        // Warmer = more olive, Cooler = more teal
        Color(
            hue: (0.38 - warmth * 0.05) / 1.0, // Shift hue with warmth
            saturation: 0.33 * saturation + 0.2,
            brightness: 0.35 + saturation * 0.1
        )
    }

    private static func adaptiveAccentSoft(warmth: CGFloat, saturation: CGFloat) -> Color {
        adaptiveAccent(warmth: warmth, saturation: saturation).opacity(0.15)
    }

    private static func adaptiveAccentGlow(warmth: CGFloat, saturation: CGFloat) -> Color {
        adaptiveAccent(warmth: warmth, saturation: saturation).opacity(0.3)
    }

    private static func adaptiveAvatarPrimary(warmth: CGFloat, saturation: CGFloat) -> Color {
        // Base: Ferni (#4a6741)
        Color(
            hue: (0.35 - warmth * 0.03) / 1.0,
            saturation: 0.38 * saturation + 0.15,
            brightness: 0.4 + saturation * 0.1
        )
    }

    private static func adaptiveAvatarGlow(warmth: CGFloat, saturation: CGFloat) -> Color {
        adaptiveAvatarPrimary(warmth: warmth, saturation: saturation).opacity(0.4)
    }

    private static func adaptiveCardBackground(warmth: CGFloat) -> Color {
        Color(
            red: 1.0,
            green: 0.995 - warmth * 0.01,
            blue: 0.99 - warmth * 0.02
        )
    }

    private static func adaptiveCardBorder(warmth: CGFloat) -> Color {
        Color(
            red: 0.9 + warmth * 0.02,
            green: 0.88,
            blue: 0.85
        ).opacity(0.5)
    }

    private static func adaptiveStatusPositive(saturation: CGFloat) -> Color {
        Color(
            hue: 0.35, // Green
            saturation: 0.5 * saturation + 0.2,
            brightness: 0.55 + saturation * 0.1
        )
    }

    private static func adaptiveStatusNeutral(warmth: CGFloat) -> Color {
        Color(
            red: 0.55 + warmth * 0.05,
            green: 0.52,
            blue: 0.48
        )
    }

    private static func adaptiveStatusConcern(saturation: CGFloat) -> Color {
        Color(
            hue: 0.08, // Orange-red
            saturation: 0.6 * saturation + 0.2,
            brightness: 0.65 + saturation * 0.1
        )
    }
}

// MARK: - Environment Key

private struct AdaptiveThemeKey: EnvironmentKey {
    static let defaultValue = AdaptiveThemeColors.forState(.balanced, energy: 75, timeOfDay: .afternoon)
}

extension EnvironmentValues {
    var adaptiveTheme: AdaptiveThemeColors {
        get { self[AdaptiveThemeKey.self] }
        set { self[AdaptiveThemeKey.self] = newValue }
    }
}

// MARK: - View Modifier

struct AdaptiveThemeModifier: ViewModifier {
    @ObservedObject var themeManager = FerniAdaptiveTheme.shared

    func body(content: Content) -> some View {
        content
            .environment(\.adaptiveTheme, themeManager.currentTheme)
    }
}

extension View {
    func adaptiveTheme() -> some View {
        modifier(AdaptiveThemeModifier())
    }
}

// MARK: - Adaptive Background

struct AdaptiveBackground: View {
    @Environment(\.adaptiveTheme) var theme

    var body: some View {
        theme.background
            .ignoresSafeArea()
    }
}

// MARK: - Preview

#Preview("Adaptive Theme States") {
    struct PreviewWrapper: View {
        @StateObject private var themeManager = FerniAdaptiveTheme.shared
        @State private var selectedState: FerniAdaptiveTheme.EmotionalState = .balanced
        @State private var energy: Double = 75

        let states: [FerniAdaptiveTheme.EmotionalState] = [
            .anxious, .stressed, .balanced, .content, .joyful, .tired, .reflective
        ]

        var body: some View {
            ZStack {
                themeManager.currentTheme.background
                    .ignoresSafeArea()

                VStack(spacing: 24) {
                    // Avatar with theme
                    ZStack {
                        Circle()
                            .fill(themeManager.currentTheme.avatarGlow)
                            .frame(width: 140, height: 140)
                            .blur(radius: 20)

                        Circle()
                            .fill(themeManager.currentTheme.avatarPrimary)
                            .frame(width: 100, height: 100)
                    }

                    // State picker
                    Picker("State", selection: $selectedState) {
                        ForEach(states, id: \.self) { state in
                            Text(String(describing: state))
                                .tag(state)
                        }
                    }
                    .pickerStyle(.segmented)
                    .padding(.horizontal)
                    .onChange(of: selectedState) { _, newValue in
                        themeManager.updateEmotionalState(newValue)
                    }

                    // Energy slider
                    VStack {
                        Text("Energy: \(Int(energy))%")
                            .foregroundColor(themeManager.currentTheme.textSecondary)

                        Slider(value: $energy, in: 0...100)
                            .tint(themeManager.currentTheme.accent)
                            .padding(.horizontal)
                            .onChange(of: energy) { _, newValue in
                                themeManager.updateEnergy(Int(newValue))
                            }
                    }

                    // Sample card
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Sample Card")
                            .font(.headline)
                            .foregroundColor(themeManager.currentTheme.textPrimary)

                        Text("This card adapts to your emotional state")
                            .font(.subheadline)
                            .foregroundColor(themeManager.currentTheme.textSecondary)

                        HStack {
                            Circle()
                                .fill(themeManager.currentTheme.statusPositive)
                                .frame(width: 12, height: 12)
                            Text("Positive")
                                .font(.caption)
                                .foregroundColor(themeManager.currentTheme.textMuted)

                            Circle()
                                .fill(themeManager.currentTheme.statusConcern)
                                .frame(width: 12, height: 12)
                            Text("Concern")
                                .font(.caption)
                                .foregroundColor(themeManager.currentTheme.textMuted)
                        }
                    }
                    .padding()
                    .background(themeManager.currentTheme.cardBackground)
                    .cornerRadius(12)
                    .overlay(
                        RoundedRectangle(cornerRadius: 12)
                            .stroke(themeManager.currentTheme.cardBorder, lineWidth: 1)
                    )
                    .padding(.horizontal)

                    // Accent button
                    Button("Accent Button") {}
                        .padding(.horizontal, 24)
                        .padding(.vertical, 12)
                        .background(themeManager.currentTheme.accent)
                        .foregroundColor(.white)
                        .cornerRadius(20)
                }
            }
        }
    }

    return PreviewWrapper()
}
