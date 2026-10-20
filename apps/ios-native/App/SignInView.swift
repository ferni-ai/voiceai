import AuthenticationServices
import FerniDesign
import FerniKit
import GoogleSignIn
import SwiftUI
import UIKit

/// Signing in to a Ferni account someone already has (from the web, with
/// Apple, Google or a phone number). Without it, a person who already uses
/// Ferni could only ever be a new anonymous account on the phone (P0
/// 2026-10-19). One designed sheet on the room's paper (design audit P1-6):
/// Apple first, then Google's own button, then the phone number. Apple sits
/// first because a sheet that offers Google must offer Apple too (App Review
/// 4.8), and it was missing.
struct SignInView: View {
    let account: AccountStore
    @Environment(\.dismiss) private var dismiss
    @State private var number = ""
    @State private var code = ""
    @State private var verification: String?
    @State private var googleProblem: String?
    /// What to type first, after a tap on the button with nothing to send yet.
    @State private var nudge: String?
    @State private var buttonHeight: CGFloat = 60
    /// Which way they last tried, so a problem shows under that one.
    @State private var tried: Way?

    private enum Way { case apple, google, phone }

    /// What went wrong, if anything, for the way they last tried.
    private var problem: String? { googleProblem ?? account.notice ?? nudge }

    var body: some View {
        NavigationStack {
            ScrollViewReader { scroller in
                ScrollView {
                    VStack(spacing: FerniSpace.rest) {
                        AvatarView(persona: .ferni, expression: .content, activity: .idle)
                            .frame(width: 72, height: 72)
                            .accessibilityHidden(true)
                        VStack(spacing: FerniSpace.breath) {
                            Text("Welcome back")
                                .font(FerniType.greeting)
                                .foregroundStyle(FerniColor.textPrimary)
                                .accessibilityAddTraits(.isHeader)
                            Text("Sign in the way you did before, and Ferni picks up where you left off.")
                                .font(FerniType.bodyLarge)
                                .foregroundStyle(FerniColor.textSecondary)
                        }
                        .multilineTextAlignment(.center)

                        VStack(spacing: FerniSpace.pause) {
                            AppleSignInButton(account: account, label: .signIn) {
                                googleProblem = nil
                                nudge = nil
                                account.clearNotice()
                                tried = .apple
                            }
                            if GoogleSignInFlow.isAvailable {
                                GoogleButton { Task { await signInWithGoogle() } }
                                    .disabled(account.isWorking)
                            }
                            if tried == .apple || tried == .google, let problem { Self.problemText(problem) }
                        }

                        Self.divider
                        phone
                    }
                    .frame(maxWidth: 480)
                    .frame(maxWidth: .infinity)
                    .padding(FerniSpace.rest)
                }
                // Room under the last row for the pinned button, at any text size.
                .contentMargins(.bottom, buttonHeight + FerniSpace.rest, for: .scrollContent)
                .scrollBounceBehavior(.basedOnSize)
                .scrollDismissesKeyboard(.interactively)
                // A new problem is scrolled into view, never left under the
                // keyboard (design audit P0-2).
                .onChange(of: problem) { _, problem in
                    guard problem != nil else { return }
                    withAnimation { scroller.scrollTo(Self.problemID, anchor: .center) }
                }
            }
            // The step's action sits under the scroll view, not in it: on iPad a tap on
            // a button in the scrolling content while the field has the keyboard only
            // ends editing, and the code was never sent.
            .safeAreaInset(edge: .bottom) {
                Button { Task { await primary() } } label: {
                    Text(verification == nil ? "Text me a code" : "Sign in")
                        .font(FerniType.button)
                        .frame(maxWidth: 420, minHeight: 52)
                }
                .ferniPrimaryGlass()
                .buttonBorderShape(.capsule)
                // Never greyed out: a dimmed label failed the contrast audit, and a tap
                // with nothing typed yet says what to type instead (design audit P1-6).
                .disabled(account.isWorking)
                .accessibilityIdentifier("signIn.continue")
                .padding(.horizontal, FerniSpace.rest)
                .padding(.bottom, FerniSpace.breath)
                .tint(FerniColor.accent)
                .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { buttonHeight = $0 }
            }
            .background(FerniColor.background.ignoresSafeArea())
            .navigationTitle("Sign in to Ferni")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
            }
            .tint(FerniColor.accent)
            .onAppear { account.clearNotice() }
            // On iPad, the page size: the form size left the phone step and, at large
            // text, Google's button below the sheet's edge (accessibility audit).
            .presentationSizing(.page)
            // Signed in (linked or moved to their account): done. Home or
            // Settings says "welcome back" from `account.notice`.
            .onChange(of: account.user?.isAnonymous == false) { _, signedIn in
                if signedIn { dismiss() }
            }
        }
    }

    /// The phone number, then the code: the field, what to do or what went
    /// wrong right under it, and the step's button in the flow, not floating.
    @ViewBuilder private var phone: some View {
        VStack(alignment: .leading, spacing: FerniSpace.breath) {
            Group {
                if verification != nil {
                    TextField("Code from the text", text: $code)
                        .keyboardType(.numberPad)
                        .textContentType(.oneTimeCode)
                        .submitLabel(.go)
                } else {
                    TextField("Phone number", text: $number)
                        .keyboardType(.phonePad)
                        .textContentType(.telephoneNumber)
                        .submitLabel(.send)
                }
            }
            .font(FerniType.bodyLarge)
            .onSubmit { Task { await primary() } }
            .onChange(of: number) { nudge = nil }
            .onChange(of: code) { nudge = nil }
            .padding(.horizontal, FerniSpace.pause)
            .frame(minHeight: 52)
            .background(RoundedRectangle(cornerRadius: FerniRadius.medium).fill(FerniColor.surfaceRaised))
            .overlay(RoundedRectangle(cornerRadius: FerniRadius.medium).stroke(FerniColor.border))
            if tried == .phone, let problem {
                Self.problemText(problem)
            } else {
                Text(verification == nil
                     ? "Use the number you signed up with. Ferni texts you a code."
                     : "Ferni texted you a six-digit code.")
                    .font(FerniType.body)
                    .foregroundStyle(FerniColor.textSecondary)
            }
        }
        if verification != nil {
            Button("Use a different number") {
                verification = nil
                code = ""
            }
            .font(FerniType.body)
            .frame(minHeight: 44)
        }
    }

    private static var divider: some View {
        HStack(spacing: FerniSpace.pause) {
            Rectangle().fill(FerniColor.border).frame(height: 1)
            Text("or with your phone number")
                .font(FerniType.footnote)
                .foregroundStyle(FerniColor.textSecondary)
                .fixedSize()
                .accessibilityAddTraits(.isHeader)
            Rectangle().fill(FerniColor.border).frame(height: 1)
        }
    }

    private static let problemID = "signIn.problem"

    private static func problemText(_ problem: String) -> some View {
        Text(problem)
            .font(FerniType.body)
            .foregroundStyle(FerniColor.error)
            .frame(maxWidth: .infinity, alignment: .leading)
            .id(problemID)
            .accessibilityIdentifier(problemID)
    }

    private var canContinue: Bool {
        !account.isWorking && (verification == nil ? !number.isEmpty : code.filter(\.isNumber).count >= 6)
    }

    /// Text the code, or sign in with it.
    private func primary() async {
        tried = .phone
        googleProblem = nil
        account.clearNotice()
        guard canContinue else {
            nudge = verification == nil ? "Type your phone number first." : "Type the six-digit code from the text."
            return
        }
        nudge = nil
        if let verification {
            await account.signIn(phoneVerification: verification, code: code)
        } else {
            verification = await account.sendPhoneCode(to: number)
        }
    }

    private func signInWithGoogle() async {
        googleProblem = nil
        nudge = nil
        account.clearNotice()
        tried = .google
        do {
            await account.signIn(try await GoogleSignInFlow.credential())
        } catch {
            googleProblem = SignInError.from(error).message
        }
    }
}

/// Sign in with Apple, wired to the account: the sign-in sheet and Settings
/// share it. Black on light, white on dark, as Apple's guidelines ask.
struct AppleSignInButton: View {
    let account: AccountStore
    var label: SignInWithAppleButton.Label = .continue
    /// Runs when the person taps it, before Apple's sheet.
    var onStart: () -> Void = {}
    @Environment(\.colorScheme) private var colorScheme
    @State private var nonce = AppleNonce()

    var body: some View {
        SignInWithAppleButton(label) { request in
            onStart()
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
        .frame(maxWidth: 420, minHeight: 52, maxHeight: 52)
        .clipShape(.capsule)
        .disabled(account.isWorking)
    }
}

/// Google's own button: the four-colour G and Google's light and dark
/// colours (its branding guidelines), shaped like Apple's beside it.
private struct GoogleButton: View {
    let action: () -> Void
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        let dark = colorScheme == .dark
        Button(action: action) {
            HStack(spacing: FerniSpace.pause) {
                Image("GoogleG")
                    .resizable()
                    .frame(width: 20, height: 20)
                    .accessibilityHidden(true)
                Text("Continue with Google")
                    .font(FerniType.button)
            }
            .foregroundStyle(Color(hex: dark ? 0xE3E3E3 : 0x1F1F1F))
            .frame(maxWidth: 420, minHeight: 52)
            .background(Capsule().fill(Color(hex: dark ? 0x131314 : 0xFFFFFF)))
            .overlay(Capsule().stroke(Color(hex: dark ? 0x8E918F : 0x747775), lineWidth: 1))
            .contentShape(.capsule)
        }
        .buttonStyle(.plain)
    }
}

private extension Color {
    init(hex: UInt32) {
        self.init(red: Double((hex >> 16) & 0xFF) / 255, green: Double((hex >> 8) & 0xFF) / 255, blue: Double(hex & 0xFF) / 255)
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
        guard let presenter = topViewController() else { throw SignInError.other(code: nil) }
        do {
            let result = try await GIDSignIn.sharedInstance.signIn(withPresenting: presenter)
            guard let idToken = result.user.idToken?.tokenString else { throw SignInError.other(code: nil) }
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
