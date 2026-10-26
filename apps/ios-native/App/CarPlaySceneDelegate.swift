import CarPlay
import FerniKit
import FerniVoice

/// Ferni in the car: pick who to talk to, then a voice screen with Mute and
/// End. Nothing to read while driving.
///
/// Compiled and tested in every build, but registered (the CarPlay scene in
/// Info.plist plus the carplay-voice-based-conversation entitlement) only once
/// Apple grants that entitlement: see the CarPlay note in project.yml.
@available(iOS 26.4, *)
@MainActor
final class CarPlaySceneDelegate: UIResponder, CPTemplateApplicationSceneDelegate {
    private var interface: CPInterfaceController?
    private var voice: CPVoiceControlTemplate?
    private var voiceMuted = false
    private var askedForConsent = false

    func templateApplicationScene(_ scene: CPTemplateApplicationScene, didConnect interfaceController: CPInterfaceController) {
        interface = interfaceController
        guard let model = AppModel.shared else { return }
        let team = CarTemplates.team(CarScreens.rows(team: model.team.unlocked, chosen: model.team.chosen)) { id in
            AppModel.shared?.talk(to: id)
        }
        interfaceController.setRootTemplate(team, animated: false, completion: nil)
        follow()
    }

    func templateApplicationScene(_ scene: CPTemplateApplicationScene, didDisconnectInterfaceController interfaceController: CPInterfaceController) {
        interface = nil
        voice = nil
    }

    /// Re-render whenever the call changes.
    private func follow() {
        guard interface != nil else { return }
        withObservationTracking { render() } onChange: {
            Task { @MainActor [weak self] in self?.follow() }
        }
    }

    private func render() {
        guard let model = AppModel.shared, let interface else { return }
        let call = model.call
        // Agreeing needs the phone: say so instead of a screen that can't be read in the car.
        if model.isAskingConsent, !askedForConsent {
            askedForConsent = true
            let ok = CPAlertAction(title: String(localized: "OK"), style: .cancel) { _ in interface.dismissTemplate(animated: true, completion: nil) }
            interface.presentTemplate(CPAlertTemplate(titleVariants: [String(localized: "Agree to talk on your iPhone first")], actions: [ok]),
                                      animated: true, completion: nil)
        } else if !model.isAskingConsent {
            askedForConsent = false
        }
        if call.isActive {
            if voice == nil || voiceMuted != call.isMuted {
                let name = PersonaRegistry.get(call.avatar.personaID).name
                let next = CarTemplates.voice(name: name, muted: call.isMuted,
                                              mute: { Task { await call.toggleMute() } },
                                              end: { Task { await call.end() } })
                if voice != nil { interface.popTemplate(animated: false, completion: nil) }
                interface.pushTemplate(next, animated: voice == nil, completion: nil)
                voice = next
                voiceMuted = call.isMuted
            }
            voice?.activateVoiceControlState(withIdentifier: CarScreens.VoiceState.of(
                phase: call.phase, pose: call.avatar.pose, onHold: call.isOnHold).rawValue)
        } else if voice != nil {
            interface.popToRootTemplate(animated: true, completion: nil)
            voice = nil
        }
    }
}
