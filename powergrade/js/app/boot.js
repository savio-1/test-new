/* Boot: load UI fonts, rank directions for the saved brief, render. */
(function () {
  const App = PG.App;
  ['Hanken Grotesk', 'JetBrains Mono', 'Instrument Serif'].forEach(PG.loadFont);
  App.rerank();
  App.renderAll();
  // Fonts change measured sizes; re-run the board grid once they're in.
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { const v = App.views[App.S.view]; if (v && v.resize) v.resize(); });
})();
