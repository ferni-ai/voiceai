import FerniDesign
import FerniKit
import SwiftUI

/// Before the first call: which companies hear what you say, in plain words.
/// A sheet over the room on iPhone, the whole screen on iPad (HomeView); never
/// swipe-dismissable, and nothing is sent until you agree.
struct ConsentView: View {
    let onAgree: () -> Void
    let onNotNow: () -> Void
    /// Offers "Already use Ferni? Sign in" while the account is anonymous.
    var account: AccountStore?
    @State private var signingIn = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: FerniSpace.rest) {
                // Ferni stays in the room, small, reading along with you.
                AvatarView(persona: .ferni, expression: .neutral, activity: .idle, reading: true)
                    .frame(width: 72, height: 72)
                    .frame(maxWidth: .infinity)
                    .accessibilityHidden(true)
                Text("Before we talk")
                    .font(FerniType.greeting)
                    .foregroundStyle(FerniColor.textPrimary)
                    .accessibilityAddTraits(.isHeader)
                Text(Self.body)
                    .font(FerniType.bodyLarge)
                    .foregroundStyle(FerniColor.textSecondary)
                    .fixedSize(horizontal: false, vertical: true)
                VStack(alignment: .leading, spacing: 0) {
                    // Each link is a full 44-pt row, not just its words.
                    Link(destination: URL(string: "https://ferni.ai/privacy")!) { Self.row("How Ferni handles your data") }
                    Link(destination: URL(string: "https://ferni.ai/terms")!) { Self.row("Terms") }
                }
                .font(FerniType.body)
                .tint(FerniColor.accent)
            }
            .frame(maxWidth: 560, alignment: .leading)
            .frame(maxWidth: .infinity)
            .padding(FerniSpace.rest)
        }
        .scrollBounceBehavior(.basedOnSize)
        .safeAreaInset(edge: .bottom) {
            VStack(spacing: FerniSpace.breath) {
                Button(action: onAgree) {
                    Text("I agree, let's talk")
                        .font(FerniType.button)
                        .frame(maxWidth: 420, minHeight: 56)
                }
                .ferniPrimaryGlass()
                .buttonBorderShape(.capsule)
                Button("Not now", action: onNotNow)
                    .font(FerniType.button)
                    .frame(minHeight: 44)
                if let account, SignInPrompt.shown(account.state) != nil {
                    Button(SignInPrompt.offerText) { signingIn = true }
                        .font(FerniType.footnote)
                        .frame(minHeight: 44)
                }
            }
            .tint(FerniColor.accent)
            .padding(.horizontal, FerniSpace.rest)
            .padding(.top, FerniSpace.breath)
            .padding(.bottom, FerniSpace.pause)
            // The words scroll under the buttons; they shouldn't show through them.
            .background(FerniColor.background.ignoresSafeArea(edges: .bottom))
        }
        .background(FerniColor.background.ignoresSafeArea())
        .interactiveDismissDisabled()
        .sheet(isPresented: $signingIn) {
            if let account { SignInView(account: account) }
        }
    }

    private static func row(_ title: LocalizedStringKey) -> some View {
        Text(title)
            .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
            .contentShape(.rect)
    }

    // Names the providers, as App Store 5.1.2(i) asks. Wording is versioned
    // (ConsentStore.currentVersion): change one, change the other.
    static let body = """
        When you talk with Ferni, your voice and what you say are sent to companies \
        that help Ferni hear, think and speak: Google (Gemini), Anthropic (Claude), \
        Cartesia (speech) and LiveKit (the call itself). They process it to answer you.

        I keep notes from our talks so I can remember you. You can see, change or \
        delete them, and you can take back this agreement any time in Settings.
        """
}

#Preview {
    ConsentView(onAgree: {}, onNotNow: {})
}
