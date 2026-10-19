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

    var body: some View {
        NavigationStack {
            List {
                Section {
                    NavigationLink("Your team") { TeamScreen(team: model.team) { dismiss() } }
                    NavigationLink("What Ferni remembers") { MemoryScreen(memory: model.memory, lock: model.memoryLock) }
                    SoundsToggle()
                }
                AccountSection(account: model.account, signOut: model.signOut)
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

/// Who you are to Ferni, and the upgrade from "this phone" to "you, anywhere".
private struct AccountSection: View {
    let account: AccountStore
    let signOut: () async -> Void
    @Environment(\.colorScheme) private var colorScheme
    @State private var nonce = AppleNonce()
    @State private var confirmingSignOut = false

    var body: some View {
        Section {
            switch account.state {
            case .starting:
                LabeledContent("Account") { ProgressView() }
            case .unavailable(let message):
                Text(message).foregroundStyle(FerniColor.textSecondary)
                Button("Try again") { Task { await account.start() } }
            case .signedIn(let user) where user.isSignedInWithApple:
                LabeledContent("Signed in with Apple", value: user.email ?? "")
                Button("Sign out", role: .destructive) { confirmingSignOut = true }
                    .disabled(account.isWorking)
            case .signedIn:
                Text("Sign in so Ferni remembers you on all your devices. What you've shared so far comes with you, unless this Apple ID already has a Ferni account; then you'll continue there.")
                    .foregroundStyle(FerniColor.textSecondary)
                SignInWithAppleButton(.continue) { request in
                    nonce = AppleNonce()
                    request.requestedScopes = [.fullName, .email]
                    request.nonce = nonce.sha256
                } onCompletion: { result in
                    guard case .success(let authorization) = result,
                          let apple = authorization.credential as? ASAuthorizationAppleIDCredential,
                          let idToken = apple.identityToken.flatMap({ String(data: $0, encoding: .utf8) })
                    else { return } // cancelled, or Apple sent nothing to sign in with
                    let credential = AppleCredential(
                        idToken: idToken, rawNonce: nonce.raw,
                        authorizationCode: apple.authorizationCode.flatMap { String(data: $0, encoding: .utf8) },
                        fullName: apple.fullName
                    )
                    Task { await account.signInWithApple(credential) }
                }
                .signInWithAppleButtonStyle(colorScheme == .dark ? .white : .black)
                .frame(minHeight: 48)
                .disabled(account.isWorking)
            }
            if let notice = account.notice {
                Text(notice).foregroundStyle(FerniColor.error)
            }
        } header: {
            SettingsHeader("Account")
        }
        .confirmationDialog("Sign out?", isPresented: $confirmingSignOut, titleVisibility: .visible) {
            Button("Sign out", role: .destructive) { Task { await signOut() } }
        } message: {
            Text("Ferni will start fresh on this phone until you sign in again.")
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
        }
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
