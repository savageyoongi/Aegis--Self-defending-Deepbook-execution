(function () {
  const sampleBooks = {
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
  };

  const state = {
    pair: "SUI_DBUSDC",
    side: "buy",
    quantity: 750,
    maxSlippageBps: 80,
    urgency: "normal",
    scenario: "toxic",
  };

  const dom = {
    pair: document.getElementById("pair"),
    quantity: document.getElementById("quantity"),
    quantityNumber: document.getElementById("quantityNumber"),
    slippage: document.getElementById("slippage"),
    slippageNumber: document.getElementById("slippageNumber"),
    runButton: document.getElementById("runButton"),
    resetButton: document.getElementById("resetButton"),
    intentSummary: document.getElementById("intentSummary"),
    scenarioLabel: document.getElementById("scenarioLabel"),
    riskScore: document.getElementById("riskScore"),
    riskLabel: document.getElementById("riskLabel"),
    sliceCount: document.getElementById("sliceCount"),
    bandLabel: document.getElementById("bandLabel"),
    savedBps: document.getElementById("savedBps"),
    savedQuote: document.getElementById("savedQuote"),
    ptbCommands: document.getElementById("ptbCommands"),
    midPrice: document.getElementById("midPrice"),
    signals: document.getElementById("signals"),
    deltaBps: document.getElementById("deltaBps"),
    naiveSlip: document.getElementById("naiveSlip"),
    aegisSlip: document.getElementById("aegisSlip"),
    naiveBar: document.getElementById("naiveBar"),
    aegisBar: document.getElementById("aegisBar"),
    bookPair: document.getElementById("bookPair"),
    bookCanvas: document.getElementById("bookCanvas"),
    cadenceLabel: document.getElementById("cadenceLabel"),
    ordersBody: document.getElementById("ordersBody"),
  };

  function levels(start, step, quantities, direction) {
    return quantities.map((quantity, index) => ({
      price: Number((start + direction * step * index).toFixed(4)),
      quantity,
    }));
  }

  function clamp(value, min = 0, max = 1) {
    if (Number.isNaN(value)) return min;
    return Math.min(max, Math.max(min, value));
  }

  function round(value, decimals = 4) {
    const factor = 10 ** decimals;
    return Math.round(value * factor) / factor;
  }

  function sum(values) {
    return values.reduce((total, value) => total + value, 0);
  }

  function mean(values) {
    return values.length ? sum(values) / values.length : 0;
  }

  function stddev(values) {
    if (values.length < 2) return 0;
    const avg = mean(values);
    return Math.sqrt(mean(values.map((value) => (value - avg) ** 2)));
  }

  function bps(changeRatio) {
    return changeRatio * 10000;
  }

  function lerp(start, end, t) {
    return start + (end - start) * clamp(t);
  }

  function cloneBook(book) {
    return {
      ...book,
      bids: book.bids.map((level) => ({ ...level })),
      asks: book.asks.map((level) => ({ ...level })),
      lastPrices: [...book.lastPrices],
    };
  }

  function midPrice(book) {
    return (book.bids[0].price + book.asks[0].price) / 2;
  }

  function computeRisk(book, intent) {
    const mid = midPrice(book);
    const spreadBps = bps((book.asks[0].price - book.bids[0].price) / mid);
    const spreadRisk = clamp(spreadBps / 80);
    const bidDepth = sum(book.bids.slice(0, 6).map((level) => level.quantity));
    const askDepth = sum(book.asks.slice(0, 6).map((level) => level.quantity));
    const imbalanceRisk = clamp((Math.abs(bidDepth - askDepth) / Math.max(bidDepth + askDepth, 1)) * 1.45);
    const limit =
      intent.side === "buy" ? mid * (1 + intent.maxSlippageBps / 10000) : mid * (1 - intent.maxSlippageBps / 10000);
    const executableDepth = sum(
      (intent.side === "buy" ? book.asks : book.bids)
        .filter((level) => (intent.side === "buy" ? level.price <= limit : level.price >= limit))
        .map((level) => level.quantity),
    );
    const thinnessRisk = 1 - clamp(executableDepth / intent.quantity);
    const returns = [];
    for (let index = 1; index < book.lastPrices.length; index += 1) {
      returns.push(Math.log(book.lastPrices[index] / book.lastPrices[index - 1]));
    }
    const volatilityRisk = clamp(bps(stddev(returns)) / 75);
    const topDepth = (intent.side === "buy" ? book.asks : book.bids)[0].quantity;
    const footprintRisk = clamp(intent.quantity / Math.max(topDepth * 3, 1));
    const score = clamp(
      0.27 * volatilityRisk +
        0.22 * spreadRisk +
        0.22 * imbalanceRisk +
        0.21 * thinnessRisk +
        0.08 * footprintRisk,
    );

    return {
      score: round(score, 4),
      label: score < 0.34 ? "low" : score < 0.67 ? "guarded" : "hostile",
      mid: round(mid, 6),
      spreadBps: round(spreadBps, 2),
      signals: {
        volatility: round(volatilityRisk, 4),
        spread: round(spreadRisk, 4),
        imbalance: round(imbalanceRisk, 4),
        depthThinness: round(thinnessRisk, 4),
        footprint: round(footprintRisk, 4),
      },
      depth: { bid: bidDepth, ask: askDepth, executable: executableDepth },
    };
  }

  function gaussianWeights(count, risk) {
    const center = (count - 1) / 2;
    const sigma = lerp(0.7, 3.2, risk);
    const weights = Array.from({ length: count }, (_, index) => {
      const distance = (index - center) / Math.max(sigma, 0.1);
      return Math.exp(-0.5 * distance * distance);
    });
    const total = sum(weights);
    return weights.map((weight) => weight / total);
  }

  function planGrid(intent, book, risk) {
    const urgency = { patient: 0.82, normal: 1, fast: 1.18 }[intent.urgency] ?? 1;
    const sliceCount = Math.round(lerp(3, 11, risk.score));
    const bandBps = clamp(intent.maxSlippageBps * lerp(0.35, 0.95, risk.score) * urgency, 6, intent.maxSlippageBps);
    const anchor = intent.side === "buy" ? book.asks[0].price : book.bids[0].price;
    const weights = gaussianWeights(sliceCount, risk.score);
    const children = weights.map((weight, index) => {
      const t = sliceCount === 1 ? 0 : index / (sliceCount - 1);
      const direction = intent.side === "buy" ? 1 : -1;
      return {
        index: index + 1,
        clientOrderId: String(10000 + index + 1),
        pair: intent.pair,
        side: intent.side,
        isBid: intent.side === "buy",
        price: round(anchor * (1 + direction * (bandBps * t) / 10000), 5),
        quantity: round(intent.quantity * weight, 4),
        priceOffsetBps: round(direction * bandBps * t, 2),
      };
    });
    const correction = round(intent.quantity - sum(children.map((child) => child.quantity)), 4);
    children[children.length - 1].quantity = round(children[children.length - 1].quantity + correction, 4);
    return {
      intent,
      risk,
      sliceCount,
      bandBps: round(bandBps, 2),
      refreshCadenceMs: Math.round(lerp(450, 1800, risk.score)),
      children,
      atomicity: { suiPtbCommands: children.length, allOrNothing: true },
    };
  }

  function attackBook(book, intent, exposureRatio = 1) {
    const attacked = cloneBook(book);
    const topDepth = intent.side === "buy" ? book.asks[0].quantity : book.bids[0].quantity;
    const pressure = clamp(intent.quantity / Math.max(topDepth * 4, 1));
    const shiftBps = (18 + 95 * pressure) * clamp(exposureRatio, 0.04, 1);
    const depthCut = (0.18 + 0.5 * pressure) * clamp(exposureRatio, 0.04, 1);

    if (intent.side === "buy") {
      attacked.asks = attacked.asks.map((level, index) => ({
        price: round(level.price * (1 + (shiftBps * (1 - index * 0.055)) / 10000), 5),
        quantity: round(level.quantity * (1 - depthCut * (index < 4 ? 1 : 0.45)), 4),
      }));
    } else {
      attacked.bids = attacked.bids.map((level, index) => ({
        price: round(level.price * (1 - (shiftBps * (1 - index * 0.055)) / 10000), 5),
        quantity: round(level.quantity * (1 - depthCut * (index < 4 ? 1 : 0.45)), 4),
      }));
    }
    return { book: attacked, shiftBps };
  }

  function consumeMarketOrder(intent, book) {
    const levelsToUse = intent.side === "buy" ? book.asks : book.bids;
    let remaining = intent.quantity;
    let filled = 0;
    let notional = 0;
    for (const level of levelsToUse) {
      if (remaining <= 0) break;
      const take = Math.min(remaining, level.quantity);
      filled += take;
      notional += take * level.price;
      remaining -= take;
    }
    const avgFill = notional / Math.max(filled, 1);
    const mid = midPrice(book);
    const slippageBps = intent.side === "buy" ? bps((avgFill - mid) / mid) : bps((mid - avgFill) / mid);
    return {
      avgFill: round(avgFill, 5),
      filled: round(filled, 4),
      fillRatio: round(filled / intent.quantity, 4),
      slippageBps: round(Math.max(slippageBps, 0), 2),
    };
  }

  function fillChildOrder(book, child) {
    const levelsToUse = child.side === "buy" ? book.asks : book.bids;
    let remaining = child.quantity;
    let filled = 0;
    let notional = 0;
    for (const level of levelsToUse) {
      const allowed = child.side === "buy" ? level.price <= child.price : level.price >= child.price;
      if (!allowed || remaining <= 0) continue;
      const take = Math.min(remaining, level.quantity);
      level.quantity = round(level.quantity - take, 4);
      filled += take;
      notional += take * level.price;
      remaining -= take;
    }
    return { filled, notional, resting: remaining };
  }

  function executeGrid(intent, book, plan) {
    const workingBook = cloneBook(book);
    const fills = plan.children.map((child) => fillChildOrder(workingBook, child));
    const filled = sum(fills.map((fill) => fill.filled));
    const notional = sum(fills.map((fill) => fill.notional));
    const avgFill = notional / Math.max(filled, 1);
    const mid = midPrice(book);
    const slippageBps = intent.side === "buy" ? bps((avgFill - mid) / mid) : bps((mid - avgFill) / mid);
    return {
      avgFill: round(avgFill, 5),
      filled: round(filled, 4),
      resting: round(sum(fills.map((fill) => fill.resting)), 4),
      fillRatio: round(filled / intent.quantity, 4),
      slippageBps: round(Math.max(slippageBps, 0), 2),
    };
  }

  function simulateDuel(intent, book) {
    const risk = computeRisk(book, intent);
    const plan = planGrid(intent, book, risk);
    const naiveAttack = attackBook(book, intent, 1);
    const naive = consumeMarketOrder(intent, naiveAttack.book);
    const maxSlice = Math.max(...plan.children.map((child) => child.quantity));
    const aegisAttack = attackBook(book, intent, clamp(maxSlice / intent.quantity) * 0.42);
    const aegis = executeGrid(intent, aegisAttack.book, plan);
    const savedBps = Math.max(naive.slippageBps - aegis.slippageBps, 0);
    return {
      intent,
      risk,
      plan,
      naive,
      aegis,
      savedBps: round(savedBps, 2),
      savedQuote: round((savedBps / 10000) * intent.quantity * midPrice(book), 4),
    };
  }

  function currentIntent() {
    return {
      pair: state.pair,
      side: state.side,
      quantity: Number(state.quantity),
      maxSlippageBps: Number(state.maxSlippageBps),
      urgency: state.urgency,
    };
  }

  function format(value, decimals = 2) {
    return new Intl.NumberFormat("en-US", {
      maximumFractionDigits: decimals,
      minimumFractionDigits: decimals,
    }).format(value);
  }

  function renderSignals(signals) {
    const labels = [
      ["Volatility", signals.volatility],
      ["Spread", signals.spread],
      ["Imbalance", signals.imbalance],
      ["Thin depth", signals.depthThinness],
      ["Footprint", signals.footprint],
    ];
    dom.signals.innerHTML = labels
      .map(
        ([label, value]) => `
          <div class="signal-row">
            <span>${label}</span>
            <div class="signal-track"><div class="signal-fill" style="width:${Math.round(value * 100)}%"></div></div>
            <strong>${Math.round(value * 100)}%</strong>
          </div>
        `,
      )
      .join("");
  }

  function renderOrders(children) {
    dom.ordersBody.innerHTML = children
      .map(
        (child) => `
          <tr>
            <td>${child.index}</td>
            <td>${child.side.toUpperCase()}</td>
            <td>${format(child.price, 5)}</td>
            <td>${format(child.quantity, 2)}</td>
            <td>${child.clientOrderId}</td>
          </tr>
        `,
      )
      .join("");
  }

  function drawBook(book, plan) {
    const canvas = dom.bookCanvas;
    const ctx = canvas.getContext("2d");
    const width = canvas.width;
    const height = canvas.height;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);

    const centerX = width / 2;
    const top = 44;
    const rowHeight = 31;
    const maxQty = Math.max(...book.bids.concat(book.asks).map((level) => level.quantity));

    ctx.strokeStyle = "#dce3dd";
    ctx.beginPath();
    ctx.moveTo(centerX, 24);
    ctx.lineTo(centerX, height - 24);
    ctx.stroke();

    ctx.fillStyle = "#63706b";
    ctx.font = "700 24px system-ui";
    ctx.textAlign = "center";
    ctx.fillText("mid " + format(midPrice(book), 4), centerX, 30);

    book.bids.forEach((level, index) => {
      const y = top + index * rowHeight;
      const barWidth = (level.quantity / maxQty) * (centerX - 110);
      ctx.fillStyle = "#d7f2ec";
      ctx.fillRect(centerX - barWidth - 16, y, barWidth, 20);
      ctx.fillStyle = "#0f766e";
      ctx.textAlign = "right";
      ctx.font = "700 18px system-ui";
      ctx.fillText(format(level.price, 4), centerX - 26, y + 16);
      ctx.fillStyle = "#63706b";
      ctx.textAlign = "left";
      ctx.fillText(format(level.quantity, 0), 26, y + 16);
    });

    book.asks.forEach((level, index) => {
      const y = top + index * rowHeight;
      const barWidth = (level.quantity / maxQty) * (centerX - 110);
      ctx.fillStyle = "#ffe3d4";
      ctx.fillRect(centerX + 16, y, barWidth, 20);
      ctx.fillStyle = "#c2410c";
      ctx.textAlign = "left";
      ctx.font = "700 18px system-ui";
      ctx.fillText(format(level.price, 4), centerX + 26, y + 16);
      ctx.fillStyle = "#63706b";
      ctx.textAlign = "right";
      ctx.fillText(format(level.quantity, 0), width - 26, y + 16);
    });

    const prices = book.bids.concat(book.asks).map((level) => level.price).concat(plan.children.map((child) => child.price));
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);

    ctx.fillStyle = "#17201d";
    plan.children.forEach((child) => {
      const x = 80 + ((child.price - minPrice) / Math.max(maxPrice - minPrice, 0.0001)) * (width - 160);
      const y = height - 58;
      const radius = 5 + clamp(child.quantity / state.quantity, 0, 0.22) * 45;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
    });

    ctx.fillStyle = "#63706b";
    ctx.textAlign = "left";
    ctx.font = "800 16px system-ui";
    ctx.fillText("Bids", 26, height - 22);
    ctx.textAlign = "right";
    ctx.fillText("Asks", width - 26, height - 22);
  }

  function render() {
    const book = sampleBooks[state.scenario];
    const intent = currentIntent();
    const result = simulateDuel(intent, book);
    const maxSlip = Math.max(result.naive.slippageBps, result.aegis.slippageBps, 1);

    dom.intentSummary.textContent = `${intent.side.toUpperCase()} ${format(intent.quantity, 0)} ${intent.pair.split("_")[0]}`;
    dom.scenarioLabel.textContent = book.name;
    dom.riskScore.textContent = `${Math.round(result.risk.score * 100)}%`;
    dom.riskLabel.textContent = result.risk.label;
    dom.sliceCount.textContent = result.plan.sliceCount;
    dom.bandLabel.textContent = `${format(result.plan.bandBps, 0)} bps band`;
    dom.savedBps.textContent = `${format(result.savedBps, 0)} bps`;
    dom.savedQuote.textContent = `${format(result.savedQuote, 2)} quote`;
    dom.ptbCommands.textContent = result.plan.atomicity.suiPtbCommands;
    dom.midPrice.textContent = format(result.risk.mid, 4);
    dom.deltaBps.textContent = `+${format(result.savedBps, 0)} bps`;
    dom.naiveSlip.textContent = `${format(result.naive.slippageBps, 0)} bps`;
    dom.aegisSlip.textContent = `${format(result.aegis.slippageBps, 0)} bps`;
    dom.naiveBar.style.width = `${Math.max(6, (result.naive.slippageBps / maxSlip) * 100)}%`;
    dom.aegisBar.style.width = `${Math.max(6, (result.aegis.slippageBps / maxSlip) * 100)}%`;
    dom.bookPair.textContent = intent.pair;
    dom.cadenceLabel.textContent = `refresh ${(result.plan.refreshCadenceMs / 1000).toFixed(1)}s`;

    renderSignals(result.risk.signals);
    renderOrders(result.plan.children);
    drawBook(book, result.plan);
  }

  function setSegment(field, value) {
    state[field] = value;
    document.querySelectorAll(`.segment[data-field="${field}"] button`).forEach((button) => {
      button.classList.toggle("active", button.dataset.value === value);
    });
    render();
  }

  document.querySelectorAll(".segment button").forEach((button) => {
    button.addEventListener("click", () => {
      setSegment(button.closest(".segment").dataset.field, button.dataset.value);
    });
  });

  dom.pair.addEventListener("change", () => {
    state.pair = dom.pair.value;
    render();
  });

  function bindRange(range, number, stateKey) {
    const sync = (source, target) => {
      state[stateKey] = Number(source.value);
      target.value = source.value;
      render();
    };
    range.addEventListener("input", () => sync(range, number));
    number.addEventListener("input", () => sync(number, range));
  }

  bindRange(dom.quantity, dom.quantityNumber, "quantity");
  bindRange(dom.slippage, dom.slippageNumber, "maxSlippageBps");

  dom.runButton.addEventListener("click", render);
  dom.resetButton.addEventListener("click", () => {
    Object.assign(state, {
      pair: "SUI_DBUSDC",
      side: "buy",
      quantity: 750,
      maxSlippageBps: 80,
      urgency: "normal",
      scenario: "toxic",
    });
    dom.pair.value = state.pair;
    dom.quantity.value = dom.quantityNumber.value = state.quantity;
    dom.slippage.value = dom.slippageNumber.value = state.maxSlippageBps;
    setSegment("side", state.side);
    setSegment("urgency", state.urgency);
    setSegment("scenario", state.scenario);
    render();
  });

  window.addEventListener("resize", render);
  render();
})();
