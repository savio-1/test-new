import Foundation

/// Looks made from imported .cube LUTs (Custom), kept with the app's files.
enum UserLooks {
    static let prefix = "user_"

    static var dir: URL {
        let d = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("looks")
        try? FileManager.default.createDirectory(at: d, withIntermediateDirectories: true)
        return d
    }
}
