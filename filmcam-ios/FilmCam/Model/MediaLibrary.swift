import AVFoundation
import Photos
import UIKit

/// A photo or clip made (or developed) with S film.
struct MediaItem: Identifiable, Equatable {
    let asset: PHAsset
    var id: String { asset.localIdentifier }
    var isVideo: Bool { asset.mediaType == .video }
    var date: Date { asset.creationDate ?? .distantPast }
    var durationMs: Int64 { Int64(asset.duration * 1000) }
    var width: Int { asset.pixelWidth }
    var height: Int { asset.pixelHeight }

    static func == (a: MediaItem, b: MediaItem) -> Bool { a.id == b.id }
}

/// The look a take was made with ("" id for none).
struct LookRecord: Codable, Equatable {
    var id: String
    var name: String
}

/// S film's own album in Photos: everything the app saves goes in it, and the gallery lists it.
/// The look each take was made with is kept beside it, by asset id.
enum MediaLibrary {
    static let albumTitle = "S film"

    private static var recordsURL: URL {
        let dir = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir.appendingPathComponent("looks.json")
    }

    private static let lock = NSLock()
    private static var records: [String: LookRecord] = {
        guard let d = try? Data(contentsOf: recordsURL), let r = try? JSONDecoder().decode([String: LookRecord].self, from: d) else { return [:] }
        return r
    }()

    static func look(of item: MediaItem) -> LookRecord? {
        lock.lock(); defer { lock.unlock() }
        return records[item.id]
    }

    private static func remember(_ id: String, _ look: LookRecord?) {
        guard let look else { return }
        lock.lock()
        records[id] = look
        let snapshot = records
        lock.unlock()
        if let d = try? JSONEncoder().encode(snapshot) { try? d.write(to: recordsURL, options: .atomic) }
    }

    /// Full access (to list the album); saving alone works with add-only access.
    static func requestAccess(_ done: @escaping (Bool) -> Void) {
        PHPhotoLibrary.requestAuthorization(for: .readWrite) { s in
            DispatchQueue.main.async { done(s == .authorized || s == .limited) }
        }
    }

    static var canRead: Bool {
        let s = PHPhotoLibrary.authorizationStatus(for: .readWrite)
        return s == .authorized || s == .limited
    }

    private static func album() -> PHAssetCollection? {
        let opts = PHFetchOptions()
        opts.predicate = NSPredicate(format: "title = %@", albumTitle)
        return PHAssetCollection.fetchAssetCollections(with: .album, subtype: .any, options: opts).firstObject
    }

    /// Saves a new asset (with [build]) into the album; [done] gets its item, on the main thread.
    static func save(look: LookRecord?, _ build: @escaping (PHAssetCreationRequest) -> Void,
                     done: @escaping (MediaItem?) -> Void) {
        PHPhotoLibrary.requestAuthorization(for: .readWrite) { status in
            let full = status == .authorized || status == .limited
            if !full {
                // Add-only: the picture is saved, it just can't be listed in the gallery.
                PHPhotoLibrary.requestAuthorization(for: .addOnly) { s2 in
                    guard s2 == .authorized || s2 == .limited else { DispatchQueue.main.async { done(nil) }; return }
                    PHPhotoLibrary.shared().performChanges({ build(PHAssetCreationRequest.forAsset()) }) { _, _ in
                        DispatchQueue.main.async { done(nil) }
                    }
                }
                return
            }
            var placeholder: PHObjectPlaceholder?
            let existing = album()
            PHPhotoLibrary.shared().performChanges({
                let req = PHAssetCreationRequest.forAsset()
                build(req)
                placeholder = req.placeholderForCreatedAsset
                guard let ph = placeholder else { return }
                if let existing {
                    PHAssetCollectionChangeRequest(for: existing)?.addAssets([ph] as NSArray)
                } else {
                    PHAssetCollectionChangeRequest.creationRequestForAssetCollection(withTitle: albumTitle).addAssets([ph] as NSArray)
                }
            }) { ok, _ in
                guard ok, let id = placeholder?.localIdentifier,
                      let asset = PHAsset.fetchAssets(withLocalIdentifiers: [id], options: nil).firstObject else {
                    DispatchQueue.main.async { done(nil) }
                    return
                }
                remember(id, look)
                DispatchQueue.main.async { done(MediaItem(asset: asset)) }
            }
        }
    }

    static func savePhoto(_ data: Data, raw: Data? = nil, look: LookRecord?, done: @escaping (MediaItem?) -> Void) {
        save(look: look, { req in
            req.addResource(with: .photo, data: data, options: nil)
            if let raw { req.addResource(with: .alternatePhoto, data: raw, options: nil) }
        }, done: done)
    }

    static func saveVideo(_ url: URL, look: LookRecord?, done: @escaping (MediaItem?) -> Void) {
        save(look: look, { req in
            let o = PHAssetResourceCreationOptions()
            o.shouldMoveFile = true
            req.addResource(with: .video, fileURL: url, options: o)
        }, done: done)
    }

    /// The album's items, newest first.
    static func list() -> [MediaItem] {
        guard canRead, let a = album() else { return [] }
        let opts = PHFetchOptions()
        opts.sortDescriptors = [NSSortDescriptor(key: "creationDate", ascending: false)]
        let r = PHAsset.fetchAssets(in: a, options: opts)
        var out: [MediaItem] = []
        out.reserveCapacity(r.count)
        r.enumerateObjects { asset, _, _ in out.append(MediaItem(asset: asset)) }
        return out
    }

    static func delete(_ items: [MediaItem], done: @escaping (Bool) -> Void) {
        PHPhotoLibrary.shared().performChanges({
            PHAssetChangeRequest.deleteAssets(items.map { $0.asset } as NSArray)
        }) { ok, _ in DispatchQueue.main.async { done(ok) } }
    }

    static func thumbnail(_ item: MediaItem, side: CGFloat, _ done: @escaping (UIImage?) -> Void) {
        let o = PHImageRequestOptions()
        o.deliveryMode = .opportunistic
        o.isNetworkAccessAllowed = true
        o.resizeMode = .fast
        PHImageManager.default().requestImage(for: item.asset, targetSize: CGSize(width: side, height: side),
                                              contentMode: .aspectFill, options: o) { img, _ in done(img) }
    }

    /// The full picture, for the viewer.
    static func image(_ item: MediaItem, maxSide: CGFloat, _ done: @escaping (UIImage?) -> Void) {
        let o = PHImageRequestOptions()
        o.deliveryMode = .highQualityFormat
        o.isNetworkAccessAllowed = true
        PHImageManager.default().requestImage(for: item.asset, targetSize: CGSize(width: maxSide, height: maxSide),
                                              contentMode: .aspectFit, options: o) { img, _ in done(img) }
    }

    static func avAsset(_ item: MediaItem, _ done: @escaping (AVAsset?) -> Void) {
        let o = PHVideoRequestOptions()
        o.isNetworkAccessAllowed = true
        o.deliveryMode = .highQualityFormat
        PHImageManager.default().requestAVAsset(forVideo: item.asset, options: o) { a, _, _ in
            DispatchQueue.main.async { done(a) }
        }
    }

    /// A file for the item (photo data or the video), for sharing or developing.
    static func file(_ item: MediaItem, _ done: @escaping (URL?) -> Void) {
        let resources = PHAssetResource.assetResources(for: item.asset)
        let main = resources.first { $0.type == (item.isVideo ? .video : .photo) } ?? resources.first
        guard let res = main else { done(nil); return }
        let url = FileManager.default.temporaryDirectory.appendingPathComponent(res.originalFilename)
        try? FileManager.default.removeItem(at: url)
        let o = PHAssetResourceRequestOptions()
        o.isNetworkAccessAllowed = true
        PHAssetResourceManager.default().writeData(for: res, toFile: url, options: o) { err in
            DispatchQueue.main.async { done(err == nil ? url : nil) }
        }
    }

    /// Saves the part of a clip from [startMs] to [endMs] as a new take (the look carries over).
    static func trim(_ item: MediaItem, startMs: Int64, endMs: Int64, done: @escaping (MediaItem?) -> Void) {
        avAsset(item) { asset in
            guard let asset, let export = AVAssetExportSession(asset: asset, presetName: AVAssetExportPresetPassthrough) else {
                done(nil); return
            }
            let url = FileManager.default.temporaryDirectory.appendingPathComponent("trim_\(Int(Date().timeIntervalSince1970)).mov")
            try? FileManager.default.removeItem(at: url)
            export.outputURL = url
            export.outputFileType = .mov
            export.timeRange = CMTimeRange(start: CMTime(value: startMs, timescale: 1000), end: CMTime(value: endMs, timescale: 1000))
            export.exportAsynchronously {
                guard export.status == .completed else { DispatchQueue.main.async { done(nil) }; return }
                saveVideo(url, look: look(of: item), done: done)
            }
        }
    }
}
