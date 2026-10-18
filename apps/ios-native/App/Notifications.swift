import FerniDesign
import SwiftUI
import UIKit
import UserNotifications

/// APNs and notification taps. The app sets the two handlers at launch.
final class FerniAppDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate {
    @MainActor static var onToken: ((Data) -> Void)?
    @MainActor static var onTalk: (() -> Void)?

    nonisolated static let noteCategory = "FERNI_NOTE"
    nonisolated static let talkAction = "TALK_NOW"

    func application(
        _ application: UIApplication, didFinishLaunchingWithOptions options: [UIApplication.LaunchOptionsKey: Any]? = nil
    ) -> Bool {
        let center = UNUserNotificationCenter.current()
        center.delegate = self
        // A note from Ferni: talk now, or later (just dismisses).
        center.setNotificationCategories([UNNotificationCategory(
            identifier: Self.noteCategory,
            actions: [
                UNNotificationAction(identifier: Self.talkAction, title: "Talk now", options: [.foreground]),
                UNNotificationAction(identifier: "LATER", title: "Later", options: []),
            ],
            intentIdentifiers: []
        )])
        // Tokens can change: ask again whenever notifications are already allowed.
        Task { @MainActor in
            if await center.notificationSettings().authorizationStatus == .authorized {
                application.registerForRemoteNotifications()
            }
        }
        return true
    }

    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        Task { @MainActor in Self.onToken?(deviceToken) }
    }

    nonisolated func userNotificationCenter(
        _ center: UNUserNotificationCenter, willPresent notification: UNNotification
    ) async -> UNNotificationPresentationOptions {
        [.banner, .sound]
    }

    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse) async {
        let talk = response.actionIdentifier == Self.talkAction
            || (response.actionIdentifier == UNNotificationDefaultActionIdentifier
                && response.notification.request.content.categoryIdentifier == Self.noteCategory)
        if talk { await MainActor.run { Self.onTalk?() } }
    }
}

/// After the first good call: ask once whether Ferni may check in.
struct NotificationAsk: View {
    @AppStorage("ferni.notifications.asked") private var asked = false
    @State private var undecided = false

    var body: some View {
        // A permanent zero-height anchor: .task on a view that renders nothing never runs.
        VStack(spacing: 0) {
            Color.clear.frame(height: 0)
            if undecided && !asked {
                VStack(alignment: .leading, spacing: FerniSpace.breath) {
                    Text("Want Ferni to check in now and then?")
                        .font(FerniType.headline)
                        .foregroundStyle(FerniColor.textPrimary)
                    Text("A short note before something you mentioned, never more than you'd want.")
                        .font(FerniType.body)
                        .foregroundStyle(FerniColor.textSecondary)
                    HStack {
                        Button("Yes, check in") { Task { await allow() } }
                            .buttonStyle(.borderedProminent)
                        Button("Not now") { asked = true }
                    }
                    .tint(FerniColor.accent)
                }
                .padding(FerniSpace.pause)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(FerniColor.surfaceRaised, in: RoundedRectangle(cornerRadius: FerniRadius.large))
                .overlay(RoundedRectangle(cornerRadius: FerniRadius.large).stroke(FerniColor.border))
            }
        }
        .task {
            undecided = await UNUserNotificationCenter.current().notificationSettings().authorizationStatus == .notDetermined
        }
    }

    private func allow() async {
        asked = true
        let granted = (try? await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound])) ?? false
        if granted { UIApplication.shared.registerForRemoteNotifications() }
    }
}
