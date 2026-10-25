import FerniDesign
import FerniKit
import Network
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
        #if FERNI_PUSH
        // Tokens can change: ask again whenever notifications are already allowed.
        Task { @MainActor in
            if await center.notificationSettings().authorizationStatus == .authorized {
                application.registerForRemoteNotifications()
            }
        }
        #endif
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

/// After a good call: ask this person once whether Ferni may check in.
struct NotificationAsk: View {
    let push: PushStore
    let uid: String?
    @State private var asked = false
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
                        Button("Not now") { markAsked() }
                    }
                    .tint(FerniColor.accent)
                }
                .padding(FerniSpace.pause)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(FerniColor.surfaceRaised, in: RoundedRectangle(cornerRadius: FerniRadius.large))
                .overlay(RoundedRectangle(cornerRadius: FerniRadius.large).stroke(FerniColor.border))
            }
        }
        .task(id: uid) {
            asked = uid.map { UserDefaults.standard.bool(forKey: Self.key($0)) } ?? true
            let status = await UNUserNotificationCenter.current().notificationSettings().authorizationStatus
            undecided = !push.hasOptedIn(uid) && status != .denied
        }
    }

    private static func key(_ uid: String) -> String { "ferni.notifications.asked.\(uid)" }

    private func allow() async {
        guard let uid else { return }
        markAsked()
        let granted = (try? await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound])) ?? false
        guard granted else { return }
        await push.optIn(uid: uid)
        #if FERNI_PUSH
        UIApplication.shared.registerForRemoteNotifications()
        #endif
    }

    private func markAsked() {
        asked = true
        if let uid { UserDefaults.standard.set(true, forKey: Self.key(uid)) }
    }
}

/// Whether this build carries notes from Ferni (push). Off until the
/// server's device route ships (#1991); a build setting, never a server flag
/// (guideline 2.5.19).
enum FerniBuild {
    #if FERNI_PUSH
    static let pushNotes = true
    #else
    static let pushNotes = false
    #endif
}

/// Tells the app when the network comes back, so unfinished push work can finish.
enum NetworkWatcher {
    /// Yields once each time the network comes back after being down.
    static func becameReachable() -> AsyncStream<Void> {
        let (paths, feed) = AsyncStream.makeStream(of: Bool.self)
        let monitor = NWPathMonitor()
        monitor.pathUpdateHandler = { feed.yield($0.status == .satisfied) }
        monitor.start(queue: DispatchQueue(label: "ferni.network"))
        feed.onTermination = { _ in monitor.cancel() }
        return AsyncStream { continuation in
            let task = Task {
                var wasReachable = true
                for await reachable in paths {
                    if reachable && !wasReachable { continuation.yield() }
                    wasReachable = reachable
                }
                continuation.finish()
            }
            continuation.onTermination = { _ in task.cancel(); feed.finish() }
        }
    }
}
