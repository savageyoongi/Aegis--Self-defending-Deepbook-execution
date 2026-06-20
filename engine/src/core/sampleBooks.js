function levels(start, step, quantities, direction) {
  return quantities.map((quantity, index) => ({
    price: Number((start + direction * step * index).toFixed(4)),
    quantity,
  }));
}

export const sampleBooks = Object.freeze({
  calm: {
    name: "Calm",
    pair: "SUI_DBUSDC",
    bids: levels(1.509, 0.002, [960, 880, 760, 690, 620, 540, 480, 430], -1),
    asks: levels(1.511, 0.002, [920, 860, 790, 710, 640, 570, 510, 460], 1),
    lastPrices: [1.506, 1.507, 1.508, 1.507, 1.509, 1.51, 1.509, 1.51, 1.511, 1.51],
  },
  stressed: {
    name: "Stressed",
    pair: "SUI_DBUSDC",
    bids: levels(1.497, 0.004, [620, 470, 390, 340, 310, 260, 220, 200], -1),
    asks: levels(1.505, 0.0045, [390, 330, 290, 260, 230, 210, 180, 160], 1),
    lastPrices: [1.522, 1.516, 1.512, 1.519, 1.506, 1.498, 1.507, 1.499, 1.504, 1.501],
  },
  toxic: {
    name: "Toxic",
    pair: "SUI_DBUSDC",
    bids: levels(1.486, 0.006, [430, 310, 260, 210, 180, 150, 130, 110], -1),
    asks: levels(1.502, 0.007, [180, 145, 120, 95, 82, 70, 58, 48], 1),
    lastPrices: [1.548, 1.528, 1.536, 1.503, 1.516, 1.487, 1.501, 1.477, 1.492, 1.468],
  },
});

export function getSampleBook(name = "toxic") {
  const key = String(name).toLowerCase();
  return sampleBooks[key] ?? sampleBooks.toxic;
}

export function cloneBook(book) {
  return {
    ...book,
    bids: book.bids.map((level) => ({ ...level })),
    asks: book.asks.map((level) => ({ ...level })),
    lastPrices: [...book.lastPrices],
  };
}
