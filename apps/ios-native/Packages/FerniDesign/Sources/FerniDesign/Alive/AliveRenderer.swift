import Metal
import os
import simd

/// Draws Ferni with `AliveShader`: one full-screen triangle, the uniforms as
/// fragment bytes. The pipeline compiles once per process and is shared.
public final class AliveRenderer: @unchecked Sendable {
    public let device: MTLDevice
    let queue: MTLCommandQueue
    let pipeline: MTLRenderPipelineState
    public static let pixelFormat = MTLPixelFormat.bgra8Unorm

    private static let log = Logger(subsystem: "com.sethdford.ferni", category: "avatar")
    private static let built = OSAllocatedUnfairLock<AliveRenderer??>(initialState: nil)

    /// The shared renderer, compiled on first use; nil if this device has no Metal.
    public static var shared: AliveRenderer? {
        built.withLock { cached in
            if let cached { return cached }
            let made = AliveRenderer()
            cached = .some(made)
            return made
        }
    }

    /// Compile ahead of the first frame (call off the main thread at launch).
    public static func warmUp() { _ = shared }

    init?(device: MTLDevice? = MTLCreateSystemDefaultDevice()) {
        guard let device, let queue = device.makeCommandQueue() else { return nil }
        do {
            let library = try device.makeLibrary(source: AliveShader.source, options: nil)
            let desc = MTLRenderPipelineDescriptor()
            desc.vertexFunction = library.makeFunction(name: "aliveVertex")
            desc.fragmentFunction = library.makeFunction(name: "aliveFragment")
            desc.colorAttachments[0].pixelFormat = Self.pixelFormat
            pipeline = try device.makeRenderPipelineState(descriptor: desc)
        } catch {
            Self.log.error("Avatar shader failed: \(error.localizedDescription, privacy: .public)")
            return nil
        }
        self.device = device
        self.queue = queue
    }

    /// Encodes one frame into `pass` (its colour target must be `pixelFormat`).
    public func encode(_ uniforms: AliveUniforms, pass: MTLRenderPassDescriptor, into buffer: MTLCommandBuffer) {
        pass.colorAttachments[0].loadAction = .clear
        pass.colorAttachments[0].clearColor = MTLClearColor(red: 0, green: 0, blue: 0, alpha: 0)
        guard let encoder = buffer.makeRenderCommandEncoder(descriptor: pass) else { return }
        var u = uniforms
        encoder.setRenderPipelineState(pipeline)
        encoder.setFragmentBytes(&u, length: MemoryLayout<AliveUniforms>.stride, index: 0)
        encoder.drawPrimitives(type: .triangle, vertexStart: 0, vertexCount: 3)
        encoder.endEncoding()
    }

    /// Renders one frame to memory: BGRA, premultiplied, row-major from the top.
    /// For tests and still images.
    public func image(_ uniforms: AliveUniforms, width: Int, height: Int) -> [UInt8]? {
        let desc = MTLTextureDescriptor.texture2DDescriptor(
            pixelFormat: Self.pixelFormat, width: width, height: height, mipmapped: false
        )
        desc.usage = [.renderTarget, .shaderRead]
        desc.storageMode = .shared
        guard let texture = device.makeTexture(descriptor: desc), let buffer = queue.makeCommandBuffer() else { return nil }
        let pass = MTLRenderPassDescriptor()
        pass.colorAttachments[0].texture = texture
        pass.colorAttachments[0].storeAction = .store
        encode(uniforms, pass: pass, into: buffer)
        buffer.commit()
        buffer.waitUntilCompleted()
        var bytes = [UInt8](repeating: 0, count: width * height * 4)
        texture.getBytes(&bytes, bytesPerRow: width * 4, from: MTLRegionMake2D(0, 0, width, height), mipmapLevel: 0)
        return bytes
    }
}

public extension AliveUniforms {
    /// The room's light for the light or dark theme (the prototype's key, rim
    /// and fill), with the room colours used for bounce light.
    mutating func light(dark: Bool, roomTop: SIMD3<Float>, roomBottom: SIMD3<Float>) {
        res.w = dark ? 1 : 0
        key = SIMD4(dark ? SIMD3(1.05, 0.93, 0.78) : SIMD3(1.0, 0.96, 0.9), key.w)
        rim = SIMD4(dark ? SIMD3(0.62, 0.50, 0.36) : SIMD3(0.42, 0.40, 0.38), rim.w)
        fill = SIMD4(dark ? SIMD3(0.22, 0.20, 0.18) : SIMD3(0.46, 0.45, 0.43), fill.w)
        bg0 = SIMD4(roomTop, bg0.w)
        bg1 = SIMD4(roomBottom, bg1.w)
    }

    /// Canvas geometry: `size` in pixels, Ferni's radius in pixels, and how far
    /// below the canvas centre Ferni sits (pixels; headroom for hops above).
    mutating func frame(size: SIMD2<Float>, radius: Float, below: Float = 0) {
        res.x = size.x
        res.y = size.y
        fill.w = radius
        key.w = radius / size.y * 5
        rim.w = -below / size.y
    }

    /// A face held still, exactly at its pose: the settled frame the springs
    /// come to rest on (still images, tests).
    static func settled(_ face: Face, body: SIMD3<Float>, glow: SIMD3<Float>) -> AliveUniforms {
        var u = AliveUniforms()
        u.body = SIMD4(body, Float(clamp(face.squash, 0.6, 1.5)))
        u.bg0.w = Float(clamp(face.scale, 0.85, 1.2))
        u.bg1.w = Float(clamp(face.glow, 0, 1.5))
        u.glowCol = SIMD4(glow, Float(clamp(face.blush, 0, 1)))
        u.pos = SIMD4(0, Float(face.posY), 0, Float(face.tilt))
        u.lean = SIMD4(Float(face.roll), 0, 0, Float(clamp(face.crease, 0, 1)))
        u.gaze = SIMD4(Float(face.gx), Float(face.gy), Float(face.gx), Float(face.gy))
        u.eyes = SIMD4(Float(face.left.sx), Float(face.left.sy), Float(face.right.sx), Float(face.right.sy))
        u.arch = SIMD4(Float(clamp(face.left.arch, 0, 1)), Float(clamp(face.right.arch, 0, 1)), Float(clamp(face.halo, 0, 1.2)), 0)
        u.lids = SIMD4(Float(clamp(face.left.top, 0, 1)), Float(clamp(face.right.top, 0, 1)),
                       Float(clamp(face.left.bot, 0, 1)), Float(clamp(face.right.bot, 0, 1)))
        return u
    }
}

/// sRGB hex ("#4a6741") to linear light, as the shader lights in linear.
public func linear(hex: String) -> SIMD3<Float> {
    let h = hex.trimmingCharacters(in: CharacterSet(charactersIn: "#"))
    guard h.count == 6, let v = UInt32(h, radix: 16) else { return SIMD3(1, 0, 1) }
    func lin(_ c: UInt32) -> Float {
        let s = Float(c) / 255
        return s <= 0.04045 ? s / 12.92 : pow((s + 0.055) / 1.055, 2.4)
    }
    return SIMD3(lin(v >> 16 & 0xff), lin(v >> 8 & 0xff), lin(v & 0xff))
}
