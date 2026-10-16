import { useRef, useState } from 'react';
import { Image as ImageIcon, Music, Plus, Trash2, Upload, Video, Type } from 'lucide-react';
import { useEditor } from '../state/store';
import { importFiles } from './importFiles';
import { deleteFile } from '../state/persist';
import { TEXT_TEMPLATES } from '../model/presets';

const fmtDur = (d: number) => {
  const m = Math.floor(d / 60);
  const s = Math.floor(d % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
};

export function MediaBin() {
  const media = useEditor((s) => s.media);
  const addClipFromMedia = useEditor((s) => s.addClipFromMedia);
  const removeMedia = useEditor((s) => s.removeMedia);
  const addTextClip = useEditor((s) => s.addTextClip);
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
  const items = Object.values(media);

  const run = async (files: File[]) => {
    if (!files.length) return;
    setBusy(true);
    await importFiles(files);
    setBusy(false);
  };

  return (
    <aside className="bin">
      <div className="panel-head">
        <span>Media</span>
        <button className="btn small primary" onClick={() => input.current?.click()} disabled={busy}>
          <Upload size={14} /> {busy ? 'Importing…' : 'Import'}
        </button>
        <input
          ref={input}
          type="file"
          multiple
          hidden
          accept="video/*,audio/*,image/*,.cube,.mkv,.mov"
          onChange={(e) => {
            void run(Array.from(e.target.files ?? []));
            e.target.value = '';
          }}
        />
      </div>

      <div
        className={`bin-grid ${over ? 'drag-over' : ''} ${items.length ? '' : 'empty'}`}
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes('Files')) {
            e.preventDefault();
            setOver(true);
          }
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          void run(Array.from(e.dataTransfer.files));
        }}
      >
        {!items.length && (
          <button className="bin-empty" onClick={() => input.current?.click()}>
            <Upload size={22} />
            <strong>Drop videos, music or photos</strong>
            <span>or click to browse. .cube LUTs work too.</span>
          </button>
        )}
        {items.map((m) => (
          <div
            key={m.id}
            className="bin-item"
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData('application/x-reel-media', m.id);
              e.dataTransfer.effectAllowed = 'copy';
            }}
            onDoubleClick={() => addClipFromMedia(m.id)}
            title={`${m.name}\nDouble-click or drag to the timeline`}
          >
            <div className="bin-thumb" style={m.thumbnail ? { backgroundImage: `url(${m.thumbnail})` } : undefined}>
              {!m.thumbnail && (m.kind === 'audio' ? <Music size={22} /> : <ImageIcon size={22} />)}
              <span className="bin-kind">
                {m.kind === 'video' ? <Video size={11} /> : m.kind === 'audio' ? <Music size={11} /> : <ImageIcon size={11} />}
                {m.kind !== 'image' && fmtDur(m.duration)}
              </span>
              <div className="bin-actions">
                <button className="mini" title="Add to timeline at playhead" onClick={() => addClipFromMedia(m.id)}>
                  <Plus size={13} />
                </button>
                <button
                  className="mini danger"
                  title="Remove from project"
                  onClick={() => {
                    removeMedia(m.id);
                    void deleteFile(m.id);
                  }}
                >
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
            <div className="bin-name">{m.name}</div>
          </div>
        ))}
      </div>

      <div className="panel-head sub">
        <span>
          <Type size={13} /> Titles
        </span>
      </div>
      <div className="title-grid">
        {TEXT_TEMPLATES.map((t) => (
          <button
            key={t.id}
            className={`title-chip tpl-${t.id}`}
            draggable
            onDragStart={(e) => e.dataTransfer.setData('application/x-reel-text', t.id)}
            onClick={() => addTextClip(t.id)}
            title="Click to add at the playhead, or drag to the timeline"
          >
            {t.name}
          </button>
        ))}
      </div>
    </aside>
  );
}
