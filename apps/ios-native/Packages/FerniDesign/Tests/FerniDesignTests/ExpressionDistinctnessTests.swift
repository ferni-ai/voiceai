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
    /// expressions read as the same face (the audit's near-identical twins sit
    /// at 0.0027-0.0055; concerned and uneasy were 0.0052 before P0 #1).
    /// Below neutral and speaking's 0.0060: speaking is neutral plus the voice.
    static let twinThreshold: Float = 0.0058

    /// Pairs still under the threshold, as found on 2026-10-20 before any fix.
    /// Fixing one makes `testTheKnownTwinsAreStillTwins` fail: remove it here.
    static let knownTwins: Set<Pair> = [
        Pair("determined", "resolute"), Pair("caring", "compassionate"), Pair("empathetic", "sympathetic"),
        Pair("listening", "nervous"), Pair("peaceful", "wise"), Pair("confident", "encouraging"),
        Pair("present", "speaking"), Pair("focused", "frustrated"), Pair("absorbing", "nervous"),
        Pair("receptive", "present"),
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
    static func render(_ id: String) -> [UInt8]? {
        let rig = AliveRig(persona: .ferni, seed: 11)
        rig.still = true
        rig.expression = id
        _ = rig.frame(at: 0.016)
        var u = rig.frame(at: 0.032)
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
        let twins = try Self.nearest().filter { $0.d < Self.twinThreshold && !Self.knownTwins.contains(Pair($0.id, $0.other)) }
        XCTAssertEqual(twins.map { "\(Pair($0.id, $0.other)) (\(String(format: "%.4f", $0.d)))" }, [],
                       "faces that render the same; tell them apart, don't list them")
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
        let faces = try Self.faceCrops()
        let neutral = Self.white(try XCTUnwrap(faces["neutral"]))
        // Anxious keeps its wide (1.05 × 1.06) eyes: FaceTests pins its furrow.
        for id in ["concerned", "worried"] {
            let white = Self.white(try XCTUnwrap(faces[id]))
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

    /// Eye-white samples in a face crop (near-white grey).
    static func white(_ crop: [Float]) -> Int { crop.filter { $0 > 0.8 }.count }

    /// Writes face crops for before/after evidence; skipped without FERNI_AUDIT_DIR.
    func testWriteEvidenceCrops() throws {
        let env = ProcessInfo.processInfo.environment
        guard let dir = env["FERNI_AUDIT_DIR"] else { throw XCTSkip("FERNI_AUDIT_DIR unset") }
        let ids = env["FERNI_AUDIT_IDS"].map { $0.split(separator: ",").map(String.init) } ?? ExpressionTokens.all.keys.sorted()
        let tag = env["FERNI_AUDIT_TAG"] ?? "crop"
        try FileManager.default.createDirectory(atPath: dir, withIntermediateDirectories: true)
        let w = Self.width, h = Self.height
        let r = Int(AvatarView.radius / AvatarView.canvas.width * Double(w))
        let cy = h / 2 + Int(AvatarView.lift / AvatarView.canvas.height * Double(h))
        let box = CGRect(x: w / 2 - r - 8, y: cy - r - 8, width: 2 * r + 16, height: 2 * r + 16)
        let info = CGBitmapInfo(rawValue: CGImageAlphaInfo.premultipliedFirst.rawValue | CGBitmapInfo.byteOrder32Little.rawValue)
        var lines: [String] = []
        for id in ids {
            let bytes = try XCTUnwrap(Self.render(id))
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
