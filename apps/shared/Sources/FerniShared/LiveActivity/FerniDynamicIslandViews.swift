import SwiftUI
import WidgetKit

#if os(iOS)

// MARK: - Dynamic Island Views
/// SwiftUI views for Ferni's Dynamic Island Live Activity.
///
/// Layout Philosophy:
/// - **Compact**: Minimal but alive - breathing orb + duration
/// - **Minimal**: Just the avatar peeking through (when multiple activities)
/// - **Expanded**: Full emotional presence with transcript + controls
///
/// These views are designed to be used in a Widget Extension target.

@available(iOS 16.1, *)
public struct FerniDynamicIslandViews {

    // MARK: - Compact Leading (Avatar Side)

    public struct CompactLeading: View {
        let personaColorHex: String
        let speakingState: SpeakingState

        public init(personaColorHex: String, speakingState: SpeakingState) {
            self.personaColorHex = personaColorHex
            self.speakingState = speakingState
        }

        public var body: some View {
            // Tiny breathing orb
            Circle()
                .fill(Color(hexString: personaColorHex))
                .frame(width: 14, height: 14)
                .scaleEffect(speakingState == .agentSpeaking ? 1.2 : 1.0)
                .animation(.easeInOut(duration: 0.3).repeatForever(autoreverses: true), value: speakingState)
                .shadow(color: (Color(hexString: personaColorHex)).opacity(0.5), radius: 3)
                .accessibilityLabel(speakingStateLabel)
        }

        private var speakingStateLabel: String {
            switch speakingState {
            case .agentSpeaking: return "Ferni is speaking"
            case .userSpeaking: return "You are speaking"
            case .listening: return "Ferni is listening"
            case .idle: return "Ferni voice session"
            }
        }
    }

    // MARK: - Compact Trailing (Duration Side)

    public struct CompactTrailing: View {
        let formattedDuration: String
        let isMuted: Bool

        public init(formattedDuration: String, isMuted: Bool) {
            self.formattedDuration = formattedDuration
            self.isMuted = isMuted
        }

        public var body: some View {
            HStack(spacing: 4) {
                if isMuted {
                    Image(systemName: "mic.slash.fill")
                        .font(.system(size: 10))
                        .foregroundColor(.red)
                }

                Text(formattedDuration)
                    .font(.system(size: 12, weight: .medium, design: .monospaced))
                    .foregroundColor(.white)
            }
            .accessibilityElement(children: .combine)
            .accessibilityLabel(accessibilityLabel)
        }

        private var accessibilityLabel: String {
            if isMuted {
                return "Muted, duration \(formattedDuration)"
            } else {
                return "Duration \(formattedDuration)"
            }
        }
    }

    // MARK: - Minimal View (When Multiple Activities)

    public struct Minimal: View {
        let personaColorHex: String

        public init(personaColorHex: String) {
            self.personaColorHex = personaColorHex
        }

        public var body: some View {
            Circle()
                .fill(Color(hexString: personaColorHex))
                .frame(width: 12, height: 12)
                .accessibilityLabel("Ferni voice session active")
        }
    }

    // MARK: - Expanded View (Full Dynamic Island)

    public struct Expanded: View {
        let attributes: FerniActivityAttributes
        let state: FerniActivityAttributes.ContentState

        public init(attributes: FerniActivityAttributes, state: FerniActivityAttributes.ContentState) {
            self.attributes = attributes
            self.state = state
        }

        public var body: some View {
            HStack(spacing: 16) {
                // Left: Avatar orb
                avatarOrb
                    .accessibilityHidden(true)  // Announced via main container

                // Center: Info
                VStack(alignment: .leading, spacing: 4) {
                    // Persona name + status
                    HStack {
                        Text(attributes.personaName)
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundColor(.white)

                        if state.showingConcern {
                            Image(systemName: "heart.fill")
                                .font(.system(size: 10))
                                .foregroundColor(.pink)
                        }
                    }

                    // Status text
                    Text(state.statusText)
                        .font(.system(size: 11))
                        .foregroundColor(.white.opacity(0.7))
                }
                .accessibilityHidden(true)  // Announced via main container

                Spacer()

                // Right: Duration + controls
                VStack(alignment: .trailing, spacing: 4) {
                    Text(state.formattedDuration)
                        .font(.system(size: 16, weight: .medium, design: .monospaced))
                        .foregroundColor(.white)

                    // Mute indicator
                    if state.isMuted {
                        HStack(spacing: 2) {
                            Image(systemName: "mic.slash.fill")
                                .font(.system(size: 9))
                            Text("Muted")
                                .font(.system(size: 9))
                        }
                        .foregroundColor(.red)
                    }
                }
                .accessibilityHidden(true)  // Announced via main container
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(expandedAccessibilityLabel)
            .accessibilityHint("Tap to open Ferni app")
        }

        private var expandedAccessibilityLabel: String {
            var parts: [String] = []

            // Persona and state
            parts.append(attributes.personaName)
            parts.append(speakingStateLabel)

            // Concern
            if state.showingConcern {
                parts.append("showing concern")
            }

            // Status
            parts.append(state.statusText)

            // Duration
            parts.append("duration \(state.formattedDuration)")

            // Mute state
            if state.isMuted {
                parts.append("microphone muted")
            }

            return parts.joined(separator: ", ")
        }

        private var speakingStateLabel: String {
            switch state.speakingState {
            case .agentSpeaking: return "speaking"
            case .userSpeaking: return "listening to you"
            case .listening: return "listening"
            case .idle: return "idle"
            }
        }

        // MARK: - Avatar Orb

        private var avatarOrb: some View {
            ZStack {
                // Outer glow based on emotional tone
                Circle()
                    .fill(emotionalGlowGradient)
                    .frame(width: 48, height: 48)
                    .blur(radius: 8)
                    .opacity(0.5)

                // Main orb
                Circle()
                    .fill(
                        RadialGradient(
                            colors: [
                                Color(hexString: attributes.personaColorHex).opacity(0.9),
                                Color(hexString: attributes.personaColorHex)
                            ],
                            center: .topLeading,
                            startRadius: 0,
                            endRadius: 24
                        )
                    )
                    .frame(width: 40, height: 40)
                    .scaleEffect(speakingScale)
                    .animation(.easeInOut(duration: 0.4).repeatForever(autoreverses: true), value: state.speakingState)

                // Speaking indicator rings
                if state.speakingState == .agentSpeaking {
                    ForEach(0..<2, id: \.self) { i in
                        Circle()
                            .stroke(
                                (Color(hexString: attributes.personaColorHex)).opacity(0.3),
                                lineWidth: 1
                            )
                            .frame(width: 40 + CGFloat(i * 8), height: 40 + CGFloat(i * 8))
                            .scaleEffect(1.0 + CGFloat(i) * 0.1)
                    }
                }

                // Listening indicator (user speaking)
                if state.speakingState == .userSpeaking {
                    Circle()
                        .stroke(.white.opacity(0.5), lineWidth: 2)
                        .frame(width: 46, height: 46)
                }
            }
        }

        private var speakingScale: CGFloat {
            switch state.speakingState {
            case .agentSpeaking: return 1.1
            case .userSpeaking: return 0.95
            case .listening: return 1.05
            case .idle: return 1.0
            }
        }

        private var emotionalGlowGradient: RadialGradient {
            let color: Color = {
                switch state.emotionalTone {
                case .warm: return .orange
                case .concerned: return .pink
                case .excited: return .yellow
                case .calm: return .blue
                case .focused: return .purple
                case .neutral: return Color(hexString: attributes.personaColorHex)
                }
            }()

            return RadialGradient(
                colors: [color.opacity(0.6), color.opacity(0)],
                center: .center,
                startRadius: 0,
                endRadius: 30
            )
        }
    }

    // MARK: - Expanded Regions

    public struct ExpandedLeadingRegion: View {
        let attributes: FerniActivityAttributes
        let state: FerniActivityAttributes.ContentState

        public init(attributes: FerniActivityAttributes, state: FerniActivityAttributes.ContentState) {
            self.attributes = attributes
            self.state = state
        }

        public var body: some View {
            // Small orb for leading region
            Circle()
                .fill(Color(hexString: attributes.personaColorHex))
                .frame(width: 52, height: 52)
                .scaleEffect(state.speakingState == .agentSpeaking ? 1.1 : 1.0)
                .animation(.easeInOut(duration: 0.4).repeatForever(autoreverses: true), value: state.speakingState)
                .accessibilityLabel("\(attributes.personaName) avatar, \(speakingStateLabel)")
        }

        private var speakingStateLabel: String {
            switch state.speakingState {
            case .agentSpeaking: return "speaking"
            case .userSpeaking: return "listening"
            case .listening: return "listening"
            case .idle: return "idle"
            }
        }
    }

    public struct ExpandedTrailingRegion: View {
        let state: FerniActivityAttributes.ContentState

        public init(state: FerniActivityAttributes.ContentState) {
            self.state = state
        }

        public var body: some View {
            VStack(alignment: .trailing, spacing: 2) {
                Text(state.formattedDuration)
                    .font(.system(size: 24, weight: .medium, design: .monospaced))
                    .foregroundColor(.white)

                if state.isMuted {
                    Image(systemName: "mic.slash.fill")
                        .font(.system(size: 14))
                        .foregroundColor(.red)
                }
            }
            .accessibilityElement(children: .combine)
            .accessibilityLabel(accessibilityLabel)
        }

        private var accessibilityLabel: String {
            if state.isMuted {
                return "Duration \(state.formattedDuration), microphone muted"
            } else {
                return "Duration \(state.formattedDuration)"
            }
        }
    }

    public struct ExpandedCenterRegion: View {
        let attributes: FerniActivityAttributes
        let state: FerniActivityAttributes.ContentState

        public init(attributes: FerniActivityAttributes, state: FerniActivityAttributes.ContentState) {
            self.attributes = attributes
            self.state = state
        }

        public var body: some View {
            VStack(spacing: 4) {
                HStack {
                    Text(attributes.personaName)
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundColor(.white)

                    if state.showingConcern {
                        Image(systemName: "heart.fill")
                            .font(.system(size: 12))
                            .foregroundColor(.pink)
                    }
                }

                Text(state.statusText)
                    .font(.system(size: 12))
                    .foregroundColor(.white.opacity(0.7))
            }
            .accessibilityElement(children: .combine)
            .accessibilityLabel(accessibilityLabel)
        }

        private var accessibilityLabel: String {
            var parts: [String] = [attributes.personaName]

            if state.showingConcern {
                parts.append("showing concern")
            }

            parts.append(state.statusText)

            return parts.joined(separator: ", ")
        }
    }

    public struct ExpandedBottomRegion: View {
        let state: FerniActivityAttributes.ContentState

        public init(state: FerniActivityAttributes.ContentState) {
            self.state = state
        }

        public var body: some View {
            // Speaking state indicator
            HStack(spacing: 8) {
                ForEach(0..<5, id: \.self) { i in
                    RoundedRectangle(cornerRadius: 2)
                        .fill(.white.opacity(barOpacity(for: i)))
                        .frame(width: 4, height: barHeight(for: i))
                }
            }
            .padding(.top, 8)
            .accessibilityLabel(audioIndicatorLabel)
        }

        private var audioIndicatorLabel: String {
            switch state.speakingState {
            case .agentSpeaking: return "Audio indicator, Ferni speaking"
            case .userSpeaking: return "Audio indicator, you are speaking"
            case .listening: return "Audio indicator, listening"
            case .idle: return "Audio indicator"
            }
        }

        private func barOpacity(for index: Int) -> Double {
            switch state.speakingState {
            case .agentSpeaking, .userSpeaking:
                return 0.8
            case .listening:
                return 0.5
            case .idle:
                return 0.3
            }
        }

        private func barHeight(for index: Int) -> CGFloat {
            let baseHeight: CGFloat = 8
            let maxHeight: CGFloat = 20

            switch state.speakingState {
            case .agentSpeaking:
                // Animated bars effect
                return baseHeight + CGFloat.random(in: 0...(maxHeight - baseHeight))
            case .userSpeaking:
                return baseHeight + CGFloat.random(in: 0...(maxHeight - baseHeight) * 0.7)
            case .listening:
                return baseHeight + 4
            case .idle:
                return baseHeight
            }
        }
    }
}

// Note: Uses Color(hexString:) from Color+Hex.swift

#endif
