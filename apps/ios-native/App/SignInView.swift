import AuthenticationServices
import FerniDesign
import FerniKit
import GoogleSignIn
import SwiftUI
import UIKit

/// Signing in to a Ferni account someone already has (with Apple, by phone or
/// Google). Without it, a person who already uses Ferni could only ever be a
/// new anonymous account on the phone (P0 2026-10-19), and someone who signed
/// out of Apple couldn't get back (App Store 4.8: Apple sits beside Google).
struct SignInView: View {
    let account: AccountStore
    @Environment(\.dismiss) private var dismiss
    @State private var number = ""
    @State private var code = ""
    @State private var verification: String?
    @State private var googleProblem: String?

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    AppleSignInButton(account: account, label: .signIn)
                }
                Section {
                    if let verification {
                        TextField("Code from the text", text: $code)
                            .keyboardType(.numberPad)
                            .textContentType(.oneTimeCode)
                        Button("Sign in") {
                            Task { await account.signIn(phoneVerification: verification, code: code) }
                        }
                        .disabled(account.isWorking || code.count < 6)
                        Button("Use a different number") {
                            self.verification = nil
                            code = ""
                        }
                    } else {
                        TextField("Phone number", text: $number)
                            .keyboardType(.phonePad)
                            .textContentType(.telephoneNumber)
                        Button("Text me a code") {
                            Task { verification = await account.sendPhoneCode(to: number) }
                        }
                        .disabled(account.isWorking || number.isEmpty)
                    }
                } header: {
                    Text("With your phone number")
                } footer: {
                    Text("Use the number you signed up with. Ferni texts you a code.")
                }
                if GoogleSignInFlow.isAvailable {
                    Section {
                        Button("Continue with Google") { Task { await signInWithGoogle() } }
                            .disabled(account.isWorking)
                    }
                }
                if let problem = googleProblem ?? account.notice {
                    Section { Text(problem).foregroundStyle(FerniColor.error) }
                }
            }
            .navigationTitle("Sign in to Ferni")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
            }
            .onAppear { account.clearNotice() }
            // Signed in (linked or moved to their account): done. Home or
            // Settings says "welcome back" from `account.notice`.
            .onChange(of: account.user?.isAnonymous == false) { _, signedIn in
                if signedIn { dismiss() }
            }
        }
    }

    private func signInWithGoogle() async {
        googleProblem = nil
        do {
            await account.signIn(try await GoogleSignInFlow.credential())
        } catch {
            googleProblem = (error as? SignInError ?? .other).message
        }
    }
}

/// When Home offers signing in, and how.
enum SignInPrompt: Equatable {
    /// A real account was here before: Talk waits for sign-in.
    case ask
    /// Anonymous so far: someone who already uses Ferni can reach their account.
    case offer

    static func shown(_ state: AccountStore.State) -> SignInPrompt? {
        switch state {
        case .needsSignIn: .ask
        case .signedIn(let user) where user.isAnonymous: .offer
        case .signedIn, .starting, .unavailable: nil
        }
    }

    static let askText = "Sign in so Ferni remembers you."
    static let offerText = "Already use Ferni? Sign in"
}

/// Home's line for `SignInPrompt`.
struct SignInPromptView: View {
    let prompt: SignInPrompt
    let signIn: () -> Void

    var body: some View {
        switch prompt {
        case .ask:
            VStack(spacing: FerniSpace.breath) {
                Text(SignInPrompt.askText)
                    .font(FerniType.body)
                    .foregroundStyle(FerniColor.textPrimary)
                Button("Sign in", action: signIn)
                    .font(FerniType.button)
                    .frame(minHeight: 44)
            }
            .tint(FerniColor.accent)
        case .offer:
            Button(SignInPrompt.offerText, action: signIn)
                .font(FerniType.footnote)
                .frame(minHeight: 44)
                .tint(FerniColor.accent)
                .accessibilityIdentifier("home.signIn")
        }
    }
}

/// Google Sign-In, for the account someone made on the web with Google.
/// `GIDClientID` in Info.plist is the Firebase app's CLIENT_ID, and the
/// reversed client ID is a URL scheme (project.yml) for the return trip.
enum GoogleSignInFlow {
    static var isAvailable: Bool { Bundle.main.object(forInfoDictionaryKey: "GIDClientID") is String }

    @MainActor static func credential() async throws -> SignInCredential {
        guard let presenter = UIApplication.shared.topViewController else { throw SignInError.other }
        do {
            let result = try await GIDSignIn.sharedInstance.signIn(withPresenting: presenter)
            guard let idToken = result.user.idToken?.tokenString else { throw SignInError.other }
            return .google(idToken: idToken, accessToken: result.user.accessToken.tokenString)
        } catch let error as NSError where error.domain == kGIDSignInErrorDomain && error.code == GIDSignInError.canceled.rawValue {
            throw SignInError.cancelled
        }
    }

    @MainActor static func handle(_ url: URL) -> Bool { GIDSignIn.sharedInstance.handle(url) }
}

/// Sign in with Apple, the one way in: Settings (linking this phone's account)
/// and the sign-in sheet (an Apple account someone signed out of) both use it,
/// so it always goes through `AccountStore.signInWithApple`: link or move to
/// the account Apple already has, the anonymous merge, and the code upload.
struct AppleSignInButton: View {
    let account: AccountStore
    let label: SignInWithAppleButton.Label
    @Environment(\.colorScheme) private var colorScheme
    @State private var nonce = AppleNonce()

    var body: some View {
        SignInWithAppleButton(label) { request in
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
        .accessibilityIdentifier("signIn.apple")
    }
}

extension UIApplication {
    /// The view controller showing now (the top of the key window's
    /// presentations), so a page or sheet can go over whatever is up.
    var topViewController: UIViewController? {
        let window = connectedScenes.compactMap { ($0 as? UIWindowScene)?.keyWindow }.first
        var top = window?.rootViewController
        while let presented = top?.presentedViewController, !presented.isBeingDismissed { top = presented }
        return top
    }
}
