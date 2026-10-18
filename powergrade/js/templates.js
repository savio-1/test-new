/* Layout library. Each touchpoint has several layout archetypes taken from patterns on leading
   studio and brand sites (studio indexes, big-type statements, editorial spreads, bento product pages…).
   Every layout is a pure function of tokens + copy + brand + photo picker, rendered at real pixel size. */
window.PG = window.PG || {};

(function () {
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const WIDTH = {
    'Michroma': 1.5, 'Unbounded': 1.28, 'Rubik Mono One': 1.42, 'Archivo Black': 1.16, 'Syne': 1.1, 'Limelight': 1.08,
    'Shrikhand': 1.12, 'Barlow Condensed': 0.72, 'Caveat': 0.78, 'Instrument Serif': 0.84, 'Cormorant Garamond': 0.86,
    'Josefin Sans': 0.95, 'Baloo 2': 0.98, 'Young Serif': 1.1, 'Libre Caslon Text': 1.1, 'Fraunces': 1.05, 'Hanken Grotesk': 0.97,
    'Shippori Mincho': 1.04, 'Chakra Petch': 1.02, 'Bodoni Moda': 1.0, 'Bricolage Grotesque': 1.02, 'Schibsted Grotesk': 1.02,
    'Public Sans': 1.0, 'Space Grotesk': 1.02, 'IBM Plex Serif': 1.06, 'Sora': 1.08, 'Outfit': 0.98, 'Manrope': 1.04, 'Anton': 0.8, 'Inter Tight': 0.95
  };
  const wf = (t) => (WIDTH[t.display] || 1) * (t.upper ? 1.18 : 1);
  /* Headline size scaled to the face's width and the direction's type scale. */
  const hs = (t, base) => Math.round(base * Math.min(1.12, Math.max(0.9, t.scale / 1.45)) / wf(t));
  /* Size that makes `text` fill `width` on one line. */
  const fill = (t, text, width, max) => Math.min(max || 9999, Math.round(width / (String(text).length * 0.58 * wf(t))));
  const H = (t, tag, text, base, extra) => `<${tag} class="h" style="font-size:${hs(t, base)}px;${extra || ''}">${esc(text)}</${tag}>`;
  const url = (b) => b.name.toLowerCase().replace(/[^a-z0-9]+/g, '') + '.com';
  const initials = (n) => n.split(' ').map((x) => x[0]).join('').slice(0, 2);
  const lastWord = (s) => { const i = s.trim().lastIndexOf(' '); return i < 0 ? ['', s] : [s.slice(0, i), s.slice(i + 1)]; };

  /* Photo box filling its parent cell. */
  const pic = (ctx, role, style, n) => `<div class="pic" style="${style || ''}">${PG.photoImg(ctx.pick(role, n), ctx.t, { grade: ctx.grade })}</div>`;
  const tiny = (s, extra) => `<span class="xs" style="${extra || ''}">${esc(s)}</span>`;

  const L = {};

  /* ======================= WEBSITE 1440×900 ======================= */
  L.website = {
    name: 'Website', group: 'Digital', w: 1440, h: 900,
    layouts: {
      index: { name: 'Studio index', ref: 'Centred object, corner navigation (design-office portfolios)', render(x) {
        const { t, c, b } = x;
        return `<div class="abs" style="padding:30px 38px">
          <div style="display:grid;grid-template-columns:1fr auto 1fr;align-items:start">
            <div class="row" style="gap:22px">${tiny(c.nav[0])}${tiny(c.nav[3])}</div>
            <div style="text-align:center;display:flex;flex-direction:column;align-items:center;gap:6px">${x.word(19)}${tiny(c.tagline, 'max-width:220px;color:var(--muted)')}</div>
            <div class="row" style="gap:22px;justify-content:flex-end">${tiny(c.nav[1])}${tiny(c.nav[2])}<span class="dotb"></span></div></div>
          ${pic(x, 'product', 'position:absolute;left:50%;top:150px;width:420px;height:520px;transform:translateX(-50%)')}
          <div style="position:absolute;left:50%;top:700px;transform:translateX(-50%);text-align:center;width:620px">${H(t, 'div', c.headline, 30)}</div>
          <div class="row" style="position:absolute;left:38px;right:38px;bottom:28px;justify-content:space-between">${tiny(c.features[0][0] + ' · ' + c.features[1][0])}${tiny(c.stat)}</div></div>`;
      } },
      bigtype: { name: 'Big-type statement', ref: 'Wordmark set at full width (independent studio sites)', render(x) {
        const { t, c, b } = x, size = fill(t, b.name, 1380, 330);
        return `<div class="abs" style="padding:34px 40px">
          <div class="row" style="justify-content:space-between;align-items:flex-start">
            <div style="display:flex;flex-direction:column;gap:14px;max-width:360px"><div class="s" style="font-weight:var(--fbb);line-height:1.25">${esc(c.tagline)}.<br><span style="font-weight:var(--fbw)">${esc(c.features[0][1])}</span></div><span class="btn pill sm">${esc(c.cta)} →</span></div>
            ${tiny('Menu ›', 'font-weight:var(--fbb)')}</div>
          <div class="h" style="position:absolute;left:34px;right:20px;top:50%;transform:translateY(-52%);font-size:${size}px;line-height:.86;white-space:nowrap;letter-spacing:-0.045em">${esc(b.name)}</div>
          <div class="row" style="position:absolute;left:40px;right:40px;bottom:30px;justify-content:space-between">${tiny(c.stat)}<span class="row" style="gap:20px">${tiny('LinkedIn')}${tiny('Instagram')}<span class="tag">EN</span></span></div></div>`;
      } },
      split: { name: 'Split editorial', ref: 'Text column with full-height photograph', render(x) {
        const { t, c } = x;
        return `<div class="abs" style="display:grid;grid-template-columns:45% 55%">
          <div style="padding:34px 56px 46px;display:flex;flex-direction:column;justify-content:space-between">
            <div class="row" style="justify-content:space-between">${x.lockup(22)}<span class="row" style="gap:22px">${c.nav.slice(0, 3).map((n) => tiny(n)).join('')}</span></div>
            <div style="display:flex;flex-direction:column;gap:26px"><span class="eb">${esc(c.tagline)}</span>${H(t, 'h1', c.headline, 66)}<p class="lead" style="max-width:460px">${esc(c.sub)}</p>
              <div class="row" style="gap:12px"><span class="btn">${esc(c.cta)}</span><span class="btn ghost">${esc(c.cta2)}</span></div></div>
            ${tiny('★ ' + c.stat, 'color:var(--muted)')}</div>
          ${pic(x, 'hero', 'height:100%')}</div>`;
      } },
      gallery: { name: 'Project grid', ref: 'Image-led index with tiny captions (architecture and studio sites)', render(x) {
        const { c, b } = x;
        const col = (i, hs) => `<div style="display:flex;flex-direction:column;gap:10px">${hs.map((h, k) => `${pic(x, ['place', 'product', 'people', 'detail'][(i + k) % 4], `height:${h}px`, i * 3 + k)}<div class="row" style="justify-content:space-between">${tiny(['2026', '2025', '2024'][k % 3])}${tiny(c.features[(i + k) % 3][0])}</div>`).join('')}</div>`;
        return `<div class="abs" style="padding:22px 26px">
          <div style="display:grid;grid-template-columns:repeat(4,1fr);margin-bottom:16px">${tiny(b.name, 'font-weight:var(--fbb)')}${tiny('Info')}${tiny('Index')}${tiny('Contact', 'text-align:right')}</div>
          <div style="display:grid;grid-template-columns:1.1fr 1.3fr 1.3fr 1fr;gap:10px">${col(0, [300, 420])}${col(1, [420, 300])}${col(2, [350, 360])}${col(3, [230, 300, 200])}</div></div>`;
      } },
      cinematic: { name: 'Dark cinematic', ref: 'Statement sentence on black with a strip of work', render(x) {
        const { t, c, b } = x, [a, z] = lastWord(c.headline);
        return `<div class="abs" style="background:${t.mode === 'dark' ? 'var(--bg)' : 'var(--ink)'};color:${t.mode === 'dark' ? 'var(--ink)' : 'var(--bg)'};padding:34px 44px">
          <div class="row" style="justify-content:space-between">${x.word(22, 'inverse')}<span class="row" style="gap:10px"><span class="circ">≡</span><span class="tag inv">${esc(c.nav[3])}</span></span></div>
          <div class="h" style="color:inherit;font-size:${hs(t, 64)}px;line-height:1.04;margin-top:56px;max-width:1320px">${esc(b.name)}® ${esc(c.tagline.toLowerCase())}. ${esc(a)} <em class="ital">${esc(z)}</em></div>
          <div style="position:absolute;left:44px;right:0;bottom:0;display:flex;gap:28px;align-items:flex-end">${[150, 210, 170, 230, 160, 190].map((h, i) => `<div style="width:${[150, 200, 220, 170, 240, 160][i]}px;height:${h}px;border-radius:12px 12px 0 0;overflow:hidden;position:relative;flex:none">${PG.photoImg(x.pick(['people', 'place', 'product', 'detail'][i % 4], 10 + i), t, { grade: x.grade })}${i % 3 === 1 ? `<span class="tag" style="position:absolute;left:10px;top:10px">${i === 1 ? '✦ New' : '✦ Update'}</span>` : ''}</div>`).join('')}</div></div>`;
      } },
      magazine: { name: 'Magazine spread', ref: 'Centred portrait photograph with set text (editorial studios)', render(x) {
        const { t, c, b } = x;
        return `<div class="abs" style="padding:26px 34px">
          <div style="display:grid;grid-template-columns:1fr auto 1fr;align-items:start">${tiny(c.nav[0], 'border:1px solid var(--line);padding:6px 10px;justify-self:start')}${x.word(18)}<div class="row" style="justify-content:flex-end;gap:18px">${tiny(c.nav[2])}${tiny(c.nav[3])}</div></div>
          ${pic(x, 'people', 'position:absolute;left:50%;top:86px;width:370px;height:470px;transform:translateX(-50%)')}
          ${tiny('Photographed for ' + b.name, 'position:absolute;left:535px;top:562px;color:var(--muted);font-size:10px')}
          <div style="position:absolute;left:300px;right:300px;top:612px;column-count:2;column-gap:34px;font-family:var(--fd);font-size:15px;line-height:1.5;text-align:justify;text-transform:none;letter-spacing:0">${esc(b.name)} ${esc(c.sub)} ${esc(c.features.map((f) => f[0] + ': ' + f[1]).join(' '))} ${esc(c.tagline)}. ${esc(c.stat)}.</div>
          <div style="position:absolute;right:40px;top:640px;width:200px;font-size:11px;line-height:1.5;color:var(--muted)">${esc(c.features[2][1])} ${esc(c.stat)}.</div></div>`;
      } },
      swiss: { name: 'Swiss columns', ref: 'Four-column grid, lowercase statement (Swiss web designers)', render(x) {
        const { t, c, b } = x;
        return `<div class="abs">
          ${[1, 2, 3].map((i) => `<div style="position:absolute;top:0;bottom:0;left:${i * 25}%;width:1px;background:var(--line)"></div>`).join('')}
          <div style="display:grid;grid-template-columns:repeat(4,1fr);padding:16px 18px">${tiny('■ ' + b.name.toLowerCase())}${tiny('')}${tiny('work')}${tiny('about')}</div>
          ${pic(x, 'detail', 'position:absolute;left:25%;width:50%;top:60px;height:420px;opacity:.38')}
          <div class="h" style="position:absolute;left:18px;right:40px;bottom:46px;font-size:${hs(t, 78)}px;line-height:1.02;text-transform:lowercase;font-family:var(--fb);font-weight:var(--fbw);letter-spacing:-0.02em">${esc(c.headline.toLowerCase())}<br><span style="color:var(--muted)">${esc(c.tagline.toLowerCase())}.</span></div></div>`;
      } },
      fullbleed: { name: 'Full-bleed photo', ref: 'Campaign image with overlaid wordmark (fashion and travel)', render(x) {
        const { t, c } = x;
        return `<div class="abs">${pic(x, 'hero', 'position:absolute;inset:0')}<div style="position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.28),rgba(0,0,0,0) 26%,rgba(0,0,0,0) 55%,rgba(0,0,0,.5))"></div>
          <div class="row" style="position:absolute;left:40px;right:40px;top:30px;justify-content:space-between;color:#fff">${x.word(26, 'light')}<span class="row" style="gap:26px">${c.nav.map((n) => tiny(n, 'color:#fff')).join('')}</span></div>
          <div style="position:absolute;left:40px;bottom:44px;color:#fff;display:flex;flex-direction:column;gap:20px;max-width:760px">${H(t, 'h1', c.headline, 76, 'color:#fff')}<div class="row" style="gap:18px"><span class="btn light">${esc(c.cta)}</span>${tiny(c.tagline, 'color:#fff')}</div></div>
          ${tiny('01 / 04', 'position:absolute;right:40px;bottom:46px;color:#fff')}</div>`;
      } },
      product: { name: 'Product page', ref: 'Commerce detail page with still life (D2C brands)', render(x) {
        const { t, c } = x;
        return `<div class="abs" style="display:grid;grid-template-rows:64px 1fr">
          <div class="row" style="padding:0 40px;justify-content:space-between;border-bottom:1px solid var(--line)"><span class="row" style="gap:26px">${c.nav.slice(0, 3).map((n) => tiny(n)).join('')}</span>${x.lockup(20)}<span class="row" style="gap:26px">${tiny('Search')}${tiny('Bag (1)')}</span></div>
          <div style="display:grid;grid-template-columns:1.25fr 1fr">${pic(x, 'product', 'height:100%;background:var(--surface)')}
            <div style="padding:60px 70px;display:flex;flex-direction:column;gap:20px">${tiny(c.nav[0] + ' / ' + c.product.name, 'color:var(--muted)')}${H(t, 'h1', c.product.name, 54)}
              <div class="s" style="color:var(--muted)">${esc(c.product.detail)}</div><div class="s" style="font-size:20px">£ 38.00</div><p class="s" style="line-height:1.6;max-width:420px;margin:0">${esc(c.sub)}</p>
              <div class="row" style="gap:8px">${['Single', 'Set of 3', 'Refill'].map((o, i) => `<span class="opt ${i ? '' : 'on'}">${o}</span>`).join('')}</div><span class="btn" style="width:100%">Add to bag</span>
              <div>${['Details', 'Ingredients', 'Delivery & returns'].map((k) => `<div class="row s" style="justify-content:space-between;border-top:1px solid var(--line);padding:14px 0">${k}<span>+</span></div>`).join('')}</div></div></div></div>`;
      } },
      bento: { name: 'Bento product', ref: 'Headline over a grid of feature tiles (software and fintech)', render(x) {
        const { t, c } = x;
        return `<div class="abs" style="padding:24px 40px">
          <div class="row" style="justify-content:space-between">${x.lockup(22)}<span class="row" style="gap:28px">${c.nav.map((n) => tiny(n)).join('')}</span><span class="btn sm">${esc(c.cta)}</span></div>
          <div style="text-align:center;margin:50px auto 34px;max-width:900px;display:flex;flex-direction:column;align-items:center;gap:18px">${H(t, 'h1', c.headline, 64)}<p class="lead" style="max-width:600px">${esc(c.sub)}</p></div>
          <div style="display:grid;grid-template-columns:1.4fr 1fr 1fr;grid-template-rows:240px 210px;gap:12px">
            ${pic(x, 'people', 'grid-row:span 2;border-radius:var(--r)')}
            <div class="tile" style="background:var(--surface)"><span class="xs" style="color:var(--muted)">${esc(c.app.metricLabel)}</span><div class="h" style="font-size:${hs(t, 46)}px;margin-top:8px">${esc(c.app.metric)}</div><svg viewBox="0 0 200 60" style="width:100%;height:70px;margin-top:14px"><path d="M0 50 C30 45 40 20 70 28 S120 10 140 18 180 4 200 8" fill="none" stroke="var(--primary)" stroke-width="3"/></svg></div>
            <div class="tile" style="background:var(--primary);color:var(--on-primary)"><div class="h" style="color:inherit;font-size:${hs(t, 64)}px">${esc(c.stat.split(' ')[0])}</div><div class="s" style="margin-top:auto">${esc(c.stat.split(' ').slice(1).join(' '))}</div></div>
            <div class="tile" style="background:var(--surface);grid-column:span 2;display:grid;grid-template-columns:repeat(3,1fr);gap:18px">${c.features.map(([k, v], i) => `<div><span class="ic" style="background:${['var(--primary)', 'var(--secondary)', 'var(--accent)'][i]}"></span><b class="s" style="display:block;margin-top:14px">${esc(k)}</b><span class="xs" style="color:var(--muted)">${esc(v)}</span></div>`).join('')}</div></div></div>`;
      } },
      colorfield: { name: 'Colour field', ref: 'Oversized cropped type on a brand colour (agency sites)', render(x) {
        const { t, c, b } = x, size = fill(t, b.name, 1500, 420);
        return `<div class="abs" style="background:var(--primary);color:var(--on-primary)">
          <div class="h" style="position:absolute;left:28px;top:20px;color:var(--on-primary);font-size:${size}px;line-height:.8;white-space:nowrap;letter-spacing:-0.05em">${esc(b.name)}</div>
          <span class="xs" style="position:absolute;right:30px;top:30px;color:inherit">™</span>
          <div style="position:absolute;left:0;right:0;bottom:40px;text-align:center;font-family:var(--fd);font-weight:var(--fdw);font-size:30px;line-height:1.05;text-transform:uppercase;color:var(--on-primary)">${esc(c.tagline)}<br>${esc(c.billboard)}</div>
          <div class="row" style="position:absolute;left:30px;right:30px;bottom:30px;justify-content:space-between">${tiny(c.nav[0], 'color:inherit')}${tiny(c.nav[3], 'color:inherit')}</div></div>`;
      } },
      list: { name: 'Indexed list', ref: 'Work list with years beside a product shot (art-director portfolios)', render(x) {
        const { t, c, b } = x;
        const rows = [...c.nav, ...c.features.map((f) => f[0]), c.product.name, c.webinar.split(' ').slice(0, 3).join(' ')];
        return `<div class="abs" style="background:${t.mode === 'dark' ? 'var(--bg)' : '#0d0d0e'};color:#eee">
          ${pic(x, 'place', 'position:absolute;inset:0;opacity:.85')}<div style="position:absolute;inset:0;background:linear-gradient(90deg,rgba(0,0,0,.75),rgba(0,0,0,.2))"></div>
          <div style="position:absolute;left:24px;top:22px;width:360px;background:#fff;color:#111;padding:14px;font-family:var(--fm);font-size:10.5px;line-height:1.5;display:grid;grid-template-columns:1fr 1fr;gap:8px"><div><b>${esc(b.name.toUpperCase())}</b><br>${esc(c.tagline.toUpperCase())}</div><div>${c.nav.map((n) => esc(n.toUpperCase())).join('<br>')}</div></div>
          <div style="position:absolute;right:120px;top:260px;width:420px;font-family:var(--fm);font-size:11px;line-height:1.85">${rows.map((r, i) => `<div class="row" style="justify-content:space-between;${i === 2 ? 'background:#fff;color:#111;padding:0 4px;' : ''}"><span>${esc(r.toUpperCase())}</span><span>${2026 - (i % 4)}</span></div>`).join('')}</div>
          <div class="row" style="position:absolute;left:24px;right:24px;bottom:18px;justify-content:space-between;font-family:var(--fm);font-size:10px">${esc(c.stat.toUpperCase())}<span>CLICK AND HOLD ···</span></div></div>`;
      } }
    }
  };

  /* ======================= MOBILE APP ======================= */
  const phone = (inner) => `<div class="phone"><div class="screen"><div class="sb"><b>9:41</b><span class="sbi"></span></div>${inner}</div></div>`;
  L.app = {
    name: 'Mobile app', group: 'Digital', w: 430, h: 900, frame: true,
    layouts: {
      home: { name: 'Account home', ref: 'Balance card and activity list (fintech and service apps)', render(x) {
        const { t, c } = x;
        const items = c.app.items.map(([k, v], i) => `<div class="li"><span class="ic" style="background:${['var(--primary)', 'var(--secondary)', 'var(--accent)'][i]}"></span><span style="flex:1">${esc(k)}</span><b>${esc(v)}</b></div>`).join('');
        return phone(`<div class="row" style="justify-content:space-between;padding:14px 22px 6px">${H(t, 'div', c.app.greeting, 24)}${x.mark(30)}</div>
          <div class="hero-card">${pic(x, 'detail', 'height:120px')}<div style="padding:16px 20px 18px"><div class="xs" style="opacity:.8">${esc(c.app.metricLabel)}</div><div class="h" style="color:var(--on-primary);font-size:${hs(t, 38)}px;margin-top:4px">${esc(c.app.metric)}</div></div></div>
          <div class="sec">Recent</div><div style="display:flex;flex-direction:column;gap:8px;padding:0 22px">${items}</div>
          <div style="padding:14px 22px 0"><span class="btn" style="width:100%">${esc(c.cta)}</span></div>
          <div class="tabs">${c.app.tabs.map((x2, i) => `<span class="${i === 0 ? 'on' : ''}"><i></i>${esc(x2)}</span>`).join('')}</div>`);
      } },
      feed: { name: 'Editorial feed', ref: 'Image-led stories feed (media and lifestyle apps)', render(x) {
        const { t, c } = x;
        return phone(`<div class="row" style="justify-content:space-between;padding:12px 22px">${x.word(22)}<span class="xs">${esc(c.app.tabs[1])}</span></div>
          <div class="row" style="gap:10px;padding:4px 22px 14px">${[0, 1, 2, 3].map((i) => `<div style="width:58px;height:58px;border-radius:50%;overflow:hidden;position:relative;box-shadow:0 0 0 2px var(--bg),0 0 0 4px var(--primary)">${PG.photoImg(x.pick('people', 20 + i), t, { grade: x.grade, thumb: true })}</div>`).join('')}</div>
          ${pic(x, 'hero', 'margin:0 22px;height:380px;border-radius:var(--r)')}
          <div style="padding:14px 22px;display:flex;flex-direction:column;gap:6px"><span class="eb" style="font-size:11px">${esc(c.tagline)}</span>${H(t, 'div', c.social, 26)}<span class="xs" style="color:var(--muted)">4 min read · ${esc(c.stat)}</span></div>
          <div class="tabs">${c.app.tabs.map((x2, i) => `<span class="${i === 0 ? 'on' : ''}"><i></i>${esc(x2)}</span>`).join('')}</div>`);
      } },
      detail: { name: 'Product detail', ref: 'Full-bleed product with bottom sheet (commerce apps)', render(x) {
        const { t, c } = x;
        return phone(`${pic(x, 'product', 'position:absolute;left:0;right:0;top:0;height:520px')}
          <div style="position:absolute;left:0;right:0;bottom:0;top:470px;background:var(--bg);border-radius:28px 28px 0 0;padding:26px 24px;display:flex;flex-direction:column;gap:10px">
            <div class="row" style="justify-content:space-between">${x.word(15)}<span class="xs">♡</span></div>${H(t, 'div', c.product.name, 34)}<span class="xs" style="color:var(--muted)">${esc(c.product.detail)}</span>
            <p class="xs" style="line-height:1.55;margin:4px 0 0">${esc(c.sub)}</p><div class="row" style="justify-content:space-between;margin-top:auto"><b class="s" style="font-size:20px">£38</b><span class="btn">${esc(c.cta)}</span></div></div>`);
      } }
    }
  };

  /* ======================= SOCIAL 1080×1350 ======================= */
  L.social = {
    name: 'Social post', group: 'Social', w: 1080, h: 1350,
    layouts: {
      photo: { name: 'Photo + caption', ref: 'Campaign photograph with a quiet caption block', render(x) {
        const { t, c } = x;
        return `<div class="abs">${pic(x, 'hero', 'position:absolute;inset:0 0 300px 0')}<div style="position:absolute;left:64px;top:56px">${x.word(34, 'light')}</div>
          <div style="position:absolute;left:0;right:0;bottom:0;height:300px;padding:52px 64px;display:flex;flex-direction:column;justify-content:space-between">${H(t, 'div', c.social, 58)}<div class="row" style="justify-content:space-between">${tiny('@' + url(x.b).replace('.com', ''), 'font-size:22px')}${tiny('01 / 05', 'font-size:22px;color:var(--muted)')}</div></div></div>`;
      } },
      type: { name: 'Type on colour', ref: 'Headline-only post on the brand colour', render(x) {
        const { t, c } = x;
        return `<div class="abs" style="background:var(--primary);color:var(--on-primary);padding:72px">${H(t, 'div', c.social, 116, 'color:var(--on-primary);max-width:900px')}
          <div class="row" style="position:absolute;left:72px;right:72px;bottom:64px;justify-content:space-between">${x.lockup(34, 'reverse')}${tiny('Swipe →', 'font-size:24px;color:inherit')}</div></div>`;
      } },
      quote: { name: 'Quote card', ref: 'Serif testimonial with portrait', render(x) {
        const { t, c } = x;
        return `<div class="abs" style="background:var(--surface);padding:96px 84px;display:flex;flex-direction:column;justify-content:space-between">
          <div class="h" style="font-size:${hs(t, 78)}px;line-height:1.08">“${esc(c.social)}”</div>
          <div class="row" style="gap:24px"><div style="width:120px;height:120px;border-radius:50%;overflow:hidden;position:relative">${PG.photoImg(x.pick('people', 30), t, { grade: x.grade, thumb: true })}</div><div><div style="font-size:28px;font-weight:var(--fbb)">${esc(c.speaker[0])}</div><div style="font-size:22px;color:var(--muted)">${esc(c.speaker[1])}</div></div><span style="margin-left:auto">${x.mark(70)}</span></div></div>`;
      } },
      frame: { name: 'Editorial frame', ref: 'Inset photo with two-column caption (magazine accounts)', render(x) {
        const { t, c, b } = x;
        return `<div class="abs" style="padding:70px">${pic(x, 'place', 'height:900px')}
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:40px;margin-top:44px">${H(t, 'div', c.story, 50)}<div style="font-size:22px;line-height:1.5;color:var(--muted)">${esc(c.sub)}</div></div>
          <div class="row" style="position:absolute;left:70px;right:70px;bottom:52px;justify-content:space-between">${x.word(26)}${tiny(c.tagline, 'font-size:20px;color:var(--muted)')}</div></div>`;
      } },
      product: { name: 'Product on colour', ref: 'Still life with price and name (D2C launches)', render(x) {
        const { t, c } = x;
        return `<div class="abs" style="background:var(--secondary);color:var(--on-secondary)">${pic(x, 'product', 'position:absolute;left:110px;right:110px;top:150px;height:860px;border-radius:var(--r)')}
          <div class="row" style="position:absolute;left:70px;right:70px;top:56px;justify-content:space-between">${x.word(30)}${tiny('New', 'font-size:22px;color:inherit')}</div>
          <div class="row" style="position:absolute;left:110px;right:110px;bottom:80px;justify-content:space-between;align-items:flex-end">${H(t, 'div', c.product.name, 70, 'color:inherit')}<span style="font-size:30px">£38</span></div></div>`;
      } },
      grid: { name: 'Photo grid', ref: 'Four-up grid with centred badge (carousel covers)', render(x) {
        return `<div class="abs" style="display:grid;grid-template-columns:1fr 1fr;grid-template-rows:1fr 1fr;gap:8px;background:var(--bg)">${[0, 1, 2, 3].map((i) => pic(x, ['people', 'product', 'place', 'detail'][i], '', 40 + i)).join('')}
          <div style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);background:var(--bg);border-radius:999px;padding:30px 50px">${x.lockup(40)}</div></div>`;
      } }
    }
  };

  /* ======================= STORY 1080×1920 ======================= */
  L.story = {
    name: 'Story', group: 'Social', w: 1080, h: 1920,
    layouts: {
      photo: { name: 'Full photo', ref: 'Vertical photo with sticker CTA', render(x) {
        const { t, c } = x;
        return `<div class="abs">${pic(x, 'people', 'position:absolute;inset:0')}<div style="position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.25),transparent 25%,transparent 55%,rgba(0,0,0,.55))"></div>
          <div style="position:absolute;left:70px;top:90px">${x.word(40, 'light')}</div>
          <div style="position:absolute;left:70px;right:70px;bottom:150px;display:flex;flex-direction:column;gap:40px;align-items:flex-start">${H(t, 'div', c.story, 120, 'color:#fff')}<span class="btn light" style="font-size:34px;padding:28px 52px">${esc(c.cta)} ↗</span></div></div>`;
      } },
      split: { name: 'Photo / type split', ref: 'Photo above, set type below', render(x) {
        const { t, c } = x;
        return `<div class="abs">${pic(x, 'hero', 'height:1080px')}<div style="padding:70px 76px;display:flex;flex-direction:column;gap:30px"><span class="eb" style="font-size:26px">${esc(c.tagline)}</span>${H(t, 'div', c.story, 112)}<p class="lead" style="font-size:32px">${esc(c.sub)}</p></div>
          <div class="row" style="position:absolute;left:76px;right:76px;bottom:70px;justify-content:space-between">${x.lockup(34)}<span class="btn" style="font-size:28px">${esc(c.cta)}</span></div></div>`;
      } },
      type: { name: 'Type story', ref: 'Big type on colour with small photo', render(x) {
        const { t, c } = x;
        return `<div class="abs" style="background:var(--primary);color:var(--on-primary);padding:90px 80px">${x.word(40, 'reverse')}
          ${H(t, 'div', c.story, 168, 'color:var(--on-primary);margin-top:220px')}${pic(x, 'detail', 'position:absolute;right:80px;bottom:200px;width:420px;height:520px;border-radius:var(--r)')}
          ${tiny(c.tagline, 'position:absolute;left:80px;bottom:90px;font-size:28px;color:inherit')}</div>`;
      } }
    }
  };

  /* ======================= POSTER 900×1273 ======================= */
  L.poster = {
    name: 'Poster', group: 'Print', w: 900, h: 1273,
    layouts: {
      swiss: { name: 'Swiss type poster', ref: 'International Typographic Style event poster', render(x) {
        const { t, c, b } = x, [title, sub, when] = c.poster;
        return `<div class="abs" style="padding:44px">
          <div class="h" style="font-size:${fill(t, title.split(' ')[0], 820, 260)}px;line-height:.86;letter-spacing:-0.05em">${esc(title.split(' ').join('\n')).replace(/\n/g, '<br>')}</div>
          ${pic(x, 'detail', 'position:absolute;right:44px;top:560px;width:380px;height:460px')}
          <div style="position:absolute;left:44px;top:600px;width:340px;display:flex;flex-direction:column;gap:16px"><div style="font-size:22px;font-weight:var(--fbb)">${esc(sub)}</div><div style="font-size:15px;line-height:1.5;color:var(--muted)">${esc(c.sub)}</div></div>
          <div style="position:absolute;left:44px;right:44px;bottom:40px;display:grid;grid-template-columns:repeat(3,1fr);border-top:2px solid var(--ink);padding-top:14px;font-size:14px"><b>${esc(when)}</b><span>${esc(url(b))}</span><span style="justify-self:end">${x.word(18)}</span></div></div>`;
      } },
      photo: { name: 'Photo poster', ref: 'Framed photograph with title block (exhibition posters)', render(x) {
        const { t, c, b } = x, [title, sub, when] = c.poster;
        return `<div class="abs" style="padding:40px">${pic(x, 'place', 'height:820px')}
          <div style="display:flex;justify-content:space-between;align-items:flex-end;margin-top:30px">${H(t, 'div', title, 92)}<span>${x.mark(64)}</span></div>
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;margin-top:22px;font-size:14px;border-top:1px solid var(--ink);padding-top:12px"><span>${esc(sub)}</span><b>${esc(when)}</b><span style="text-align:right">${esc(url(b))}</span></div></div>`;
      } },
      crop: { name: 'Cropped wordmark', ref: 'Giant type cropped off the sheet (agency posters)', render(x) {
        const { t, c, b } = x, [title, sub, when] = c.poster;
        return `<div class="abs" style="background:var(--primary);color:var(--on-primary)">
          <div class="h" style="position:absolute;left:-10px;top:-40px;color:var(--on-primary);font-size:${fill(t, b.name, 900, 560) * 1.6}px;line-height:.82;letter-spacing:-0.06em;writing-mode:vertical-rl;transform:rotate(180deg);white-space:nowrap">${esc(b.name)}</div>
          <div style="position:absolute;right:44px;top:50px;width:380px;display:flex;flex-direction:column;gap:14px;text-align:right">${H(t, 'div', title, 64, 'color:var(--on-primary)')}<div style="font-size:18px">${esc(sub)}</div></div>
          <div style="position:absolute;right:44px;bottom:40px;text-align:right;font-size:16px"><b>${esc(when)}</b><br>${esc(url(b))}</div></div>`;
      } },
      grid: { name: 'Info grid', ref: 'Modular grid with photos and details', render(x) {
        const { t, c, b } = x, [title, sub, when] = c.poster;
        return `<div class="abs" style="display:grid;grid-template-columns:1fr 1fr;grid-template-rows:1fr 1fr 1fr;gap:2px;background:var(--ink)">
          <div style="background:var(--bg);padding:34px;display:flex;flex-direction:column;justify-content:space-between">${x.lockup(24)}${H(t, 'div', title, 60)}</div>${pic(x, 'people', '', 50)}
          ${pic(x, 'detail', '', 51)}<div style="background:var(--accent);color:var(--ink);padding:34px;display:flex;flex-direction:column;justify-content:flex-end;font-size:22px"><b>${esc(when)}</b>${esc(sub)}</div>
          <div style="background:var(--bg);padding:34px;font-size:15px;line-height:1.5;grid-column:span 2;display:flex;justify-content:space-between;align-items:flex-end">${esc(c.sub)}<b>${esc(url(b))}</b></div></div>`;
      } }
    }
  };

  /* ======================= PRESENTATION 1920×1080 ======================= */
  L.webinar = {
    name: 'Presentation', group: 'Events', w: 1920, h: 1080,
    layouts: {
      title: { name: 'Webinar title', ref: 'Speaker title slide', render(x) {
        const { t, c, b } = x, [name, role] = c.speaker;
        return `<div class="abs" style="display:grid;grid-template-columns:1.2fr 1fr">
          <div style="padding:90px 110px;display:flex;flex-direction:column;justify-content:space-between">${x.lockup(34)}
            <div style="display:flex;flex-direction:column;gap:34px"><span class="chip">● Live webinar</span>${H(t, 'div', c.webinar, 100)}
            <div class="row" style="gap:24px"><div style="width:110px;height:110px;border-radius:50%;overflow:hidden;position:relative">${PG.photoImg(x.pick('people', 60), t, { grade: x.grade, thumb: true })}</div><div><div style="font-size:32px;font-weight:var(--fbb)">${esc(name)}</div><div style="font-size:24px;color:var(--muted)">${esc(role)}, ${esc(b.name)}</div></div></div></div>
            <div class="row" style="gap:26px"><span class="btn" style="font-size:24px">Register free</span>${tiny('Thu 21 Nov · 16:00 GMT · 45 min', 'font-size:22px;color:var(--muted)')}</div></div>
          ${pic(x, 'hero', 'height:100%')}</div>`;
      } },
      statement: { name: 'Big statement', ref: 'One sentence on the brand colour (keynote style)', render(x) {
        const { t, c } = x;
        return `<div class="abs" style="background:var(--ink);color:var(--bg);padding:110px">${tiny('02 — Why now', 'font-size:22px;color:var(--bg);opacity:.7')}
          ${H(t, 'div', c.headline, 150, `color:var(--bg);margin-top:120px;max-width:1500px`)}<div class="row" style="position:absolute;left:110px;right:110px;bottom:80px;justify-content:space-between">${x.word(30, 'inverse')}${tiny(c.tagline, 'font-size:22px;color:var(--bg);opacity:.7')}</div></div>`;
      } },
      data: { name: 'Key number', ref: 'Big figure beside a photograph', render(x) {
        const { t, c } = x;
        return `<div class="abs" style="display:grid;grid-template-columns:1fr 1fr">${pic(x, 'people', 'height:100%')}
          <div style="padding:110px;display:flex;flex-direction:column;justify-content:center;gap:28px">${tiny('Impact', 'font-size:22px;color:var(--muted)')}<div class="h" style="font-size:${hs(t, 220)}px;color:var(--primary-text);line-height:.9">${esc(c.stat.split(' ')[0])}</div><div style="font-size:36px;line-height:1.3">${esc(c.stat.split(' ').slice(1).join(' '))}</div><p style="font-size:24px;color:var(--muted);line-height:1.5;margin:0">${esc(c.sub)}</p></div></div>`;
      } }
    }
  };

  /* ======================= EMAIL 640 ======================= */
  L.email = {
    name: 'Email', group: 'Digital', w: 640, h: 1080,
    layouts: {
      newsletter: { name: 'Editorial newsletter', ref: 'Single-column newsletter', render(x) {
        const { t, c, b } = x;
        return `<div class="abs" style="background:var(--surface)"><div style="position:absolute;left:30px;right:30px;top:24px;bottom:0;background:var(--bg)">
          <div style="padding:26px;text-align:center;border-bottom:1px solid var(--line)">${x.lockup(22)}</div>${pic(x, 'hero', 'height:300px')}
          <div style="padding:36px 40px;display:flex;flex-direction:column;gap:18px">${H(t, 'div', c.email, 38)}<p style="font-size:${Math.max(16, t.minBody)}px;line-height:1.6;margin:0">${esc(c.sub)}</p><div><span class="btn">${esc(c.cta)}</span></div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:10px">${[0, 1].map((i) => `<div>${pic(x, 'detail', 'height:150px', 70 + i)}<b class="s" style="display:block;margin-top:10px">${esc(c.features[i][0])}</b><span class="xs" style="color:var(--muted)">${esc(c.features[i][1])}</span></div>`).join('')}</div></div>
          <div class="xs" style="position:absolute;bottom:0;left:0;right:0;padding:20px 40px;color:var(--muted);border-top:1px solid var(--line)">${esc(b.name)} · 12 Market Street, London · Unsubscribe</div></div></div>`;
      } }
    }
  };

  /* ======================= AD BANNER 1200×628 ======================= */
  L.banner = {
    name: 'Ad banner', group: 'Social', w: 1200, h: 628,
    layouts: {
      split: { name: 'Photo split', ref: 'Paid social / LinkedIn ad', render(x) {
        const { t, c } = x;
        return `<div class="abs" style="display:grid;grid-template-columns:1fr 1fr"><div style="padding:48px;display:flex;flex-direction:column;justify-content:space-between">${x.lockup(24)}${H(t, 'div', c.headline, 52)}<div><span class="btn">${esc(c.cta)}</span></div></div>${pic(x, 'hero', 'height:100%')}</div>`;
      } },
      overlay: { name: 'Photo overlay', ref: 'Full-bleed photo with type', render(x) {
        const { t, c } = x;
        return `<div class="abs">${pic(x, 'people', 'position:absolute;inset:0')}<div style="position:absolute;inset:0;background:linear-gradient(90deg,rgba(0,0,0,.55),transparent 70%)"></div>
          <div style="position:absolute;left:52px;top:44px">${x.word(26, 'light')}</div><div style="position:absolute;left:52px;bottom:52px;max-width:620px;display:flex;flex-direction:column;gap:22px">${H(t, 'div', c.billboard, 64, 'color:#fff')}<div><span class="btn light">${esc(c.cta)}</span></div></div></div>`;
      } }
    }
  };

  /* ======================= BILLBOARD (flat) 1920×640 ======================= */
  L.billboard = {
    name: 'Billboard', group: 'Physical', w: 1920, h: 640,
    layouts: {
      photo: { name: 'Photo + line', ref: '48-sheet outdoor', render(x) {
        const { t, c } = x;
        return `<div class="abs" style="display:grid;grid-template-columns:1.1fr 1fr"><div style="padding:70px 90px;display:flex;flex-direction:column;justify-content:space-between">${H(t, 'div', c.billboard, 150)}<div class="row" style="justify-content:space-between">${x.lockup(40)}${tiny(c.tagline, 'font-size:24px;color:var(--muted)')}</div></div>${pic(x, 'hero', 'height:100%')}</div>`;
      } },
      type: { name: 'Type only', ref: 'Copy-led outdoor on colour', render(x) {
        const { t, c } = x;
        return `<div class="abs" style="background:var(--primary);color:var(--on-primary);padding:70px 90px;display:flex;flex-direction:column;justify-content:space-between">${H(t, 'div', c.billboard, 210, 'color:var(--on-primary)')}<div class="row" style="justify-content:space-between">${x.lockup(44, 'reverse')}${tiny(url(x.b), 'font-size:26px;color:inherit')}</div></div>`;
      } }
    }
  };

  /* ======================= IDENTITY SPREAD 1600×1000 ======================= */
  L.identity = {
    name: 'Brand book', group: 'Brand', w: 1600, h: 1000,
    layouts: {
      spread: { name: 'Guidelines spread', ref: 'Brand book spread: logo, colour, type, imagery', render(x) {
        const { t, c, b } = x;
        const sw = [['Primary', t.primary, t.onPrimary], ['Ink', t.ink, t.bg], ['Paper', t.bg, t.ink], ['Secondary', t.secondary, t.onSecondary], ['Accent', t.accent, t.ink]];
        return `<div class="abs" style="display:grid;grid-template-columns:1fr 1fr;background:var(--line);gap:1px">
          <div style="background:var(--bg);display:grid;grid-template-rows:1.2fr 1fr">
            <div style="display:grid;place-items:center;position:relative">${x.lockup(64)}${tiny('01 — Logo', 'position:absolute;left:34px;top:28px;color:var(--muted)')}</div>
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr">
              <div style="background:var(--primary);display:grid;place-items:center">${x.lockup(26, 'reverse')}</div>
              <div style="background:var(--ink);display:grid;place-items:center">${x.lockup(26, 'inverse')}</div>
              <div style="background:var(--surface);display:grid;place-items:center">${x.mark(110) || x.word(40)}</div></div></div>
          <div style="background:var(--bg);display:grid;grid-template-rows:auto 1fr auto">
            <div style="display:grid;grid-template-columns:repeat(5,1fr);height:300px">${sw.map(([k, v, on]) => `<div style="background:${v};color:${on};padding:20px;display:flex;flex-direction:column;justify-content:flex-end;font-size:13px;border-left:1px solid var(--line)"><b>${k}</b><span style="font-family:var(--fm);font-size:12px;opacity:.85">${v}</span></div>`).join('')}</div>
            <div style="padding:30px 34px;display:grid;grid-template-columns:auto 1fr;gap:34px;align-items:center"><span class="h" style="font-size:170px;line-height:.85">Aa</span>
              <div style="display:flex;flex-direction:column;gap:10px;min-width:0"><b style="font-size:20px">${esc(t.display)} · ${esc(t.body)}</b><p style="font-size:16px;line-height:1.55;margin:0;max-width:440px">${esc(c.sub)}</p><span style="font-size:14px;color:var(--muted)">Voice — "${esc(x.dir.voice)}"</span></div></div>
            <div style="display:grid;grid-template-columns:repeat(4,1fr);height:230px;gap:1px">${[0, 1, 2, 3].map((i) => pic(x, ['people', 'place', 'product', 'detail'][i], '', 80 + i)).join('')}</div></div></div>`;
      } }
    }
  };

  /* ======================= PACKAGING / PRINT / DEVICES (3D) ======================= */
  /* These touchpoints render through PG.Mockups (three.js). The entries here only declare them. */
  L.packaging = { name: 'Packaging', group: 'Physical', w: 1600, h: 1200, three: true, layouts: {} };
  L.stationery = { name: 'Stationery', group: 'Print', w: 1600, h: 1200, three: true, layouts: {} };
  L.devices = { name: 'Devices', group: 'Digital', w: 1600, h: 1200, three: true, layouts: {} };
  L.outdoor = { name: 'Outdoor', group: 'Physical', w: 1600, h: 1200, three: true, layouts: {} };

  /* Default layout per touchpoint for each direction. */
  const KIT = {
    minimal: ['quietLux', 'japaneseMinimal', 'softWellness', 'architectural', 'clinical'],
    editorial: ['editorialLux', 'magazine', 'heritage', 'artdeco', 'institutional', 'organic', 'warmHuman'],
    bold: ['brutalist', 'maximal', 'kinetic', 'retro', 'memphis', 'y2k', 'handmade', 'riso', 'bauhaus'],
    friendly: ['friendlyGeo', 'neofintech', 'kidsJoy', 'ecoOptimist', 'civic'],
    tech: ['darkprecision', 'gradient', 'scientific', 'cyber', 'dynamicSystem', 'darkLuxury', 'modernist', 'swiss']
  };
  const kitOf = (id) => Object.keys(KIT).find((k) => KIT[k].includes(id)) || 'editorial';
  const WEB = { swiss: 'swiss', institutional: 'split', modernist: 'gallery', neofintech: 'bento', gradient: 'bento', darkprecision: 'cinematic', scientific: 'swiss', editorialLux: 'fullbleed', quietLux: 'index', artdeco: 'magazine', heritage: 'magazine', brutalist: 'bigtype', friendlyGeo: 'bento', warmHuman: 'split', softWellness: 'index', clinical: 'split', organic: 'split', handmade: 'bigtype', ecoOptimist: 'fullbleed', retro: 'colorfield', y2k: 'colorfield', bauhaus: 'swiss', memphis: 'colorfield', japaneseMinimal: 'index', magazine: 'magazine', dynamicSystem: 'list', maximal: 'colorfield', kinetic: 'fullbleed', kidsJoy: 'bento', civic: 'split', cyber: 'list', riso: 'bigtype', architectural: 'gallery', darkLuxury: 'cinematic' };
  const BY_KIT = {
    app: { minimal: 'detail', editorial: 'feed', bold: 'feed', friendly: 'home', tech: 'home' },
    social: { minimal: 'frame', editorial: 'quote', bold: 'type', friendly: 'photo', tech: 'type' },
    story: { minimal: 'split', editorial: 'photo', bold: 'type', friendly: 'photo', tech: 'type' },
    poster: { minimal: 'photo', editorial: 'photo', bold: 'crop', friendly: 'grid', tech: 'swiss' },
    webinar: { minimal: 'data', editorial: 'title', bold: 'statement', friendly: 'title', tech: 'statement' },
    banner: { minimal: 'split', editorial: 'split', bold: 'overlay', friendly: 'split', tech: 'overlay' },
    billboard: { minimal: 'photo', editorial: 'photo', bold: 'type', friendly: 'photo', tech: 'type' }
  };
  PG.defaultLayout = function (tp, dirId) {
    const T = L[tp]; if (!T || T.three) return null;
    const keys = Object.keys(T.layouts);
    if (tp === 'website') return WEB[dirId] || keys[0];
    const k = BY_KIT[tp] && BY_KIT[tp][kitOf(dirId)];
    return keys.includes(k) ? k : keys[0];
  };
  PG.kitOf = kitOf;

  PG.TEMPLATES = L;
  PG.TOUCHPOINTS = Object.keys(L).map((id) => ({ id, name: L[id].name, group: L[id].group, w: L[id].w, h: L[id].h, three: !!L[id].three }));

  /* Brand object shared by all renderers. */
  PG.brandFor = function (brief) {
    const ind = PG.byId(PG.INDUSTRIES, brief.industry);
    const name = ((brief.name || '').trim() || ind.sampleName);
    return { name, initial: name.replace(/^the\s+/i, '').charAt(0).toUpperCase(), initials: initials(name.replace(/^the\s+/i, '')).toUpperCase(), logo: brief.logo || null };
  };

  /* Build a scaled artboard for an HTML touchpoint. Returns { html, w, h, t, layout }. */
  PG.renderBoard = function (tpId, dir, tune, brief, box, opts) {
    opts = opts || {};
    const T = L[tpId];
    const t = PG.tokens(dir, tune, brief);
    const ind = PG.byId(PG.INDUSTRIES, brief.industry);
    const b = PG.brandFor(brief);
    const layout = (opts.layout && T.layouts[opts.layout]) ? opts.layout : ((tune.layouts && tune.layouts[tpId] && T.layouts[tune.layouts[tpId]]) ? tune.layouts[tpId] : PG.defaultLayout(tpId, dir.id));
    const pick = PG.photoPicker(brief, t, (tune.seed || 1) + '|' + tpId + '|' + (opts.salt || ''));
    const ctx = {
      t, c: ind.copy, b, dir, grade: PG.gradeFor(dir.id, tune),
      pick: (role, n) => pick(role, n || 0),
      mark: (px, v) => PG.brandMark(t, b, px, v),
      word: (px, v) => PG.brandWord(t, b, px, v),
      lockup: (px, v) => PG.brandLockup(t, b, px, v)
    };
    const s = Math.min(box.w / T.w, box.h ? box.h / T.h : Infinity);
    const sw = Math.round(T.w * s), sh = Math.round(T.h * s);
    const html = `<div class="stage" style="width:${sw}px;height:${sh}px"><div class="ab${T.frame ? ' framed' : ''}" data-btn="${t.button}" style="width:${T.w}px;height:${T.h}px;transform:scale(${s.toFixed(5)});${PG.cssVars(t)}">${T.layouts[layout].render(ctx)}</div></div>`;
    return { html, w: sw, h: sh, t, layout };
  };

  PG._layoutHelpers = { esc, hs, fill, wf };
})();
