import SwiftUI

@main
struct FilmCamApp: App {
    @StateObject private var model = AppModel()

    var body: some Scene {
        WindowGroup {
            CameraView().environmentObject(model)
        }
    }
}
