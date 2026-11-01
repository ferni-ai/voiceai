import UIKit

/// Home Screen quick actions for the app's window: one that launched the app,
/// and one chosen while it runs. Both go to FerniAppDelegate.onShortcut.
final class FerniSceneDelegate: UIResponder, UIWindowSceneDelegate {
    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options: UIScene.ConnectionOptions) {
        guard let item = options.shortcutItem else { return }
        let type = item.type
        Task { @MainActor in FerniAppDelegate.onShortcut?(type) }
    }

    func windowScene(
        _ windowScene: UIWindowScene, performActionFor shortcutItem: UIApplicationShortcutItem,
        completionHandler: @escaping (Bool) -> Void
    ) {
        let type = shortcutItem.type
        Task { @MainActor in
            FerniAppDelegate.onShortcut?(type)
            completionHandler(true)
        }
    }
}
