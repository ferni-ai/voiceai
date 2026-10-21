import FerniDesign
import SwiftUI

/// The first screen: Ferni, a way to talk, and the account one tap away.
struct HomeView: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        @Bindable var model = model
        NavigationStack {
            ScrollView {
                VStack(spacing: FerniSpace.rest) {
                    FerniWindowAvatar(size: 200, isSpeaking: .constant(false), volume: .constant(0))
                        .padding(.top, FerniSpace.silence)
                    VStack(spacing: FerniSpace.breath) {
                        Text("Hi, I'm Ferni.")
                            .font(FerniType.title)
                            .foregroundStyle(FerniColor.textPrimary)
                        Text("Whenever you're ready, I'm here.")
                            .font(FerniType.bodyLarge)
                            .foregroundStyle(FerniColor.textSecondary)
                    }
                    .multilineTextAlignment(.center)
                }
                .frame(maxWidth: 560)
                .frame(maxWidth: .infinity)
                .padding(.horizontal, FerniSpace.rest)
            }
            .scrollBounceBehavior(.basedOnSize)
            .safeAreaInset(edge: .bottom) { talkButton }
            .background(FerniColor.background.ignoresSafeArea())
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        model.isShowingSettings = true
                    } label: {
                        Image(systemName: model.account.user?.isSignedInWithApple == true
                              ? "person.crop.circle.fill" : "person.crop.circle")
                            .font(.title2)
                            .frame(minWidth: 44, minHeight: 44)
                    }
                    .tint(FerniColor.accent)
                    .accessibilityLabel("Account and settings")
                }
            }
            .sheet(isPresented: $model.isShowingSettings) {
                SettingsView()
            }
        }
    }

    // The call arrives with FerniVoice's session (the call-screen PR); until
    // then the button is visible but off, so the layout is the real one.
    private var talkButton: some View {
        VStack(spacing: FerniSpace.breath) {
            Button {} label: {
                Label("Talk to Ferni", systemImage: "waveform")
                    .font(FerniType.button)
                    .frame(maxWidth: 420, minHeight: 56)
            }
            .buttonStyle(.borderedProminent)
            .buttonBorderShape(.capsule)
            .tint(FerniColor.accent)
            .disabled(true)
            Text("Talking is coming back soon.")
                .font(FerniType.footnote)
                .foregroundStyle(FerniColor.textMuted)
        }
        .padding(.horizontal, FerniSpace.rest)
        .padding(.bottom, FerniSpace.pause)
    }
}

#Preview {
    HomeView().environment(AppModel(config: .production, firebaseReady: false))
}
