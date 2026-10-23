import CoreGraphics
import ImageIO
import UniformTypeIdentifiers
import XCTest
@testable import FerniDesign

/// Every expression, rendered by the real rig and shader, must look different
/// from its nearest neighbour: the rendered-difference test from the
/// 2026-10-20 expression audit (voiceai-evidence/ios-expr-audit-2026-10-20,
/// audit-harness.patch). The audit found concern rendering as neutral and 21
/// of 102 faces with a near-identical twin; the twins not fixed yet are listed
/// here, and the list can only shrink.
///
/// `FERNI_AUDIT_DIR` (and optionally `FERNI_AUDIT_IDS`, comma-separated, and
/// `FERNI_AUDIT_TAG`) writes face crops for before/after evidence.
@MainActor
final class ExpressionDistinctnessTests: XCTestCase {
    /// Mean absolute grey-level difference over the face below which two
    /// expressions read as the same face: the audit's own line, 0.01 (critic
    /// M6; its near-identical twins sat at 0.0027-0.0055). Pairs between the
    /// old 0.0058 and 0.01 are allowed below only with a reason.
    static let twinThreshold: Float = 0.01

    /// Pairs still under the threshold, as found on 2026-10-20 before any fix.
    /// Fixing one makes `testTheKnownTwinsAreStillTwins` fail: remove it here.
    static let knownTwins: Set<Pair> = []

    /// Twins by design, each with why: a still frame can't tell them apart.
    /// Measured 2026-10-20 (FERNI_AUDIT_PRINT=1 on testPrintNearest). With the
    /// page-colour lid caps back (2026-10-22), absorbing/listening (0.031),
    /// confident/encouraging (0.019) and processing/receptive (0.029) grew
    /// apart past the line and left the list.
    static let allowedTwins: [Pair: String] = [
        Pair("neutral", "speaking"): "0.0047: speaking is neutral plus the voice's motion, which a still frame can't see",
        Pair("content", "serene"): "0.0093: two settled faces a step apart (lids 0.162 vs 0.225 on the rig); serene is the goodbye's settle face",
    ]

    struct Pair: Hashable, CustomStringConvertible {
        let a: String, b: String
        init(_ x: String, _ y: String) { (a, b) = x < y ? (x, y) : (y, x) }
        var description: String { "\(a) ≈ \(b)" }
    }

    static let slot = 200.0, scale = 2.0
    static var width: Int { Int(slot * AvatarView.canvas.width * scale) }
    static var height: Int { Int(slot * AvatarView.canvas.height * scale) }

    /// The settled face (springs at target; no breath, saccade or blink), as
    /// Home shows it at rest in the light theme.
    static func render(_ id: String, reduceMotion: Bool = false, untilted: Bool = false, caps: Bool = true) -> [UInt8]? {
        let rig = AliveRig(persona: .ferni, seed: 11)
        rig.still = true
        rig.reduceMotion = reduceMotion
        rig.expression = id
        _ = rig.frame(at: 0.016)
        var u = rig.frame(at: 0.032)
        if untilted { u.lean.x = 0 }
        if !caps { u.caps = .zero }
        u.light(dark: false, roomTop: linear(hex: "#faf8f5"), roomBottom: linear(hex: "#efe9e0"))
        let w = width, h = height
        u.frame(size: SIMD2(Float(w), Float(h)), radius: Float(AvatarView.radius / AvatarView.canvas.width) * Float(w),
                below: Float(AvatarView.lift / AvatarView.canvas.width) * Float(w))
        return AliveRenderer.shared?.image(u, width: w, height: h)
    }

    /// The face region (eyes and cheeks), grey, every fourth pixel: the audit's crop.
    static func crop(_ bytes: [UInt8]) -> [Float] {
        let w = width, h = height
        let cx = w / 2, cy = h / 2 + Int(AvatarView.lift / AvatarView.canvas.height * Double(h))
        let r = Int(AvatarView.radius / AvatarView.canvas.width * Double(w))
        var v: [Float] = []
        for y in stride(from: cy - r, to: cy + r / 2, by: 4) {
            for x in stride(from: cx - r, to: cx + r, by: 4) where x >= 0 && y >= 0 && x < w && y < h {
                let i = (y * w + x) * 4
                v.append((Float(bytes[i]) + Float(bytes[i + 1]) + Float(bytes[i + 2])) / 765)
            }
        }
        return v
    }

    static func difference(_ a: [Float], _ b: [Float]) -> Float {
        zip(a, b).reduce(0) { $0 + abs($1.0 - $1.1) } / Float(max(a.count, 1))
    }

    /// Every expression's face, rendered once per run.
    static var faces: [String: [Float]] = [:]
    static func faceCrops() throws -> [String: [Float]] {
        if faces.isEmpty {
            for id in ExpressionTokens.all.keys {
                faces[id] = crop(try XCTUnwrap(render(id), "the shader renders \(id)"))
            }
        }
        return faces
    }

    /// Each expression's nearest neighbour and how far it is.
    static func nearest() throws -> [(id: String, other: String, d: Float)] {
        let faces = try faceCrops()
        return faces.keys.sorted().map { id in
            let best = faces.keys.filter { $0 != id }.map { ($0, difference(faces[id]!, faces[$0]!)) }.min { $0.1 < $1.1 }!
            return (id, best.0, best.1)
        }
    }

    override func setUpWithError() throws {
        guard AliveRenderer.shared != nil else { throw XCTSkip("no Metal device") }
        XCTAssertGreaterThan(ExpressionTokens.all.count, 100, "the tokens loaded")
    }

    func testEveryExpressionLooksDifferentFromItsNeighbours() throws {
        let twins = try Self.nearest().filter {
            $0.d < Self.twinThreshold && !Self.knownTwins.contains(Pair($0.id, $0.other)) && Self.allowedTwins[Pair($0.id, $0.other)] == nil
        }
        XCTAssertEqual(twins.map { "\(Pair($0.id, $0.other)) (\(String(format: "%.4f", $0.d)))" }, [],
                       "faces that render the same; tell them apart, don't list them")
    }

    /// The allowlist only holds pairs that need it: one that's grown apart past
    /// the line is removed, so the list can't hide a new twin under an old reason.
    func testEveryAllowedTwinIsStillUnderTheLine() throws {
        let faces = try Self.faceCrops()
        for pair in Self.allowedTwins.keys {
            let a = try XCTUnwrap(faces[pair.a]), b = try XCTUnwrap(faces[pair.b])
            XCTAssertLessThan(Self.difference(a, b), Self.twinThreshold, "\(pair) is past the line now: remove it from allowedTwins")
        }
    }

    func testTheKnownTwinsAreStillTwins() throws {
        let faces = try Self.faceCrops()
        for pair in Self.knownTwins {
            let a = try XCTUnwrap(faces[pair.a]), b = try XCTUnwrap(faces[pair.b])
            XCTAssertLessThan(Self.difference(a, b), Self.twinThreshold, "\(pair) is fixed: remove it from knownTwins")
        }
    }

    /// Audit P0 #1: concern and worry rendered as neutral, lids wider open
    /// than neutral's. Their lids now come down (the lifted inner corners and
    /// tensed lower lids), so less eye white shows than on neutral.
    func testWorryIsNotANeutralFace() throws {
        let neutral = try Self.eyeWhite("neutral")
        // Anxious keeps its wide (1.05 × 1.06) eyes: FaceTests pins its furrow.
        for id in ["concerned", "worried"] {
            let white = try Self.eyeWhite(id)
            XCTAssertLessThan(Double(white), Double(neutral) * 0.9, "\(id): \(white) eye-white samples vs neutral's \(neutral)")
        }
    }

    /// The worried slant, read from the pixels: how much lower (in pixels) the
    /// top edge of each eye's white sits at its inner third than at its outer
    /// third, averaged over both eyes. Negative: the inner corners are higher.
    static func slant(_ id: String) throws -> Double {
        let bytes = try XCTUnwrap(render(id))
        let w = width, h = height, cx = w / 2
        let r = Int(AvatarView.radius / AvatarView.canvas.width * Double(w))
        func isWhite(_ x: Int, _ y: Int) -> Bool {
            let i = (y * w + x) * 4
            return bytes[i + 3] > 200 && min(bytes[i], bytes[i + 1], bytes[i + 2]) > 190
        }
        /// Top edge of the white in each column of an eye, outer to inner.
        func edges(_ xs: [Int]) -> [Int] {
            xs.compactMap { x in (0..<h).first { isWhite(x, $0) } }
        }
        func slantOf(outerToInner xs: [Int]) -> Double {
            let e = edges(xs)
            guard e.count >= 6 else { return 0 }
            let third = e.count / 3
            let outer = e.prefix(third), inner = e.suffix(third)
            return Double(inner.reduce(0, +)) / Double(inner.count) - Double(outer.reduce(0, +)) / Double(outer.count)
        }
        let left = slantOf(outerToInner: Array((cx - r)..<cx))
        let right = slantOf(outerToInner: Array(((cx)..<(cx + r)).reversed()))
        return (left + right) / 2
    }

    /// The lifted inner corners show in the pixels, not only in the numbers:
    /// on neutral the inner edge sits about 2.6 px below the outer, on a
    /// worried face 7-9 px above it (2026-10-20).
    func testWorryHasItsSlant() throws {
        let neutral = try Self.slant("neutral")
        for id in ["concerned", "worried", "anxious"] {
            let s = try Self.slant(id)
            XCTAssertLessThan(s, neutral - 6, "\(id): slant \(s) px vs neutral \(neutral) px")
        }
    }

    /// Critic L2: under Reduce Motion confused has no "?" (P2 #4) and no
    /// animation, so its pose has to carry it, held: one eye narrowed, the
    /// other open. Past the twin line from neutral and thinking, and the
    /// eyes' whites a third apart in height (without the pose, 1.06: two
    /// near-equal eyes under a tilt, which read as a tilted neutral).
    func testConfusedStillReadsUnderReduceMotion() throws {
        func bytes(_ id: String, untilted: Bool = false) throws -> [UInt8] {
            try XCTUnwrap(Self.render(id, reduceMotion: true, untilted: untilted))
        }
        let confused = Self.crop(try bytes("confused"))
        for other in ["neutral", "thinking"] {
            let d = Self.difference(confused, Self.crop(try bytes(other)))
            XCTAssertGreaterThan(d, Self.twinThreshold, "confused vs \(other) under Reduce Motion: \(d)")
        }
        // Rows of eye white in each half of the face, the head held level.
        let face = try bytes("confused", untilted: true)
        let w = Self.width, h = Self.height
        func rows(_ xs: Range<Int>) -> Int {
            (0..<h).filter { y in xs.contains { x in
                let i = (y * w + x) * 4
                return face[i + 3] > 200 && min(face[i], face[i + 1], face[i + 2]) > 190
            } }.count
        }
        let left = rows(0..<(w / 2)), right = rows((w / 2)..<w)
        let ratio = Double(max(left, right)) / Double(max(min(left, right), 1))
        if ProcessInfo.processInfo.environment["FERNI_AUDIT_PRINT"] != nil { print("RM confused eye rows \(left) \(right) \(ratio)") }
        XCTAssertGreaterThan(ratio, 1.3, "one eye narrowed, the other open: white rows \(left) vs \(right)")
    }

    /// Critic M-E: three pairs were told apart only by motion (caring's settle,
    /// calm's breath, nervous's look), so under Reduce Motion they were one
    /// face. Each now holds a pose, rendered with Reduce Motion on.
    static let motionTwins = [("calm", "neutral"), ("caring", "tender"), ("listening", "nervous")]

    func testTheMotionTwinsDifferWhenStill() throws {
        for (a, b) in Self.motionTwins {
            let d = Self.difference(Self.crop(try XCTUnwrap(Self.render(a, reduceMotion: true))),
                                    Self.crop(try XCTUnwrap(Self.render(b, reduceMotion: true))))
            if ProcessInfo.processInfo.environment["FERNI_AUDIT_PRINT"] != nil { print("MOTIONTWIN\t\(a)\t\(b)\t\(d)") }
            XCTAssertGreaterThan(d, Self.twinThreshold, "\(a) vs \(b) under Reduce Motion: \(d)")
            XCTAssertNil(Self.allowedTwins[Pair(a, b)], "\(Pair(a, b)) isn't allowed as a twin")
        }
    }

    /// Eye-white samples in a face crop (near-white grey).
    static func white(_ crop: [Float]) -> Int { crop.filter { $0 > 0.8 }.count }

    /// The eye white a face shows: light samples its lid caps didn't change
    /// (the caps are the page's cream, as light as a white).
    static func eyeWhite(_ id: String) throws -> Int {
        let capped = crop(try XCTUnwrap(render(id), id)), bare = crop(try XCTUnwrap(render(id, caps: false), id))
        return zip(capped, bare).filter { $0.0 > 0.8 && abs($0.0 - $0.1) < 0.02 }.count
    }

    /// Writes face crops for before/after evidence; skipped without FERNI_AUDIT_DIR.
    func testWriteEvidenceCrops() throws {
        let env = ProcessInfo.processInfo.environment
        guard let dir = env["FERNI_AUDIT_DIR"] else { throw XCTSkip("FERNI_AUDIT_DIR unset") }
        let ids = env["FERNI_AUDIT_IDS"].map { $0.split(separator: ",").map(String.init) } ?? ExpressionTokens.all.keys.sorted()
        let tag = env["FERNI_AUDIT_TAG"] ?? "crop"
        let reduceMotion = env["FERNI_AUDIT_RM"] != nil
        try FileManager.default.createDirectory(atPath: dir, withIntermediateDirectories: true)
        let w = Self.width, h = Self.height
        let r = Int(AvatarView.radius / AvatarView.canvas.width * Double(w))
        let cy = h / 2 + Int(AvatarView.lift / AvatarView.canvas.height * Double(h))
        let box = CGRect(x: w / 2 - r - 8, y: cy - r - 8, width: 2 * r + 16, height: 2 * r + 16)
        let info = CGBitmapInfo(rawValue: CGImageAlphaInfo.premultipliedFirst.rawValue | CGBitmapInfo.byteOrder32Little.rawValue)
        var lines: [String] = []
        for id in ids {
            let bytes = try XCTUnwrap(Self.render(id, reduceMotion: reduceMotion))
            let provider = try XCTUnwrap(CGDataProvider(data: Data(bytes) as CFData))
            let image = try XCTUnwrap(CGImage(width: w, height: h, bitsPerComponent: 8, bitsPerPixel: 32, bytesPerRow: w * 4,
                                              space: CGColorSpace(name: CGColorSpace.sRGB)!, bitmapInfo: info, provider: provider,
                                              decode: nil, shouldInterpolate: false, intent: .defaultIntent))
            let cropped = try XCTUnwrap(image.cropping(to: box))
            // Over the room colour, so the evidence shows what Home shows.
            let ctx = try XCTUnwrap(CGContext(data: nil, width: cropped.width, height: cropped.height, bitsPerComponent: 8, bytesPerRow: 0,
                                              space: CGColorSpace(name: CGColorSpace.sRGB)!, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue))
            ctx.setFillColor(red: 0.98, green: 0.973, blue: 0.961, alpha: 1)
            ctx.fill(CGRect(x: 0, y: 0, width: cropped.width, height: cropped.height))
            ctx.draw(cropped, in: CGRect(x: 0, y: 0, width: cropped.width, height: cropped.height))
            let url = URL(fileURLWithPath: dir).appending(path: "\(id)-\(tag).png")
            let dest = try XCTUnwrap(CGImageDestinationCreateWithURL(url as CFURL, UTType.png.identifier as CFString, 1, nil))
            CGImageDestinationAddImage(dest, try XCTUnwrap(ctx.makeImage()), nil)
            XCTAssertTrue(CGImageDestinationFinalize(dest))
            if let n = try Self.nearest().first(where: { $0.id == id }) {
                lines.append("\(id)\tnearest \(n.other)\t\(String(format: "%.4f", n.d))\tvs neutral \(String(format: "%.4f", Self.difference(Self.faces[id]!, Self.faces["neutral"]!)))")
            }
        }
        try (lines.joined(separator: "\n") + "\n").write(toFile: dir + "/distances-\(tag).tsv", atomically: true, encoding: .utf8)
    }

    /// Prints every face's nearest neighbour (FERNI_AUDIT_PRINT=1), for tuning.
    func testPrintNearest() throws {
        guard ProcessInfo.processInfo.environment["FERNI_AUDIT_PRINT"] != nil else { throw XCTSkip("FERNI_AUDIT_PRINT unset") }
        for n in try Self.nearest().sorted(by: { $0.d < $1.d }) {
            print("NEAREST\t\(n.id)\t\(n.other)\t\(String(format: "%.4f", n.d))")
        }
    }
}
