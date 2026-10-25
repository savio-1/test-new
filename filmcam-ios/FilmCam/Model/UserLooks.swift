import CoreGraphics
import Foundation
import ImageIO
import UniformTypeIdentifiers

/// Looks made from imported .cube LUTs or graded Hald images (Custom), kept with the app's
/// files: the LUT baked into the app's 33^3 strip (luts/<id>.png) and its tile (<id>.jpg).
enum UserLooks {
    static let prefix = "user_"

    static var dir: URL {
        let d = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("looks")
        try? FileManager.default.createDirectory(at: d, withIntermediateDirectories: true)
        return d
    }

    static func lutURL(_ id: String) -> URL { dir.appendingPathComponent("\(id).png") }

    /// The imported looks, in the order they were added (registers their stocks).
    static func load() -> [FilmCamera] {
        guard let d = UserDefaults.standard.data(forKey: "userLuts"),
              let list = try? JSONDecoder().decode([[String: String]].self, from: d) else { return [] }
        return list.compactMap { e in
            guard let id = e["id"], let name = e["name"], FileManager.default.fileExists(atPath: lutURL(id).path) else { return nil }
            return camera(id, name)
        }
    }

    static func save(_ looks: [FilmCamera]) {
        let list = looks.map { ["id": $0.id, "name": $0.name] }
        if let d = try? JSONEncoder().encode(list) { UserDefaults.standard.set(d, forKey: "userLuts") }
    }

    /// A look for an imported LUT: the LUT alone, nothing added on top.
    static func camera(_ id: String, _ name: String) -> FilmCamera {
        var stock = Spec.shared.stock("neutral")
        stock.id = id
        stock.name = name
        stock.colorGrain = 0
        stock.monochrome = false
        stock.swatch = "#FF8C8C8C"
        Spec.extraStocks[id] = stock
        var look = Spec.shared.original.look
        look.stock = id
        look.halation = 0; look.bloom = 0; look.vignette = 0; look.aberration = 0; look.grain = 0
        return FilmCamera(id: id, name: name, subtitle: "Imported LUT", category: "CUSTOM", look: look)
    }

    static func remove(_ id: String) {
        try? FileManager.default.removeItem(at: lutURL(id))
        try? FileManager.default.removeItem(at: dir.appendingPathComponent("\(id).jpg"))
        Spec.extraStocks.removeValue(forKey: id)
    }

    /// Reads a .cube (or a graded Hald image), bakes it, and returns the new look and whether
    /// some of its colours jump about (a watermark on a Hald image, say).
    static func importFile(_ url: URL) throws -> (FilmCamera, Bool) {
        let scoped = url.startAccessingSecurityScopedResource()
        defer { if scoped { url.stopAccessingSecurityScopedResource() } }
        let data = try Data(contentsOf: url)
        if data.count > 64 * 1024 * 1024 { throw CubeException("That file is too large for a LUT") }
        let ext = url.pathExtension.lowercased()
        let cube: CubeLut
        if ["png", "jpg", "jpeg", "webp", "heic", "tif", "tiff"].contains(ext) {
            guard let src = CGImageSourceCreateWithData(data as CFData, nil), let img = CGImageSourceCreateImageAtIndex(src, 0, nil),
                  let px = argbPixels(img) else { throw CubeException("Couldn't read that image") }
            cube = try CubeLut.fromHald(width: img.width, height: img.height, argb: px)
        } else {
            guard let text = String(data: data, encoding: .utf8) ?? String(data: data, encoding: .isoLatin1) else {
                throw CubeException("That file isn't a .cube LUT this app can read")
            }
            cube = try CubeLut.parse(text)
        }
        let rough = cube.roughness() > 0.004
        let id = prefix + String(Int64(Date().timeIntervalSince1970 * 1000))
        guard let strip = image(argb: cube.toStrip(), width: 33 * 33, height: 33),
              write(strip, to: lutURL(id), type: .png, quality: 1) else { throw CubeException("Couldn't keep the LUT") }
        // Its tile: the Provia tile (close to a phone's own picture) through the LUT.
        if let path = Bundle.main.path(forResource: "fx_provia", ofType: "jpg", inDirectory: "looks"),
           let src = CGImageSourceCreateWithURL(URL(fileURLWithPath: path) as CFURL, nil),
           let base = CGImageSourceCreateImageAtIndex(src, 0, nil), var px = argbPixels(base) {
            for i in px.indices {
                let c = px[i]
                let o = cube.sample(Float((c >> 16) & 255) / 255, Float((c >> 8) & 255) / 255, Float(c & 255) / 255)
                func b(_ v: Float) -> UInt32 { UInt32(max(0, min(255, v * 255 + 0.5))) }
                px[i] = 0xFF00_0000 | b(o.0) << 16 | b(o.1) << 8 | b(o.2)
            }
            if let tile = image(argb: px, width: base.width, height: base.height) {
                _ = write(tile, to: dir.appendingPathComponent("\(id).jpg"), type: .jpeg, quality: 0.88)
            }
        }
        var name = String(url.deletingPathExtension().lastPathComponent.prefix(24))
        if name.trimmingCharacters(in: .whitespaces).isEmpty { name = "Imported" }
        return (camera(id, name), rough)
    }

    /// Pixels as 0xAARRGGBB, row by row from the top.
    private static func argbPixels(_ img: CGImage) -> [UInt32]? {
        let w = img.width, h = img.height
        var px = [UInt32](repeating: 0, count: w * h)
        let ok = px.withUnsafeMutableBytes { buf -> Bool in
            guard let ctx = CGContext(data: buf.baseAddress, width: w, height: h, bitsPerComponent: 8, bytesPerRow: w * 4,
                                      space: CGColorSpaceCreateDeviceRGB(),
                                      bitmapInfo: CGBitmapInfo.byteOrder32Little.rawValue | CGImageAlphaInfo.noneSkipFirst.rawValue) else { return false }
            ctx.draw(img, in: CGRect(x: 0, y: 0, width: w, height: h))
            return true
        }
        return ok ? px.map { $0 | 0xFF00_0000 } : nil
    }

    private static func image(argb: [UInt32], width: Int, height: Int) -> CGImage? {
        let data = argb.withUnsafeBufferPointer { Data(buffer: $0) }
        guard let provider = CGDataProvider(data: data as CFData) else { return nil }
        return CGImage(width: width, height: height, bitsPerComponent: 8, bitsPerPixel: 32, bytesPerRow: width * 4,
                       space: CGColorSpaceCreateDeviceRGB(),
                       bitmapInfo: CGBitmapInfo(rawValue: CGBitmapInfo.byteOrder32Little.rawValue | CGImageAlphaInfo.noneSkipFirst.rawValue),
                       provider: provider, decode: nil, shouldInterpolate: false, intent: .defaultIntent)
    }

    private static func write(_ img: CGImage, to url: URL, type: UTType, quality: Double) -> Bool {
        guard let dest = CGImageDestinationCreateWithURL(url as CFURL, type.identifier as CFString, 1, nil) else { return false }
        CGImageDestinationAddImage(dest, img, [kCGImageDestinationLossyCompressionQuality: quality] as CFDictionary)
        return CGImageDestinationFinalize(dest)
    }
}
