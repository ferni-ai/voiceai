import FerniDesign
import FerniVoice
import SwiftUI
import XCTest
@testable import Ferni

/// The one line between a working body and something nobody sees: every
/// input CallAvatar and AvatarView take reaches Ferni's rig. Hosts the real
/// views on a window with a scripted call, changes each input, and checks the
/// rig was asked (AliveRig.requests).
@MainActor
final class AvatarGlueTests: XCTestCase {
    @Observable final class Inputs {
        var wake = 0
        var doubleTake = 0
    }

    struct Host: View {
        let call: CallSession
        let inputs: Inputs
        let rig: AliveRig

        var body: some View {
            CallAvatar(call: call, wake: inputs.wake, doubleTake: inputs.doubleTake, rig: rig)
                .frame(width: 200, height: 200)
        }
    }

    private var window: UIWindow?

    override func tearDown() async throws {
        window?.isHidden = true
        window = nil
    }

    private func settle(_ seconds: Double = 0.25) async {
        try? await Task.sleep(for: .seconds(seconds))
    }

    private func count(_ rig: AliveRig, _ request: AliveRig.Request) -> Int {
        rig.requests.filter { $0 == request }.count
    }

    /// `change` makes the rig hear `request` once more than before.
    private func expect(_ rig: AliveRig, hears request: AliveRig.Request, after wait: Double = 0.25,
                        line: UInt = #line, _ change: () -> Void) async {
        let before = count(rig, request)
        change()
        await settle(wait)
        XCTAssertGreaterThan(count(rig, request), before, "\(request) never reached the rig: \(rig.requests)", line: line)
    }

    func testEveryInputReachesTheBody() async {
        let avatar = AvatarModel()
        let call = UITestScenario.callSession(avatar: avatar, level: AudioLevelMeter())
        let rig = AliveRig(seed: 1), inputs = Inputs()
        let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 390, height: 844))
        window.rootViewController = UIHostingController(rootView: Host(call: call, inputs: inputs, rig: rig))
        window.makeKeyAndVisible()
        self.window = window
        await settle()

        // At rest (Home): a long time away wakes him; a short one is a double take.
        await expect(rig, hears: .keyed(.wake)) { inputs.wake += 1 }
        await expect(rig, hears: .doubleTake) { inputs.doubleTake += 1 }
        // From the call (the agent's signals): a micro-expression and a moment.
        await expect(rig, hears: .micro(.delight)) { avatar.send(.micro(.delight)) }
        await expect(rig, hears: .sequence("deep_moment")) { avatar.send(.moment("deep_moment")) }
        // What he's doing: a fast join, back from reconnecting, the goodbye.
        avatar.send(.connectTapped(personaID: "ferni"))
        await settle(0.1)
        await expect(rig, hears: .sequence("connection_success")) {
            avatar.send(.agentJoined)
            avatar.send(.agentState(.listening))
        }
        avatar.send(.reconnecting)
        await settle(1.2) // a reconnect shows after 1 s
        await expect(rig, hears: .sequence("error_recovery")) { avatar.send(.reconnected) }
        await expect(rig, hears: .keyed(.goodbye)) { avatar.send(.ended) }
    }
}
