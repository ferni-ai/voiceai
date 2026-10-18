import SwiftUI
import FerniShared

// MARK: - Waiting View
/// Shown when /token answers 403 WAITLISTED: Ferni settled in, the person's
/// place in line, the next wave and their invite link. "You're in" with the
/// founding-member badge once their spot has opened.

struct WaitingView: View {
    let status: WaitlistStatus
    let onDismiss: () -> Void

    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var breathe = false
    @State private var copied = false

    private var isDark: Bool { colorScheme == .dark }
    private var textPrimary: Color { isDark ? FerniColors.Midnight.textPrimary : FerniColors.Zen.textPrimary }
    private var textSecondary: Color { isDark ? FerniColors.Midnight.textSecondary : FerniColors.Zen.textSecondary }
    private var background: Color { isDark ? FerniColors.Midnight.bgPrimary : FerniColors.Zen.bgPrimary }
    private var card: Color { isDark ? FerniColors.Midnight.bgElevated : FerniColors.Zen.bgElevated }
    private var accent: Color { isDark ? FerniColors.Midnight.accent : FerniColors.Zen.accent }

    var body: some View {
        ScrollView {
            VStack(spacing: 16) {
                PixarVoiceOrb(persona: PersonaRegistry.get("ferni"), isActive: false, size: 110)
                    .frame(width: 160, height: 160)
                    .rotationEffect(.degrees(status.isAdmitted ? 0 : -5))
                    .scaleEffect(breathe ? 1.03 : 1)
                    .accessibilityHidden(true)

                Text(status.isAdmitted ? "You’re in" : "You’re on the list")
                    .font(.title.weight(.semibold))
                    .foregroundColor(textPrimary)

                if status.isAdmitted {
                    admittedContent
                } else {
                    waitingContent
                }

                Button(status.isAdmitted ? "Come in" : "Not now", action: onDismiss)
                    .buttonStyle(.bordered)
                    .tint(textPrimary)
            }
            .multilineTextAlignment(.center)
            .padding(24)
            .frame(maxWidth: 420)
            .frame(maxWidth: .infinity)
        }
        .background(background.ignoresSafeArea())
        .onAppear {
            guard !reduceMotion else { return }
            withAnimation(.easeInOut(duration: 3).repeatForever(autoreverses: true)) { breathe = true }
        }
    }

    @ViewBuilder private var admittedContent: some View {
        if let badge = status.badge {
            Text(badge)
                .font(.subheadline.weight(.semibold))
                .padding(.horizontal, 12)
                .padding(.vertical, 6)
                .background(Capsule().fill(accent.opacity(0.18)))
                .foregroundColor(textPrimary)
        }
        Text("Your spot opened up, and I saved it for you.")
            .foregroundColor(textSecondary)
    }

    @ViewBuilder private var waitingContent: some View {
        Text(status.positionLine)
            .font(.headline)
            .foregroundColor(textPrimary)
        if let line = status.nextWaveLine() {
            Text(line).foregroundColor(textSecondary)
        }
        if let url = status.inviteURL {
            VStack(spacing: 10) {
                Text("Your invite link").font(.footnote).foregroundColor(textSecondary)
                Text(url.absoluteString).font(.body.monospaced()).foregroundColor(textPrimary).textSelection(.enabled)
                HStack(spacing: 10) {
                    ShareLink(item: url) { Label("Share", systemImage: "square.and.arrow.up") }
                        .buttonStyle(.borderedProminent)
                        .tint(accent)
                    Button(copied ? "Copied" : "Copy link") {
                        UIPasteboard.general.url = url
                        copied = true
                    }
                    .buttonStyle(.bordered)
                    .tint(textPrimary)
                }
                Text("Each friend who joins moves you up a few days.").foregroundColor(textSecondary)
            }
            .padding(16)
            .frame(maxWidth: .infinity)
            .background(RoundedRectangle(cornerRadius: 16).fill(card))
        }
        Text("I’ll email you the moment your spot opens.")
            .foregroundColor(textSecondary)
    }
}
