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
    /// A Home Screen quick action (its type), from launch or while running.
    @MainActor static var onShortcut: ((String) -> Void)?

    nonisolated static let noteCategory = "FERNI_NOTE"
    nonisolated static let talkAction = "TALK_NOW"

    func application(
        _ application: UIApplication, didFinishLaunchingWithOptions options: [UIApplication.LaunchOptionsKey: Any]? = nil
    ) -> Bool {
        // Here, not in FerniApp.init: Auth sets up phone sign-in's notification
        // and APNs managers only if UIApplication exists when it starts, and in
        // App.init it doesn't yet. Started from there, every "Text me a code"
        // failed with 17054 (2026-10-19, Seth's iPhone).
        #if DEBUG
        if UITestScenario.current == nil { FerniFirebase.configure() }
        #else
        FerniFirebase.configure()
        #endif
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

    /// The window scene gets a delegate for Home Screen quick actions; other
    /// scenes (CarPlay) keep their configuration from Info.plist.
    func application(
        _ application: UIApplication, configurationForConnecting session: UISceneSession, options: UIScene.ConnectionOptions
    ) -> UISceneConfiguration {
        let config = UISceneConfiguration(name: session.configuration.name, sessionRole: session.role)
        if session.role == .windowApplication { config.delegateClass = FerniSceneDelegate.self }
        return config
    }

    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        FerniFirebase.setAPNSToken(deviceToken)
        Task { @MainActor in Self.onToken?(deviceToken) }
    }

    /// Firebase phone sign-in checks that remote notifications reach it before
    /// it texts a code: it sends a probe through this method. Without it,
    /// "Text me a code" failed with 17054 ERROR_NOTIFICATION_NOT_FORWARDED
    /// (2026-10-19, Seth's iPhone) and never got to the reCAPTCHA fallback.
    func application(
        _ application: UIApplication, didReceiveRemoteNotification userInfo: [AnyHashable: Any],
        fetchCompletionHandler completionHandler: @escaping (UIBackgroundFetchResult) -> Void
    ) {
        _ = FerniFirebase.canHandleNotification(userInfo)
        completionHandler(.noData)
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

/// After a good call: ask whether Ferni may check in (UX spec §12; when to
/// ask is `CheckInAsk`: after the first good call, once more three good calls
/// after a "Not now", then never).
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
                        Button("Not now") { decline() }
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
            asked = !(uid.map { CheckInAsk().shouldAsk(uid: $0) } ?? false)
            let status = await UNUserNotificationCenter.current().notificationSettings().authorizationStatus
            undecided = !push.hasOptedIn(uid) && status != .denied
        }
    }

    private func allow() async {
        guard let uid else { return }
        asked = true
        let granted = (try? await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound])) ?? false
        guard granted else { return }
        await push.optIn(uid: uid)
        #if FERNI_PUSH
        UIApplication.shared.registerForRemoteNotifications()
        #endif
    }

    private func decline() {
        asked = true
        if let uid { CheckInAsk().declined(uid: uid) }
    }
}

/// Whether this build carries notes from Ferni (push): on since IB1, with
/// FERNI_PUSH in every configuration; a build setting, never a server flag
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
