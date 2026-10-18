/* Boot: load UI fonts, rank directions for the saved brief, render. */
(function () {
  const App = PG.App;
  ['Hanken Grotesk', 'JetBrains Mono', 'Instrument Serif'].forEach(PG.loadFont);
  App.rerank();
  App.renderAll();
  // Fonts change measured sizes; re-run the board grid once they're in.
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { const v = App.views[App.S.view]; if (v && v.resize) v.resize(); });
})();

// Once the 3D engine and its lighting are loaded, refresh so captions and object lists are complete.
window.addEventListener('pg:studio3d-ready', () => {
  PG.Studio3D.ready.then(() => { const v = PG.App.S.view; if (v === 'board' || v === 'studio' || v === 'compare') PG.App.renderMain(); });
});
