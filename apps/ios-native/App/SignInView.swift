import FerniDesign
import FerniKit
import GoogleSignIn
import SwiftUI
import UIKit

/// Signing in to a Ferni account someone already has (from the web, by phone
/// or Google). Without it, a person who already uses Ferni could only ever
/// be a new anonymous account on the phone (P0 2026-10-19).
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
        guard let presenter = topViewController() else { throw SignInError.other }
        do {
            let result = try await GIDSignIn.sharedInstance.signIn(withPresenting: presenter)
            guard let idToken = result.user.idToken?.tokenString else { throw SignInError.other }
            return .google(idToken: idToken, accessToken: result.user.accessToken.tokenString)
        } catch let error as NSError where error.domain == kGIDSignInErrorDomain && error.code == GIDSignInError.canceled.rawValue {
            throw SignInError.cancelled
        }
    }

    @MainActor static func handle(_ url: URL) -> Bool { GIDSignIn.sharedInstance.handle(url) }

    /// The sheet asking, so Google's page goes over it.
    @MainActor private static func topViewController() -> UIViewController? {
        let window = UIApplication.shared.connectedScenes
            .compactMap { ($0 as? UIWindowScene)?.keyWindow }
            .first
        var top = window?.rootViewController
        while let presented = top?.presentedViewController { top = presented }
        return top
    }
}
