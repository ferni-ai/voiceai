import XCTest
@testable import FerniDesign

/// The expression tokens become the same face geometry the web draws
/// (face-model.ts / the alive prototype's faceOf). Expected values are worked
/// by hand from the token numbers.
final class FaceTests: XCTestCase {
    /// The bundled copy matches design-system/tokens/expressions.json; rerun
    /// scripts/sync-expression-tokens.py when the tokens change.
    func testTheBundledTokensMatchTheDesignSystem() throws {
        let repo = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
            .appending(path: "../../../../../../design-system/tokens/expressions.json").standardized
        guard let data = try? Data(contentsOf: repo) else { throw XCTSkip("design-system not reachable from here") }
        let source = try JSONDecoder().decode(ExpressionTokens.File.self, from: data).expressions
        XCTAssertEqual(ExpressionTokens.all.count, 102)
        XCTAssertEqual(ExpressionTokens.all, source, "run apps/ios-native/scripts/sync-expression-tokens.py")
    }

    func testJoyfulSquintsIntoTheHappyArch() {
        let f = Face.of("joyful")
        let eye = Face.Eye(sx: 1.12, sy: 0.7, top: 0.189, bot: 0, arch: 0.75)
        for e in [f.left, f.right] {
            XCTAssertEqual(e.sx, eye.sx, accuracy: 1e-9)
            XCTAssertEqual(e.sy, eye.sy, accuracy: 1e-9)
            XCTAssertEqual(e.top, eye.top, accuracy: 1e-9)
            XCTAssertEqual(e.bot, 0)
            XCTAssertEqual(e.arch, eye.arch, accuracy: 1e-9)
        }
        XCTAssertEqual(f.posY, 0.064, accuracy: 1e-9) // translateY(-4px)
        XCTAssertEqual(f.scale, 1.03, accuracy: 1e-9)
        XCTAssertEqual(f.squash, 1, accuracy: 1e-9)
        XCTAssertEqual(f.crease, 1)
        XCTAssertEqual(f.halo, 0.5)
        XCTAssertEqual(f.glow, 0.6, accuracy: 1e-9)
        XCTAssertEqual(f.blush, 0.55)
        XCTAssertEqual(f.effect, "sparkle")
    }

    func testAWinkClosesOneEyeIntoAnArc() {
        let f = Face.of("winking")
        XCTAssertEqual(f.left, Face.Eye(sx: 1, sy: 0.9, top: 0.45, bot: 0, arch: 0.85), "a gentle closed arc")
        XCTAssertEqual(Face.of("yawning").left, Face.Eye(sx: 0.95, sy: 1, top: 1, bot: 0, arch: 0.55), "a yawn shuts to the fold")
        XCTAssertEqual(f.right.top, 0.18, accuracy: 1e-9)
        XCTAssertEqual(f.right.sy, 0.9)
        XCTAssertEqual(f.roll, 2 * .pi / 180 * 1.8, accuracy: 1e-9)
        XCTAssertEqual(f.animation, "winkPop")
        XCTAssertEqual(f.halo, 0.2, "no presence ring: the default")
    }

    func testCuriousLooksAsideAndLeansIn() {
        let f = Face.of("curious")
        XCTAssertEqual(f.left.sx, 1.05)
        XCTAssertEqual(f.left.sy, 1.1)
        XCTAssertEqual(f.right.sy, 1.06)
        XCTAssertEqual(f.gx, 0.18, accuracy: 1e-9)
        XCTAssertEqual(f.gy, 0.09, accuracy: 1e-9)
        XCTAssertEqual(f.roll, 3 * .pi / 180 * 1.8 + 0.22, accuracy: 1e-9)
    }

    /// A furrow is worry on a concern or nervous face (inner corners lifted,
    /// lower lids tensed) and a glare on a frustrated one (audit P0 #1).
    func testAFurrowIsWorryOnAConcernFaceAndAGlareOnAnAngryOne() {
        for id in ["concerned", "worried", "anxious"] {
            let f = Face.of(id)
            XCTAssertEqual(f.tilt, 0.45, id)
            XCTAssertGreaterThanOrEqual(f.left.top, 0.24, id)
            XCTAssertEqual(f.left.bot, 0.14, accuracy: 1e-9, id)
        }
        XCTAssertEqual(Face.of("irritated").tilt, -0.6)
        XCTAssertEqual(Face.of("irritated").left.bot, 0.12, accuracy: 1e-9, "a glare pushes the lower lids up")
        XCTAssertEqual(Face.of("sympathetic").tilt, 0, "concern without a furrow keeps its soft face")
        XCTAssertEqual(Face.of("neutral").tilt, 0)
    }

    /// The smile crease is a cheek lift (the lower lids rise and curve up), never
    /// a stroke under the eye: Seth read that stroke as a floating lower lid.
    func testASmileCreaseLiftsTheCheeks() {
        // Not speaking: there it read smug on the everyday talking face (2026-10-20).
        for (id, bot, arch) in [("speaking", 0.0, 0.0), ("wise", 0.2, 0.2), ("sassy", 0.2, 0.3), ("neutral", 0.06, 0.0)] {
            let f = Face.of(id)
            XCTAssertEqual(f.left.bot, bot, accuracy: 1e-9, "\(id): lower lid")
            XCTAssertEqual(f.left.arch, arch, accuracy: 1e-9, "\(id): arch")
        }
        XCTAssertEqual(Face.of("happy").left.arch, 0.45, accuracy: 1e-9, "a happy face keeps its own arch")
        XCTAssertEqual(Face.of("happy").left.bot, 0)
        XCTAssertEqual(Face.of("present").left.bot, 0.2, accuracy: 1e-9, "present's settled, soft eyes")
    }

    func testAnUnknownExpressionIsNeutral() {
        XCTAssertEqual(Face.of("not-a-face"), Face.of("neutral"))
        XCTAssertEqual(Face.of("neutral").left.top, 0.108, accuracy: 1e-9)
    }

    func testBodyTransformsParseLikeCSS() {
        let a = BodyTransform("rotate(-4deg) scaleX(1.03) translateY(-3px)")
        XCTAssertEqual([a.rot, a.sx, a.sy, a.ty], [-4, 1.03, 1, -3])
        let b = BodyTransform("scale(1.03) translateY(-5px)")
        XCTAssertEqual([b.sx, b.sy, b.ty], [1.03, 1.03, -5])
        XCTAssertEqual(BodyTransform("none"), BodyTransform(nil))
    }
}

final class KeyedMomentTests: XCTestCase {
    func testKeysAreHitExactlyAndEasedBetween() throws {
        let posY = try XCTUnwrap(KeyedMoment.arrival.channels[.posY])
        XCTAssertEqual(KeyedMoment.sample(posY, at: 0), -2.5)
        XCTAssertEqual(KeyedMoment.sample(posY, at: 22), 0.18, accuracy: 1e-12)
        XCTAssertEqual(KeyedMoment.sample(posY, at: 11), -2.5 + 2.68 * 0.875, accuracy: 1e-12) // ease out at u = 0.5
        XCTAssertEqual(KeyedMoment.sample(posY, at: 500), 0)
    }

    func testEveryEaseStartsAtZeroAndLands() {
        for ease in [KeyEase.out, .in, .inOut, .snap, .overshoot, .linear, .hold] {
            XCTAssertEqual(ease(0), 0, accuracy: 1e-12)
            XCTAssertEqual(ease(1), 1, accuracy: 1e-12)
        }
        XCTAssertGreaterThan(KeyEase.overshoot(0.7), 1, "overshoot goes past and settles")
        XCTAssertEqual(KeyEase.hold(0.99), 0)
    }

    func testEveryMomentIsOrderedAndEndsInTime() {
        for moment in KeyedMoment.allCases {
            for (channel, keys) in moment.channels {
                XCTAssertEqual(keys.map(\.frame), keys.map(\.frame).sorted(), "\(moment) \(channel)")
                XCTAssertLessThanOrEqual(keys.last?.frame ?? 0, moment.end, "\(moment) \(channel)")
            }
            XCTAssertEqual(moment.cues.map(\.frame), moment.cues.map(\.frame).sorted())
        }
    }

    func testTheWinSpinsOnceAndComesBackFacingYou() throws {
        let yaw = try XCTUnwrap(KeyedMoment.win.channels[.yaw])
        XCTAssertEqual(KeyedMoment.sample(yaw, at: 44), 2 * .pi, accuracy: 1e-12)
        XCTAssertEqual(KeyedMoment.sample(yaw, at: 60), 0)
    }

    func testSpringsSettleAndJellyOvershoots() {
        var body = RigSpring(1, k: 170, d: 9)
        body.t = 1.2
        var jelly = RigSpring(0, k: 260, d: 6)
        jelly.v = 9
        var peak = 0.0
        for _ in 0..<(240 * 3) {
            body.step(1.0 / 240)
            jelly.step(1.0 / 240)
            peak = max(peak, -jelly.x)
        }
        XCTAssertEqual(body.x, 1.2, accuracy: 1e-3)
        XCTAssertGreaterThan(peak, 0.05, "underdamped on purpose: it wobbles back past rest")
    }
}
