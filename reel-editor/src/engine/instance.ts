import { PreviewEngine } from './preview';
import { useEditor } from '../state/store';
import { projectDuration } from '../model/timeline';

/** The single preview engine shared by the viewer and transport controls. */
export const preview = new PreviewEngine();

/** Toggle playback. Must run inside a user gesture so audio can start. */
export function togglePlay(force?: boolean) {
  const s = useEditor.getState();
  const play = force ?? !s.playing;
  if (play) {
    preview.ensureAudio();
    const dur = projectDuration(s.project);
    if (dur > 0 && s.playhead >= dur - 1e-3) s.setPlayhead(0);
  }
  s.setPlaying(play);
}

export function stepFrames(n: number) {
  const s = useEditor.getState();
  s.setPlaying(false);
  const fps = s.project.settings.fps;
  s.setPlayhead(Math.max(0, Math.round(s.playhead * fps + n) / fps));
}
