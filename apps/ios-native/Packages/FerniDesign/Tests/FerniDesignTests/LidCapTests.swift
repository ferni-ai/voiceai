import XCTest
@testable import FerniDesign

/// Seth, on build .57 (2026-10-20): "the eyebrow eyelid problem is still
/// there": thin pale arcs under each eye (the smile-crease stroke) and light
/// lines along the lid edges read as brows or floating lower lids. The web has
/// no strokes there; its lids are caps in a darker shade of the face whose
/// curved edge carries the expression (apps/web ferni-expressions.ui.ts,
/// .avatar-lid-overlay). So: nothing drawn on the body outside the eyes, and
/// the caps visible where the web's lids close, on a round orb.
@MainActor
final class LidCapTests: XCTestCase {
    typealias Render = (bytes: [UInt8], w: Int, h: Int, u: AliveUniforms)

    static func render(_ id: String, tears: Bool = true, caps: Bool = true) throws -> Render {
        let rig = AliveRig(persona: .ferni, seed: 11)
        rig.still = true
        rig.expression = id
        _ = rig.frame(at: 0.016)
        var u = rig.frame(at: 0.032)
        if !tears { u.tear = .zero }
        if !caps { u.caps = .zero }
        u.light(dark: false, roomTop: linear(hex: "#faf8f5"), roomBottom: linear(hex: "#efe9e0"))
        let w = ExpressionDistinctnessTests.width, h = ExpressionDistinctnessTests.height
        u.frame(size: SIMD2(Float(w), Float(h)), radius: Float(AvatarView.radius / AvatarView.canvas.width) * Float(w),
                below: Float(AvatarView.lift / AvatarView.canvas.width) * Float(w))
        let bytes = try XCTUnwrap(AliveRenderer.shared?.image(u, width: w, height: h))
        return (bytes, w, h, u)
    }

    /// Luma of the pixel over the light room (#faf8f5): the render is
    /// premultiplied BGRA with the room left transparent.
    static func luma(_ r: Render, _ x: Int, _ y: Int) -> Double {
        let i = (y * r.w + x) * 4, a = Double(r.bytes[i + 3]) / 255
        let b = Double(r.bytes[i]) / 255 + (1 - a) * 0.961, g = Double(r.bytes[i + 1]) / 255 + (1 - a) * 0.973
        let red = Double(r.bytes[i + 2]) / 255 + (1 - a) * 0.98
        return 0.0722 * b + 0.7152 * g + 0.2126 * red
    }

    static func opaque(_ r: Render, _ x: Int, _ y: Int) -> Bool { r.bytes[(y * r.w + x) * 4 + 3] == 255 }

    /// Is pixel (x, y) within an eye's ellipse, grown by `grow`? The eyes sit at
    /// ±0.36 (plus gaze) on the surface, 0.2 × 0.255 body radii, magnified by
    /// the perspective of the surface they sit on (about 1.2).
    static func nearEye(_ r: Render, _ x: Int, _ y: Int, grow: Double) -> Bool {
        let u = r.u, radius = Double(u.fill.w), scale = Double(u.bg0.w), k = 1.2
        let cx = Double(r.w) / 2 + Double(u.pos.x) * radius
        let cy = Double(r.h) / 2 - Double(u.rim.w) * Double(r.h) - Double(u.pos.y) * radius
        // The shader's world-to-local turn: local = R(roll) · world, R = [[c, -s], [s, c]].
        let c = cos(Double(u.lean.x)), s = sin(Double(u.lean.x))
        for (side, gaze, size) in [(-1.0, SIMD2(u.gaze.x, u.gaze.y), SIMD2(u.eyes.x, u.eyes.y)),
                                    (1.0, SIMD2(u.gaze.z, u.gaze.w), SIMD2(u.eyes.z, u.eyes.w))] {
            let lx = (side * 0.36 + Double(gaze.x) * 0.15) * scale * k, ly = (0.05 + Double(gaze.y) * 0.13) * scale * k
            // The pixel, as a local offset from this eye's centre (screen y runs down).
            let wx = (Double(x) - cx) / radius, wy = (cy - Double(y)) / radius
            let px = c * wx - s * wy - lx, py = s * wx + c * wy - ly
            let rx = (0.2 * Double(size.x) * scale * k * radius * grow + 2) / radius
            let ry = (0.255 * Double(size.y) * scale * k * radius * grow + 2) / radius
            if (px / rx) * (px / rx) + (py / ry) * (py / ry) <= 1 { return true }
        }
        return false
    }

    /// The eye whites as drawn, with their blended edges: connected patches of
    /// opaque pixels lighter than his green ever gets (`isWhite`'s reasoning),
    /// keeping each patch at least a quarter the size of the biggest (a thin
    /// stroke never is), grown by `reach` pixels (a square dilation).
    static func whites(_ r: Render, reach: Int) -> [Bool] {
        var label = [Int](repeating: -1, count: r.w * r.h)
        func white(_ i: Int) -> Bool {
            r.bytes[i * 4 + 3] == 255 && min(r.bytes[i * 4], r.bytes[i * 4 + 1], r.bytes[i * 4 + 2]) > 150
        }
        var areas: [Int] = []
        for start in 0..<(r.w * r.h) where label[start] < 0 && white(start) {
            var stack = [start], area = 0
            label[start] = areas.count
            while let i = stack.popLast() {
                area += 1
                let x = i % r.w, y = i / r.w
                for (nx, ny) in [(x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)] where nx >= 0 && ny >= 0 && nx < r.w && ny < r.h {
                    let n = ny * r.w + nx
                    if label[n] < 0 && white(n) { label[n] = areas.count; stack.append(n) }
                }
            }
            areas.append(area)
        }
        let biggest = areas.max() ?? 0
        let eye = label.map { $0 >= 0 && areas[$0] * 4 >= biggest }
        // Grow along rows, then columns.
        var rows = [Bool](repeating: false, count: r.w * r.h), out = rows
        for y in 0..<r.h { for x in 0..<r.w where eye[y * r.w + x] {
            for dx in max(0, x - reach)...min(r.w - 1, x + reach) { rows[y * r.w + dx] = true }
        } }
        for y in 0..<r.h { for x in 0..<r.w where rows[y * r.w + x] {
            for dy in max(0, y - reach)...min(r.h - 1, y + reach) { out[dy * r.w + x] = true }
        } }
        return out
    }

    /// The sharpest thin line on the body away from the eyes: the largest
    /// vertical second difference of luma over fully opaque pixels (3 px from
    /// any edge) more than 5 px from any eye white (the measure reaches 2 px
    /// either side; a lid's soft shadow 3 more) and, for a closed eye, outside
    /// where the rig puts it.
    static func strokeStrength(_ r: Render) -> (value: Double, x: Int, y: Int) {
        let atEye = whites(r, reach: 5)
        var best = (value: 0.0, x: 0, y: 0)
        for y in 4..<(r.h - 4) {
            for x in 4..<(r.w - 4) {
                guard (-3...3).allSatisfy({ opaque(r, x, y + $0) && opaque(r, x + $0, y) }) else { continue }
                if atEye[y * r.w + x] || nearEye(r, x, y, grow: 1.0) { continue }
                let d = abs(luma(r, x, y - 2) - 2 * luma(r, x, y) + luma(r, x, y + 2))
                if d > best.value { best = (d, x, y) }
            }
        }
        return best
    }

    /// No lid or crease stroke is drawn outside an eye, on any face. Tears are
    /// left out: water, not a line (expression audit P1 #12 moves them to the
    /// lid); so are the lid caps, whose edge is meant to show (tested below).
    func testNothingIsDrawnOnTheBodyOutsideTheEyes() throws {
        guard AliveRenderer.shared != nil else { throw XCTSkip("no Metal device") }
        var worst: [String] = []
        for id in ExpressionTokens.all.keys.sorted() {
            let s = Self.strokeStrength(try Self.render(id, tears: false, caps: false))
            if s.value > Self.strokeLimit { worst.append("\(id) \(String(format: "%.3f", s.value)) at \(s.x),\(s.y)") }
        }
        XCTAssertEqual(worst, [], "a line on the body away from the eyes")
    }

    /// A shut eye is shut to its corners: no specks of white where the lids
    /// all but meet (the wink's closed eye had a white tick at each end).
    func testAClosedEyeShowsNoWhiteAtItsCorners() throws {
        guard AliveRenderer.shared != nil else { throw XCTSkip("no Metal device") }
        for id in ["winking", "yawning"] {
            let r = try Self.render(id)
            // The face, not the rim light along his outline.
            let u = r.u, radius = Double(u.fill.w * u.bg0.w)
            let cx = Double(r.w) / 2 + Double(u.pos.x) * Double(u.fill.w)
            let cy = Double(r.h) / 2 - Double(u.rim.w) * Double(r.h) - Double(u.pos.y) * Double(u.fill.w)
            func onFace(_ i: Int) -> Bool { hypot(Double(i % r.w) - cx, Double(i / r.w) - cy) < 0.8 * radius }
            var patches = 0, seen = Set<Int>(), at: [String] = []
            for start in 0..<(r.w * r.h) where onFace(start) && !seen.contains(start) && Self.isWhite(r, start) {
                patches += 1
                at.append("\(start % r.w),\(start / r.w)")
                var stack = [start]
                seen.insert(start)
                while let i = stack.popLast() {
                    for n in [i + 1, i - 1, i + r.w, i - r.w] where n >= 0 && n < r.w * r.h && !seen.contains(n) && Self.isWhite(r, n) {
                        seen.insert(n); stack.append(n)
                    }
                }
            }
            // A wink's closed eye is a thin arc of white, one patch like an open eye.
            let open = [Face.of(id).left, Face.of(id).right].filter { $0.top < 1 }.count
            XCTAssertEqual(patches, open, "\(id): white at \(at); one patch per eye that isn't shut, no specks")
        }
    }

    /// Lighter than any of his green ever gets (its darkest channel tops out
    /// near 111 under the key light; the corner specks measured 141-147).
    static func isWhite(_ r: Render, _ i: Int) -> Bool {
        r.bytes[i * 4 + 3] == 255 && min(r.bytes[i * 4], r.bytes[i * 4 + 1], r.bytes[i * 4 + 2]) > 128
    }

    /// Body shading and blush bend gently; Seth's stroke and the lid-edge
    /// highlights measured far above this (2026-10-20).
    static let strokeLimit = 0.04

    /// The lid caps are the web's: as deep as its overlay's edges, a darker
    /// shade of the face over a round orb. The orb keeps its outline (the web
    /// moved away from page-colour lids that cut a crescent out of it), and
    /// the lid's edge is a visible step down in luma.
    func testTheCapsAreAsDeepAsTheWebsOnARoundOrb() throws {
        guard let renderer = AliveRenderer.shared else { throw XCTSkip("no Metal device") }
        for (id, bottom) in [("sleepy", true), ("drowsy", true), ("exhausted", false), ("happy", false)] {
            let r = try Self.render(id)
            var flat = r.u
            flat.caps = .zero
            let round: Render = (try XCTUnwrap(renderer.image(flat, width: r.w, height: r.h)), r.w, r.h, flat)
            // The outline: every pixel's alpha as without the lids.
            let moved = zip(stride(from: 3, to: r.bytes.count, by: 4).map { r.bytes[$0] }, stride(from: 3, to: round.bytes.count, by: 4).map { round.bytes[$0] })
                .map { abs(Int($0) - Int($1)) }.max() ?? 0
            XCTAssertLessThanOrEqual(moved, 2, "\(id): the lids change the outline by \(moved) alpha levels")
            // Down the middle: the lid is where the face is darker than without it.
            let x = r.w / 2, face = Face.of(id)
            let solid = (0..<r.h).filter { r.bytes[($0 * r.w + x) * 4 + 3] == 255 }
            let first = try XCTUnwrap(solid.first, id), last = try XCTUnwrap(solid.last, id)
            func darker(_ y: Int) -> Bool { Self.luma(round, x, y) - Self.luma(r, x, y) > 0.01 }
            let lidEnd = try XCTUnwrap((first...last).first { !darker($0) }, "\(id): no lid at the top")
            let scale = Double(r.u.bg0.w), px = Double(r.u.fill.w) * scale * Double(r.u.body.w) * 5 / (25 - scale * scale).squareRoot()
            let box = AliveShader.lidBox, web = (1 - (box - box * face.capTop)) * px
            XCTAssertEqual(Double(lidEnd - first), web, accuracy: 4, "\(id): the lid comes \(lidEnd - first) px down; the web's \(Int(web))")
            let lid = Self.luma(r, x, lidEnd - 5), body = Self.luma(r, x, lidEnd + 5)
            XCTAssertGreaterThan(body - lid, Self.lidStep, "\(id): lid \(lid) against body \(body) at its edge")
            if bottom {
                let lidStart = try XCTUnwrap((first...last).reversed().first { !darker($0) }, id)
                let webBottom = (1 - (box - box * face.capBottom)) * px
                XCTAssertEqual(Double(last - lidStart), webBottom, accuracy: 4, "\(id): the bottom lid comes \(last - lidStart) px up")
            }
        }
    }

    /// The lid's shade (18% toward the web's ink) against the face beside it.
    static let lidStep = 0.03

    /// A face with no cap keeps its round top: the cap's edge at rest sits on
    /// the orb's outline, and drawing it anyway shaved a flat top (listening,
    /// speaking, 2026-10-20).
    func testAFaceWithoutACapKeepsItsRoundTop() throws {
        guard let renderer = AliveRenderer.shared else { throw XCTSkip("no Metal device") }
        for id in ["neutral", "listening", "speaking"] {
            let r = try Self.render(id)
            var away = r.u
            away.caps = SIMD4(-1, -1, 0, 0)   // edges far outside the orb
            let round = try XCTUnwrap(renderer.image(away, width: r.w, height: r.h))
            var worst = 0
            for y in 0..<r.h { for x in stride(from: r.w / 4, to: 3 * r.w / 4, by: 2) {
                worst = max(worst, abs(Int(r.bytes[(y * r.w + x) * 4 + 3]) - Int(round[(y * r.w + x) * 4 + 3])))
            } }
            XCTAssertLessThanOrEqual(worst, 2, "\(id): the outline moves by \(worst) alpha levels")
        }
    }

    /// The live web overlay is `inset: 0` on the orb (#coachAvatar), so its
    /// 100-unit box is the orb's diameter: one body radius each side.
    func testTheLidBoxIsTheLiveOverlays() {
        XCTAssertEqual(AliveShader.lidBox, 1.0)
        XCTAssertTrue(AliveShader.source.contains("const float B = 1.0;"), "the shader uses it")
    }

    /// Every lid and cap edge is blended, not stair-stepped: crossing one,
    /// at least two pixels sit between the two sides.
    func testEveryLidAndCapEdgeIsBlended() throws {
        guard AliveRenderer.shared != nil else { throw XCTSkip("no Metal device") }
        // The caps, top and bottom, down the middle of sleepy: how much darker each
        // pixel is than without the lid (the dither cancels), between lid and face.
        guard let renderer = AliveRenderer.shared else { return }
        let sleepy = try Self.render("sleepy")
        var flat = sleepy.u
        flat.caps = .zero
        let round: Render = (try XCTUnwrap(renderer.image(flat, width: sleepy.w, height: sleepy.h)), sleepy.w, sleepy.h, flat)
        let x = sleepy.w / 2
        let shade = (0..<sleepy.h).map { Self.luma(round, x, $0) - Self.luma(sleepy, x, $0) }
        let solid = (0..<sleepy.h).filter { sleepy.bytes[($0 * sleepy.w + x) * 4 + 3] == 255 }
        let first = try XCTUnwrap(solid.first), last = try XCTUnwrap(solid.last)
        for (name, rows) in [("top", Array(first...(first + (last - first) / 2))), ("bottom", Array(((first + last) / 2...last).reversed()))] {
            let lid = shade[rows[3]], edge = try XCTUnwrap(rows.firstIndex { shade[$0] < lid / 2 }, name)
            let around = rows[max(0, edge - 4)...min(rows.count - 1, edge + 4)].map { shade[$0] }
            let blended = around.filter { $0 > 0.1 * lid && $0 < 0.9 * lid }.count
            XCTAssertGreaterThanOrEqual(blended, 2, "the \(name) lid's edge: \(around.map { String(format: "%.3f", $0) })")
        }
        // The lid cut on an eye white: wise's lifted lower lid (a flat bottom), and
        // sleepy's top lid, down the middle of the left eye.
        for (id, edge) in [("wise", "bottom"), ("sleepy", "top")] {
            let r = try Self.render(id)
            func level(_ x: Int, _ y: Int) -> Int {
                let i = (y * r.w + x) * 4
                return Int(min(r.bytes[i], r.bytes[i + 1], r.bytes[i + 2]))
            }
            var xs: [Int] = [], ys: [Int] = []  // the left eye's white
            for y in 0..<r.h { for x in 0..<(r.w / 2) where r.bytes[(y * r.w + x) * 4 + 3] == 255 && level(x, y) > 190 { xs.append(x); ys.append(y) } }
            let cx = xs.reduce(0, +) / max(xs.count, 1)
            let column = ys.indices.filter { xs[$0] == cx }.map { ys[$0] }
            let mid = column.reduce(0, +) / max(column.count, 1), step = edge == "bottom" ? 1 : -1
            // Out from the middle of the white, the edge is the steepest drop; its two
            // sides are a few pixels either way (the lid's own shading varies slowly).
            let profile = (0..<70).map { level(cx, mid + $0 * step) }
            let e = try XCTUnwrap((3..<60).max { profile[$0] - profile[$0 + 1] < profile[$1] - profile[$1 + 1] }, id)
            let inside = Double(profile[e - 3]), outside = Double(profile[e + 4]), gap = inside - outside
            let between = profile[(e - 2)...(e + 3)].filter { Double($0) > outside + 0.1 * gap && Double($0) < inside - 0.1 * gap }
            XCTAssertGreaterThanOrEqual(between.count, 2, "\(id) \(edge) lid: \(Array(profile[(e - 3)...(e + 4)]))")
        }
    }

    /// The caps move like the web's (d 0.25-0.3 s, cubic-bezier(0.34, 1.56,
    /// 0.64, 1)): they spring a little past the new lid and settle, near the
    /// web's timing.
    func testTheCapsOvershootAndSettleLikeTheWebs() {
        let rig = AliveRig(persona: .ferni, seed: 11)
        rig.expression = "neutral"
        var t = 0.0
        while t < 1 { t += 1.0 / 60; _ = rig.frame(at: t) }
        rig.expression = "sleepy"
        let start = t, target = Face.of("sleepy").capTop
        var trace: [(t: Double, v: Double)] = []
        while t < start + 1.2 { t += 1.0 / 60; _ = rig.frame(at: t); trace.append((t - start, rig[.capT].x)) }
        let peak = trace.max { $0.v < $1.v }!
        XCTAssertGreaterThan(peak.v, target * 1.05, "springs past the new lid")
        XCTAssertLessThan(peak.v, target * 1.2, "but not far: the web's curve peaks about 10% over")
        XCTAssertEqual(peak.t, 0.25, accuracy: 0.1, "peaks when the web's does")
        XCTAssertEqual(trace.last!.v, target, accuracy: 0.01, "and settles")
    }

    /// Prints where the eye whites are vs where `nearEye` thinks (FERNI_AUDIT_PRINT=1).
    func testPrintEyeGeometry() throws {
        guard ProcessInfo.processInfo.environment["FERNI_AUDIT_PRINT"] != nil else { throw XCTSkip("FERNI_AUDIT_PRINT unset") }
        for id in ["neutral", "curious", "surprised"] {
            let r = try Self.render(id)
            var minX = [Int.max, Int.max], maxX = [0, 0], minY = [Int.max, Int.max], maxY = [0, 0]
            for y in 0..<r.h { for x in 0..<r.w {
                let i = (y * r.w + x) * 4
                guard r.bytes[i + 3] == 255, min(r.bytes[i], r.bytes[i + 1], r.bytes[i + 2]) > 200 else { continue }
                let e = x < r.w / 2 ? 0 : 1
                minX[e] = min(minX[e], x); maxX[e] = max(maxX[e], x); minY[e] = min(minY[e], y); maxY[e] = max(maxY[e], y)
            } }
            let inside = (0..<2).map { e in Self.nearEye(r, (minX[e] + maxX[e]) / 2, (minY[e] + maxY[e]) / 2, grow: 0.3) }
            let corners = (0..<2).map { e in [Self.nearEye(r, minX[e], (minY[e] + maxY[e]) / 2, grow: 1.08), Self.nearEye(r, maxX[e], (minY[e] + maxY[e]) / 2, grow: 1.08), Self.nearEye(r, (minX[e] + maxX[e]) / 2, minY[e], grow: 1.08), Self.nearEye(r, (minX[e] + maxX[e]) / 2, maxY[e], grow: 1.08)] }
            print("EYES\t\(id)\twhites x \(minX)-\(maxX) y \(minY)-\(maxY)\tcentre inside \(inside)\tedges inside \(corners)\tw \(r.w) h \(r.h) radius \(r.u.fill.w) rimw \(r.u.rim.w)")
        }
    }

    /// Prints each face's strongest line away from the eyes (FERNI_AUDIT_PRINT=1).
    func testPrintStrokes() throws {
        guard ProcessInfo.processInfo.environment["FERNI_AUDIT_PRINT"] != nil else { throw XCTSkip("FERNI_AUDIT_PRINT unset") }
        for id in ExpressionTokens.all.keys.sorted() {
            let s = Self.strokeStrength(try Self.render(id, tears: false, caps: false))
            print("STROKE\t\(id)\t\(String(format: "%.4f", s.value))\t\(s.x),\(s.y)")
        }
    }

    /// The everyday faces keep a round top (neutral, listening, speaking), as on
    /// the web; caps come from the live overlay's table.
    func testEverydayFacesHaveNoCap() {
        for id in ["neutral", "listening", "speaking", "winking"] {
            XCTAssertEqual(Face.of(id).capTop, 0, id)
            XCTAssertEqual(Face.of(id).capBottom, 0, id)
        }
        // The web's attentive lid: a 5% sliver.
        XCTAssertEqual(Face.of("attentive").capTop, 0.05, accuracy: 1e-9)
        // Ids the web overlay draws use its table, not the tokens (neutral's token curve is 12).
        XCTAssertEqual(Face.of("happy").capTop, 0.25, accuracy: 1e-9)
        XCTAssertEqual(Face.of("happy").capBottom, 0.15, accuracy: 1e-9)
        XCTAssertEqual(Face.of("sleepy").capBottom, 0.3, accuracy: 1e-9)
    }
}
