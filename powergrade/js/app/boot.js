/* Boot: load UI fonts, rank directions for the saved brief, restore imported mockups, render. */
(function () {
  const App = PG.App;
  PG.loadFont('Instrument Serif');  // UI fonts (Geist, Geist Mono) are linked in index.html; this serif is used by artwork.
  App.rerank();
  App.renderAll();
  // Mockups imported in earlier sessions live in IndexedDB; add them once they're read back.
  PG.Mocks.restore().then(() => { if (PG.Mocks.all().some((m) => m.source === 'imported')) App.renderAll(); }).catch(() => {});
})();
