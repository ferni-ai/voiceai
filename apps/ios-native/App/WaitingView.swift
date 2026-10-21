import FerniDesign
import FerniKit
import SwiftUI

/// Talk was refused because the account is still on the waitlist (#1988's
/// screen, in the new app): Ferni settled in, their place in line, the next
/// wave, and their invite link, since each friend who joins moves them up.
/// Once their spot has opened: "You're in", with the founding-member badge.
struct WaitingView: View {
    let place: WaitlistStatus
    /// The account is anonymous: the server never puts one on the list.
    var anonymous = false
    let onClose: () -> Void
    /// "Come in": their spot is open, so Talk again.
    let onComeIn: () -> Void
    /// Not on the list yet: sign in, which is how a person joins it.
    var onSignIn: () -> Void = {}
    /// Signed in but not on the list: join it from here (critic H1).
    var onJoin: () async -> WaitlistStatus.JoinOutcome = { .failed }
    @State private var copied = false
    /// Where they stand after joining from here.
    @State private var joined: WaitlistStatus?
    @State private var working = false
    @State private var problem: String?

    /// Where they stand: as Talk found them, or as joining from here left them.
    private var shown: WaitlistStatus { joined ?? place }

    var body: some View {
        let place = shown
        let joining = place.needsToJoin(anonymous: anonymous)
        // Signed in, so one tap joins; anonymous, signing in is the way.
        let joinsHere = joining && !anonymous
        ScrollView {
            VStack(spacing: FerniSpace.rest) {
                AvatarView(persona: .ferni, expression: place.isAdmitted ? .happy : .content, activity: .idle)
                    .frame(width: 120, height: 120)
                    .accessibilityHidden(true)
                Text(place.isAdmitted ? "You’re in" : joinsHere ? "Join the list" : joining ? "Sign in to join the list" : "You’re on the list")
                    .font(FerniType.greeting)
                    .foregroundStyle(FerniColor.textPrimary)
                    .accessibilityAddTraits(.isHeader)
                if place.isAdmitted { admitted } else if joinsHere { joinHere } else if joining { join } else { waiting }
                if let problem {
                    Text(problem)
                        .font(FerniType.body)
                        .foregroundStyle(FerniColor.textSecondary)
                }
                Button {
                    if place.isAdmitted { onComeIn() } else if joinsHere { Task { await joinList() } } else if joining { onSignIn() } else { onClose() }
                } label: {
                    Text(place.isAdmitted ? "Come in" : joinsHere ? "Join the list" : joining ? "Sign in" : "Not now")
                        .font(FerniType.button)
                        .frame(maxWidth: 420, minHeight: 56)
                }
                .ferniPrimaryGlass()
                .buttonBorderShape(.capsule)
                .tint(FerniColor.accent)
                .disabled(working)
                if joining {
                    Button("Not now", action: onClose)
                        .font(FerniType.button)
                        .frame(minHeight: 44)
                        .tint(FerniColor.accent)
                }
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

    /// Signed in, not on the list: joining takes one tap (critic round 2, H1).
    private var joinHere: some View {
        Text("I’m letting people in a few at a time. Join and you’ll get your place in line.")
            .font(FerniType.bodyLarge)
            .foregroundStyle(FerniColor.textSecondary)
    }

    private func joinList() async {
        working = true
        problem = nil
        switch await onJoin() {
        case .joined(let status): withAnimation { joined = status }
        case .needsEmail: problem = String(localized: "To join, sign in with Apple or Google, so I have an email for when your spot opens.")
        case .failed: problem = String(localized: "Couldn’t add you just now. Try again?")
        }
        working = false
    }

    /// Not on the list (anonymous, or not_joined): no place, no link and no email
    /// to write to, so no promise of one (critic H1). Signing in joins.
    private var join: some View {
        Text("I’m letting people in a few at a time. Sign in and you’ll get your place in line.")
            .font(FerniType.bodyLarge)
            .foregroundStyle(FerniColor.textSecondary)
    }

    @ViewBuilder private var admitted: some View {
        if let badge = shown.badge {
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
        if let line = shown.positionLine {
            Text(line)
                .font(FerniType.headline)
                .foregroundStyle(FerniColor.textPrimary)
        }
        if let line = shown.nextWaveLine() {
            Text(line)
                .font(FerniType.bodyLarge)
                .foregroundStyle(FerniColor.textSecondary)
        }
        if let url = shown.inviteURL {
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
