import SwiftUI

// Placeholder: replaced by the subtitle editor.
struct SubtitleScreen: View {
    @EnvironmentObject var model: AppModel
    var body: some View { Button("Back") { model.screen = .GALLERY } }
}
