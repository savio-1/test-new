import Foundation

/// Where an SVG path's segments go (a CGPath on the phone, a recorder in tests).
protocol PathSink {
    mutating func move(_ x: Double, _ y: Double)
    mutating func line(_ x: Double, _ y: Double)
    mutating func cubic(_ x1: Double, _ y1: Double, _ x2: Double, _ y2: Double, _ x: Double, _ y: Double)
    mutating func close()
}

/// SVG path data ("M4 10a8 8 0 0 1 13.7-4.3L20 8"): the icons are drawn from the same strings
/// as on Android. Quadratics and arcs arrive as cubics.
enum SvgPath {
    static func parse<S: PathSink>(_ d: String, into sink: inout S) {
        let chars = Array(d.utf8)
        var i = 0
        func skipSeparators() {
            while i < chars.count, chars[i] == 32 || chars[i] == 44 || chars[i] == 9 || chars[i] == 10 || chars[i] == 13 { i += 1 }
        }
        func isNumberStart(_ c: UInt8) -> Bool { (c >= 48 && c <= 57) || c == 45 || c == 43 || c == 46 }
        func number() -> Double? {
            skipSeparators()
            guard i < chars.count, isNumberStart(chars[i]) else { return nil }
            let start = i
            if chars[i] == 45 || chars[i] == 43 { i += 1 }
            var dot = false
            while i < chars.count {
                let c = chars[i]
                if c >= 48 && c <= 57 { i += 1 } else if c == 46 && !dot { dot = true; i += 1 } else { break }
            }
            if i < chars.count, chars[i] == 101 || chars[i] == 69 {
                i += 1
                if i < chars.count, chars[i] == 45 || chars[i] == 43 { i += 1 }
                while i < chars.count, chars[i] >= 48 && chars[i] <= 57 { i += 1 }
            }
            return Double(String(decoding: chars[start..<i], as: UTF8.self))
        }
        /// Arc flags may be written without separators ("a8 8 0 1101 2").
        func flag() -> Double? {
            skipSeparators()
            guard i < chars.count, chars[i] == 48 || chars[i] == 49 else { return nil }
            defer { i += 1 }
            return chars[i] == 49 ? 1 : 0
        }

        var cx = 0.0, cy = 0.0, sx = 0.0, sy = 0.0
        var lastCtrl: (Double, Double)?
        var lastQuad: (Double, Double)?
        var cmd: UInt8 = 0
        while true {
            skipSeparators()
            if i >= chars.count { break }
            let c = chars[i]
            if (c >= 65 && c <= 90) || (c >= 97 && c <= 122) {
                cmd = c
                i += 1
                if cmd == 90 || cmd == 122 {
                    sink.close(); cx = sx; cy = sy; lastCtrl = nil; lastQuad = nil
                    continue
                }
            } else if cmd == 0 {
                i += 1
                continue
            }
            let rel = cmd >= 97
            let ox = rel ? cx : 0, oy = rel ? cy : 0
            switch cmd | 0x20 {
            case 109: // m
                guard let x = number(), let y = number() else { i = chars.count; break }
                cx = ox + x; cy = oy + y; sx = cx; sy = cy
                sink.move(cx, cy)
                cmd = rel ? 108 : 76 // later pairs are lines
                lastCtrl = nil; lastQuad = nil
            case 108: // l
                guard let x = number(), let y = number() else { i = chars.count; break }
                cx = ox + x; cy = oy + y
                sink.line(cx, cy); lastCtrl = nil; lastQuad = nil
            case 104: // h
                guard let x = number() else { i = chars.count; break }
                cx = ox + x
                sink.line(cx, cy); lastCtrl = nil; lastQuad = nil
            case 118: // v
                guard let y = number() else { i = chars.count; break }
                cy = (rel ? cy : 0) + y
                sink.line(cx, cy); lastCtrl = nil; lastQuad = nil
            case 99: // c
                guard let x1 = number(), let y1 = number(), let x2 = number(), let y2 = number(), let x = number(), let y = number()
                else { i = chars.count; break }
                sink.cubic(ox + x1, oy + y1, ox + x2, oy + y2, ox + x, oy + y)
                lastCtrl = (ox + x2, oy + y2); lastQuad = nil
                cx = ox + x; cy = oy + y
            case 115: // s
                guard let x2 = number(), let y2 = number(), let x = number(), let y = number() else { i = chars.count; break }
                let (x1, y1) = lastCtrl.map { (2 * cx - $0.0, 2 * cy - $0.1) } ?? (cx, cy)
                sink.cubic(x1, y1, ox + x2, oy + y2, ox + x, oy + y)
                lastCtrl = (ox + x2, oy + y2); lastQuad = nil
                cx = ox + x; cy = oy + y
            case 113, 116: // q, t
                var qx: Double, qy: Double
                if cmd | 0x20 == 113 {
                    guard let a = number(), let b = number() else { i = chars.count; break }
                    qx = ox + a; qy = oy + b
                } else {
                    (qx, qy) = lastQuad.map { (2 * cx - $0.0, 2 * cy - $0.1) } ?? (cx, cy)
                }
                guard let x = number(), let y = number() else { i = chars.count; break }
                let ex = ox + x, ey = oy + y
                sink.cubic(cx + 2 / 3 * (qx - cx), cy + 2 / 3 * (qy - cy), ex + 2 / 3 * (qx - ex), ey + 2 / 3 * (qy - ey), ex, ey)
                lastQuad = (qx, qy); lastCtrl = nil
                cx = ex; cy = ey
            case 97: // a
                guard let rx = number(), let ry = number(), let rot = number(), let large = flag(), let sweep = flag(),
                      let x = number(), let y = number() else { i = chars.count; break }
                arc(&sink, cx, cy, rx, ry, rot, large != 0, sweep != 0, ox + x, oy + y)
                cx = ox + x; cy = oy + y
                lastCtrl = nil; lastQuad = nil
            default:
                i = chars.count
            }
        }
    }

    /// An elliptical arc as cubics (SVG 1.1, appendix F.6).
    private static func arc<S: PathSink>(_ sink: inout S, _ x1: Double, _ y1: Double, _ rxIn: Double, _ ryIn: Double,
                                         _ angle: Double, _ large: Bool, _ sweep: Bool, _ x2: Double, _ y2: Double) {
        var rx = abs(rxIn), ry = abs(ryIn)
        if rx == 0 || ry == 0 || (x1 == x2 && y1 == y2) { sink.line(x2, y2); return }
        let phi = angle * .pi / 180
        let cosP = cos(phi), sinP = sin(phi)
        let dx = (x1 - x2) / 2, dy = (y1 - y2) / 2
        let x1p = cosP * dx + sinP * dy
        let y1p = -sinP * dx + cosP * dy
        let lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry)
        if lambda > 1 { rx *= lambda.squareRoot(); ry *= lambda.squareRoot() }
        let num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p
        let den = rx * rx * y1p * y1p + ry * ry * x1p * x1p
        var k = (max(0, num) / den).squareRoot()
        if large == sweep { k = -k }
        let cxp = k * rx * y1p / ry
        let cyp = -k * ry * x1p / rx
        let cx = cosP * cxp - sinP * cyp + (x1 + x2) / 2
        let cy = sinP * cxp + cosP * cyp + (y1 + y2) / 2
        func ang(_ ux: Double, _ uy: Double, _ vx: Double, _ vy: Double) -> Double {
            let a = atan2(ux * vy - uy * vx, ux * vx + uy * vy)
            return a
        }
        let theta1 = ang(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry)
        var delta = ang((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry)
        if !sweep && delta > 0 { delta -= 2 * .pi } else if sweep && delta < 0 { delta += 2 * .pi }
        let segments = max(1, Int((abs(delta) / (.pi / 2)).rounded(.up)))
        let step = delta / Double(segments)
        let t = 4.0 / 3.0 * tan(step / 4)
        var a = theta1
        func point(_ a: Double) -> (Double, Double) {
            let ex = rx * cos(a), ey = ry * sin(a)
            return (cosP * ex - sinP * ey + cx, sinP * ex + cosP * ey + cy)
        }
        func deriv(_ a: Double) -> (Double, Double) {
            let ex = -rx * sin(a), ey = ry * cos(a)
            return (cosP * ex - sinP * ey, sinP * ex + cosP * ey)
        }
        for s in 0..<segments {
            let b = a + step
            let p0 = point(a), d0 = deriv(a)
            let p3 = s == segments - 1 ? (x2, y2) : point(b)
            let d3 = deriv(b)
            sink.cubic(p0.0 + t * d0.0, p0.1 + t * d0.1, p3.0 - t * d3.0, p3.1 - t * d3.1, p3.0, p3.1)
            a = b
        }
    }
}
