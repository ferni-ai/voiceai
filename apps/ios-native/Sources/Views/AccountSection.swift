import AuthenticationServices
import SwiftUI

// MARK: - Account Section
/// Account management section for Settings view
/// Allows signing in with Apple or managing signed-in account

struct AccountSection: View {
    @EnvironmentObject var authService: AuthService
    @State private var showSignOutConfirmation = false
    @State private var showError = false

    var body: some View {
        Section {
            if authService.isSignedIn {
                signedInView
            } else {
                signedOutView
            }
        } header: {
            Text("Account")
        } footer: {
            if authService.isSignedIn {
                Text("Your conversations and preferences sync across devices when signed in.")
            } else {
                Text("Sign in to sync your conversations and preferences across devices.")
            }
        }
        .alert("Sign Out?", isPresented: $showSignOutConfirmation) {
            Button("Cancel", role: .cancel) {}
            Button("Sign Out", role: .destructive) {
                Task {
                    await authService.signOut()
                }
            }
        } message: {
            Text("You can sign back in anytime. Your data will remain on this device.")
        }
        .alert("Sign In Failed", isPresented: $showError) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(authService.errorMessage ?? "Please try again.")
        }
        .onChange(of: authService.errorMessage) { newValue in
            if newValue != nil {
                showError = true
            }
        }
    }

    // MARK: - Signed In View

    private var signedInView: some View {
        VStack(spacing: 0) {
            // User info row
            HStack(spacing: 16) {
                // Avatar
                ZStack {
                    Circle()
                        .fill(
                            LinearGradient(
                                colors: [.green.opacity(0.8), .green.opacity(0.5)],
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                            )
                        )
                        .frame(width: 44, height: 44)

                    if let name = authService.displayName, !name.isEmpty {
                        Text(initials(from: name))
                            .font(.system(size: 16, weight: .semibold, design: .rounded))
                            .foregroundColor(.white)
                    } else {
                        Image(systemName: "person.fill")
                            .font(.system(size: 18))
                            .foregroundColor(.white)
                    }
                }

                VStack(alignment: .leading, spacing: 4) {
                    if let name = authService.displayName, !name.isEmpty {
                        Text(name)
                            .font(.headline)
                            .foregroundColor(.white)
                    }

                    if let email = authService.userEmail {
                        Text(email)
                            .font(.subheadline)
                            .foregroundColor(.white.opacity(0.6))
                    } else {
                        Text("Signed in with Apple")
                            .font(.subheadline)
                            .foregroundColor(.white.opacity(0.6))
                    }
                }

                Spacer()

                // Verified badge
                Image(systemName: "checkmark.seal.fill")
                    .font(.system(size: 20))
                    .foregroundColor(.green)
            }
            .padding(.vertical, 4)

            Divider()
                .padding(.vertical, 8)

            // Sign out button
            Button {
                showSignOutConfirmation = true
            } label: {
                HStack {
                    Image(systemName: "rectangle.portrait.and.arrow.right")
                        .foregroundColor(.red)
                    Text("Sign Out")
                        .foregroundColor(.red)
                    Spacer()
                }
            }
            .buttonStyle(PlainButtonStyle())
        }
    }

    // MARK: - Signed Out View

    private var signedOutView: some View {
        VStack(spacing: 12) {
            // Sign In with Apple button
            Button {
                Task {
                    do {
                        try await authService.signInWithApple()
                    } catch AuthService.AuthError.signInCancelled {
                        // User cancelled, no action needed
                    } catch {
                        // Error will be shown via alert
                    }
                }
            } label: {
                HStack(spacing: 12) {
                    Image(systemName: "apple.logo")
                        .font(.system(size: 18, weight: .medium))

                    Text("Sign in with Apple")
                        .font(.system(size: 17, weight: .medium))

                    Spacer()

                    if authService.isLoading {
                        ProgressView()
                            .progressViewStyle(CircularProgressViewStyle(tint: .white))
                    }
                }
                .foregroundColor(.white)
                .padding(.vertical, 14)
                .padding(.horizontal, 16)
                .background(Color.black)
                .cornerRadius(10)
            }
            .buttonStyle(PlainButtonStyle())
            .disabled(authService.isLoading)
            .accessibilityLabel("Sign in with Apple")
            .accessibilityHint("Uses your Apple ID to securely sign in")

            // Privacy note
            HStack(spacing: 6) {
                Image(systemName: "lock.shield.fill")
                    .font(.system(size: 12))
                    .foregroundColor(.white.opacity(0.4))

                Text("Your data is encrypted and private")
                    .font(.caption)
                    .foregroundColor(.white.opacity(0.4))
            }
        }
        .padding(.vertical, 4)
    }

    // MARK: - Helpers

    private func initials(from name: String) -> String {
        let components = name.split(separator: " ")
        let initials = components.prefix(2).compactMap { $0.first }
        return String(initials).uppercased()
    }
}

// MARK: - Preview

#Preview("Signed Out") {
    List {
        AccountSection()
    }
    .preferredColorScheme(.dark)
    .environmentObject(AuthService.shared)
}
