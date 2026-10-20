import FerniDesign
import FerniKit
import SwiftUI

/// Talk was refused because the account is still on the waitlist (#1988's
/// screen, in the new app): Ferni settled in, their place in line, the next
/// wave, and their invite link, since each friend who joins moves them up.
/// Once their spot has opened: "You're in", with the founding-member badge.
struct WaitingView: View {
    let place: WaitlistStatus
    let onClose: () -> Void
    /// "Come in": their spot is open, so Talk again.
    let onComeIn: () -> Void
    @State private var copied = false

    var body: some View {
        ScrollView {
            VStack(spacing: FerniSpace.rest) {
                AvatarView(persona: .ferni, expression: place.isAdmitted ? .happy : .content, activity: .idle)
                    .frame(width: 120, height: 120)
                    .accessibilityHidden(true)
                Text(place.isAdmitted ? "You’re in" : "You’re on the list")
                    .font(FerniType.greeting)
                    .foregroundStyle(FerniColor.textPrimary)
                    .accessibilityAddTraits(.isHeader)
                if place.isAdmitted { admitted } else { waiting }
                Button {
                    place.isAdmitted ? onComeIn() : onClose()
                } label: {
                    Text(place.isAdmitted ? "Come in" : "Not now")
                        .font(FerniType.button)
                        .frame(maxWidth: 420, minHeight: 56)
                }
                .ferniPrimaryGlass()
                .buttonBorderShape(.capsule)
                .tint(FerniColor.accent)
            }
            .multilineTextAlignment(.center)
            .frame(maxWidth: 560)
            .frame(maxWidth: .infinity)
            .padding(FerniSpace.rest)
        }
        .scrollBounceBehavior(.basedOnSize)
        .background(FerniColor.background.ignoresSafeArea())
        .interactiveDismissDisabled()
        .accessibilityIdentifier("waiting")
    }

    @ViewBuilder private var admitted: some View {
        if let badge = place.badge {
            Text(badge)
                .font(FerniType.headline)
                .foregroundStyle(FerniColor.textPrimary)
                .padding(.horizontal, FerniSpace.pause)
                .padding(.vertical, FerniSpace.breath)
                .background(Capsule().fill(FerniColor.surface))
        }
        Text("Your spot is open. Come in within a week to keep it.")
            .font(FerniType.bodyLarge)
            .foregroundStyle(FerniColor.textSecondary)
    }

    @ViewBuilder private var waiting: some View {
        if let line = place.positionLine {
            Text(line)
                .font(FerniType.headline)
                .foregroundStyle(FerniColor.textPrimary)
        }
        if let line = place.nextWaveLine() {
            Text(line)
                .font(FerniType.bodyLarge)
                .foregroundStyle(FerniColor.textSecondary)
        }
        if let url = place.inviteURL {
            VStack(spacing: FerniSpace.pause) {
                // One element for VoiceOver: a raw URL isn't something to read
                // aloud, and Share and Copy link do the work (no text selection,
                // which made the URL a too-small control).
                VStack(spacing: FerniSpace.breath) {
                    Text("Your invite link")
                        .font(FerniType.footnote)
                        .foregroundStyle(FerniColor.textSecondary)
                    Text(url.absoluteString)
                        .font(FerniType.body.monospaced())
                        .foregroundStyle(FerniColor.textPrimary)
                }
                .accessibilityElement(children: .ignore)
                .accessibilityLabel("Your invite link, ready to share")
                // Stacked at every size: a ViewThatFits swap fails the audit's
                // Dynamic Type check (ConsentView, 2026-10-20).
                share(url)
                copy(url)
                Text("Each friend who joins moves you up a few days.")
                    .font(FerniType.body)
                    .foregroundStyle(FerniColor.textSecondary)
            }
            .padding(FerniSpace.rest)
            .frame(maxWidth: .infinity)
            .background(RoundedRectangle(cornerRadius: FerniRadius.large).fill(FerniColor.surface))
        }
        Text("I’ll email you the moment your spot opens.")
            .font(FerniType.bodyLarge)
            .foregroundStyle(FerniColor.textSecondary)
            .padding(.bottom, FerniSpace.pause)
    }

    private func share(_ url: URL) -> some View {
        ShareLink(item: url) {
            Label("Share", systemImage: "square.and.arrow.up").frame(minHeight: 44)
        }
        .buttonStyle(.bordered)
        .tint(FerniColor.accent)
    }

    private func copy(_ url: URL) -> some View {
        Button {
            UIPasteboard.general.url = url
            copied = true
        } label: {
            Text(copied ? "Copied" : "Copy link").frame(minHeight: 44)
        }
        .buttonStyle(.bordered)
        .tint(FerniColor.accent)
    }
}
