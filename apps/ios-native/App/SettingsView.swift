import AuthenticationServices
import FerniDesign
import FerniKit
import SwiftUI

/// Account and settings. Only what a person can use: no developer switches.
struct SettingsView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    /// False in the iPad sidebar, where Settings is a page, not a sheet.
    var showsDone = true
    /// The sign-in sheet hangs off the List: a sheet on a Section inside it doesn't present.
    @State private var signingIn = false

    var body: some View {
        NavigationStack {
            List {
                Section {
                    NavigationLink("Your team") { TeamScreen(team: model.team) { dismiss() } }
                    NavigationLink("What Ferni remembers") { MemoryScreen(memory: model.memory, lock: model.memoryLock) }
                    SoundsToggle()
                }
                AccountSection(account: model.account, signOut: model.signOut, signingIn: $signingIn)
                Section {
                    NavigationLink("Help") { HelpView() }
                    NavigationLink("Delete account") { DeleteAccountView(delete: model.deleteAccount) }
                        .foregroundStyle(FerniColor.error)
                }
                PrivacySection(consent: model.consent, lock: model.memoryLock) { await model.withdrawConsent() }
                Section {
                    LabeledContent("Version", value: Self.version)
                    Link("Privacy Policy", destination: URL(string: "https://ferni.ai/privacy")!)
                    Link("Terms of Service", destination: URL(string: "https://ferni.ai/terms")!)
                } header: {
                    SettingsHeader("About")
                }
            }
            .ferniPaper()
            .screenIntro(ScreenIntro.settings)
            .sheet(isPresented: $signingIn) { SignInView(account: model.account) }
            .navigationTitle("Settings")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    if showsDone { Button("Done") { dismiss() } }
                }
            }
            .tint(FerniColor.accent)
        }
    }

    /// "1.0.0 (6)", from the built bundle rather than a typed-in string.
    static func version(_ info: [String: Any]? = Bundle.main.infoDictionary) -> String {
        let short = info?["CFBundleShortVersionString"] as? String ?? "?"
        let build = info?["CFBundleVersion"] as? String ?? "?"
        return "\(short) (\(build))"
    }

    private static var version: String { version() }
}

/// A section title in Ferni's secondary text colour, which keeps 4.5:1 contrast
/// on the grouped background in both appearances (the system default falls just short).
private struct SettingsHeader: View {
    let title: LocalizedStringKey
    init(_ title: LocalizedStringKey) { self.title = title }
    var body: some View { Text(title).foregroundStyle(FerniColor.textSecondary) }
}

/// What the Account section shows while the account is set up (critic L6):
/// a spinner for a moment, then "taking longer than usual" with Try again,
/// never a spinner forever; and when setting up fails or is slow, a way to
/// get help (ferni.ai/help).
enum AccountStatus: Equatable {
    case working, slow, unavailable(String), ready

    static let slowAfter: Double = 15
    static let helpURL = URL(string: "https://ferni.ai/help/")!

    static func shown(_ state: AccountStore.State, waited: Double) -> AccountStatus {
        switch state {
        case .starting: waited >= slowAfter ? .slow : .working
        case .unavailable(let message): .unavailable(message)
        case .signedIn, .needsSignIn: .ready
        }
    }

    var offersHelp: Bool {
        switch self {
        case .slow, .unavailable: true
        case .working, .ready: false
        }
    }
}

/// Who you are to Ferni, and the upgrade from "this phone" to "you, anywhere".
private struct AccountSection: View {
    let account: AccountStore
    let signOut: () async -> Void
    @State private var confirmingSignOut = false
    @Binding var signingIn: Bool
    @State private var startedWaiting = Date.now
    @State private var now = Date.now

    var body: some View {
        let status = AccountStatus.shown(account.state, waited: now.timeIntervalSince(startedWaiting))
        Section {
            switch account.state {
            case .starting where status == .slow:
                Text("Setting up your account is taking longer than usual.").foregroundStyle(FerniColor.textSecondary)
                Button("Try again") { Task { await account.start() } }
            case .starting:
                LabeledContent("Account") { ProgressView() }
                    .task {
                        startedWaiting = .now
                        try? await Task.sleep(for: .seconds(AccountStatus.slowAfter))
                        now = .now
                    }
            case .unavailable(let message):
                Text(message).foregroundStyle(FerniColor.textSecondary)
                Button("Try again") { Task { await account.start() } }
            case .needsSignIn:
                Text(SignInPrompt.askText).foregroundStyle(FerniColor.textSecondary)
                Button("Sign in") { signingIn = true }
            case .signedIn(let user) where user.isSignedInWithApple:
                LabeledContent("Signed in with Apple", value: user.email ?? "")
                Button("Sign out", role: .destructive) { confirmingSignOut = true }
                    .disabled(account.isWorking)
            case .signedIn(let user) where !user.isAnonymous:
                LabeledContent("Signed in", value: user.email ?? (user.providerIDs.contains("phone") ? String(localized: "With your phone number") : ""))
                Button("Sign out", role: .destructive) { confirmingSignOut = true }
                    .disabled(account.isWorking)
            case .signedIn:
                Text("Sign in so Ferni remembers you on all your devices. What you've shared so far comes with you, unless this Apple ID already has a Ferni account; then you'll continue there.")
                    .foregroundStyle(FerniColor.textSecondary)
                AppleSignInButton(account: account)
                Button(SignInPrompt.offerText) { signingIn = true }
            }
            if let notice = account.notice {
                Text(notice).foregroundStyle(FerniColor.error)
            }
        } header: {
            SettingsHeader("Account")
        } footer: {
            if status.offersHelp {
                Link("Get help with your account", destination: AccountStatus.helpURL)
            }
        }
        .confirmationDialog("Sign out?", isPresented: $confirmingSignOut, titleVisibility: .visible) {
            Button("Sign out", role: .destructive) { Task { await signOut() } }
        } message: {
            Text("To talk with Ferni on this phone again, you'll sign in.")
        }
    }
}

/// What you agreed to, and taking it back.
private struct PrivacySection: View {
    let consent: ConsentStore
    let lock: MemoryLock
    let withdraw: () async -> Void
    @State private var confirmingWithdraw = false

    var body: some View {
        Section {
            if let method = lock.method {
                // Optional, off by default; the phone's owner confirms turning it on or off.
                Toggle("Lock what Ferni remembers with \(method)", isOn: Binding(
                    get: { lock.isEnabled },
                    set: { on in Task { await lock.setEnabled(on) } }
                ))
            }
            if let agreement = consent.agreement, consent.hasAgreed {
                LabeledContent("You agreed on", value: agreement.agreedAt.formatted(date: .abbreviated, time: .omitted))
                Button("Withdraw", role: .destructive) { confirmingWithdraw = true }
            } else {
                Text("You haven't agreed to share your conversations yet. Ferni will ask before your next call.")
                    .foregroundStyle(FerniColor.textSecondary)
            }
            Link("How Ferni handles your data", destination: URL(string: "https://ferni.ai/privacy")!)
        } header: {
            SettingsHeader("Privacy")
        }
        .confirmationDialog("Withdraw your agreement?", isPresented: $confirmingWithdraw, titleVisibility: .visible) {
            Button("Withdraw", role: .destructive) { Task { await withdraw() } }
        } message: {
            Text("Ferni won't take calls until you agree again.")
        }
    }
}

/// Getting help now, and what Ferni is and isn't.
struct HelpView: View {
    var body: some View {
        List {
            Section {
                Text("Ferni is a friend, not a therapist. If you're struggling, people are ready to help right now.")
            }
            Section {
                Link(destination: URL(string: "tel:988")!) { Label("Call 988", systemImage: "phone") }
                Link(destination: URL(string: "sms:988")!) { Label("Text 988", systemImage: "message") }
            } header: {
                SettingsHeader("Suicide & Crisis Lifeline (US)")
            } footer: {
                Text("Free and confidential, any time. If you're in danger, call 911.")
            }
            Section {
                Link(destination: URL(string: "https://findahelpline.com")!) {
                    Label("Find a helpline outside the US", systemImage: "globe")
                }
            } header: {
                SettingsHeader("Outside the US")
            } footer: {
                Text("Free, confidential helplines in your country. If you're in danger, call your local emergency number.")
            }
        }
        .ferniPaper()
        .screenIntro(ScreenIntro.help)
        .navigationTitle("Help")
        .navigationBarTitleDisplayMode(.inline)
        .tint(FerniColor.accent)
    }
}

/// Deleting the account: what goes, one clear confirmation, and the result.
struct DeleteAccountView: View {
    let delete: () async throws -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var confirming = false
    @State private var working = false
    @State private var failed = false

    var body: some View {
        List {
            Section {
                Text("This deletes your Ferni account and everything Ferni remembers about you: conversations, notes, check-ins and settings. If you signed in with Apple, Ferni's access to your Apple ID ends too.")
                Text("It can't be undone.")
                    .foregroundStyle(FerniColor.error)
            }
            Section {
                Button("Delete my account", role: .destructive) { confirming = true }
                    .disabled(working)
                if working { ProgressView() }
                if failed {
                    Text("Couldn't delete your account. Check your connection and try again.")
                        .foregroundStyle(FerniColor.error)
                }
            }
        }
        .ferniPaper()
        .navigationTitle("Delete account")
        .navigationBarTitleDisplayMode(.inline)
        .alert("Delete everything?", isPresented: $confirming) {
            Button("Delete", role: .destructive) { Task { await run() } }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("Your account and everything Ferni remembers will be gone for good.")
        }
    }

    private func run() async {
        working = true
        failed = false
        do {
            try await delete()
            dismiss()
        } catch {
            failed = true
        }
        working = false
    }
}

/// The call's few sounds (arrival, handoff, goodbye); haptics are separate.
private struct SoundsToggle: View {
    @AppStorage(CallFeedback.soundsKey) private var on = true
    var body: some View { Toggle("Call sounds", isOn: $on) }
}
