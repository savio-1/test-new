/* Procedural imagery and logo marks.
   Clients usually arrive with no photography and no logo, so every direction gets
   generated stand-ins: an image style that follows its genome and a mark built from the brand initial.
   All output is SVG, seeded so a direction always renders the same until you shuffle it. */
window.PG = window.PG || {};

(function () {
  let UID = 0;
  const f = (n) => Math.round(n * 10) / 10;
  const pick = (r, arr) => arr[Math.floor(r() * arr.length)];
  const ff = (t, which) => (which === 'body' ? t.fb : t.fd).replace(/"/g, "'");
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  /* Smooth closed blob through n points around (cx, cy). */
  function blob(r, cx, cy, rad, n, wobble) {
    const pts = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2, rr = rad * (1 - wobble / 2 + r() * wobble);
      pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
    }
    let d = '';
    for (let i = 0; i < n; i++) {
      const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
      if (i === 0) d += `M${f(p1[0])},${f(p1[1])}`;
      const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
      const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
      d += `C${f(c1[0])},${f(c1[1])} ${f(c2[0])},${f(c2[1])} ${f(p2[0])},${f(p2[1])}`;
    }
    return d + 'Z';
  }
  function grainFilter(id, op) {
    return `<filter id="${id}" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 ${op} 0"/><feComposite in2="SourceGraphic" operator="in"/></filter>`;
  }

  const G = {};

  G.mesh = ({ w, h, t, r, id }) => {
    const m = Math.max(w, h);
    const cols = [t.primary, t.secondary, t.accent, t.primary];
    let s = `<defs><filter id="${id}b" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${f(m * 0.09)}"/></filter></defs><rect width="${w}" height="${h}" fill="${t.surface}"/><g filter="url(#${id}b)">`;
    cols.forEach((c, i) => { s += `<ellipse cx="${f(r() * w)}" cy="${f(r() * h)}" rx="${f(m * (0.3 + r() * 0.3))}" ry="${f(m * (0.2 + r() * 0.25))}" fill="${c}" opacity="${i === 3 ? 0.7 : 0.95}"/>`; });
    return s + '</g>';
  };

  G.glow = ({ w, h, t, r, id }) => {
    const step = Math.max(w, h) / 14;
    let s = `<defs><radialGradient id="${id}g" cx="50%" cy="100%" r="75%"><stop offset="0" stop-color="${t.primary}" stop-opacity=".95"/><stop offset=".45" stop-color="${t.primary}" stop-opacity=".25"/><stop offset="1" stop-color="${t.primary}" stop-opacity="0"/></radialGradient></defs><rect width="${w}" height="${h}" fill="${t.mode === 'dark' ? t.bg : t.ink}"/><g stroke="${t.mode === 'dark' ? t.ink : t.bg}" stroke-opacity=".09" stroke-width="1">`;
    for (let x = 0; x < w; x += step) s += `<line x1="${f(x)}" y1="0" x2="${f(x)}" y2="${h}"/>`;
    for (let y = 0; y < h; y += step) s += `<line x1="0" y1="${f(y)}" x2="${w}" y2="${f(y)}"/>`;
    s += `</g><rect width="${w}" height="${h}" fill="url(#${id}g)"/>`;
    s += `<ellipse cx="${w / 2}" cy="${h * 0.98}" rx="${w * 0.42}" ry="${h * 0.02 + 2}" fill="${t.accent}" opacity=".8"/>`;
    for (let i = 0; i < 18; i++) s += `<circle cx="${f(r() * w)}" cy="${f(r() * h * 0.8)}" r="${f(1 + r() * 2)}" fill="${t.mode === 'dark' ? t.ink : t.bg}" opacity="${f(0.2 + r() * 0.5)}"/>`;
    return s;
  };

  G.lines = ({ w, h, t, r }) => {
    const n = 10 + Math.floor(r() * 6);
    let s = `<rect width="${w}" height="${h}" fill="${t.surface}"/><g stroke="${t.ink}" stroke-width="${Math.max(1, w / 600)}">`;
    for (let i = 1; i < n; i++) s += `<line x1="0" y1="${f((h / n) * i)}" x2="${w}" y2="${f((h / n) * i)}"/>`;
    s += '</g>';
    const cr = Math.min(w, h) * (0.28 + r() * 0.12);
    s += `<circle cx="${f(w * (0.55 + r() * 0.2))}" cy="${f(h * (0.35 + r() * 0.2))}" r="${f(cr)}" fill="${t.primary}"/>`;
    s += `<rect x="${f(w * 0.08)}" y="${f(h * 0.68)}" width="${f(w * 0.36)}" height="${f(h / n)}" fill="${t.ink}"/>`;
    return s;
  };

  G.type = ({ w, h, t, b }) => {
    const ch = esc((b.initial || 'A').toUpperCase());
    return `<rect width="${w}" height="${h}" fill="${t.primary}"/><text x="${f(w * 0.52)}" y="${f(h * 0.98)}" font-family="${ff(t)}" font-weight="${t.fdw}" font-size="${f(h * 1.15)}" fill="${t.onPrimary}" text-anchor="middle">${ch}</text><text x="${f(w * 0.08)}" y="${f(h * 0.14)}" font-family="${ff(t, 'body')}" font-size="${f(h * 0.05)}" fill="${t.onPrimary}" opacity=".8">${esc(b.name)} — ${new Date().getFullYear()}</text>`;
  };

  G.engraving = ({ w, h, t, r }) => {
    const cx = w * (0.5 + (r() - 0.5) * 0.3), cy = h * 0.5, R = Math.max(w, h) * 0.32, k = 6 + Math.floor(r() * 8);
    let s = `<rect width="${w}" height="${h}" fill="${t.primary}"/><g fill="none" stroke="${t.onPrimary}" stroke-width="${Math.max(0.6, w / 1400)}" opacity=".55">`;
    for (let j = 0; j < 22; j++) {
      let d = '';
      for (let i = 0; i <= 96; i++) {
        const a = (i / 96) * Math.PI * 2;
        const rr = R * (0.35 + j * 0.035) + R * 0.12 * Math.sin(k * a + j * 0.28);
        d += (i ? 'L' : 'M') + f(cx + Math.cos(a) * rr * 1.25) + ',' + f(cy + Math.sin(a) * rr);
      }
      s += `<path d="${d}Z"/>`;
    }
    return s + `</g><circle cx="${f(cx)}" cy="${f(cy)}" r="${f(R * 0.28)}" fill="${t.accent}" opacity=".9"/>`;
  };

  G.stripes = ({ w, h, t, r }) => {
    const cols = [t.primary, t.secondary, t.accent, t.ink];
    let s = `<rect width="${w}" height="${h}" fill="${t.bg}"/>`;
    if (r() < 0.5) {
      const cx = w * 0.5, cy = h * 1.02, band = Math.min(w, h) * 0.11;
      cols.forEach((c, i) => { const R = Math.min(w, h) * 0.85 - i * band; s += `<circle cx="${cx}" cy="${f(cy)}" r="${f(R)}" fill="${c}"/>`; });
      s += `<circle cx="${cx}" cy="${f(cy)}" r="${f(Math.min(w, h) * 0.85 - 4 * band)}" fill="${t.bg}"/>`;
    } else {
      const band = h / 11;
      cols.forEach((c, i) => { s += `<rect x="0" y="${f(h * 0.3 + i * band * 1.4)}" width="${w}" height="${f(band)}" fill="${c}"/>`; });
    }
    return s;
  };

  G.geometric = ({ w, h, t, r }) => {
    const cols = [t.primary, t.secondary, t.accent, t.ink, t.surface];
    const cx = 4, cy = Math.max(2, Math.round((h / w) * 4));
    const cw = w / cx, ch = h / cy;
    let s = `<rect width="${w}" height="${h}" fill="${t.bg}"/>`;
    for (let i = 0; i < cx; i++) for (let j = 0; j < cy; j++) {
      const x = i * cw, y = j * ch, c = pick(r, cols), c2 = pick(r, cols), k = Math.floor(r() * 6);
      s += `<rect x="${f(x)}" y="${f(y)}" width="${f(cw + 0.5)}" height="${f(ch + 0.5)}" fill="${c2}"/>`;
      if (k === 0) s += `<circle cx="${f(x + cw / 2)}" cy="${f(y + ch / 2)}" r="${f(Math.min(cw, ch) * 0.42)}" fill="${c}"/>`;
      else if (k === 1) s += `<path d="M${f(x)},${f(y + ch)} A${f(cw)},${f(ch)} 0 0 1 ${f(x + cw)},${f(y)} L${f(x + cw)},${f(y + ch)}Z" fill="${c}"/>`;
      else if (k === 2) s += `<path d="M${f(x)},${f(y + ch)} L${f(x + cw / 2)},${f(y)} L${f(x + cw)},${f(y + ch)}Z" fill="${c}"/>`;
      else if (k === 3) s += `<path d="M${f(x)},${f(y + ch / 2)} A${f(cw / 2)},${f(ch / 2)} 0 0 1 ${f(x + cw)},${f(y + ch / 2)}Z" fill="${c}"/>`;
      else if (k === 4) s += `<rect x="${f(x + cw * 0.2)}" y="${f(y + ch * 0.2)}" width="${f(cw * 0.6)}" height="${f(ch * 0.6)}" fill="${c}"/>`;
    }
    return s;
  };

  G.friendly = ({ w, h, t, r }) => {
    const cols = [t.primary, t.secondary, t.accent];
    const u = Math.min(w, h);
    let s = `<rect width="${w}" height="${h}" fill="${t.surface}"/>`;
    for (let i = 0; i < 7; i++) {
      const c = cols[i % 3], x = r() * w, y = r() * h, k = Math.floor(r() * 4), sz = u * (0.18 + r() * 0.22);
      if (k === 0) s += `<circle cx="${f(x)}" cy="${f(y)}" r="${f(sz / 2)}" fill="${c}"/>`;
      else if (k === 1) s += `<rect x="${f(x)}" y="${f(y)}" width="${f(sz * 1.8)}" height="${f(sz * 0.7)}" rx="${f(sz * 0.35)}" fill="${c}" transform="rotate(${f(r() * 60 - 30)} ${f(x)} ${f(y)})"/>`;
      else if (k === 2) s += `<path d="M${f(x)},${f(y)} a${f(sz / 2)},${f(sz / 2)} 0 0 1 ${f(sz)},0Z" fill="${c}"/>`;
      else s += `<rect x="${f(x)}" y="${f(y)}" width="${f(sz)}" height="${f(sz)}" rx="${f(sz * 0.28)}" fill="${c}"/>`;
    }
    s += `<path d="M${f(w * 0.38)},${f(h * 0.55)} q${f(w * 0.12)},${f(h * 0.12)} ${f(w * 0.24)},0" fill="none" stroke="${t.ink}" stroke-width="${f(u * 0.025)}" stroke-linecap="round"/>`;
    return s;
  };

  G.organic = ({ w, h, t, r }) => {
    const u = Math.min(w, h);
    const cols = [t.secondary, t.primary, t.accent];
    let s = `<rect width="${w}" height="${h}" fill="${t.surface}"/>`;
    cols.forEach((c, i) => { s += `<path d="${blob(r, w * (0.2 + r() * 0.6), h * (0.25 + r() * 0.5), u * (0.38 - i * 0.07), 7, 0.45)}" fill="${c}" opacity="${i === 0 ? 0.9 : 0.85}"/>`; });
    for (let i = 0; i < 5; i++) s += `<circle cx="${f(r() * w)}" cy="${f(r() * h)}" r="${f(u * (0.015 + r() * 0.03))}" fill="${t.ink}" opacity=".18"/>`;
    return s;
  };

  G.arch = ({ w, h, t, r }) => {
    const n = 3, gap = w * 0.04, aw = (w - gap * (n + 1)) / n;
    const cols = [t.primary, t.secondary, t.accent];
    let s = `<rect width="${w}" height="${h}" fill="${t.surface}"/>`;
    for (let i = 0; i < n; i++) {
      const x = gap + i * (aw + gap), top = h * (0.18 + r() * 0.2), c = cols[(i + Math.floor(r() * 3)) % 3];
      s += `<path d="M${f(x)},${h} V${f(top + aw / 2)} A${f(aw / 2)},${f(aw / 2)} 0 0 1 ${f(x + aw)},${f(top + aw / 2)} V${h}Z" fill="${c}"/>`;
      if (i === 1) s += `<circle cx="${f(x + aw / 2)}" cy="${f(top + aw * 0.55)}" r="${f(aw * 0.22)}" fill="${t.bg}" opacity=".9"/>`;
    }
    return s;
  };

  G.rings = ({ w, h, t, r }) => {
    const cx = w * (0.55 + r() * 0.2), cy = h * (0.4 + r() * 0.2), m = Math.max(w, h);
    let s = `<rect width="${w}" height="${h}" fill="${t.surface}"/>`;
    for (let i = 7; i >= 1; i--) s += `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(m * 0.09 * i)}" fill="${i % 2 ? t.secondary : t.surface}" opacity="${f(0.35 + (7 - i) * 0.08)}"/>`;
    s += `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(m * 0.07)}" fill="${t.primary}"/>`;
    s += `<circle cx="${f(cx + m * 0.22)}" cy="${f(cy - m * 0.12)}" r="${f(m * 0.025)}" fill="${t.accent}"/>`;
    return s;
  };

  G.topo = ({ w, h, t, r }) => {
    let s = `<rect width="${w}" height="${h}" fill="${t.primary}"/><g fill="none" stroke="${t.onPrimary}" stroke-opacity=".5" stroke-width="${Math.max(1, w / 700)}">`;
    const centers = [[w * (0.2 + r() * 0.3), h * (0.3 + r() * 0.4)], [w * (0.6 + r() * 0.3), h * (0.2 + r() * 0.5)]];
    centers.forEach(([cx, cy]) => {
      const seed = r() * 1000;
      for (let i = 1; i <= 11; i++) {
        const rr = PG.rng(Math.floor(seed));
        s += `<path d="${blob(rr, cx, cy, Math.min(w, h) * 0.06 * i, 9, 0.22)}"/>`;
      }
    });
    return s + `</g><circle cx="${f(centers[0][0])}" cy="${f(centers[0][1])}" r="${f(Math.min(w, h) * 0.03)}" fill="${t.secondary}"/>`;
  };

  G.doodle = ({ w, h, t, r }) => {
    const u = Math.min(w, h), sw = f(u * 0.012);
    let s = `<rect width="${w}" height="${h}" fill="${t.surface}"/><g fill="none" stroke="${t.ink}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round">`;
    for (let i = 0; i < 4; i++) {
      let d = `M${f(r() * w)},${f(r() * h)}`;
      for (let k = 0; k < 4; k++) d += ` q${f((r() - 0.5) * u * 0.5)},${f((r() - 0.5) * u * 0.5)} ${f((r() - 0.5) * u * 0.6)},${f((r() - 0.5) * u * 0.4)}`;
      s += `<path d="${d}"/>`;
    }
    const sx = w * (0.65 + r() * 0.2), sy = h * (0.25 + r() * 0.2), sr = u * 0.09;
    let star = '';
    for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? sr * 0.45 : sr; star += (i ? 'L' : 'M') + f(sx + Math.cos(a) * rr) + ',' + f(sy + Math.sin(a) * rr); }
    s += `<path d="${star}Z"/>`;
    s += `</g><path d="${blob(r, w * 0.35, h * 0.6, u * 0.22, 8, 0.35)}" fill="${t.primary}" opacity=".9"/>`;
    s += `<path d="${blob(r, w * 0.35, h * 0.6, u * 0.25, 9, 0.4)}" fill="none" stroke="${t.ink}" stroke-width="${sw}"/>`;
    return s;
  };

  G.chrome = ({ w, h, t, r, id }) => {
    const u = Math.min(w, h);
    let s = `<defs><linearGradient id="${id}c" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FFFFFF"/><stop offset=".3" stop-color="${t.primary}"/><stop offset=".5" stop-color="#F4F4FF"/><stop offset=".7" stop-color="${t.secondary}"/><stop offset="1" stop-color="#FFFFFF"/></linearGradient><linearGradient id="${id}bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${t.accent}"/><stop offset="1" stop-color="${t.bg}"/></linearGradient></defs><rect width="${w}" height="${h}" fill="url(#${id}bg)"/>`;
    for (let i = 0; i < 3; i++) s += `<path d="${blob(r, w * (0.25 + r() * 0.5), h * (0.3 + r() * 0.4), u * (0.32 - i * 0.07), 6, 0.6)}" fill="url(#${id}c)" stroke="${t.ink}" stroke-opacity=".25" stroke-width="2"/>`;
    for (let i = 0; i < 6; i++) {
      const x = r() * w, y = r() * h, sr = u * (0.02 + r() * 0.04);
      s += `<path d="M${f(x)},${f(y - sr)} Q${f(x)},${f(y)} ${f(x + sr)},${f(y)} Q${f(x)},${f(y)} ${f(x)},${f(y + sr)} Q${f(x)},${f(y)} ${f(x - sr)},${f(y)} Q${f(x)},${f(y)} ${f(x)},${f(y - sr)}Z" fill="${t.mode === 'dark' ? '#FFFFFF' : t.ink}"/>`;
    }
    return s;
  };

  G.squiggle = ({ w, h, t, r }) => {
    const u = Math.min(w, h), cols = [t.primary, t.secondary, t.accent, t.ink];
    let s = `<rect width="${w}" height="${h}" fill="${t.bg}"/><g fill="${t.ink}" opacity=".7">`;
    for (let x = u * 0.04; x < w * 0.4; x += u * 0.05) for (let y = u * 0.04; y < h * 0.3; y += u * 0.05) s += `<circle cx="${f(x)}" cy="${f(y)}" r="${f(u * 0.007)}"/>`;
    s += '</g>';
    for (let i = 0; i < 9; i++) {
      const c = cols[i % 4], x = r() * w, y = r() * h, k = i % 3, sz = u * (0.1 + r() * 0.12);
      if (k === 0) { let d = `M${f(x)},${f(y)}`; for (let j = 0; j < 5; j++) d += ` q${f(sz / 4)},${f(-sz / 3)} ${f(sz / 2)},0 t${f(sz / 2)},0`; s += `<path d="${d}" fill="none" stroke="${c}" stroke-width="${f(u * 0.02)}" stroke-linecap="round"/>`; }
      else if (k === 1) s += `<path d="M${f(x)},${f(y)} l${f(sz)},${f(sz * 0.2)} l${f(-sz * 0.6)},${f(sz * 0.8)}Z" fill="${c}" stroke="${t.ink}" stroke-width="${f(u * 0.006)}"/>`;
      else s += `<circle cx="${f(x)}" cy="${f(y)}" r="${f(sz / 2)}" fill="${c}" stroke="${t.ink}" stroke-width="${f(u * 0.006)}"/>`;
    }
    return s;
  };

  G.minimal = ({ w, h, t, r }) => {
    const u = Math.min(w, h);
    return `<rect width="${w}" height="${h}" fill="${t.surface}"/><line x1="${f(w * 0.1)}" y1="${f(h * 0.72)}" x2="${f(w * 0.9)}" y2="${f(h * 0.72)}" stroke="${t.ink}" stroke-width="${Math.max(1, u / 400)}"/><circle cx="${f(w * (0.55 + r() * 0.2))}" cy="${f(h * 0.45)}" r="${f(u * 0.11)}" fill="${t.primary}"/>`;
  };

  G.collage = ({ w, h, t, r, id }) => {
    const u = Math.min(w, h), cols = [t.primary, t.secondary, t.accent];
    let s = `<defs><pattern id="${id}d" width="${f(u * 0.03)}" height="${f(u * 0.03)}" patternUnits="userSpaceOnUse"><circle cx="${f(u * 0.015)}" cy="${f(u * 0.015)}" r="${f(u * 0.009)}" fill="${t.ink}"/></pattern></defs><rect width="${w}" height="${h}" fill="${t.surface}"/>`;
    for (let i = 0; i < 5; i++) {
      const rw = w * (0.3 + r() * 0.4), rh = h * (0.25 + r() * 0.35), x = r() * (w - rw * 0.5), y = r() * (h - rh * 0.5), rot = f((r() - 0.5) * 16);
      s += `<rect x="${f(x)}" y="${f(y)}" width="${f(rw)}" height="${f(rh)}" fill="${i % 2 ? `url(#${id}d)` : cols[i % 3]}" transform="rotate(${rot} ${f(x + rw / 2)} ${f(y + rh / 2)})"/>`;
    }
    s += `<circle cx="${f(w * 0.62)}" cy="${f(h * 0.45)}" r="${f(u * 0.2)}" fill="${t.bg}" stroke="${t.ink}" stroke-width="${f(u * 0.006)}"/>`;
    return s;
  };

  G.flow = ({ w, h, t, r }) => {
    const n = 18, sw = Math.max(1.5, h / 160);
    let s = `<rect width="${w}" height="${h}" fill="${t.bg}"/><g fill="none" stroke-width="${f(sw)}">`;
    const amp = h * (0.08 + r() * 0.08), freq = 1 + r() * 2, ph = r() * 6;
    for (let i = 0; i < n; i++) {
      let d = '';
      for (let x = 0; x <= w; x += w / 40) {
        const y = (h / (n + 1)) * (i + 1) + Math.sin((x / w) * Math.PI * freq + ph + i * 0.18) * amp;
        d += (x ? 'L' : 'M') + f(x) + ',' + f(y);
      }
      s += `<path d="${d}" stroke="${i === 7 ? t.secondary : i === 11 ? t.accent : t.ink}" stroke-width="${i === 7 || i === 11 ? f(sw * 4) : f(sw)}"/>`;
    }
    return s + '</g>';
  };

  G.speed = ({ w, h, t, r }) => {
    let s = `<rect width="${w}" height="${h}" fill="${t.mode === 'dark' ? t.bg : t.ink}"/><g transform="skewX(-22)">`;
    for (let i = 0; i < 26; i++) {
      const y = r() * h, len = w * (0.2 + r() * 0.6), x = r() * w * 1.2;
      s += `<rect x="${f(x)}" y="${f(y)}" width="${f(len)}" height="${f(1 + r() * h * 0.012)}" fill="${i % 5 === 0 ? t.primary : t.mode === 'dark' ? t.ink : t.bg}" opacity="${f(0.15 + r() * 0.6)}"/>`;
    }
    s += `<rect x="${f(w * 0.45)}" y="${f(h * 0.15)}" width="${f(w * 0.28)}" height="${f(h * 0.7)}" fill="${t.primary}"/>`;
    return s + '</g>';
  };

  G.pixel = ({ w, h, t, r }) => {
    const px = Math.max(w, h) / 36, cols = Math.ceil(w / px), rows = Math.ceil(h / px);
    let s = `<rect width="${w}" height="${h}" fill="${t.mode === 'dark' ? t.bg : t.ink}"/>`;
    let hgt = rows * 0.35;
    for (let c = 0; c < cols; c++) {
      hgt = Math.max(2, Math.min(rows * 0.7, hgt + Math.floor(r() * 3) - 1));
      for (let k = 0; k < hgt; k++) {
        const col = k === Math.floor(hgt) - 1 ? t.primary : k > hgt - 4 ? t.secondary : t.surface;
        s += `<rect x="${f(c * px)}" y="${f(h - (k + 1) * px)}" width="${f(px - 1)}" height="${f(px - 1)}" fill="${col}" opacity="${k > hgt - 4 ? 1 : 0.55}"/>`;
      }
    }
    for (let i = 0; i < 20; i++) s += `<rect x="${f(Math.floor(r() * cols) * px)}" y="${f(Math.floor(r() * rows * 0.4) * px)}" width="${f(px / 2)}" height="${f(px / 2)}" fill="${t.accent}"/>`;
    s += `<rect x="${f(w * 0.68)}" y="${f(h * 0.12)}" width="${f(px * 4)}" height="${f(px * 4)}" fill="${t.primary}"/>`;
    return s;
  };

  G.halftone = ({ w, h, t, r }) => {
    const step = Math.max(w, h) / 42;
    const cx = w * (0.3 + r() * 0.4), cy = h * (0.3 + r() * 0.4), maxD = Math.hypot(w, h) * 0.6;
    let a = '', b = '';
    for (let x = step / 2; x < w; x += step) for (let y = step / 2; y < h; y += step) {
      const d = Math.hypot(x - cx, y - cy) / maxD;
      const ra = step * 0.48 * Math.max(0, 1 - d), rb = step * 0.42 * Math.max(0, d * 1.1 - 0.15);
      if (ra > 0.4) a += `<circle cx="${f(x)}" cy="${f(y)}" r="${f(ra)}"/>`;
      if (rb > 0.4) b += `<circle cx="${f(x + step * 0.25)}" cy="${f(y + step * 0.2)}" r="${f(rb)}"/>`;
    }
    return `<rect width="${w}" height="${h}" fill="${t.bg}"/><g fill="${t.secondary}" style="mix-blend-mode:multiply">${b}</g><g fill="${t.primary}" style="mix-blend-mode:multiply">${a}</g>`;
  };

  G.plan = ({ w, h, t, r }) => {
    const u = Math.min(w, h), sw = f(Math.max(1.5, u / 120)), m = u * 0.08;
    let s = `<rect width="${w}" height="${h}" fill="${t.surface}"/><g fill="none" stroke="${t.ink}" stroke-width="${sw}">`;
    s += `<rect x="${f(m)}" y="${f(m)}" width="${f(w - 2 * m)}" height="${f(h - 2 * m)}"/>`;
    const vx = m + (w - 2 * m) * (0.35 + r() * 0.2), hy = m + (h - 2 * m) * (0.4 + r() * 0.2);
    s += `<line x1="${f(vx)}" y1="${f(m)}" x2="${f(vx)}" y2="${f(hy - u * 0.08)}"/><line x1="${f(vx)}" y1="${f(hy + u * 0.04)}" x2="${f(vx)}" y2="${f(h - m)}"/>`;
    s += `<line x1="${f(m)}" y1="${f(hy)}" x2="${f(vx - u * 0.1)}" y2="${f(hy)}"/>`;
    s += `<path d="M${f(vx)},${f(hy - u * 0.08)} a${f(u * 0.12)},${f(u * 0.12)} 0 0 1 ${f(u * 0.12)},${f(u * 0.12)}" stroke-width="${f(sw / 2)}"/>`;
    s += `</g><g stroke="${t.muted}" stroke-width="${f(sw / 2)}"><line x1="${f(m)}" y1="${f(m * 0.5)}" x2="${f(w - m)}" y2="${f(m * 0.5)}"/></g>`;
    s += `<rect x="${f(vx + u * 0.05)}" y="${f(m + u * 0.05)}" width="${f((w - m - vx) * 0.6)}" height="${f((hy - m) * 0.5)}" fill="${t.primary}" opacity=".85"/>`;
    s += `<text x="${f(w / 2)}" y="${f(m * 0.42)}" font-family="${ff(t, 'body')}" font-size="${f(u * 0.035)}" fill="${t.muted}" text-anchor="middle">12 400</text>`;
    return s;
  };

  G.data = ({ w, h, t, r }) => {
    const u = Math.min(w, h), m = u * 0.1;
    let s = `<rect width="${w}" height="${h}" fill="${t.surface}"/><g stroke="${t.line}" stroke-width="1">`;
    for (let i = 0; i <= 5; i++) s += `<line x1="${f(m)}" y1="${f(m + ((h - 2 * m) / 5) * i)}" x2="${f(w - m)}" y2="${f(m + ((h - 2 * m) / 5) * i)}"/>`;
    s += '</g>';
    let d = '', v = 0.6;
    const pts = [];
    for (let i = 0; i <= 24; i++) { v = Math.max(0.1, Math.min(0.95, v + (r() - 0.45) * 0.15)); pts.push([m + ((w - 2 * m) / 24) * i, h - m - v * (h - 2 * m)]); }
    pts.forEach((p, i) => (d += (i ? 'L' : 'M') + f(p[0]) + ',' + f(p[1])));
    s += `<path d="${d}L${f(w - m)},${f(h - m)}L${f(m)},${f(h - m)}Z" fill="${t.primary}" opacity=".12"/><path d="${d}" fill="none" stroke="${t.primary}" stroke-width="${f(u * 0.008)}"/>`;
    for (let i = 0; i < 26; i++) s += `<circle cx="${f(m + r() * (w - 2 * m))}" cy="${f(m + r() * (h - 2 * m))}" r="${f(u * 0.006)}" fill="${t.secondary}"/>`;
    const last = pts[pts.length - 1];
    s += `<circle cx="${f(last[0])}" cy="${f(last[1])}" r="${f(u * 0.018)}" fill="${t.primary}"/>`;
    s += `<text x="${f(m)}" y="${f(m * 0.7)}" font-family="${t.fm.replace(/"/g, "'")}" font-size="${f(u * 0.035)}" fill="${t.muted}">n = 4,096 · p &lt; 0.01</text>`;
    return s;
  };

  G.scene = ({ w, h, t, r, id }) => {
    const top = t.mode === 'dark' ? t.bg : PG.color.mix(t.primary, '#FFFFFF', 0.55);
    const hor = PG.color.mix(t.primary, t.accent, 0.35);
    let s = `<defs><linearGradient id="${id}s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${top}"/><stop offset="1" stop-color="${hor}"/></linearGradient>${grainFilter(id + 'n', 0.18)}</defs><rect width="${w}" height="${h}" fill="url(#${id}s)"/>`;
    s += `<circle cx="${f(w * (0.3 + r() * 0.4))}" cy="${f(h * (0.35 + r() * 0.15))}" r="${f(Math.min(w, h) * 0.11)}" fill="${t.mode === 'dark' ? t.primary : '#FFFFFF'}" opacity=".9"/>`;
    for (let L = 0; L < 4; L++) {
      const base = h * (0.55 + L * 0.12), col = PG.color.mix(t.primary, t.ink, 0.3 + L * 0.2);
      let d = `M0,${f(h)} L0,${f(base)}`;
      for (let x = 0; x <= w; x += w / 10) d += ` L${f(x)},${f(base - r() * h * 0.12)}`;
      s += `<path d="${d} L${w},${f(h)}Z" fill="${col}"/>`;
    }
    return s + `<rect width="${w}" height="${h}" fill="#000" filter="url(#${id}n)" opacity=".6"/>`;
  };

  G.grain = ({ w, h, t, r, id }) => {
    const u = Math.max(w, h);
    return `<defs><linearGradient id="${id}l" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${t.surface}"/><stop offset="1" stop-color="${t.secondary}"/></linearGradient><filter id="${id}b" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${f(u * 0.06)}"/></filter>${grainFilter(id + 'n', 0.22)}</defs><rect width="${w}" height="${h}" fill="url(#${id}l)"/><ellipse cx="${f(w * (0.4 + r() * 0.3))}" cy="${f(h * (0.4 + r() * 0.3))}" rx="${f(u * 0.25)}" ry="${f(u * 0.18)}" fill="${t.accent}" opacity=".55" filter="url(#${id}b)"/><rect width="${w}" height="${h}" fill="#000" filter="url(#${id}n)"/>`;
  };

  G.deco = ({ w, h, t, r }) => {
    const cx = w / 2, cy = h * 1.0, R = Math.hypot(w, h);
    let s = `<rect width="${w}" height="${h}" fill="${t.mode === 'dark' ? t.bg : t.ink}"/>`;
    const n = 26;
    for (let i = 0; i < n; i++) {
      if (i % 2) continue;
      const a1 = Math.PI + (i / n) * Math.PI, a2 = Math.PI + ((i + 1) / n) * Math.PI;
      s += `<path d="M${f(cx)},${f(cy)} L${f(cx + Math.cos(a1) * R)},${f(cy + Math.sin(a1) * R)} L${f(cx + Math.cos(a2) * R)},${f(cy + Math.sin(a2) * R)}Z" fill="${t.primary}" opacity=".22"/>`;
    }
    for (let i = 1; i <= 4; i++) s += `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(Math.min(w, h) * 0.16 * i)}" fill="none" stroke="${t.primary}" stroke-width="${f(Math.max(1, w / 500))}"/>`;
    s += `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(Math.min(w, h) * 0.22)}" fill="${t.primary}"/>`;
    return s;
  };

  PG.IMAGERY = Object.keys(G);
  PG.IMAGERY_NAMES = {
    mesh: 'Mesh gradient', glow: 'Glow grid', lines: 'Swiss lines', type: 'Type as image', engraving: 'Guilloché engraving',
    stripes: 'Retro stripes', geometric: 'Bauhaus geometry', friendly: 'Friendly shapes', organic: 'Organic blobs', arch: 'Arches',
    rings: 'Calm rings', topo: 'Topographic', doodle: 'Hand doodles', chrome: 'Liquid chrome', squiggle: 'Memphis squiggles',
    minimal: 'Ma (emptiness)', collage: 'Editorial collage', flow: 'Responsive lines', speed: 'Speed lines', pixel: 'Pixel world',
    halftone: 'Riso halftone', plan: 'Plan drawing', data: 'Data plot', scene: 'Duotone landscape', grain: 'Grain gradient', deco: 'Deco sunburst'
  };

  /* Render imagery as a full SVG. `opts.kind` overrides the direction's imagery, `opts.salt` varies the seed. */
  PG.art = function (t, b, w, h, opts) {
    opts = opts || {};
    const kind = opts.kind || t.imagery;
    const gen = G[kind] || G.mesh;
    const id = 'pg' + (++UID);
    const r = PG.rng((t.seed || 1) * 31 + (opts.salt || 0) * 977 + PG.hash(kind));
    return `<svg class="art" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid slice" width="100%" height="100%" aria-hidden="true">${gen({ w, h, t, r, id, b })}</svg>`;
  };

  /* ---------- logo marks (100×100 box) ---------- */
  const M = {};
  const L = (t, b, fill, size, y) => `<text x="50" y="${y || 50}" dy=".35em" text-anchor="middle" font-family="${ff(t)}" font-weight="${t.fdw}" font-size="${size || 56}" fill="${fill}" style="font-style:${t.italic ? 'italic' : 'normal'}">${esc(b.initial)}</text>`;
  M.cutSquare = (t, b, c, on) => `<rect width="100" height="100" fill="${c}"/><path d="M60 0H100V40Z" fill="${on}"/>${L(t, b, on, 58, 54)}`;
  M.octagon = (t, b, c, on) => `<path d="M30 2H70L98 30V70L70 98H30L2 70V30Z" fill="${c}"/><rect x="34" y="34" width="32" height="32" fill="${on}"/>`;
  M.stripes = (t, b, c, on) => { let s = `<rect width="100" height="100" fill="${on}" opacity="0"/>${L(t, b, c, 96, 52)}`; for (let y = 8; y < 100; y += 11) s += `<rect y="${y}" width="100" height="3.5" fill="${on}"/>`; return s; };
  M.circleMono = (t, b, c, on) => `<circle cx="50" cy="50" r="48" fill="${c}"/>${L(t, b, on, 54)}`;
  M.squareMono = (t, b, c, on) => `<rect width="100" height="100" fill="${c}"/>${L(t, b, on, 60, 52)}`;
  M.orb = (t, b, c, on, id) => `<defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${t.secondary}"/><stop offset=".55" stop-color="${t.primary}"/><stop offset="1" stop-color="${t.accent}"/></linearGradient></defs><circle cx="50" cy="50" r="48" fill="url(#${id})"/><circle cx="36" cy="34" r="12" fill="#FFFFFF" opacity=".35"/>`;
  M.stack = (t, b, c) => `<rect x="10" y="12" width="80" height="18" rx="4" fill="${c}"/><rect x="10" y="41" width="80" height="18" rx="4" fill="${c}" opacity=".7"/><rect x="10" y="70" width="80" height="18" rx="4" fill="${c}" opacity=".4"/>`;
  M.ring = (t, b, c) => `<circle cx="50" cy="50" r="38" fill="none" stroke="${c}" stroke-width="10"/><circle cx="80" cy="24" r="10" fill="${t.accent}"/>`;
  M.fan = (t, b, c) => { let s = ''; for (let i = 0; i < 7; i++) { const a = Math.PI + (i / 6) * Math.PI; s += `<line x1="50" y1="88" x2="${f(50 + Math.cos(a) * 46)}" y2="${f(88 + Math.sin(a) * 46)}" stroke="${c}" stroke-width="4"/>`; } return s + `<path d="M22 88A28 28 0 0 1 78 88Z" fill="${c}"/>`; };
  M.crest = (t, b, c, on) => `<path d="M50 2L94 14V48C94 74 74 92 50 98C26 92 6 74 6 48V14Z" fill="${c}"/><path d="M50 10L86 20V48C86 69 70 84 50 90C30 84 14 69 14 48V20Z" fill="none" stroke="${on}" stroke-width="2"/>${L(t, b, on, 48, 50)}`;
  M.blob = (t, b, c, on) => `<path d="${blob(PG.rng(PG.hash(b.name)), 50, 50, 44, 6, 0.3)}" fill="${c}"/>${L(t, b, on, 50)}`;
  M.sun = (t, b, c) => { let s = `<circle cx="50" cy="58" r="24" fill="${c}"/>`; for (let i = 0; i < 9; i++) { const a = Math.PI + (i / 8) * Math.PI; s += `<line x1="${f(50 + Math.cos(a) * 32)}" y1="${f(58 + Math.sin(a) * 32)}" x2="${f(50 + Math.cos(a) * 44)}" y2="${f(58 + Math.sin(a) * 44)}" stroke="${c}" stroke-width="6" stroke-linecap="round"/>`; } return s + `<rect x="4" y="80" width="92" height="6" rx="3" fill="${c}"/>`; };
  M.scribble = (t, b, c) => `<path d="M14 60C10 30 40 8 64 16S96 56 76 78 22 90 18 62 46 30 70 40" fill="none" stroke="${c}" stroke-width="7" stroke-linecap="round"/>`;
  M.badge = (t, b, c, on) => `<circle cx="50" cy="50" r="48" fill="${c}"/><circle cx="50" cy="50" r="40" fill="none" stroke="${on}" stroke-width="2" stroke-dasharray="4 4"/>${L(t, b, on, 46)}`;
  M.star = (t, b, c) => `<path d="M50 2C54 36 64 46 98 50C64 54 54 64 50 98C46 64 36 54 2 50C36 46 46 36 50 2Z" fill="${c}"/>`;
  M.trio = (t) => `<circle cx="28" cy="30" r="24" fill="${t.primary}"/><rect x="54" y="6" width="42" height="42" fill="${t.secondary}"/><path d="M50 96L74 54L98 96Z" fill="${t.accent}"/><rect x="6" y="58" width="40" height="38" fill="${t.ink}"/>`;
  M.zigzag = (t, b, c) => `<path d="M4 30L28 70L50 30L72 70L96 30" fill="none" stroke="${c}" stroke-width="12" stroke-linejoin="miter"/>`;
  M.slash = (t, b, c) => `<path d="M30 92L58 8H74L46 92Z" fill="${c}"/><path d="M58 92L86 8H96L68 92Z" fill="${c}" opacity=".55"/>`;
  M.pixel = (t, b, c) => { const r = PG.rng(PG.hash(b.name)); let s = ''; for (let x = 0; x < 5; x++) for (let y = 0; y < 5; y++) { const on = x === 2 || r() < 0.45; if (on) { s += `<rect x="${x * 20}" y="${y * 20}" width="18" height="18" fill="${c}"/>`; s += `<rect x="${(4 - x) * 20}" y="${y * 20}" width="18" height="18" fill="${c}"/>`; } } return s; };
  M.frame = (t, b, c) => `<rect x="6" y="6" width="88" height="88" fill="none" stroke="${c}" stroke-width="5"/><rect x="40" y="6" width="5" height="60" fill="${c}"/><rect x="40" y="62" width="54" height="5" fill="${c}"/>`;
  M.chevron = (t, b, c) => `<path d="M6 30L50 70L94 30" fill="none" stroke="${c}" stroke-width="12"/><path d="M26 30L50 52L74 30" fill="none" stroke="${c}" stroke-width="6" opacity=".6"/>`;

  /* Mark SVG. `variant`: 'brand' (primary), 'ink', 'reverse' (on primary) */
  PG.mark = function (t, b, px, variant) {
    if (t.mark === 'wordmark') return '';
    const gen = M[t.mark] || M.circleMono;
    let c = t.primary, on = t.onPrimary;
    if (variant === 'ink') { c = t.ink; on = t.bg; }
    if (variant === 'reverse') { c = t.onPrimary; on = t.primary; }
    if (variant === 'light') { c = '#FFFFFF'; on = '#111111'; }
    if (c === t.primary && PG.color.contrast(t.primary, t.bg) < 1.5 && variant !== 'reverse') { c = t.ink; on = t.bg; }
    return `<svg class="mk" viewBox="0 0 100 100" width="${px}" height="${px}" aria-hidden="true">${gen(t, b, c, on, 'pgm' + (++UID))}</svg>`;
  };

  /* Mark + wordmark lockup as HTML. */
  PG.lockup = function (t, b, px, variant) {
    const col = variant === 'reverse' ? 'var(--on-primary)' : variant === 'light' ? '#FFFFFF' : 'var(--ink)';
    const mk = PG.mark(t, b, Math.round(px * 1.15), variant);
    const wordSize = t.mark === 'wordmark' ? px * 1.05 : px * 0.92;
    return `<span class="lk" style="gap:${f(px * 0.38)}px;color:${col}">${mk}<span class="lk-w" style="font-size:${f(wordSize)}px">${esc(b.name)}</span></span>`;
  };
})();
