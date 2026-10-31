/// The Lock Screen's mute button (#2868 item 45). It mutes a live call and does
/// nothing else: never unmutes, never touches a call that isn't live. Anyone can
/// press it on a locked phone, so turning the mic back on takes the person, in
/// the app. A press that arrives after the call was muted another way (AirPods,
/// the app) before the Lock Screen caught up stays muted.
extension CallSession {
    public func muteFromLockScreen() async {
        guard phase == .live, !isMuted else { return }
        await toggleMute()
    }
}
