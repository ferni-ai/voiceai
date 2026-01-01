// MARK: - Session Window Avatar
// Connects the Window Avatar to the LiveKit session state
//
// This view bridges the IOSLiveKitSession with FerniWindowAvatar,
// automatically updating expressions and mouth animation based on
// backend emotion events and speech state.
//
// Usage:
//   SessionWindowAvatar(size: 200)
//       .environmentObject(session)

import SwiftUI
import Combine

// MARK: - Session Window Avatar

/// Window Avatar that automatically responds to session emotion events
public struct SessionWindowAvatar: View {
    @EnvironmentObject var session: IOSLiveKitSession

    // MARK: - Properties

    var size: CGFloat = 160

    /// Whether to show persona colors based on current persona
    var usePersonaColors: Bool = true

    // MARK: - Body

    public var body: some View {
        FerniWindowAvatar(
            size: size,
            persona: mappedPersona,
            expression: session.currentExpression,
            isSpeaking: isSpeakingBinding,
            volume: volumeBinding
        )
        .animation(.spring(response: 0.3, dampingFraction: 0.7), value: session.currentExpression)
    }

    // MARK: - Bindings

    /// Binding for speaking state
    private var isSpeakingBinding: Binding<Bool> {
        Binding(
            get: { session.isAgentSpeaking },
            set: { _ in }
        )
    }

    /// Binding for volume
    private var volumeBinding: Binding<CGFloat> {
        Binding(
            get: { session.agentAudioLevel },
            set: { _ in }
        )
    }

    // MARK: - Persona Mapping

    /// Map session persona ID to Window Avatar Persona enum
    private var mappedPersona: WindowPersona {
        guard usePersonaColors else { return .ferni }

        switch session.currentPersonaId {
        case "ferni": return .ferni
        case "peter": return .peter
        case "maya": return .maya
        case "jordan": return .jordan
        case "nayan": return .nayan
        case "alex": return .alex
        default: return .ferni
        }
    }
}

// MARK: - Expression Observer

/// Observes session expression changes and triggers micro-expression haptics
/// Used internally by SessionWindowAvatar
final class ExpressionObserver: ObservableObject {
    private var cancellables = Set<AnyCancellable>()

    /// Subscribe to expression changes
    func observe(session: IOSLiveKitSession) {
        session.$currentExpression
            .removeDuplicates()
            .sink { [weak self] expression in
                self?.handleExpressionChange(expression)
            }
            .store(in: &cancellables)
    }

    private func handleExpressionChange(_ expression: AvatarExpression) {
        // Log expression changes for debugging
        #if DEBUG
        print("🎭 Expression changed: \(expression.rawValue)")
        #endif

        // Trigger platform-specific feedback (haptics, etc.)
        triggerExpressionFeedback(expression)
    }

    private func triggerExpressionFeedback(_ expression: AvatarExpression) {
        #if os(iOS)
        // Subtle haptic for expression changes
        let generator = UIImpactFeedbackGenerator(style: .light)

        switch expression {
        case .delighted, .joyful, .excited:
            generator.impactOccurred(intensity: 0.7)

        case .comforting, .supportive:
            generator.impactOccurred(intensity: 0.3)

        default:
            // No haptic for most expressions
            break
        }
        #endif
    }
}

// MARK: - Preview

#Preview("Session Window Avatar") {
    ZStack {
        Color(hexString: "#1a1612")
            .ignoresSafeArea()

        VStack(spacing: 40) {
            Text("Session Avatar Preview")
                .font(.headline)
                .foregroundColor(.white)

            // Preview with mock session
            SessionWindowAvatar(size: 200)
                .environmentObject(IOSLiveKitSession())

            Text("Expressions update automatically")
                .font(.caption)
                .foregroundColor(.white.opacity(0.6))
        }
    }
}

// MARK: - Standalone Window Avatar Preview

/// Preview that demonstrates expressions without a session
struct StandaloneWindowAvatarPreview: View {
    @State private var currentExpression: AvatarExpression = .neutral
    @State private var isSpeaking = false
    @State private var volume: CGFloat = 0

    var body: some View {
        VStack(spacing: 30) {
            // Avatar
            FerniWindowAvatar(
                size: 180,
                persona: .ferni,
                expression: currentExpression,
                isSpeaking: $isSpeaking,
                volume: $volume
            )

            // Expression picker
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 12) {
                    ForEach(sampleExpressions, id: \.self) { expression in
                        Button(expression.rawValue) {
                            withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) {
                                currentExpression = expression
                            }
                        }
                        .padding(.horizontal, 12)
                        .padding(.vertical, 8)
                        .background(
                            currentExpression == expression
                                ? Color.green.opacity(0.3)
                                : Color.white.opacity(0.1)
                        )
                        .cornerRadius(8)
                        .foregroundColor(.white)
                    }
                }
                .padding(.horizontal)
            }

            // Speaking toggle
            Toggle("Speaking", isOn: $isSpeaking)
                .padding(.horizontal, 40)
                .foregroundColor(.white)

            // Volume slider
            if isSpeaking {
                Slider(value: $volume, in: 0...1)
                    .padding(.horizontal, 40)
            }
        }
        .padding(.vertical, 40)
        .background(Color(hexString: "#1a1612"))
    }

    private var sampleExpressions: [AvatarExpression] {
        [.neutral, .happy, .joyful, .sleepy, .thinking, .curious, .winking, .surprised, .sad]
    }
}

#Preview("Expression Demo") {
    StandaloneWindowAvatarPreview()
}
