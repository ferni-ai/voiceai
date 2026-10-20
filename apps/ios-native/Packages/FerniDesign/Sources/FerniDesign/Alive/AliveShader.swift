import simd

/// Everything one frame of Ferni needs on the GPU. Only float4 slots, so the
/// Swift and Metal layouts are identical by construction (no padding rules).
/// Slot meanings mirror the prototype's uniforms; see `AliveShader.source`.
public struct AliveUniforms: Equatable, Sendable {
    public var res = SIMD4<Float>(1, 1, 0, 0)          // width, height (px), time (s), dark (0/1)
    public var body = SIMD4<Float>(0, 0, 0, 1)         // body colour (linear), squash
    public var bg0 = SIMD4<Float>(0, 0, 0, 1)          // room top (linear), scale
    public var bg1 = SIMD4<Float>(0, 0, 0, 0.3)        // room bottom (linear), glow
    public var glowCol = SIMD4<Float>(0, 0, 0, 0)      // persona light (linear), blush
    public var key = SIMD4<Float>(1, 0.96, 0.9, 1)     // key light, zoom
    public var rim = SIMD4<Float>(0.42, 0.4, 0.38, 0)  // rim light, vertical shift
    public var fill = SIMD4<Float>(0.46, 0.45, 0.43, 1) // fill light, radius in px
    public var pos = SIMD4<Float>(0, 0, 0, 0)          // body position (world), lid tilt
    public var lean = SIMD4<Float>(0, 0, 0, 0)         // roll, pitch, yaw, smile crease
    public var gaze = SIMD4<Float>(0, 0, 0, 0)         // left eye gaze xy, right eye gaze xy
    public var eyes = SIMD4<Float>(1, 1, 1, 1)         // left eye scale xy, right eye scale xy
    public var arch = SIMD4<Float>(0, 0, 0.2, 0)       // arch left, arch right, halo, shear
    public var ring = SIMD4<Float>(0, 1, 0, 0)         // ring y offset, ring scale, guest arch, -
    public var fly = SIMD4<Float>(0, 0, 0, 0)          // firefly position, glow
    public var guest = SIMD4<Float>(0, 0, 0, 0)        // teammate position xy, scale, visible
    public var guestEye = SIMD4<Float>(0, 0, 0, 1)     // teammate gaze xy, blink, squash
    public var guestCol = SIMD4<Float>(0, 0, 0, 0)     // teammate colour (linear)
    public var lids = SIMD4<Float>(0.1, 0.1, 0.06, 0.06) // top left, top right, bottom left, bottom right
    public var poke = SIMD4<Float>(0, 0.3, 0.95, 0)    // where Ferni was touched (dir), amount
    public var tear = SIMD4<Float>(0, 0, 0, 0)         // tear progress left/right, alpha left/right
    public var caps = SIMD4<Float>(0, 0, 0, 0)         // lid cap top, lid cap bottom (web control point / 100), the pitch the face rests at, -

    public init() {}

    static let slots = 22
}

/// The ray-marched Ferni from the owner's alive prototype (WebGL), in Metal:
/// a soft body, Luxo eyes on its surface with curved lids, the happy arch,
/// the web's lid caps (a darker shade of the face), per-eye scale, a teammate for the family
/// table, a firefly's light and tears. Output is premultiplied alpha so the
/// room behind stays SwiftUI's: glow and the presence ring add light, the floor
/// shadow darkens, the body sits on top.
///
/// Compiled at runtime from this source (no build-time Metal toolchain).
public enum AliveShader {
    /// Half the width of the web's lid overlay box, in body radii: the live
    /// overlay (apps/web ferni-expressions.ui.ts, `.avatar-lid-overlay`) is
    /// `inset: 0` on #coachAvatar, the orb itself, so its 100-unit box is the
    /// orb's diameter. (The design-system playground's box is 2.5 radii.)
    public static let lidBox = 1.0

    public static let source = #"""
#include <metal_stdlib>
using namespace metal;

struct U {
  float4 res, body, bg0, bg1, glowCol, key, rim, fill, pos, lean, gaze, eyes, arch, ring, fly, guest, guestEye, guestCol, lids, poke, tear, caps;
};

struct Ctx {
  float3 RB;
  float3 EL, LX, LY, LZ, SL;
  float3 ER, RX, RY, RZ, SR;
};

constant float PI = 3.14159265;

float2x2 rot(float a) { float c = cos(a), s = sin(a); return float2x2(float2(c, s), float2(-s, c)); }
float sdEllipsoid(float3 p, float3 r) { float k0 = length(p / r); float k1 = length(p / (r * r)); return k0 * (k0 - 1.0) / k1; }
float hash21(float2 p) { return fract(sin(dot(p, float2(41.3, 289.1))) * 43758.5453); }

float3 toLocal(float3 p, constant U& u) {
  float3 q = p - u.pos.xyz;
  q.xz = rot(u.lean.z) * q.xz; q.yz = rot(u.lean.y) * q.yz; q.xy = rot(u.lean.x) * q.xy;
  q.x -= u.arch.w * (q.y + 1.0) * 0.5;   // follow-through: the top trails the bottom
  return q / u.bg0.w;
}
float3 onBody(float x, float y, thread const Ctx& c) {
  return float3(x, y, c.RB.z * sqrt(max(0.0, 1.0 - (x * x) / (c.RB.x * c.RB.x) - (y * y) / (c.RB.y * c.RB.y))));
}
// Eyes sit on the surface, oriented along its normal, so they never sink as Ferni looks around.
void eyeFrame(float side, float2 sc, float2 gz, thread const Ctx& cx, thread float3& c, thread float3& ex, thread float3& ey, thread float3& ez, thread float3& es) {
  float3 s = onBody(side * 0.36 + gz.x * 0.15, 0.05 + gz.y * 0.13, cx);
  ez = normalize(s / (cx.RB * cx.RB)); ex = normalize(cross(float3(0.0, 1.0, 0.0), ez)); ey = cross(ez, ex);
  es = float3(0.2 * sc.x, 0.255 * sc.y, 0.085);
  c = s - ez * 0.032;
}
float3 eyeLocal(float3 q, float3 c, float3 ex, float3 ey, float3 ez) { float3 d = q - c; return float3(dot(d, ex), dot(d, ey), dot(d, ez)); }
// Curved lids. top/bot: 0 open .. 1 closed. arch lifts the lower lid's middle into the happy ^.
void lidLines(float3 l, float3 es, float top, float bot, float arch, float inner, float tilt, thread float& tY, thread float& bY) {
  float u = clamp(l.x / es.x, -1.0, 1.0); float e = sqrt(max(0.0, 1.0 - u * u));
  tY = es.y * (mix(e, -e, top) + 0.22 * sin(PI * top) * (1.0 - u * u) + tilt * 0.55 * u * inner);
  bY = es.y * (mix(-e, e, bot) + arch * 1.12 * (1.0 - u * u));
}
float eyeD(float3 l, float3 es, float top, float bot, float arch, float inner, float tilt) {
  float d = sdEllipsoid(l, es); float tY, bY; lidLines(l, es, top, bot, arch, inner, tilt, tY, bY);
  // Where the lids all but meet (a closed eye's corners) there's no eye: a sliver there
  // showed as white specks at the ends of the wink's closed eye.
  return max(max(d, max((l.y - tY) * 0.7, (bY - l.y) * 0.7)), (0.02 - (tY - bY)) * 0.7);   // wider than the edge blend (about 0.012)
}
float bodyD(float3 q, constant U& u, thread const Ctx& c) {
  float3 nq = normalize(q); float3 dp = nq - u.poke.xyz;
  float d = sdEllipsoid(q, c.RB) + 0.0045 * sin(q.x * 5.0 + u.res.z * 1.3) * sin(q.y * 4.0 - u.res.z * 1.1);
  return d + u.poke.w * 0.12 * exp(-dot(dp, dp) * 9.0);      // jelly dent where Ferni was touched
}
float eyeLD(float3 q, constant U& u, thread const Ctx& c) { return eyeD(eyeLocal(q, c.EL, c.LX, c.LY, c.LZ), c.SL, u.lids.x, u.lids.z, u.arch.x, 1.0, u.pos.w); }
float eyeRD(float3 q, constant U& u, thread const Ctx& c) { return eyeD(eyeLocal(q, c.ER, c.RX, c.RY, c.RZ), c.SR, u.lids.y, u.lids.w, u.arch.y, -1.0, u.pos.w); }
float tearD(float3 q, float side, float prog, float a, thread const Ctx& c) {
  if (a < 0.02) return 10.0;
  // From the eye's own lower lid, toward its outer corner, wherever the eye is looking:
  // it used to start below and outside the eye, a speck on the cheek (audit P1 #12).
  float3 ec = side < 0.0 ? c.EL : c.ER; float3 es = side < 0.0 ? c.SL : c.SR;
  float3 s = onBody(ec.x + side * es.x * 0.4, ec.y - es.y * 0.75 - prog * 0.72, c);
  float3 n = normalize(s / (c.RB * c.RB));
  return sdEllipsoid(q - (s + n * 0.012), float3(0.034, 0.05 + prog * 0.02, 0.03) * a);
}
// Where a screen point sits in the lid caps' box (the orb's outline on screen, turned with
// the head's roll), carried along with `face` (a point on the face, body-local) by however
// far the head's pitch, from the pitch the face rests at (caps.z), moves it on the screen.
float2 capPoint(float3 face, float2 cuv, constant U& u, thread const Ctx& c, float zoom, float pxScale) {
  float s = u.bg0.w;
  float3 p = face * s, p0 = p;
  p.xy = rot(-u.lean.x) * p.xy; p.yz = rot(-u.lean.y) * p.yz; p.xz = rot(-u.lean.z) * p.xz;
  p0.xy = rot(-u.lean.x) * p0.xy; p0.yz = rot(-u.caps.z) * p0.yz; p0.xz = rot(-u.lean.z) * p0.xz;
  p += u.pos.xyz; p0 += u.pos.xyz;
  float2 follow = (p.xy / (5.0 - p.z) - p0.xy / (5.0 - p0.z)) * zoom / pxScale;
  // In units of the orb's outline on screen (perspective draws it 5/sqrt(25 - r²) wide).
  return (rot(u.lean.x) * (cuv - follow)) / (s * c.RB.xy) * (sqrt(25.0 - s * s) / 5.0);
}
// A teammate sharing the screen: same body and Luxo eyes, simpler lids (blink and the happy arch).
float2 guestMap(float3 p, constant U& u) {
  if (u.guest.w < 0.5) return float2(10.0, 0.0);
  float3 q = (p - float3(u.guest.xy, 0.0)) / u.guest.z; float k = u.guestEye.w; float3 r = float3(1.0 / sqrt(k), k, 1.0 / sqrt(k));
  float b = sdEllipsoid(q, r), e = 10.0;
  for (int i = 0; i < 2; i++) {
    float side = i == 0 ? -1.0 : 1.0; float x = side * 0.36 + u.guestEye.x * 0.15, y = 0.05 + u.guestEye.y * 0.13;
    float z = r.z * sqrt(max(0.0, 1.0 - x * x / (r.x * r.x) - y * y / (r.y * r.y)));
    float3 c = float3(x, y, z - 0.03); float3 es = float3(0.2, 0.255 * max(0.06, 1.0 - u.guestEye.z), 0.085);
    float de = sdEllipsoid(q - c, es);
    float uu = clamp((q.x - c.x) / es.x, -1.0, 1.0);
    float bY = c.y + es.y * (-sqrt(max(0.0, 1.0 - uu * uu)) + u.ring.z * 1.12 * (1.0 - uu * uu));
    e = min(e, max(de, (bY - q.y) * 0.7));
  }
  return e < b ? float2(e * u.guest.z, 5.0) : float2(b * u.guest.z, 4.0);
}
float2 map(float3 p, constant U& u, thread const Ctx& c) {
  float3 q = toLocal(p, u);
  float b = bodyD(q, u, c), e = min(eyeLD(q, u, c), eyeRD(q, u, c));
  float t = min(tearD(q, -1.0, u.tear.x, u.tear.z, c), tearD(q, 1.0, u.tear.y, u.tear.w, c));
  float2 r = e < b ? float2(e, 2.0) : float2(b, 1.0);
  if (t < r.x) r = float2(t, 3.0);
  r.x *= u.bg0.w;
  float2 g = guestMap(p, u); if (g.x < r.x) r = g;
  return r;
}
float3 calcNormal(float3 p, constant U& u, thread const Ctx& c) {
  const float2 k = float2(1.0, -1.0); const float h = 0.0012;
  return normalize(k.xyy * map(p + k.xyy * h, u, c).x + k.yyx * map(p + k.yyx * h, u, c).x
                 + k.yxy * map(p + k.yxy * h, u, c).x + k.xxx * map(p + k.xxx * h, u, c).x);
}
float calcAO(float3 p, float3 n, constant U& u, thread const Ctx& c) {
  float o = 0.0, s = 1.0;
  for (int i = 0; i < 5; i++) { float h = 0.015 + 0.05 * float(i); o += (h - map(p + n * h, u, c).x) * s; s *= 0.72; }
  return clamp(1.0 - 2.6 * o, 0.0, 1.0);
}
float softbox(float3 r, float sharp) {
  float3 L = normalize(float3(-0.45, 0.62, 0.64)); float3 X = normalize(cross(float3(0.0, 1.0, 0.0), L)); float3 Y = cross(L, X);
  float f = dot(r, L); if (f <= 0.0) return 0.0;
  float2 uv = float2(dot(r, X), dot(r, Y)) / f; float2 e = smoothstep(float2(0.42, 0.26), float2(0.42, 0.26) - sharp, abs(uv));
  return e.x * e.y;
}
float3 aces(float3 x) { return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
float3 gamma(float3 c) { return pow(max(c, 0.0), float3(1.0 / 2.2)); }

struct VOut { float4 position [[position]]; };

vertex VOut aliveVertex(uint vid [[vertex_id]]) {
  float2 p = float2((vid << 1) & 2, vid & 2) * 2.0 - 1.0;   // one triangle that covers the screen
  VOut o; o.position = float4(p, 0.0, 1.0); return o;
}

fragment float4 aliveFragment(VOut in [[stage_in]], constant U& u [[buffer(0)]]) {
  float2 res = u.res.xy;
  float2 frag = float2(in.position.x, res.y - in.position.y);   // GL orientation: y up
  float2 uv = (frag - 0.5 * res) / res.y; uv.y -= u.rim.w;
  float zoom = u.key.w, radiusPx = u.fill.w, uScale = u.bg0.w, dark = u.res.w;
  Ctx c;
  float k = u.body.w; c.RB = float3(1.0 / sqrt(k), k, 1.0 / sqrt(k));
  eyeFrame(-1.0, u.eyes.xy, u.gaze.xy, c, c.EL, c.LX, c.LY, c.LZ, c.SL);
  eyeFrame(1.0, u.eyes.zw, u.gaze.zw, c, c.ER, c.RX, c.RY, c.RZ, c.SR);
  float3 ro = float3(0.0, 0.0, 5.0); float3 rd = normalize(float3(uv, -zoom));
  float2 cuv = float2(uv.x - u.pos.x / 5.0 * zoom, uv.y - u.pos.y / 5.0 * zoom) / (radiusPx / res.y);
  // The web's lid caps (the live overlay, .avatar-lid-overlay over the orb): shapes in a
  // darker shade of the face, over the body and eyes, whose curved edge carries the expression. Its box is
  // 2·B body radii wide; its quadratic edge is y = B - B·cap·(1 - (x/B)²). Flat on the
  // screen like the web's, turning with the head's roll (measured on the body's surface,
  // perspective made every cap about half as deep). Worked out here, before any
  // per-pixel branch, so fwidth gives the edge's true pixel width.
  const float B = \#(lidBox);
  // A lid belongs to the face: the caps follow the head's pitch, carried by as much as
  // it moves the eyes on the screen, so a nod or a look up or down keeps each eye's gap
  // to its cap. Each cap follows a point on the eyes' surface 0.6 of the way up or down,
  // where the lid edges are seen (a point inside the eye moves less under a nod, one on
  // its front more: either let the gap drift 3 px over ±0.1 rad).
  float3 mid = 0.5 * (c.EL + c.ER), up = 0.5 * (c.LY * c.SL.y + c.RY * c.SR.y), out = 0.5 * (c.LZ * c.SL.z + c.RZ * c.SR.z);
  float2 capT = capPoint(mid + 0.6 * up + 0.8 * out, cuv, u, c, zoom, radiusPx / res.y);
  float2 capB = capPoint(mid - 0.6 * up + 0.8 * out, cuv, u, c, zoom, radiusPx / res.y);
  float fallT = 1.0 - (capT.x / B) * (capT.x / B), fallB = 1.0 - (capB.x / B) * (capB.x / B);
  float overTop = capT.y - (B - B * u.caps.x * fallT), underBot = (-B + B * u.caps.y * fallB) - capB.y;
  // Blended over two pixels each side: one left a single grey step (a stair on a curve).
  float fwT = 2.0 * max(fwidth(overTop), 1e-5), fwB = 2.0 * max(fwidth(underBot), 1e-5);
  // A closed-off cap (the web's lids above the orb, Y < 0) draws nothing, not a shaved top.
  float capped = max(step(0.001, u.caps.x) * smoothstep(-fwT, fwT, overTop), step(0.001, u.caps.y) * smoothstep(-fwB, fwB, underBot));

  // The room's light, premultiplied: glow and the presence ring add light (alpha 0), the floor shadow darkens.
  float d0 = length(cuv);
  float3 light = u.glowCol.xyz * (0.05 + 0.22 * u.bg1.w) * exp(-d0 * d0 * 0.42) * mix(0.55, 1.0, dark);
  float ringR = 1.24 * uScale * u.ring.y; float dr = length(cuv - float2(0.0, u.ring.x));
  // Light added over a dark room shows far more after gamma, so in dark mode the ring is
  // scaled down until it shows no more than in light mode: never a target outline (gap 8).
  light += u.glowCol.xyz * u.arch.z * (0.55 * exp(-pow((dr - ringR) / 0.028, 2.0)) * mix(0.8, 0.1, dark)
                                       + 0.18 * exp(-pow((dr - ringR) / 0.12, 2.0)) * mix(0.8, 0.25, dark));
  float shade = 0.0;
  float floorY = -1.18;
  if (rd.y < 0.0) {
    float tf = (floorY - ro.y) / rd.y; float3 fp = ro + rd * tf; float2 dxz = fp.xz - u.pos.xz;
    float hgt = max(0.0, (u.pos.y - k * uScale) - floorY); float rr = (0.8 + hgt * 0.9) * uScale;
    float2 w = dxz / float2(rr, rr * 0.5);
    float s = exp(-dot(w, w) * 1.7) / (1.0 + hgt * 2.2);
    shade = s * mix(0.28, 0.6, dark); light += u.glowCol.xyz * u.bg1.w * s * 0.06;
    if (u.guest.w > 0.5) {
      float2 gd = fp.xz - float2(u.guest.x, 0.0); float gh = max(0.0, (u.guest.y - u.guestEye.w * u.guest.z) - floorY);
      float grr = (0.8 + gh * 0.9) * u.guest.z; float2 w2 = gd / float2(grr, grr * 0.5);
      shade = 1.0 - (1.0 - shade) * (1.0 - exp(-dot(w2, w2) * 1.7) / (1.0 + gh * 2.2) * mix(0.28, 0.6, dark));
    }
  }
  // Added light is what it adds on screen over the room (not gamma(light) alone, which lifts
  // the faintest glow into a visible box), and fades out before the canvas edge.
  float2 edge = abs(frag / res * 2.0 - 1.0);
  float fade = smoothstep(1.0, 0.8, max(edge.x, edge.y));
  float3 roomC = mix(u.bg1.xyz, u.bg0.xyz, frag.y / res.y);
  float4 under = float4((gamma(roomC + light) - gamma(roomC)) * fade, 0.0) + float4(0.0, 0.0, 0.0, shade * fade);

  float3 bc = u.pos.xyz; float R = 1.75 * uScale;
  if (u.guest.w > 0.5) { float3 gp = float3(u.guest.xy, 0.0); bc = (u.pos.xyz + gp) * 0.5; R = 0.5 * length(gp - u.pos.xyz) + 1.75 * max(uScale, u.guest.z); }
  float3 oc = ro - bc; float bb = dot(oc, rd); float cc = dot(oc, oc) - R * R; float disc = bb * bb - cc;
  float4 outc = under;
  if (disc > 0.0) {
    float t = max(0.0, -bb - sqrt(disc)); float tEnd = -bb + sqrt(disc);
    float minD = 1e9, tMin = t; bool hit = false;
    for (int i = 0; i < 96; i++) {
      float2 h = map(ro + rd * t, u, c);
      if (h.x < minD) { minD = h.x; tMin = t; }
      if (h.x < 0.0008) { hit = true; break; }
      t += h.x * 0.85; if (t > tEnd) break;
    }
    float ts = hit ? t : tMin;
    float alpha = hit ? 1.0 : 1.0 - smoothstep(0.0, 1.4 / (res.y * zoom) * ts, minD);
    if (alpha > 0.0) {
      float3 p = ro + rd * ts; float3 n = calcNormal(p, u, c); float3 V = -rd; float3 q = toLocal(p, u);
      float mat = map(p, u, c).y;
      float3 L = normalize(float3(-0.55, 0.72, 0.62)); float3 H = normalize(L + V);
      float ndl = dot(n, L); float ndh = max(dot(n, H), 0.0);
      float fres = pow(1.0 - max(dot(n, V), 0.0), 4.0);
      float ao = calcAO(p, n, u, c);
      float3 key = u.key.xyz, rim = u.rim.xyz, fill = u.fill.xyz, bg1 = u.bg1.xyz;
      float3 col, lidCol = float3(0.0);
      if (mat > 3.5) {
        float wrapG = clamp((ndl + 0.6) / 1.6, 0.0, 1.0);
        if (mat < 4.5) {
          float3 gb = u.guestCol.xyz;
          col = gb * (key * wrapG + fill * (0.55 + 0.45 * n.y) * 0.5 + bg1 * (0.5 - 0.5 * n.y) * 0.5);
          col += gb * float3(0.55, 0.22, 0.08) * pow(1.0 - abs(ndl), 3.0) * 0.45 + key * softbox(reflect(rd, n), 0.25) * 0.025 + rim * fres * 0.4;
        } else {
          col = float3(0.92, 0.91, 0.88) * (key * (0.55 + 0.45 * max(ndl, 0.0)) * 0.8 + fill * 0.5) + key * (pow(ndh, 90.0) * 0.6 + softbox(reflect(rd, n), 0.1) * 0.35);
        }
        col *= mix(0.55, 1.0, ao);
      } else {
        float3 lL = eyeLocal(q, c.EL, c.LX, c.LY, c.LZ), lR = eyeLocal(q, c.ER, c.RX, c.RY, c.RZ);
        float dB = bodyD(q, u, c);
        float dL = eyeD(lL, c.SL, u.lids.x, u.lids.z, u.arch.x, 1.0, u.pos.w), dR = eyeD(lR, c.SR, u.lids.y, u.lids.w, u.arch.y, -1.0, u.pos.w);
        float pxw = 1.5 / (res.y * zoom) * ts / uScale;
        float eyeMix = smoothstep(pxw, -pxw, min(dL, dR) - dB);
        // body: soft, matte, lit through
        float3 base = u.body.xyz;
        float wrap = clamp((ndl + 0.6) / 1.6, 0.0, 1.0);
        float3 cb = base * (key * wrap + fill * (0.55 + 0.45 * n.y) * 0.5 + bg1 * (0.5 - 0.5 * n.y) * 0.5);
        cb += base * float3(0.55, 0.22, 0.08) * pow(1.0 - abs(ndl), 3.0) * 0.45;
        cb += key * (pow(ndh, 14.0) * 0.03 + softbox(reflect(rd, n), 0.25) * 0.025);
        cb += rim * fres * 0.4 + u.glowCol.xyz * u.bg1.w * (1.0 - fres) * 0.09;
        float ch = exp(-pow(length((q.xy - float2(-0.5, -0.2)) / float2(0.17, 0.1)), 2.0)) + exp(-pow(length((q.xy - float2(0.5, -0.2)) / float2(0.17, 0.1)), 2.0));
        // Blush: the cheeks warm toward pink, lit like the body there. Multiplying the
        // green by a warm tint made a brown smudge (expression audit P1 #11).
        float3 lumaW = float3(0.2126, 0.7152, 0.0722);
        float3 pink = float3(0.80, 0.33, 0.36) * (dot(cb, lumaW) / max(dot(base, lumaW), 1e-3));
        cb = mix(cb, pink, u.glowCol.w * ch * step(0.0, q.z) * 0.42);
        for (int s = 0; s < 2; s++) {
          float3 l = s == 0 ? lL : lR; float3 es = s == 0 ? c.SL : c.SR;
          float top = s == 0 ? u.lids.x : u.lids.y, bot = s == 0 ? u.lids.z : u.lids.w, ar = s == 0 ? u.arch.x : u.arch.y;
          float tY, bY; lidLines(l, es, top, bot, ar, s == 0 ? 1.0 : -1.0, u.pos.w, tY, bY);
          float uu = l.x / es.x; float front = step(-0.08, l.z);
          float closed = smoothstep(0.03, -0.01, tY - bY);
          float crease = (1.0 - smoothstep(0.006, 0.016, abs(l.y - max(tY, bY)))) * (1.0 - smoothstep(0.55, 0.85, abs(uu))) * closed * front;
          cb *= 1.0 - 0.32 * crease;   // a closed eye's soft fold, inside the eye; its upturned ends faded out
          // No other strokes near the eyes: the lid-edge highlights and the smile crease
          // under each eye read as eyebrows or floating lower lids (Seth, 2026-10-20). The
          // expression's lids are the caps below, as on the web.
        }
        cb *= mix(0.5, 1.0, ao);
        // eyes: porcelain, shaded by the lid caps above and below
        bool left = dL < dR; float3 l = left ? lL : lR; float3 es = left ? c.SL : c.SR;
        float tY, bY; lidLines(l, es, left ? u.lids.x : u.lids.y, left ? u.lids.z : u.lids.w, left ? u.arch.x : u.arch.y, left ? 1.0 : -1.0, u.pos.w, tY, bY);
        // The white is the eyeball less the lids, each edge blended over a few pixels.
        // The lid cuts are steps in depth the ray lands on one side of, so their blends
        // come from the distance to each lid line, not from which surface the ray hit; that
        // width is the pixel's footprint at this depth (what fwidth would give, but
        // Metal leaves derivatives undefined inside this per-pixel branch). An eye
        // whose lids all but meet stays closed (eyeD's margin).
        float px = 2.5 / (res.y * zoom) * ts / uScale;   // two and a half pixels each side
        // The eyeball's outline keeps its 3D blend: it bulges out of the body, and its
        // shaded side is part of its look.
        float ball = smoothstep(pxw, -pxw, sdEllipsoid(l, es) - dB);
        // Distance to each lid line, not height above it: near the corners the lines
        // turn steep, and a height there changes by more than a pixel per pixel.
        float tY2, bY2; lidLines(l + float3(0.002, 0.0, 0.0), es, left ? u.lids.x : u.lids.y, left ? u.lids.z : u.lids.w, left ? u.arch.x : u.arch.y, left ? 1.0 : -1.0, u.pos.w, tY2, bY2);
        float slopeT = (tY2 - tY) / 0.002, slopeB = (bY2 - bY) / 0.002;
        float lidEdge = min(min((tY - l.y) * rsqrt(1.0 + slopeT * slopeT), (l.y - bY) * rsqrt(1.0 + slopeB * slopeB)), 0.5 * (tY - bY) - 0.01);
        eyeMix = ball * smoothstep(-px, px, lidEdge);
        float lidShade = mix(0.74, 1.0, smoothstep(0.0, 0.06, tY - l.y)) * mix(0.88, 1.0, smoothstep(0.0, 0.05, l.y - bY));
        float3 white = float3(0.92, 0.91, 0.88);
        float3 ce = white * (key * (0.55 + 0.45 * max(ndl, 0.0)) * 0.8 + fill * 0.5) * lidShade;
        ce += key * (pow(ndh, 90.0) * 0.6 + softbox(reflect(rd, n), 0.1) * 0.35) * lidShade;
        // Where the ray landed on the body beside a lid cut, the white blended in is the
        // white at its edge, not one darkened by the body's crease there.
        ce += rim * fres * 0.15; ce *= mix(0.7, 1.0, mat < 1.5 ? 1.0 : ao);
        col = mix(cb, ce, eyeMix);
        // The lid: the web's fill, color-mix(in srgb, persona 82%, natural ink #2c2520), lit
        // like the body under it (the sphere's shading, over the eyeball's bulge too), so it
        // reads as a lid on Ferni, not a hole cut out of him (the web moved away from that).
        float3 lidBase = pow(mix(pow(base, float3(1.0 / 2.2)), float3(0.1725, 0.1451, 0.1255), 0.18), float3(2.2));
        lidCol = cb * lidBase / max(base, float3(1e-4));
        if (u.fly.w > 0.0) {                                             // the firefly's light falls on Ferni
          float3 lv = u.fly.xyz - p; float dd = dot(lv, lv);
          col += float3(0.75, 0.95, 0.4) * u.fly.w * max(dot(n, normalize(lv)), 0.0) * mix(base * 2.2, float3(0.5), eyeMix) / (dd * 1.6 + 0.12);
        }
        if (mat > 2.5 && mat < 3.5) {                                    // a tear: clear water over the body
          col = cb * 0.75 + float3(0.05, 0.07, 0.09) + key * (pow(ndh, 140.0) * 1.4 + softbox(reflect(rd, n), 0.05) * 0.9) + rim * fres * 0.8;
        }
      }
      if (mat < 3.5) col = mix(col, lidCol, capped);   // the lid caps, worked out above; the outline stays round
      col = mix(col, float3(dot(col, float3(0.2126, 0.7152, 0.0722))), 0.08);
      col = gamma(aces(col));
      col += (hash21(frag + fract(u.res.z)) - 0.5) / 255.0;
      outc = float4(col * alpha, alpha) + under * (1.0 - alpha);
    }
  }
  return outc;
}
"""#
}
