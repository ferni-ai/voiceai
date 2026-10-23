import CoreGraphics
import ImageIO
import simd
import UniformTypeIdentifiers
import XCTest
@testable import FerniDesign

/// A measurement, not a gate: the SPEC's pass test as a machine proxy. With
/// the colour taken away, colourless features of a clip (20 s at home, 4 s
/// listening with a caller's pause, 4 s thinking) are classified by the
/// nearest persona centroid with one seed held out.
///
/// Measured 2026-10-23: it saturates. With persona acting OFF it already
/// tells the six apart 97% of the time (tempo and the thinking spots are
/// enough for a machine), so it can't stand in for the real bar, the
/// Listening Panel (mean at least 40%, every persona at least 30%, chance
/// 16.7%), which people rate. It asserts nothing about that bar. The gates
/// that can fail live in PersonaActingTests, PersonaNodTests,
/// PersonaShapeTests and PersonaQuirkTests.
///
/// With FERNI_SNAPSHOT_DIR it writes the confusions (flag off, on, on with
/// motion only) and a grey strip of the six for the panel; skipped without it.
@MainActor
final class PersonaTellApartTests: XCTestCase {
    static let seeds: [UInt64] = [11, 12, 13, 14, 15]

    /// One clip's colourless features.
    static func features(_ persona: WindowPersona, seed: UInt64, acting: Bool) -> [Double] {
        let rig = AliveRig(persona: persona, seed: seed)
        rig.personaActing = acting
        let fps = 60.0
        var t = 0.0, last = rig.lastBlinkAt, blinks = 0.0, blinkFrames = 0.0, jumps: [Double] = []
        var prev = SIMD2<Double>(rig[.gx].t, rig[.gy].t), squash: [Double] = [], thinkGaze = SIMD2<Double>.zero, thinkN = 0.0
        var nodDepth = 0.0, nodStart: Double?, quirkMove = 0.0, rest = AliveUniforms()
        var u = AliveUniforms()
        // The first quirk may come 10-20 s in: rest at home long enough to show it.
        let idleEnd = 20.0, listenEnd = idleEnd + 4, end = listenEnd + 4
        while t < end {
            t += 1 / fps
            rig.activity = t < idleEnd ? .idle : t < listenEnd ? .listening : .thinking
            rig.personSpeaking = t >= idleEnd && t < idleEnd + 2
            let before = rig.nodsGiven, pitch = rig[.pitch].x, quirks = rig.quirksPlayed
            u = rig.frame(at: t)
            if t < 2 { rest = u; prev = SIMD2(rig[.gx].t, rig[.gy].t); last = rig.lastBlinkAt; continue }
            if rig.lastBlinkAt != last { last = rig.lastBlinkAt; blinks += 1 }
            if rig.blinking { blinkFrames += 1 }
            let g = SIMD2(rig[.gx].t, rig[.gy].t)
            if simd_distance(g, prev) > 0.02 { jumps.append(simd_distance(g, prev)) }
            prev = g
            if t < idleEnd {
                squash.append(rig[.squash].t)
                if rig.quirksPlayed > 0 || quirks > 0 {
                    quirkMove = max(quirkMove, Double(abs(u.lean.x - rest.lean.x) + abs(u.pos.y - rest.pos.y) + abs(u.pos.x - rest.pos.x)
                                                      + abs(u.eyes.y - rest.eyes.y) + abs(u.gaze.y - rest.gaze.y) + abs(u.lids.x - rest.lids.x)))
                }
            } else if t < listenEnd {
                if nodStart == nil, rig.nodsGiven > before { nodStart = pitch }
                if let s = nodStart { nodDepth = max(nodDepth, s - rig[.pitch].x) }
            } else if t > listenEnd + 0.5 {
                thinkGaze += g; thinkN += 1
            }
        }
        let mean = squash.reduce(0, +) / Double(max(squash.count, 1))
        let ups = zip(squash.dropFirst(), squash).filter { $0.1 < mean && $0.0 >= mean }.count
        let tg = thinkN > 0 ? thinkGaze / thinkN : .zero
        return [blinks, blinkFrames / max(blinks, 1), Double(jumps.count), jumps.isEmpty ? 0 : jumps.reduce(0, +) / Double(jumps.count),
                Double(ups), nodDepth, tg.x, tg.y, quirkMove,
                Double(u.caps.w), Double(u.eyes.x) / max(rig[.sxL].x, 1e-3), rig.shape.bodyHeight]
    }

    struct Result { var accuracy: [WindowPersona: Double]; var mean: Double; var confusion: [[Int]] }

    /// The last three features are shape (spacing, eye size, body height), constant per persona.
    static let shapeFeatures = 3

    /// Leave-one-seed-out nearest-centroid on z-scored features; `motionOnly`
    /// drops the shape (which alone would tell them apart, flag on).
    static func tellApart(acting: Bool, motionOnly: Bool = false) -> Result {
        let personas = WindowPersona.allCases
        let clips = personas.map { p in seeds.map { f -> [Double] in
            let all = features(p, seed: f, acting: acting)
            return motionOnly ? Array(all.dropLast(shapeFeatures)) : all
        } }
        let all = clips.flatMap { $0 }, n = all[0].count
        let mu = (0..<n).map { i in all.map { $0[i] }.reduce(0, +) / Double(all.count) }
        let sd = (0..<n).map { i in max(1e-9, (all.map { pow($0[i] - mu[i], 2) }.reduce(0, +) / Double(all.count)).squareRoot()) }
        let z = clips.map { $0.map { f in (0..<n).map { (f[$0] - mu[$0]) / sd[$0] } } }
        var confusion = Array(repeating: Array(repeating: 0, count: personas.count), count: personas.count)
        for (pi, _) in personas.enumerated() {
            for held in seeds.indices {
                let centroids = personas.indices.map { qi -> [Double] in
                    let train = z[qi].enumerated().filter { $0.offset != held }.map(\.element)
                    return (0..<n).map { k in train.map { $0[k] }.reduce(0, +) / Double(train.count) }
                }
                let clip = z[pi][held]
                let guess = centroids.indices.min { a, b in
                    zip(centroids[a], clip).map { ($0 - $1) * ($0 - $1) }.reduce(0, +)
                        < zip(centroids[b], clip).map { ($0 - $1) * ($0 - $1) }.reduce(0, +)
                }!
                confusion[pi][guess] += 1
            }
        }
        var accuracy: [WindowPersona: Double] = [:]
        for (i, p) in personas.enumerated() { accuracy[p] = Double(confusion[i][i]) / Double(seeds.count) }
        return Result(accuracy: accuracy, mean: accuracy.values.reduce(0, +) / Double(personas.count), confusion: confusion)
    }

    func testMeasureTheTellApart() throws {
        guard ProcessInfo.processInfo.environment["FERNI_SNAPSHOT_DIR"] != nil else { throw XCTSkip("FERNI_SNAPSHOT_DIR unset") }
        Self.write(Self.tellApart(acting: false), acting: false, tag: "")
        Self.write(Self.tellApart(acting: true), acting: true, tag: "")
        Self.write(Self.tellApart(acting: true, motionOnly: true), acting: true, tag: "-motion")
    }

    static func write(_ r: Result, acting: Bool, tag: String) {
        guard let dir = ProcessInfo.processInfo.environment["FERNI_SNAPSHOT_DIR"] else { return }
        let names = WindowPersona.allCases.map { "\($0)" }
        var lines = ["machine proxy\(tag), persona acting \(acting ? "ON" : "OFF"): mean \(String(format: "%.0f%%", r.mean * 100)) (chance 17%)"]
        for (i, n) in names.enumerated() {
            lines.append("\(n): \(String(format: "%.0f%%", (r.accuracy[WindowPersona.allCases[i]] ?? 0) * 100))  guessed as \(zip(names, r.confusion[i]).filter { $0.1 > 0 }.map { "\($0.0)×\($0.1)" }.joined(separator: " "))")
        }
        try? lines.joined(separator: "\n").appending("\n").write(toFile: dir + "/tell-apart-\(acting ? "on" : "off")\(tag).txt", atomically: true, encoding: .utf8)
    }

    /// For the panel: the six settled faces in one grey, flag on, in a strip.
    func testRenderTheGreyStripForThePanel() throws {
        guard let dir = ProcessInfo.processInfo.environment["FERNI_SNAPSHOT_DIR"] else { throw XCTSkip("FERNI_SNAPSHOT_DIR unset") }
        let renderer = try XCTUnwrap(AliveRenderer.shared)
        let cell = 240, personas = WindowPersona.allCases, w = cell * personas.count
        var out = [UInt8](repeating: 0, count: w * cell * 4)
        for (column, p) in personas.enumerated() {
            let rig = AliveRig(persona: p, seed: 11)
            rig.still = true
            rig.personaActing = true
            _ = rig.frame(at: 0.016)
            var u = rig.frame(at: 0.032)
            let grey = linear(hex: "#7a7a7a")
            u.body = SIMD4(grey, u.body.w); u.glowCol = SIMD4(grey, u.glowCol.w)
            u.light(dark: false, roomTop: linear(hex: "#faf8f5"), roomBottom: linear(hex: "#efe9e0"))
            u.frame(size: SIMD2(Float(cell), Float(cell)), radius: 70)
            let bytes = try XCTUnwrap(renderer.image(u, width: cell, height: cell))
            let page = [0xf5, 0xf8, 0xfa].map(Double.init)
            for y in 0..<cell { for x in 0..<cell {
                let i = (y * cell + x) * 4, o = (y * w + column * cell + x) * 4, a = Double(bytes[i + 3]) / 255
                for c in 0..<3 { out[o + c] = UInt8(min(255, (Double(bytes[i + c]) + page[c] * (1 - a)).rounded())) }
                out[o + 3] = 255
            } }
        }
        let info = CGBitmapInfo(rawValue: CGImageAlphaInfo.premultipliedFirst.rawValue | CGBitmapInfo.byteOrder32Little.rawValue)
        let image = try XCTUnwrap(CGImage(width: w, height: cell, bitsPerComponent: 8, bitsPerPixel: 32, bytesPerRow: w * 4,
                                          space: CGColorSpace(name: CGColorSpace.sRGB)!, bitmapInfo: info,
                                          provider: try XCTUnwrap(CGDataProvider(data: Data(out) as CFData)),
                                          decode: nil, shouldInterpolate: false, intent: .defaultIntent))
        let dest = try XCTUnwrap(CGImageDestinationCreateWithURL(URL(fileURLWithPath: dir + "/acting-grey-strip.png") as CFURL,
                                                                 UTType.png.identifier as CFString, 1, nil))
        CGImageDestinationAddImage(dest, image, nil)
        XCTAssertTrue(CGImageDestinationFinalize(dest))
    }
}
