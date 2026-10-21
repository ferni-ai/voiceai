import UIKit
import SwiftUI
import XCTest
@testable import FerniDesign

/// Delight gap 6: the Lock Screen tells the truth after you hang up.
final class CallActivityStateTests: XCTestCase {
    func testAnEndedCallSaysGoodbyeAndHasNothingToPress() {
        XCTAssertEqual(CallActivityState.ended.words("Ferni"), "Talk soon.")
        XCTAssertFalse(CallActivityState.ended.hasControls, "no End or Mute on a call that's over")
        for state in [CallActivityState.calling, .arriving, .listening, .thinking, .speaking, .reconnecting, .onHold] {
            XCTAssertTrue(state.hasControls, "\(state): End always works while there's a call")
        }
    }

    /// Calling, then on the way, then (if Ferni never comes) saying so, with
    /// nothing to press (2026-10-19).
    func testCallingOnTheWayAndCouldntJoin() {
        XCTAssertEqual(CallActivityState.calling.words("Ferni"), "Calling Ferni")
        XCTAssertEqual(CallActivityState.arriving.words("Ferni"), "Ferni's on the way")
        XCTAssertEqual(CallActivityState.couldNotJoin.words("Ferni"), "Ferni couldn't join right now")
        XCTAssertFalse(CallActivityState.couldNotJoin.hasControls)
    }

    /// Activities in flight keep decoding after the new field arrives.
    func testAnOlderStateWithoutMutedStillDecodes() throws {
        let old = #"{"state":"listening","personaID":"ferni","personaName":"Ferni"}"#
        let state = try JSONDecoder().decode(CallActivityAttributes.ContentState.self, from: Data(old.utf8))
        XCTAssertFalse(state.muted)
    }

    /// After hang-up the Dynamic Island waves goodbye instead of showing the
    /// call's waveform, and the running time stops showing (design audit P1-11).
    func testAfterHangUpTheIslandWavesGoodbye() {
        XCTAssertEqual(CallActivityState.ended.islandSymbol(muted: false), "hand.wave.fill")
        XCTAssertEqual(CallActivityState.ended.islandSymbol(muted: true), "hand.wave.fill", "muted no longer matters")
        XCTAssertEqual(CallActivityState.couldNotJoin.islandSymbol(muted: false), "hand.wave.fill")
        XCTAssertEqual(CallActivityState.speaking.islandSymbol(muted: false), "waveform")
        XCTAssertEqual(CallActivityState.listening.islandSymbol(muted: true), "mic.slash.fill")
        XCTAssertFalse(CallActivityState.ended.showsDuration)
        XCTAssertTrue(CallActivityState.listening.showsDuration)
    }

    /// The End glyph sits on the error colour in its own ink: at least 4.5:1
    /// in light and dark (white on dark mode's #E7A39A was 2.08:1, P1-12).
    func testTheEndGlyphReadsOnTheErrorColour() {
        func luminance(_ c: UIColor) -> Double {
            var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
            c.getRed(&r, green: &g, blue: &b, alpha: &a)
            func lin(_ v: CGFloat) -> Double { let v = Double(v); return v <= 0.04045 ? v / 12.92 : pow((v + 0.055) / 1.055, 2.4) }
            return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
        }
        for style in [UIUserInterfaceStyle.light, .dark] {
            let traits = UITraitCollection(userInterfaceStyle: style)
            let ink = luminance(UIColor(FerniColor.onError).resolvedColor(with: traits))
            let paint = luminance(UIColor(FerniColor.error).resolvedColor(with: traits))
            let ratio = (max(ink, paint) + 0.05) / (min(ink, paint) + 0.05)
            XCTAssertGreaterThanOrEqual(ratio, 4.5, "\(style.rawValue): \(ratio)")
        }
    }

    /// Award upgrade 9: muted in a live call, the Lock Screen and the Island
    /// say so, as the call screen does; not on hold, reconnecting or after.
    func testMutedItSaysYoureMuted() {
        for state in [CallActivityState.listening, .thinking, .speaking] {
            XCTAssertEqual(state.words("Ferni", muted: true), "You're muted", "\(state)")
        }
        XCTAssertEqual(CallActivityState.listening.words("Ferni"), "Ferni's listening")
        XCTAssertEqual(CallActivityState.onHold.words("Ferni", muted: true), "On hold")
        XCTAssertEqual(CallActivityState.reconnecting.words("Ferni", muted: true), "Reconnecting")
        XCTAssertEqual(CallActivityState.ended.words("Ferni", muted: true), "Talk soon.")
    }
}
