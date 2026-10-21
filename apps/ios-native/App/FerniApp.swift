import FerniDesign
import FerniKit
import FerniVoice
import SwiftUI

@main
struct FerniApp: App {
    @UIApplicationDelegateAdaptor(FerniAppDelegate.self) private var delegate
    @State private var model: AppModel

    init() {
        CrashReporting.start()
        FerniFonts.register()
        FerniFonts.useForNavigationTitles()
        // Compile Ferni's shader off the main thread, ahead of the first frame.
        Task.detached(priority: .userInitiated) { AliveRenderer.warmUp() }
        #if DEBUG
        if let scenario = UITestScenario.current {
            UITestScenario.resetDefaults()
            _model = State(initialValue: AppModel(config: UITestScenario.config, firebaseReady: false, scenario: scenario.rawValue))
            return
        }
        #endif
        // Firebase itself starts in the app delegate's didFinishLaunching
        // (FerniAppDelegate): here, in App.init, UIApplication doesn't exist yet
        // and Auth would start without what phone sign-in needs (17054).
        _model = State(initialValue: AppModel(firebaseReady: FerniFirebase.isUsable()))
    }

    @Environment(\.scenePhase) private var scenePhase

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(model)
                .modifier(NightInkScheme())
                .onOpenURL { model.open($0) }
                // Spotlight and Shortcuts know the team as it is now.
                .task(id: model.team.unlocked) { await model.teamSpotlight.sync(met: model.team.unlocked) }
                #if DEBUG
                .uiTestEnvironment()
                #endif
                // Silent, anonymous on a first launch: talking never waits on a sign-in screen.
                .task {
                    await model.account.start()
                    await model.team.refresh()
                    await model.homeLine.refresh()
                    await model.minimumBuild.check()
                }
                // Consent belongs to whoever is signed in: switch with them.
                .onChange(of: LiveActivityController.content(for: model.call)) { _, content in
                    model.liveActivity.follow(content, startedAt: model.call.startedAt)
                }
                .task {
                    // Back online: finish any unbind or registration that didn't go through,
                    // starting an account first if one is waiting to be unbound. This loop
                    // never ends, so it stays last in this task.
                    for await _ in NetworkWatcher.becameReachable() {
                        if model.push.needsAccount { await model.account.start() }
                        await model.push.reconcile(uid: model.account.user?.uid)
                    }
                }
                // A good call (two minutes or more, ended by you) counts toward the check-in ask.
                .onChange(of: model.call.phase) { _, phase in
                    if phase == .ended, model.call.lastCallWasGood, let uid = model.account.user?.uid {
                        CheckInAsk().recordGoodCall(uid: uid)
                    }
                    switch phase {
                    case .ended, .failed:
                        model.callEndedAt = .now
                        model.callFinished()
                    default: break
                    }
                }
                // The watch shows the call as it is now.
                .onChange(of: model.remoteState) { _, state in model.watchRemote?.publish(state) }
                // What Ferni remembers locks again whenever the app leaves the foreground.
                .onChange(of: scenePhase) { old, phase in
                    if phase == .active {
                        model.cameBack(now: .now)
                    } else {
                        model.memoryLock.lock()
                        if old == .active { model.wentAway(now: .now) }
                    }
                }
                .onChange(of: model.account.user?.uid, initial: true) { old, uid in
                    model.accountChanged(from: old, to: uid)
                }
        }
    }
}

/// App-wide state the screens share: the account, the server API as that
/// account, and the call.
@MainActor
@Observable
final class AppModel {
    /// The model for scenes SwiftUI doesn't own (CarPlay).
    static weak var shared: AppModel?
    let feedback: CallFeedback
    let config: FerniConfig
    let account: AccountStore
    let api: FerniAPI
    let call: CallSession
    let consent = ConsentStore()
    let team: TeamStore
    let memory: MemoryStore
    let minimumBuild: MinimumBuild
    let callRemembered: CallRemembered
    let memoryLock = MemoryLock()
    let homeLine: HomeLineStore
    let nextSteps: NextSteps
    let teamSpotlight = TeamSpotlight()
    /// Bumped when Ferni should wake on a return (Welcome).
    var wakeCount = 0
    /// Bumped when Ferni should do a double take on a short return (Welcome).
    var doubleTakeCount = 0
    @ObservationIgnored var callEndedAt: Date?
    @ObservationIgnored private var wentAwayAt: Date?

    func wentAway(now: Date) { wentAwayAt = now }

    /// Back in the foreground: yesterday's goodbye goes, Ferni wakes after a
    /// long time away, and Home's line is fetched again (delight gap 1).
    func cameBack(now: Date) {
        let r = Welcome.onReturn(callEndedAt: callEndedAt, wasActiveAt: wentAwayAt, inCall: call.isActive, now: now)
        if r.forgetCall { call.forgetLastCall(); callEndedAt = nil }
        if r.wake { wakeCount += 1 }
        if r.doubleTake { doubleTakeCount += 1 }
        wentAwayAt = nil
        if r.forgetCall || r.wake { Task { await homeLine.refresh() } }
    }
    @ObservationIgnored private(set) var watchRemote: WatchRemote?
    let liveActivity = LiveActivityController()
    let push: PushStore
    var isShowingSettings = false
    /// What Ferni remembers, opened from Home (award upgrade 7).
    var isShowingMemory = false
    var isAskingConsent = false
    /// The sign-in sheet: "Already use Ferni? Sign in", or Talk when a real
    /// account was here before and isn't now.
    var isSigningIn = false
    var isShowingCallMore = false
    /// A line of Ferni's being reported.
    var reporting: Caption?

    /// The session a reported line belongs to: the room it was heard in.
    func reportSession(for caption: Caption) -> String { caption.room ?? call.roomName ?? "unknown" }

    func report(_ caption: Caption, reason: ReplyReport.Reason, note: String) async throws {
        try await ReplyReport.send(
            using: api, sessionID: reportSession(for: caption), saidAt: caption.at, reason: reason,
            note: note, textHint: caption.text, appVersion: SettingsView.version()
        )
    }
    /// Ferni's words in the caption area; off leaves only who's doing what.
    var showCaptions = UserDefaults.standard.object(forKey: "ferni.captions") as? Bool ?? true {
        didSet { UserDefaults.standard.set(showCaptions, forKey: "ferni.captions") }
    }

    /// Where the next call starts from, read by the token request: Home's
    /// note (`note:<id>`), or nothing for an ordinary Talk.
    @MainActor final class CallOrigin { var value: String? }
    private let origin = CallOrigin()
    var callOrigin: String? { origin.value }

    /// "Talk about this" on Ferni's note: the same door as Talk (consent
    /// first), and the call opens on the note's topic.
    func talk(aboutNote note: HomeLineStore.Home.Note) {
        guard HomeLineStore.validNoteID(note.id), !call.isActive else { return }
        origin.value = "note:\(note.id)"
        talk()
    }

    /// A one-off note for the person (shown as an alert), e.g. after a link.
    var notice: String?

    /// A `ferniapp://` link opened the app (DeepLink).
    func open(_ url: URL) {
        // Sign-in's return trips: Firebase's reCAPTCHA page (phone), Google's page.
        if FerniFirebase.canHandle(url) || GoogleSignInFlow.handle(url) { return }
        switch DeepLink.parse(url) {
        case .healthNotYet:
            notice = String(localized: "Health sharing isn't in the iPhone app yet.")
            noticeDetail = String(localized: "You can keep talking with Ferni as usual.")
        case nil: break
        }
    }

    /// A line under the notice, when it needs one.
    var noticeDetail: String?

    /// The server deleted the account: everything of the person on this phone
    /// goes too (their agreement, the check-in record, what's shown about
    /// them), and the app says so (critic L3).
    func afterDeletion(uid: String?) {
        if let uid {
            consent.forget(uid: uid)
            CheckInAsk().forget(uid: uid)
        }
        AccountDeletion.localKeys.forEach(UserDefaults.standard.removeObject(forKey:))
        forgetPerson()
        notice = String(localized: "Your account is deleted.")
        noticeDetail = String(localized: "Everything Ferni remembered about you is gone.")
    }

    /// The Home Screen quick action "Get help now" (static, in Info.plist, so
    /// it's there even when Ferni can't connect). It opens Help (critic L4).
    static let helpShortcut = "com.sethdford.ferni.help"
    var isShowingHelp = false

    func performShortcut(_ type: String) {
        if type == Self.helpShortcut { isShowingHelp = true }
    }

    /// After the sign-in sheet: a welcome back when they reached their account.
    func signInFinished() {
        guard account.user?.isAnonymous == false, let welcome = account.notice else { return }
        notice = welcome
        noticeDetail = nil
        account.clearNotice()
    }

    /// The consent sheet's Not now: no call, and nothing carried to the next one.
    func notNow() {
        isAskingConsent = false
        origin.value = nil
    }

    /// The call ended or failed: the next Talk is an ordinary one.
    func callFinished() { origin.value = nil }

    /// From Siri, Shortcuts, Control Center or the Action button: the same door
    /// as the Talk button. Someone not on the team yet means Ferni answers.
    func talk(to personaID: String) {
        guard !call.isActive else { return }
        if !team.choose(personaID) { team.choose(PersonaRegistry.ferni.id) }
        talk()
    }

    /// Talk: the consent screen first if this person hasn't agreed (or withdrew).
    func talk() {
        // Never a new anonymous account after a real one: sign in first.
        if account.needsSignIn {
            isSigningIn = true
            return
        }
        feedback.newCall()
        if consent.hasAgreed { call.start(personaID: team.chosen) } else { isAskingConsent = true }
    }

    /// "I agree, let's talk": the call starts at once ("Calling…"); the
    /// account is settled inside it, and the agreement is recorded for that
    /// account only. No account means the call ends saying so (critic H5).
    func agreeAndTalk() async {
        call.start(personaID: team.chosen) { [weak self] in
            guard let self else { return false }
            await self.account.start()
            self.consent.use(uid: self.account.user?.uid)
            return self.consent.agree()
        }
    }

    /// Delete the account on the server, then everything this phone kept about
    /// the person, then start fresh. Throws (and keeps everything) if the server says no.
    func deleteAccount() async throws {
        if call.isActive { await call.end() } // first, even if the server then says no
        let uid = account.user?.uid
        try await AccountDeletion.delete(using: api)
        afterDeletion(uid: uid)
        await account.signOut()
    }

    /// Sign out: this person's agreement and everything shown about them leave
    /// the phone with them.
    /// Withdrawing consent mid-call ends the call first: nothing more goes to
    /// the providers the person just withdrew from (critic M2).
    func withdrawConsent() async {
        if call.isActive { await call.end() }
        consent.withdraw()
    }

    func signOut() async {
        if call.isActive { await call.end() } // the call belongs to the person leaving
        if let uid = account.user?.uid { await push.unbindBeforeSignOut(uid: uid) } // while still them
        if let uid = account.user?.uid { consent.forget(uid: uid) }
        forgetPerson()
        await account.signOut()
    }

    /// Every per-person store follows the signed-in account.
    func accountChanged(from old: String?, to uid: String?) {
        consent.use(uid: uid)
        // At launch and on every change: the token is bound to this person only if they said yes.
        Task { await push.reconcile(uid: uid) }
        guard old != nil, old != uid else { return } // first launch keeps what's loading
        forgetPerson()
        Task { await team.refresh(); await homeLine.refresh() }
    }

    private func forgetPerson() {
        memory.reset()
        memoryLock.reset()
        homeLine.reset()
        team.reset()
        call.forgetPerson()
    }

    /// - Parameter scenario: debug builds only; a UI-test launch (`UITestScenario`).
    init(config: FerniConfig = .fromBundle(), firebaseReady: Bool, scenario: String? = nil) {
        self.config = config
        #if DEBUG
        account = UITestScenario.account() ?? AccountStore(backend: firebaseReady ? FirebaseAuthBackend() : nil)
        #else
        account = AccountStore(backend: firebaseReady ? FirebaseAuthBackend() : nil)
        #endif
        #if DEBUG
        api = UITestScenario.storeData ? UITestScenario.api(baseURL: config.apiBaseURL) : account.api(baseURL: config.apiBaseURL)
        #else
        api = account.api(baseURL: config.apiBaseURL)
        #endif
        team = TeamStore(api: api)
        memory = MemoryStore(api: api)
        callRemembered = CallRemembered(api: api)
        nextSteps = NextSteps(api: api)
        homeLine = HomeLineStore(api: api)
        minimumBuild = MinimumBuild(api: api, currentBuild: (Bundle.main.infoDictionary?["CFBundleVersion"] as? String).flatMap(Int.init))
        #if DEBUG
        let apnsEnvironment = "sandbox"
        #else
        let apnsEnvironment = "production"
        #endif
        push = PushStore(
            api: api, vault: KeychainPushVault(), bundleID: Bundle.main.bundleIdentifier ?? "com.sethdford.ferni",
            environment: apnsEnvironment, appVersion: SettingsView.version(),
            currentUID: { [account] in account.user?.uid }
        )
        account.uploadAppleCode = AppleAuthorizationUpload.uploader(api: api)
        account.mergeLeftBehind = AnonymousMerge.merger(api: api)
        let feedback = CallFeedback()
        self.feedback = feedback
        let level = AudioLevelMeter()
        let avatar = AvatarModel(play: { [feedback] in feedback.play($0) })
        #if DEBUG
        let testCall = scenario.map { _ in UITestScenario.callSession(avatar: avatar, level: level) }
        #else
        let testCall: CallSession? = nil
        #endif
        call = testCall ?? CallSession(
            fetchToken: CallTokens.fetcher(api: api, origin: { [origin] in await origin.value }),
            makeRoom: { LiveKitVoiceRoom(agentLevel: level) },
            audio: SystemCallAudio(systemManagesCalls: ConversationLifecycle.isAvailable),
            avatar: avatar,
            lifecycle: ConversationLifecycle.isAvailable ? ConversationLifecycle() : nil,
            agentLevel: level
        )
        feedback.isSomeoneSpeaking = { [call] in (call.avatar.pose == .speaking, call.isUserSpeaking) }
        feedback.isAtRest = { [call] in !call.isActive }
        #if DEBUG
        if scenario != nil { feedback.reduceMotion = { UITestScenario.reduceMotion } }
        #endif
        installSystemHandlers()
        Self.shared = self
        #if DEBUG
        if let scenario = scenario.flatMap(UITestScenario.init(rawValue:)) {
            switch scenario {
            case .home: break
            case .consent: isAskingConsent = true
            case .settings: isShowingSettings = true
            case .call, .handoff, .waitlist, .connecting, .reconnecting, .onHold, .failed:
                call.start(personaID: PersonaRegistry.ferni.id)
            case .remember:
                call.start(personaID: PersonaRegistry.ferni.id)
                Task { [call] in
                    try? await Task.sleep(for: .seconds(2))
                    await call.end()
                }
            }
            return // no watch session in a UI test
        }
        #endif
        watchRemote = WatchRemote(model: self)
        watchRemote?.start()
    }

    /// Siri, Control Center, the Action button and notifications can launch
    /// the app cold and arrive before any view appears (critic H6), so they're
    /// wired as soon as the model exists, before the app finishes launching.
    private func installSystemHandlers() {
        EndCallIntent.end = { [weak self] in await self?.call.end() }
        MuteCallIntent.toggle = { [weak self] in await self?.call.toggleMute() }
        TalkIntent.handler = { [weak self] personaID in self?.talk(to: personaID) }
        TeamMemberQuery.met = { [weak self] in self?.team.unlocked ?? [PersonaRegistry.ferni.id] }
        FerniAppDelegate.onToken = { [weak self] token in
            guard let self else { return }
            Task { await self.push.received(deviceToken: token, uid: self.account.user?.uid) }
        }
        FerniAppDelegate.onShortcut = { [weak self] type in self?.performShortcut(type) }
        FerniAppDelegate.onTalk = { [weak self] in
            guard let self else { return }
            self.talk(to: self.team.chosen)
        }
    }
}
