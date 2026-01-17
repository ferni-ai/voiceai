import SwiftUI

// MARK: - Onboarding Journey View
/// A warm, human introduction to Ferni for first-time users.
///
/// Design Philosophy:
/// - This is meeting someone new, not filling out a form
/// - Every screen should feel conversational
/// - Animations reinforce personality (curious, warm, attentive)
/// - User should feel understood, not sold to
///
/// Journey Steps:
/// 1. Warm welcome with animated Ferni
/// 2. "What brings you here?" (gentle preference gathering)
/// 3. Quick voice sample (optional, for voice enrollment)
/// 4. "I'm ready when you are"

public struct OnboardingJourneyView: View {

    // MARK: - Configuration

    /// Callback when onboarding completes
    public var onComplete: ((OnboardingResult) -> Void)?

    /// Persona color
    public var personaColor: Color = Color(hexString: "4a6741")

    // MARK: - State

    @State private var currentStep: OnboardingStep = .welcome
    @State private var userName: String = ""
    @State private var selectedReasons: Set<OnboardingReason> = []
    @State private var isAnimating: Bool = false
    @State private var orbScale: CGFloat = 0.8
    @State private var orbOpacity: CGFloat = 0
    @State private var textOpacity: CGFloat = 0

    // MARK: - Environment

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    // MARK: - Constants

    private let orbSize: CGFloat = 100

    public init(
        onComplete: ((OnboardingResult) -> Void)? = nil,
        personaColor: Color = Color(hexString: "4a6741")
    ) {
        self.onComplete = onComplete
        self.personaColor = personaColor
    }

    public var body: some View {
        ZStack {
            backgroundGradient

            VStack(spacing: 0) {
                // Progress indicator (subtle dots)
                progressIndicator
                    .padding(.top, 60)

                Spacer()

                // Content changes based on step
                Group {
                    switch currentStep {
                    case .welcome:
                        welcomeContent
                    case .whatBringsYou:
                        whatBringsYouContent
                    case .nameIntro:
                        nameIntroContent
                    case .ready:
                        readyContent
                    }
                }
                .transition(.asymmetric(
                    insertion: .move(edge: .trailing).combined(with: .opacity),
                    removal: .move(edge: .leading).combined(with: .opacity)
                ))

                Spacer()

                // Bottom action
                bottomAction
                    .padding(.bottom, 50)
            }
        }
        .onAppear {
            animateIn()
        }
    }

    // MARK: - Background

    private var backgroundGradient: some View {
        LinearGradient(
            colors: [
                Color(hexString: "0a0a12"),
                Color(hexString: "12121a")
            ],
            startPoint: .top,
            endPoint: .bottom
        )
        .ignoresSafeArea()
    }

    // MARK: - Progress Indicator

    private var progressIndicator: some View {
        HStack(spacing: 8) {
            ForEach(OnboardingStep.allCases, id: \.self) { step in
                Circle()
                    .fill(step.rawValue <= currentStep.rawValue
                          ? .white
                          : .white.opacity(0.3))
                    .frame(width: 8, height: 8)
                    .animation(.spring(), value: currentStep)
            }
        }
    }

    // MARK: - Step 1: Welcome

    private var welcomeContent: some View {
        VStack(spacing: 30) {
            // Animated orb
            ZStack {
                // Glow
                Circle()
                    .fill(
                        RadialGradient(
                            colors: [
                                personaColor.opacity(0.4),
                                personaColor.opacity(0.1),
                                .clear
                            ],
                            center: .center,
                            startRadius: orbSize * 0.3,
                            endRadius: orbSize
                        )
                    )
                    .frame(width: orbSize * 2, height: orbSize * 2)
                    .blur(radius: 20)

                // Orb
                Circle()
                    .fill(
                        LinearGradient(
                            colors: [personaColor, personaColor.opacity(0.8)],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
                    .frame(width: orbSize, height: orbSize)
                    .shadow(color: personaColor.opacity(0.5), radius: 15)
            }
            .scaleEffect(orbScale)
            .opacity(orbOpacity)

            VStack(spacing: 16) {
                Text("Hi there")
                    .font(.system(size: 32, weight: .light, design: .rounded))
                    .foregroundColor(.white)

                Text("I'm Ferni, your AI companion.\nI'm here to help you think, plan, and grow.")
                    .font(.system(size: 16, weight: .regular, design: .rounded))
                    .foregroundColor(.white.opacity(0.7))
                    .multilineTextAlignment(.center)
                    .lineSpacing(4)
            }
            .opacity(textOpacity)
        }
        .padding(.horizontal, 40)
    }

    // MARK: - Step 2: What Brings You

    private var whatBringsYouContent: some View {
        VStack(spacing: 30) {
            VStack(spacing: 12) {
                Text("What brings you here?")
                    .font(.system(size: 28, weight: .light, design: .rounded))
                    .foregroundColor(.white)

                Text("Pick as many as feel right")
                    .font(.system(size: 14, weight: .regular, design: .rounded))
                    .foregroundColor(.white.opacity(0.5))
            }

            // Reason cards
            VStack(spacing: 12) {
                ForEach(OnboardingReason.allCases, id: \.self) { reason in
                    ReasonCard(
                        reason: reason,
                        isSelected: selectedReasons.contains(reason),
                        personaColor: personaColor
                    ) {
                        withAnimation(.spring(response: 0.3)) {
                            if selectedReasons.contains(reason) {
                                selectedReasons.remove(reason)
                            } else {
                                selectedReasons.insert(reason)
                            }
                        }
                    }
                }
            }
        }
        .padding(.horizontal, 30)
    }

    // MARK: - Step 3: Name Intro

    private var nameIntroContent: some View {
        VStack(spacing: 30) {
            VStack(spacing: 12) {
                Text("What should I call you?")
                    .font(.system(size: 28, weight: .light, design: .rounded))
                    .foregroundColor(.white)

                Text("Just a first name is perfect")
                    .font(.system(size: 14, weight: .regular, design: .rounded))
                    .foregroundColor(.white.opacity(0.5))
            }

            TextField("", text: $userName)
                .font(.system(size: 24, weight: .light, design: .rounded))
                .foregroundColor(.white)
                .multilineTextAlignment(.center)
                .padding(.vertical, 16)
                .padding(.horizontal, 24)
                .background(
                    RoundedRectangle(cornerRadius: 16)
                        .fill(.white.opacity(0.1))
                        .overlay(
                            RoundedRectangle(cornerRadius: 16)
                                .stroke(.white.opacity(0.2), lineWidth: 1)
                        )
                )
                .frame(maxWidth: 280)
                .autocorrectionDisabled()
                #if os(iOS)
                .textInputAutocapitalization(.words)
                #endif
        }
        .padding(.horizontal, 30)
    }

    // MARK: - Step 4: Ready

    private var readyContent: some View {
        VStack(spacing: 30) {
            // Larger orb with gentle pulse
            ZStack {
                // Glow
                Circle()
                    .fill(
                        RadialGradient(
                            colors: [
                                personaColor.opacity(0.5),
                                personaColor.opacity(0.2),
                                .clear
                            ],
                            center: .center,
                            startRadius: orbSize * 0.5,
                            endRadius: orbSize * 1.5
                        )
                    )
                    .frame(width: orbSize * 3, height: orbSize * 3)
                    .blur(radius: 30)

                // Orb
                Circle()
                    .fill(
                        LinearGradient(
                            colors: [personaColor, personaColor.opacity(0.8)],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
                    .frame(width: orbSize * 1.3, height: orbSize * 1.3)
                    .shadow(color: personaColor.opacity(0.6), radius: 20)
            }
            .scaleEffect(isAnimating ? 1.05 : 1.0)
            .animation(
                reduceMotion ? nil : .easeInOut(duration: 2).repeatForever(autoreverses: true),
                value: isAnimating
            )

            VStack(spacing: 16) {
                Text(userName.isEmpty ? "I'm ready when you are" : "Ready, \(userName)?")
                    .font(.system(size: 28, weight: .light, design: .rounded))
                    .foregroundColor(.white)

                Text("Just tap and start talking.\nI'm here to listen.")
                    .font(.system(size: 16, weight: .regular, design: .rounded))
                    .foregroundColor(.white.opacity(0.7))
                    .multilineTextAlignment(.center)
                    .lineSpacing(4)
            }
        }
        .padding(.horizontal, 40)
        .onAppear {
            isAnimating = true
        }
    }

    // MARK: - Bottom Action

    private var bottomAction: some View {
        VStack(spacing: 16) {
            // Main button
            Button(action: advanceStep) {
                Text(buttonText)
                    .font(.system(size: 17, weight: .medium, design: .rounded))
                    .foregroundColor(.white)
                    .frame(maxWidth: .infinity)
                    .frame(height: 56)
                    .background(
                        Capsule()
                            .fill(personaColor)
                            .shadow(color: personaColor.opacity(0.4), radius: 10, y: 5)
                    )
            }
            .disabled(!canAdvance)
            .opacity(canAdvance ? 1.0 : 0.5)

            // Skip option for optional steps
            if currentStep == .whatBringsYou || currentStep == .nameIntro {
                Button(action: skipStep) {
                    Text("Skip for now")
                        .font(.system(size: 14, weight: .regular, design: .rounded))
                        .foregroundColor(.white.opacity(0.5))
                }
            }
        }
        .padding(.horizontal, 40)
    }

    private var buttonText: String {
        switch currentStep {
        case .welcome: return "Let's get started"
        case .whatBringsYou: return selectedReasons.isEmpty ? "Continue" : "Sounds good"
        case .nameIntro: return userName.isEmpty ? "Continue" : "Nice to meet you"
        case .ready: return "Start my first conversation"
        }
    }

    private var canAdvance: Bool {
        switch currentStep {
        case .welcome: return true
        case .whatBringsYou: return true  // Optional
        case .nameIntro: return true  // Optional
        case .ready: return true
        }
    }

    // MARK: - Navigation

    private func advanceStep() {
        let nextStep: OnboardingStep? = {
            switch currentStep {
            case .welcome: return .whatBringsYou
            case .whatBringsYou: return .nameIntro
            case .nameIntro: return .ready
            case .ready: return nil
            }
        }()

        if let next = nextStep {
            withAnimation(.spring(response: 0.4, dampingFraction: 0.8)) {
                currentStep = next
            }
        } else {
            completeOnboarding()
        }
    }

    private func skipStep() {
        advanceStep()
    }

    private func completeOnboarding() {
        let result = OnboardingResult(
            userName: userName.isEmpty ? nil : userName,
            selectedReasons: selectedReasons
        )
        onComplete?(result)
    }

    private func animateIn() {
        if reduceMotion {
            orbScale = 1.0
            orbOpacity = 1.0
            textOpacity = 1.0
            return
        }

        withAnimation(.spring(response: 0.6, dampingFraction: 0.7)) {
            orbScale = 1.0
            orbOpacity = 1.0
        }

        DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
            withAnimation(.easeOut(duration: 0.4)) {
                textOpacity = 1.0
            }
        }
    }
}

// MARK: - Reason Card

private struct ReasonCard: View {
    let reason: OnboardingReason
    let isSelected: Bool
    let personaColor: Color
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 16) {
                Image(systemName: reason.iconName)
                    .font(.system(size: 20))
                    .foregroundColor(isSelected ? personaColor : .white.opacity(0.6))
                    .frame(width: 24)

                Text(reason.title)
                    .font(.system(size: 16, weight: .regular, design: .rounded))
                    .foregroundColor(.white)

                Spacer()

                Circle()
                    .fill(isSelected ? personaColor : .clear)
                    .overlay(
                        Circle()
                            .stroke(isSelected ? personaColor : .white.opacity(0.3), lineWidth: 2)
                    )
                    .frame(width: 24, height: 24)
                    .overlay(
                        Image(systemName: "checkmark")
                            .font(.system(size: 12, weight: .bold))
                            .foregroundColor(.white)
                            .opacity(isSelected ? 1 : 0)
                    )
            }
            .padding(.horizontal, 20)
            .padding(.vertical, 16)
            .background(
                RoundedRectangle(cornerRadius: 16)
                    .fill(isSelected ? personaColor.opacity(0.2) : .white.opacity(0.05))
                    .overlay(
                        RoundedRectangle(cornerRadius: 16)
                            .stroke(isSelected ? personaColor.opacity(0.5) : .white.opacity(0.1), lineWidth: 1)
                    )
            )
        }
        .buttonStyle(PlainButtonStyle())
    }
}

// MARK: - Supporting Types

public enum OnboardingStep: Int, CaseIterable {
    case welcome = 0
    case whatBringsYou = 1
    case nameIntro = 2
    case ready = 3
}

public enum OnboardingReason: String, CaseIterable, Codable {
    case thinkingPartner = "thinking-partner"
    case emotionalSupport = "emotional-support"
    case productivity = "productivity"
    case curiosity = "curiosity"
    case loneliness = "loneliness"
    case other = "other"

    var title: String {
        switch self {
        case .thinkingPartner: return "A thinking partner"
        case .emotionalSupport: return "Emotional support"
        case .productivity: return "Getting things done"
        case .curiosity: return "Just curious"
        case .loneliness: return "Someone to talk to"
        case .other: return "Something else"
        }
    }

    var iconName: String {
        switch self {
        case .thinkingPartner: return "brain.head.profile"
        case .emotionalSupport: return "heart"
        case .productivity: return "checkmark.circle"
        case .curiosity: return "sparkles"
        case .loneliness: return "bubble.left.and.bubble.right"
        case .other: return "ellipsis"
        }
    }
}

public struct OnboardingResult {
    public let userName: String?
    public let selectedReasons: Set<OnboardingReason>
}

// MARK: - Preview

#if DEBUG
struct OnboardingJourneyView_Previews: PreviewProvider {
    static var previews: some View {
        OnboardingJourneyView { result in
            print("Completed with: \(result)")
        }
    }
}
#endif
