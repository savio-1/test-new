/* Touchpoint templates. Each template is a pure function of (tokens, copy, brand) that returns
   an artboard at its real-world pixel size. The app scales boards down to fit nodes and matrix cells.
   Templates never hard-code colour or type: everything comes from CSS variables set by PG.cssVars. */
window.PG = window.PG || {};

(function () {
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  /* Optical width of display faces, so headlines fit regardless of the font. */
  const WIDTH = {
    'Michroma': 1.5, 'Unbounded': 1.28, 'Rubik Mono One': 1.42, 'Archivo Black': 1.16, 'Syne': 1.1, 'Limelight': 1.08,
    'Shrikhand': 1.12, 'Barlow Condensed': 0.72, 'Caveat': 0.78, 'Instrument Serif': 0.84, 'Cormorant Garamond': 0.86,
    'Josefin Sans': 0.95, 'Baloo 2': 0.98, 'Young Serif': 1.1, 'Libre Caslon Text': 1.1, 'Fraunces': 1.05,
    'Hanken Grotesk': 0.97, 'Shippori Mincho': 1.04, 'Chakra Petch': 1.02, 'Bodoni Moda': 1.0, 'Bricolage Grotesque': 1.02,
    'Schibsted Grotesk': 1.02, 'Public Sans': 1.0, 'Space Grotesk': 1.02, 'IBM Plex Serif': 1.06, 'Sora': 1.08, 'Outfit': 0.98, 'Manrope': 1.04
  };
  const hs = (t, base) => {
    const wf = WIDTH[t.display] || 1;
    return Math.round(base * Math.min(1.12, Math.max(0.9, t.scale / 1.45)) / wf * (t.upper ? 0.84 : 1));
  };
  const H = (t, tag, text, base, extra) => `<${tag} class="h" style="font-size:${hs(t, base)}px;${extra || ''}">${esc(text)}</${tag}>`;
  const url = (b) => b.name.toLowerCase().replace(/[^a-z0-9]+/g, '') + '.com';
  const initials = (n) => n.split(' ').map((x) => x[0]).join('').slice(0, 2);

  const T = {};

  /* ------------ Website ------------ */
  T.website = {
    name: 'Website', group: 'Digital', w: 1440, h: 900,
    render({ t, c, b, art, lockup }) {
      const P = t.pad;
      const nav = `<div class="w-nav" style="padding:${Math.round(30 * P)}px 64px">${lockup(28)}<div class="w-links">${c.nav.map((n) => `<span>${esc(n)}</span>`).join('')}</div><span class="btn sm">${esc(c.cta)}</span></div>`;
      const btns = `<div class="row" style="gap:14px"><span class="btn lg">${esc(c.cta)}</span><span class="btn ghost lg">${esc(c.cta2)}</span></div>`;
      const ui = `<div class="float card" style="left:28px;bottom:28px;width:300px"><div class="muted" style="font-size:14px">${esc(c.app.metricLabel)}</div><div class="h" style="font-size:${hs(t, 38)}px;margin-top:6px">${esc(c.app.metric)}</div><div class="bar"><i style="width:68%"></i></div></div>`;
      let hero;
      if (t.hero === 'center') {
        hero = `<div style="text-align:center;padding:${Math.round(36 * P)}px 140px 0;display:flex;flex-direction:column;align-items:center;gap:${Math.round(22 * P)}px">
          <span class="eb">${esc(c.tagline)}</span>${H(t, 'h1', c.headline, 82, 'max-width:1040px')}
          <p class="lead" style="max-width:640px">${esc(c.sub)}</p>${btns}</div>
          <div class="pane" style="position:absolute;left:64px;right:64px;bottom:0;height:${Math.round(250 / P)}px;border-radius:var(--r) var(--r) 0 0">${art(1312, 300)}</div>`;
      } else if (t.hero === 'editorial') {
        hero = `<div style="padding:${Math.round(24 * P)}px 64px 0">${H(t, 'h1', c.headline, 124, 'max-width:1300px')}</div>
          <div class="rule" style="margin:${Math.round(30 * P)}px 64px 0"></div>
          <div style="display:grid;grid-template-columns:1fr 1.25fr;gap:48px;padding:28px 64px 0">
            <div style="display:flex;flex-direction:column;gap:24px"><span class="eb">${esc(c.tagline)}</span><p class="lead">${esc(c.sub)}</p>${btns}</div>
            <div class="pane" style="height:330px;border-radius:var(--r)">${art(760, 330)}</div></div>`;
      } else if (t.hero === 'fullbleed') {
        hero = `<div class="pane" style="position:absolute;inset:0">${art(1440, 900)}</div><div style="position:absolute;inset:0;background:linear-gradient(90deg,var(--bg) 28%,transparent 78%)"></div>
          <div style="position:absolute;left:64px;bottom:${Math.round(84 * P)}px;width:700px;display:flex;flex-direction:column;gap:24px"><span class="eb">${esc(c.tagline)}</span>${H(t, 'h1', c.headline, 88)}<p class="lead">${esc(c.sub)}</p>${btns}</div>`;
      } else {
        hero = `<div style="display:grid;grid-template-columns:1.02fr 1fr;gap:56px;padding:${Math.round(26 * P)}px 64px 0;height:760px">
          <div style="display:flex;flex-direction:column;justify-content:center;gap:${Math.round(26 * P)}px;padding-bottom:70px">
            <span class="eb">${esc(c.tagline)}</span>${H(t, 'h1', c.headline, 80)}<p class="lead" style="max-width:540px">${esc(c.sub)}</p>${btns}
            <div class="muted" style="font-size:16px">★ ${esc(c.stat)}</div></div>
          <div class="pane" style="height:680px;border-radius:var(--r);position:relative">${art(660, 680)}${ui}</div></div>`;
      }
      return `<div style="position:relative;height:100%">${t.hero === 'fullbleed' ? hero + `<div style="position:relative">${nav}</div>` : nav + hero}</div>`;
    }
  };

  /* ------------ Mobile app ------------ */
  T.app = {
    name: 'Mobile app', group: 'Digital', w: 430, h: 890, frame: true,
    render({ t, c, art, mark }) {
      const items = c.app.items.map(([k, v], i) => `<div class="li"><span class="ic" style="background:${i === 0 ? 'var(--primary)' : i === 1 ? 'var(--secondary)' : 'var(--accent)'}"></span><span style="flex:1">${esc(k)}</span><b>${esc(v)}</b></div>`).join('');
      const tabs = c.app.tabs.map((x, i) => `<span class="${i === 0 ? 'on' : ''}"><i></i>${esc(x)}</span>`).join('');
      return `<div class="phone"><div class="screen">
        <div class="sb"><b>9:41</b><span>▮▮▮ ◔</span></div>
        <div style="display:flex;align-items:center;justify-content:space-between;padding:14px 22px 6px">${H(t, 'div', c.app.greeting, 26)}${mark(34) || ''}</div>
        <div class="hero-card"><div class="hc-art">${art(386, 120, { salt: 3 })}</div><div style="padding:18px 20px 20px"><div style="font-size:14px;opacity:.85">${esc(c.app.metricLabel)}</div><div class="h" style="font-size:${hs(t, 40)}px;margin-top:4px">${esc(c.app.metric)}</div></div></div>
        <div class="sec">Recent</div><div style="display:flex;flex-direction:column;gap:10px;padding:0 22px">${items}</div>
        <div style="padding:16px 22px 0"><span class="btn" style="width:100%;font-size:17px;padding:16px">${esc(c.cta)}</span></div>
        <div class="tabs">${tabs}</div></div></div>`;
    }
  };

  /* ------------ Social post ------------ */
  T.social = {
    name: 'Social post', group: 'Social', w: 1080, h: 1080,
    render({ t, c, b, art, lockup }) {
      const handle = '@' + url(b).replace('.com', '');
      if (t.hero === 'fullbleed' || t.hero === 'editorial' || t.seed % 2) {
        return `<div class="pane" style="position:absolute;inset:0">${art(1080, 1080, { salt: 5 })}</div>
          <div style="position:absolute;left:56px;right:56px;bottom:56px;background:var(--bg);border-radius:var(--r);padding:52px;display:flex;flex-direction:column;gap:30px">
          ${H(t, 'div', c.social, 76)}<div style="display:flex;justify-content:space-between;align-items:center">${lockup(30)}<span class="muted" style="font-size:24px">${esc(handle)}</span></div></div>`;
      }
      return `<div style="position:absolute;inset:0;background:var(--primary);color:var(--on-primary);padding:80px;display:flex;flex-direction:column;justify-content:space-between">
        <div style="display:flex;justify-content:space-between;font-size:26px"><span>${esc(handle)}</span><span>01 / 05</span></div>
        ${H(t, 'div', c.social, 104, 'max-width:820px;color:var(--on-primary)')}
        <div style="display:flex;justify-content:space-between;align-items:flex-end">${lockup(34, 'reverse')}<div class="pane" style="width:300px;height:300px;border-radius:50%;margin:-40px -40px 0 0">${art(300, 300, { salt: 5 })}</div></div></div>`;
    }
  };

  /* ------------ Story / reel cover ------------ */
  T.story = {
    name: 'Story', group: 'Social', w: 1080, h: 1920,
    render({ t, c, art, lockup }) {
      return `<div class="pane" style="position:absolute;left:0;right:0;top:0;height:1120px">${art(1080, 1120, { salt: 7 })}</div>
        <div style="position:absolute;left:56px;top:70px;background:var(--bg);border-radius:999px;padding:18px 30px">${lockup(30)}</div>
        <div style="position:absolute;left:80px;right:80px;top:1190px;display:flex;flex-direction:column;gap:34px">
          <span class="eb" style="font-size:28px">${esc(c.tagline)}</span>${H(t, 'div', c.story, 128)}
          <p class="lead" style="font-size:34px">${esc(c.sub)}</p></div>
        <div style="position:absolute;left:80px;right:80px;bottom:90px;display:flex;justify-content:center"><span class="btn" style="font-size:36px;padding:30px 60px">${esc(c.cta)} ↑</span></div>`;
    }
  };

  /* ------------ Paid social / LinkedIn ad ------------ */
  T.banner = {
    name: 'Ad banner', group: 'Social', w: 1200, h: 628,
    render({ t, c, art, lockup }) {
      return `<div style="display:grid;grid-template-columns:1.1fr 1fr;height:100%">
        <div style="padding:52px;display:flex;flex-direction:column;justify-content:space-between">${lockup(26)}
          <div style="display:flex;flex-direction:column;gap:22px">${H(t, 'div', c.headline, 60)}<p class="muted" style="font-size:20px;line-height:1.45;margin:0">${esc(c.features[0][0])} · ${esc(c.features[1][0])} · ${esc(c.features[2][0])}</p></div>
          <div><span class="btn">${esc(c.cta)}</span></div></div>
        <div class="pane">${art(560, 628, { salt: 9 })}</div></div>`;
    }
  };

  /* ------------ Packaging (form depends on industry) ------------ */
  const shadow = (x, y, w) => `<div style="position:absolute;left:${x}px;top:${y}px;width:${w}px;height:40px;border-radius:50%;background:radial-gradient(closest-side,rgba(0,0,0,.35),transparent)"></div>`;
  const PACK = {
    box({ t, c, art, lockup }) {
      return `${shadow(250, 790, 560)}<div style="position:absolute;left:290px;top:250px;width:380px;height:540px">
        <div style="position:absolute;bottom:100%;left:0;width:100%;height:64px;transform-origin:bottom;transform:skewX(-60deg);background:var(--secondary)"></div>
        <div style="position:absolute;left:100%;top:0;width:110px;height:100%;transform-origin:left;transform:skewY(-30deg);background:var(--primary);filter:brightness(.72)"></div>
        <div style="position:absolute;inset:0;background:var(--primary);color:var(--on-primary);display:flex;flex-direction:column">
          <div class="pane" style="height:46%">${art(380, 250, { salt: 11 })}</div>
          <div style="padding:26px;display:flex;flex-direction:column;gap:12px;flex:1">${lockup(22, 'reverse')}${H(t, 'div', c.product.name, 44, 'color:var(--on-primary)')}<div style="font-size:16px;opacity:.85;margin-top:auto">${esc(c.product.detail)}</div></div></div></div>`;
    },
    can({ t, c, art, lockup, mark }) {
      const can = (x, alt) => `<div style="position:absolute;left:${x}px;top:230px;width:270px;height:540px">
        <div style="position:absolute;left:8px;right:8px;top:-14px;height:34px;border-radius:50%;background:linear-gradient(90deg,#9a9a9a,#eee,#9a9a9a)"></div>
        <div style="position:absolute;inset:0;border-radius:34px/18px;overflow:hidden;background:${alt ? 'var(--secondary)' : 'var(--primary)'};color:${alt ? 'var(--on-secondary)' : 'var(--on-primary)'}">
          <div class="pane" style="position:absolute;left:0;right:0;top:150px;height:220px">${art(270, 220, { salt: alt ? 17 : 13 })}</div>
          <div style="position:absolute;left:0;right:0;top:40px;text-align:center">${mark(54, alt ? '' : 'reverse') || ''}</div>
          <div style="position:absolute;left:18px;right:18px;bottom:46px;text-align:center">${H(t, 'div', c.product.name, 34, 'color:inherit')}<div style="font-size:14px;margin-top:8px;opacity:.85">${esc(c.product.detail)}</div></div>
          <div style="position:absolute;inset:0;background:linear-gradient(90deg,rgba(0,0,0,.32),rgba(255,255,255,.22) 26%,rgba(255,255,255,0) 46%,rgba(0,0,0,.08) 70%,rgba(0,0,0,.36))"></div></div></div>`;
      return shadow(210, 760, 620) + can(250, false) + can(510, true);
    },
    bottle({ t, c, art, lockup }) {
      return `${shadow(300, 830, 400)}<div style="position:absolute;left:435px;top:140px;width:130px;height:80px;background:var(--ink);border-radius:12px"></div>
        <div style="position:absolute;left:450px;top:215px;width:100px;height:90px;background:var(--primary);filter:brightness(.9)"></div>
        <div style="position:absolute;left:350px;top:290px;width:300px;height:540px;border-radius:60px 60px 30px 30px;background:var(--primary);overflow:hidden">
          <div style="position:absolute;left:30px;right:30px;top:120px;bottom:70px;background:var(--surface);color:var(--ink);padding:26px;display:flex;flex-direction:column;gap:14px;border-radius:calc(var(--r) / 2)">
            ${lockup(18)}<div class="pane" style="height:110px;border-radius:calc(var(--r) / 2)">${art(240, 110, { salt: 19 })}</div>${H(t, 'div', c.product.name, 34)}<div class="muted" style="font-size:14px;margin-top:auto">${esc(c.product.detail)}</div></div>
          <div style="position:absolute;inset:0;background:linear-gradient(90deg,rgba(0,0,0,.25),rgba(255,255,255,.25) 22%,rgba(255,255,255,0) 40%,rgba(0,0,0,.25))"></div></div>`;
    },
    jar({ t, c, art, lockup }) {
      return `${shadow(270, 800, 460)}<div style="position:absolute;left:300px;top:330px;width:400px;height:110px;border-radius:22px;background:var(--primary)"></div>
        <div style="position:absolute;left:310px;top:430px;width:380px;height:370px;border-radius:44px;background:var(--surface);overflow:hidden;display:flex;flex-direction:column">
          <div class="pane" style="height:120px">${art(380, 120, { salt: 23 })}</div>
          <div style="padding:26px 30px;display:flex;flex-direction:column;gap:12px;align-items:center;text-align:center">${lockup(20)}${H(t, 'div', c.product.name, 38)}<div class="muted" style="font-size:15px">${esc(c.product.detail)}</div></div>
          <div style="position:absolute;inset:0;background:linear-gradient(90deg,rgba(0,0,0,.18),rgba(255,255,255,.2) 25%,rgba(255,255,255,0) 45%,rgba(0,0,0,.18))"></div></div>`;
    },
    pouch({ t, c, mark, lockup }) {
      return `${shadow(250, 830, 500)}<div style="position:absolute;left:400px;top:140px;width:200px;height:150px;border:14px solid var(--ink);border-bottom:0;border-radius:100px 100px 0 0"></div>
        <div style="position:absolute;left:280px;top:270px;width:440px;height:570px;background:var(--secondary);color:var(--on-secondary);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:24px;text-align:center;clip-path:polygon(0 3%,8% 0,92% 0,100% 3%,100% 100%,0 100%)">
          ${mark(150, 'brand') || H(t, 'div', c.product.name, 60)}${lockup(30)}<div style="font-size:18px;opacity:.85">${esc(c.tagline)}</div>
          <div style="position:absolute;inset:0;background:linear-gradient(90deg,rgba(0,0,0,.15),rgba(255,255,255,.15) 30%,rgba(0,0,0,0) 55%,rgba(0,0,0,.15))"></div></div>`;
    },
    card({ t, c, art, lockup }) {
      const face = (alt, x, y, rot) => `<div style="position:absolute;left:${x}px;top:${y}px;width:620px;height:390px;border-radius:26px;overflow:hidden;transform:rotate(${rot}deg);box-shadow:0 30px 60px rgba(0,0,0,.28);background:${alt ? 'var(--ink)' : 'var(--primary)'};color:${alt ? 'var(--bg)' : 'var(--on-primary)'}">
          ${alt ? '' : `<div class="pane" style="position:absolute;inset:0;opacity:.9">${art(620, 390, { salt: 29 })}</div>`}
          <div style="position:absolute;left:40px;top:36px">${lockup(28, alt ? 'light' : 'reverse')}</div>
          <div style="position:absolute;left:40px;top:150px;width:70px;height:54px;border-radius:10px;background:linear-gradient(135deg,#d9c38a,#a88a43)"></div>
          <div style="position:absolute;left:40px;bottom:34px;font-size:24px;letter-spacing:.14em;font-family:var(--fm)">•••• ${alt ? '9012' : '4821'}</div>
          <div style="position:absolute;right:40px;bottom:30px;font-size:18px;opacity:.9">${esc(c.product.claim)}</div></div>`;
      return shadow(220, 760, 600) + face(true, 230, 330, 6) + face(false, 160, 230, -8);
    },
    tote({ t, c, mark, lockup }) {
      return `${shadow(250, 870, 500)}<div style="position:absolute;left:380px;top:130px;width:240px;height:230px;border:16px solid var(--surface);border-bottom:0;border-radius:120px 120px 0 0;filter:brightness(.9)"></div>
        <div style="position:absolute;left:260px;top:330px;width:480px;height:540px;background:var(--surface);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:28px;text-align:center;box-shadow:inset 0 0 0 1px var(--line)">
          ${mark(170) || H(t, 'div', c.product.name, 64)}${lockup(32)}<div class="muted" style="font-size:18px">${esc(c.tagline)}</div></div>`;
    },
    ticket({ t, c, art, lockup }) {
      return `${shadow(160, 700, 700)}<div style="position:absolute;left:110px;top:330px;width:780px;height:320px;transform:rotate(-5deg);display:flex;filter:drop-shadow(0 24px 40px rgba(0,0,0,.25))">
        <div class="pane" style="width:270px;height:100%;border-radius:18px 0 0 18px">${art(270, 320, { salt: 31 })}</div>
        <div style="flex:1;background:var(--bg);border-left:3px dashed var(--line);padding:34px 40px;display:flex;flex-direction:column;justify-content:space-between;border-radius:0 18px 18px 0">
          ${lockup(22)}${H(t, 'div', c.poster[0], 48)}<div class="muted" style="font-size:17px">${esc(c.product.detail)}</div>
          <div style="display:flex;justify-content:space-between;font-family:var(--fm);font-size:15px"><span>${esc(c.poster[2])}</span><span>No. 000482</span></div></div></div>`;
    }
  };
  T.packaging = {
    name: 'Packaging', group: 'Physical', w: 1000, h: 1000,
    render(ctx) {
      const kind = ctx.pack || 'box';
      return `<div style="position:absolute;inset:0;background:linear-gradient(180deg,var(--surface) 0 72%,var(--line) 72% 100%)"></div>${(PACK[kind] || PACK.box)(ctx)}`;
    }
  };
  PG.PACK_NAMES = { box: 'Box', can: 'Cans', bottle: 'Bottle', jar: 'Jar', pouch: 'Bag', card: 'Card', tote: 'Tote', ticket: 'Ticket' };

  /* ------------ Business card ------------ */
  T.card = {
    name: 'Business card', group: 'Print', w: 1000, h: 640,
    render({ t, c, b, lockup }) {
      const [name, role] = c.speaker;
      return `<div style="position:absolute;inset:0;background:var(--line)"></div>
        <div style="position:absolute;left:70px;top:60px;width:540px;height:320px;background:var(--primary);color:var(--on-primary);transform:rotate(-5deg);box-shadow:0 20px 40px rgba(0,0,0,.25);display:flex;align-items:center;justify-content:center;border-radius:calc(var(--r) / 3)">${lockup(40, 'reverse')}</div>
        <div style="position:absolute;right:70px;bottom:60px;width:540px;height:320px;background:var(--bg);transform:rotate(3deg);box-shadow:0 20px 40px rgba(0,0,0,.25);padding:40px;display:flex;flex-direction:column;justify-content:space-between;border-radius:calc(var(--r) / 3)">
          <div><div class="h" style="font-size:${hs(t, 32)}px">${esc(name)}</div><div class="muted" style="font-size:17px;margin-top:6px">${esc(role)}</div></div>
          <div style="display:flex;justify-content:space-between;align-items:flex-end"><div style="font-size:15px;line-height:1.6">${esc(name.split(' ')[0].toLowerCase())}@${esc(url(b))}<br>+44 20 7946 0321<br>${esc(url(b))}</div>${PG.mark(t, b, 54) || ''}</div></div>`;
    }
  };

  /* ------------ Poster ------------ */
  T.poster = {
    name: 'Poster', group: 'Print', w: 900, h: 1272,
    render({ t, c, b, art, lockup }) {
      const [title, sub, when] = c.poster;
      return `<div class="pane" style="position:absolute;left:0;right:0;top:0;height:${t.hero === 'fullbleed' ? 1272 : 760}px">${art(900, t.hero === 'fullbleed' ? 1272 : 760, { salt: 37 })}</div>
        <div style="position:absolute;left:0;right:0;bottom:0;${t.hero === 'fullbleed' ? 'background:linear-gradient(transparent,var(--bg) 30%);padding-top:200px;' : 'top:760px;'}padding-left:60px;padding-right:60px;padding-bottom:56px;display:flex;flex-direction:column;gap:20px">
          ${H(t, 'div', title, 120)}<div style="font-size:26px">${esc(sub)}</div><div class="rule"></div>
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:20px;font-size:17px;align-items:end"><b>${esc(when)}</b><span class="muted">${esc(url(b))}</span><span style="justify-self:end">${lockup(22)}</span></div></div>`;
    }
  };

  /* ------------ Webinar title slide ------------ */
  T.webinar = {
    name: 'Webinar slide', group: 'Events', w: 1920, h: 1080,
    render({ t, c, b, art, lockup }) {
      const [name, role] = c.speaker;
      return `<div style="display:grid;grid-template-columns:1.25fr 1fr;height:100%">
        <div style="padding:90px 110px;display:flex;flex-direction:column;justify-content:space-between">
          ${lockup(36)}
          <div style="display:flex;flex-direction:column;gap:36px"><span class="chip">● Live webinar</span>${H(t, 'div', c.webinar, 104)}
          <div style="display:flex;align-items:center;gap:26px"><div class="pane" style="width:120px;height:120px;border-radius:50%;position:relative">${art(120, 120, { salt: 41 })}<span style="position:absolute;inset:0;display:grid;place-items:center;font-family:var(--fd);font-size:40px;color:#fff;text-shadow:0 1px 6px rgba(0,0,0,.4)">${esc(initials(name))}</span></div>
            <div><div style="font-size:34px;font-weight:var(--fbb)">${esc(name)}</div><div class="muted" style="font-size:26px;margin-top:4px">${esc(role)}, ${esc(b.name)}</div></div></div></div>
          <div style="display:flex;gap:28px;align-items:center"><span class="btn lg" style="font-size:26px">Register free</span><span class="muted" style="font-size:26px">Thu 21 Nov · 16:00 GMT · 45 min</span></div></div>
        <div class="pane">${art(853, 1080, { salt: 43 })}</div></div>`;
    }
  };

  /* ------------ Email ------------ */
  T.email = {
    name: 'Email', group: 'Digital', w: 640, h: 1060,
    render({ t, c, b, art, lockup }) {
      const feats = c.features.map(([k, v], i) => `<div style="display:flex;gap:16px;align-items:flex-start"><span class="ic" style="width:40px;height:40px;flex:none;background:${['var(--primary)', 'var(--secondary)', 'var(--accent)'][i]}"></span><div><b style="font-size:17px">${esc(k)}</b><div class="muted" style="font-size:15px;margin-top:3px">${esc(v)}</div></div></div>`).join('');
      return `<div style="padding:30px;text-align:center;border-bottom:1px solid var(--line)">${lockup(24)}</div>
        <div class="pane" style="height:290px">${art(640, 290, { salt: 47 })}</div>
        <div style="padding:40px 44px;display:flex;flex-direction:column;gap:22px">${H(t, 'div', c.email, 42)}
          <p style="font-size:${Math.max(16, t.minBody)}px;line-height:1.6;margin:0">${esc(c.sub)}</p><div><span class="btn">${esc(c.cta)}</span></div>
          <div class="rule" style="margin:10px 0"></div>${feats}</div>
        <div class="muted" style="position:absolute;bottom:0;left:0;right:0;padding:26px 44px;font-size:13px;background:var(--surface);line-height:1.6">${esc(b.name)} · 12 Market Street, London · Unsubscribe · View in browser</div>`;
    }
  };

  /* ------------ Billboard ------------ */
  T.billboard = {
    name: 'Billboard', group: 'Physical', w: 1920, h: 720,
    render({ t, c, art, lockup }) {
      return `<div style="display:grid;grid-template-columns:1.15fr 1fr;height:100%">
        <div style="padding:80px 100px;display:flex;flex-direction:column;justify-content:space-between">${H(t, 'div', c.billboard, 168)}
          <div style="display:flex;justify-content:space-between;align-items:center">${lockup(44)}<span class="muted" style="font-size:30px">${esc(c.tagline)}</span></div></div>
        <div class="pane">${art(890, 720, { salt: 53 })}</div></div>`;
    }
  };

  /* ------------ Identity sheet ------------ */
  T.identity = {
    name: 'Identity sheet', group: 'Brand', w: 1200, h: 900,
    render({ t, c, b, art, lockup, mark }) {
      const sw = [['Background', t.bg], ['Surface', t.surface], ['Text', t.ink], ['Primary', t.primary], ['Secondary', t.secondary], ['Accent', t.accent]];
      const swatches = sw.map(([k, v]) => `<div style="display:flex;flex-direction:column;gap:8px"><div style="height:110px;background:${v};border:1px solid var(--line)"></div><b style="font-size:13px">${k}</b><span style="font-family:var(--fm);font-size:12px" class="muted">${v}</span></div>`).join('');
      return `<div style="display:grid;grid-template-columns:repeat(3,1fr);grid-template-rows:280px 300px 1fr;gap:1px;background:var(--line);height:100%">
        <div style="grid-column:span 2;background:var(--bg);display:grid;place-items:center">${lockup(64)}</div>
        <div style="background:var(--primary);display:grid;place-items:center">${lockup(36, 'reverse')}</div>
        <div style="background:var(--surface);display:grid;place-items:center">${mark(150) || `<span class="h" style="font-size:150px">${esc(b.initial)}</span>`}</div>
        <div style="grid-column:span 2;background:var(--bg);padding:30px;display:grid;grid-template-columns:repeat(6,1fr);gap:14px;align-content:center">${swatches}</div>
        <div style="grid-column:span 2;background:var(--bg);padding:34px;display:flex;gap:36px;align-items:center">
          <span class="h" style="font-size:150px;line-height:.9">Aa</span>
          <div style="display:flex;flex-direction:column;gap:10px;min-width:0"><b style="font-size:20px">${esc(t.display)} / ${esc(t.body)}</b>
          <p style="font-size:${Math.max(16, t.minBody)}px;line-height:1.55;margin:0;max-width:440px">${esc(c.sub)}</p>
          <div class="row" style="gap:10px;margin-top:6px"><span class="btn sm">${esc(c.cta)}</span><span class="btn ghost sm">${esc(c.cta2)}</span></div></div></div>
        <div class="pane">${art(400, 340, { salt: 59 })}</div></div>`;
    }
  };

  PG.TEMPLATES = T;
  PG.TOUCHPOINTS = Object.keys(T).map((id) => ({ id, name: T[id].name, group: T[id].group, w: T[id].w, h: T[id].h }));

  /* Build a scaled artboard for a touchpoint. Returns { html, w, h, scale }. */
  PG.renderBoard = function (tpId, dir, tune, brief, box) {
    const tpl = T[tpId];
    const t = PG.tokens(dir, tune, brief);
    const ind = PG.byId(PG.INDUSTRIES, brief.industry);
    const name = (brief.name || ind.sampleName).trim() || ind.sampleName;
    const b = { name, initial: name.replace(/^the\s+/i, '').charAt(0).toUpperCase() };
    const ctx = {
      t, c: ind.copy, b, pack: brief.pack || ind.packaging,
      art: (w, h, o) => PG.art(t, b, w, h, o),
      mark: (px, v) => PG.mark(t, b, px, v),
      lockup: (px, v) => PG.lockup(t, b, px, v)
    };
    const s = Math.min(box.w / tpl.w, box.h ? box.h / tpl.h : Infinity);
    const sw = Math.round(tpl.w * s), sh = Math.round(tpl.h * s);
    const html = `<div class="stage" style="width:${sw}px;height:${sh}px"><div class="ab${tpl.frame ? ' framed' : ''}" data-btn="${t.button}" style="width:${tpl.w}px;height:${tpl.h}px;transform:scale(${s.toFixed(5)});${PG.cssVars(t)}">${tpl.render(ctx)}</div></div>`;
    return { html, w: sw, h: sh, t };
  };
})();
