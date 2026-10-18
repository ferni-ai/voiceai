import FerniDesign
import SwiftUI

/// Before the first call: which companies hear what you say, in plain words.
/// Shown full screen and not swipe-dismissable; nothing is sent until you agree.
struct ConsentView: View {
    let onAgree: () -> Void
    let onNotNow: () -> Void

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: FerniSpace.rest) {
                Text("Before we talk")
                    .font(FerniType.greeting)
                    .foregroundStyle(FerniColor.textPrimary)
                    .accessibilityAddTraits(.isHeader)
                Text(Self.body)
                    .font(FerniType.bodyLarge)
                    .foregroundStyle(FerniColor.textSecondary)
                VStack(alignment: .leading, spacing: FerniSpace.breath) {
                    Link("How Ferni handles your data", destination: URL(string: "https://ferni.ai/privacy")!)
                    Link("Terms", destination: URL(string: "https://ferni.ai/terms")!)
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
            }
            .tint(FerniColor.accent)
            .padding(.horizontal, FerniSpace.rest)
            .padding(.bottom, FerniSpace.pause)
        }
        .background(FerniColor.background.ignoresSafeArea())
        .interactiveDismissDisabled()
    }

    // Names the providers, as App Store 5.1.2(i) asks. Wording is versioned
    // (ConsentStore.currentVersion): change one, change the other.
    static let body = """
        When you talk with Ferni, your voice and what you say are sent to companies \
        that help Ferni hear, think and speak: Google (Gemini), Anthropic (Claude), \
        Cartesia (speech) and LiveKit (the call itself). They process it to answer you.

        Ferni keeps notes so it can remember you. You can see, change or delete them, \
        and you can take back this agreement any time in Settings.
        """
}

#Preview {
    ConsentView(onAgree: {}, onNotNow: {})
}
