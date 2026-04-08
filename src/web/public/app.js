// --- P&L Chart (pure canvas, no dependencies) ---
var pnlChartData = [];

function drawPnlChart() {
  var canvas = document.getElementById("pnl-chart");
  var noData = document.getElementById("no-pnl");
  if (!pnlChartData || pnlChartData.length === 0) {
    canvas.style.display = "none";
    noData.style.display = "block";
    return;
  }
  canvas.style.display = "block";
  noData.style.display = "none";

  var ctx = canvas.getContext("2d");
  var dpr = window.devicePixelRatio || 1;
  var rect = canvas.parentElement.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = 200 * dpr;
  canvas.style.width = rect.width + "px";
  canvas.style.height = "200px";
  ctx.scale(dpr, dpr);

  var w = rect.width;
  var h = 200;
  var pad = { top: 20, right: 16, bottom: 30, left: 56 };

  var values = pnlChartData.map(function(d) { return d.cumulative; });
  var minVal = Math.min(0, Math.min.apply(null, values));
  var maxVal = Math.max(0, Math.max.apply(null, values));
  var range = maxVal - minVal || 1;

  function x(i) { return pad.left + (i / Math.max(1, pnlChartData.length - 1)) * (w - pad.left - pad.right); }
  function y(v) { return pad.top + (1 - (v - minVal) / range) * (h - pad.top - pad.bottom); }

  // Background
  ctx.fillStyle = "#111118";
  ctx.fillRect(0, 0, w, h);

  // Grid lines
  ctx.strokeStyle = "#1a1a2e";
  ctx.lineWidth = 1;
  var steps = 4;
  for (var i = 0; i <= steps; i++) {
    var yy = pad.top + (i / steps) * (h - pad.top - pad.bottom);
    ctx.beginPath();
    ctx.moveTo(pad.left, yy);
    ctx.lineTo(w - pad.right, yy);
    ctx.stroke();

    var label = (maxVal - (i / steps) * range).toFixed(0);
    ctx.fillStyle = "#666";
    ctx.font = "11px monospace";
    ctx.textAlign = "right";
    ctx.fillText("$" + label, pad.left - 6, yy + 4);
  }

  // Zero line
  if (minVal < 0 && maxVal > 0) {
    var zeroY = y(0);
    ctx.strokeStyle = "#333";
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(pad.left, zeroY);
    ctx.lineTo(w - pad.right, zeroY);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Date labels
  ctx.fillStyle = "#555";
  ctx.font = "10px monospace";
  ctx.textAlign = "center";
  var labelCount = Math.min(pnlChartData.length, 6);
  for (var i = 0; i < labelCount; i++) {
    var idx = Math.round(i * (pnlChartData.length - 1) / Math.max(1, labelCount - 1));
    var d = pnlChartData[idx];
    if (d) ctx.fillText(d.date.slice(5), x(idx), h - 8);
  }

  if (pnlChartData.length < 2) {
    // Single point — draw a dot
    var lastVal = values[0];
    ctx.fillStyle = lastVal >= 0 ? "#4ade80" : "#f87171";
    ctx.beginPath();
    ctx.arc(x(0), y(lastVal), 4, 0, Math.PI * 2);
    ctx.fill();
    return;
  }

  // Area fill
  var lastVal = values[values.length - 1];
  var color = lastVal >= 0 ? "rgba(74,222,128," : "rgba(248,113,113,";
  ctx.beginPath();
  ctx.moveTo(x(0), y(values[0]));
  for (var i = 1; i < values.length; i++) ctx.lineTo(x(i), y(values[i]));
  ctx.lineTo(x(values.length - 1), y(minVal));
  ctx.lineTo(x(0), y(minVal));
  ctx.closePath();
  var grad = ctx.createLinearGradient(0, pad.top, 0, h - pad.bottom);
  grad.addColorStop(0, color + "0.25)");
  grad.addColorStop(1, color + "0.02)");
  ctx.fillStyle = grad;
  ctx.fill();

  // Line
  ctx.strokeStyle = lastVal >= 0 ? "#4ade80" : "#f87171";
  ctx.lineWidth = 2;
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(x(0), y(values[0]));
  for (var i = 1; i < values.length; i++) ctx.lineTo(x(i), y(values[i]));
  ctx.stroke();

  // Daily bars
  var barWidth = Math.max(2, (w - pad.left - pad.right) / pnlChartData.length * 0.4);
  for (var i = 0; i < pnlChartData.length; i++) {
    var daily = pnlChartData[i].pnl;
    if (daily === 0) continue;
    var barTop = daily > 0 ? y(daily + (values[i] - daily)) : y(values[i]);
    var barBot = y(values[i] - (daily > 0 ? daily : 0));
    ctx.fillStyle = daily >= 0 ? "rgba(74,222,128,0.15)" : "rgba(248,113,113,0.15)";
    ctx.fillRect(x(i) - barWidth / 2, Math.min(y(0), y(daily)), barWidth, Math.abs(y(0) - y(daily)));
  }

  // End label
  ctx.fillStyle = lastVal >= 0 ? "#4ade80" : "#f87171";
  ctx.font = "bold 12px monospace";
  ctx.textAlign = "left";
  ctx.fillText("$" + lastVal.toFixed(2), x(values.length - 1) + 6, y(lastVal) + 4);
}

async function fetchPnlHistory() {
  try {
    var res = await fetch("/api/pnl-history");
    var data = await res.json();
    if (data.ok) {
      pnlChartData = data.history;
      drawPnlChart();
    }
  } catch (err) {
    console.error("Failed to fetch PnL history:", err);
  }
}

async function fetchPositions() {
  try {
    var res = await fetch("/api/positions");
    var data = await res.json();
    if (data.ok) renderPositions(data.positions);
  } catch (err) {
    console.error("Failed to fetch positions:", err);
  }
}

function renderPositions(positions) {
  var tbody = document.getElementById("positions-body");
  var noPos = document.getElementById("no-positions");
  if (positions.length > 0) {
    noPos.style.display = "none";
    tbody.innerHTML = positions.map(function(p) {
      var addr = p.trader_address ? p.trader_address.slice(0, 6) + ".." : "-";
      var market = (p.market_slug || "-").slice(0, 35);
      var opened = "-";
      if (p.created_at) {
        var parts = p.created_at.includes("T") ? p.created_at.split("T") : p.created_at.split(" ");
        opened = parts[0].slice(5) + " " + (parts[1] ? parts[1].slice(0, 5) : "");
      }
      return "<tr>" +
        "<td title='" + escapeHtml(p.market_slug || "") + "'>" + escapeHtml(market) + "</td>" +
        "<td class='side-" + (p.side || "BUY").toLowerCase() + "'>" + (p.side || "BUY") + "</td>" +
        "<td>$" + (p.price || 0).toFixed(2) + "</td>" +
        "<td>$" + (p.amount || 0).toFixed(2) + "</td>" +
        "<td>" + addr + "</td>" +
        "<td class='mode-" + p.mode + "'>" + p.mode + "</td>" +
        "<td>" + opened + "</td>" +
        "</tr>";
    }).join("");
  } else {
    noPos.style.display = "block";
    tbody.innerHTML = "";
  }
}

// --- Main Dashboard ---
async function fetchDashboard() {
  try {
    var res = await fetch("/api/dashboard");
    var data = await res.json();
    render(data);
  } catch (err) {
    console.error("Failed to fetch dashboard:", err);
  }
}

function render(data) {
  var badge = document.getElementById("mode-badge");
  badge.textContent = data.mode.toUpperCase();
  badge.className = data.mode === "live" ? "live" : "";

  document.getElementById("budget-text").textContent =
    "$" + data.budget.spent.toFixed(2) + " / $" + data.budget.limit.toFixed(2);

  var pnlEl = document.getElementById("pnl-text");
  pnlEl.textContent = "$" + data.stats.totalPnl.toFixed(2);
  pnlEl.className = "value " + (data.stats.totalPnl >= 0 ? "positive" : "negative");

  document.getElementById("winrate-text").textContent =
    data.stats.winRate.toFixed(1) + "%";
  document.getElementById("trades-text").textContent =
    data.stats.total + " (W:" + data.stats.wins + " L:" + data.stats.losses + ")";
  document.getElementById("monitor-text").textContent =
    data.monitor.running ? "Active" : "Stopped";
  var btn = document.getElementById("monitor-btn");
  if (data.monitor.running) {
    btn.textContent = "Stop";
    btn.className = "running";
  } else {
    btn.textContent = "Start";
    btn.className = "";
  }

  // Trades table — now with P&L column
  var tbody = document.getElementById("trades-body");
  var noTrades = document.getElementById("no-trades");
  if (data.recentTrades.length > 0) {
    noTrades.style.display = "none";
    tbody.innerHTML = data.recentTrades.map(function(t) {
      var time = "-";
      if (t.created_at) {
        var parts = t.created_at.includes("T") ? t.created_at.split("T") : t.created_at.split(" ");
        time = parts[1] ? parts[1].slice(0, 5) : "-";
      }
      var addr = t.trader_address ? t.trader_address.slice(0, 6) + ".." : "-";
      var pnl = t.pnl != null ? t.pnl.toFixed(2) : "-";
      var pnlClass = t.pnl > 0 ? "positive" : t.pnl < 0 ? "negative" : "";
      return "<tr>" +
        "<td>" + time + "</td>" +
        "<td>" + addr + "</td>" +
        "<td>" + escapeHtml((t.market_slug || "-").slice(0, 30)) + "</td>" +
        "<td>$" + (t.price || 0).toFixed(2) + "</td>" +
        "<td>$" + (t.amount || 0).toFixed(2) + "</td>" +
        "<td class='" + pnlClass + "'>" + (pnl === "-" ? "-" : "$" + pnl) + "</td>" +
        "<td class='status-" + (t.status || "").replace("_", "-") + "'>" + (t.status || "-") + "</td>" +
        "</tr>";
    }).join("");
  } else {
    noTrades.style.display = "block";
    tbody.innerHTML = "";
  }

  // Watchlist
  var cards = document.getElementById("watchlist-cards");
  var noWatchlist = document.getElementById("no-watchlist");
  if (data.watchlist.length > 0) {
    noWatchlist.style.display = "none";
    cards.innerHTML = data.watchlist.map(function(w) {
      var addr = w.address.slice(0, 6) + ".." + w.address.slice(-4);
      var escapedAlias = escapeHtml(w.alias || "Unknown");
      return '<div class="wallet-card">' +
        '<div class="alias">' + escapedAlias + '</div>' +
        '<div class="addr">' + addr + '</div>' +
        '<div class="meta">Vol: $' + (w.volume || 0).toLocaleString() + ' | PnL: $' + (w.pnl || 0).toLocaleString() + '</div>' +
        '<button class="remove-btn" onclick="removeFromWatchlist(\'' + w.address + '\')">Remove</button>' +
        '</div>';
    }).join("");
  } else {
    noWatchlist.style.display = "block";
    cards.innerHTML = "";
  }

  // Logs
  var logDiv = document.getElementById("log-stream");
  if (data.logs.length > 0) {
    logDiv.innerHTML = data.logs.map(function(l) {
      var parts = l.timestamp.includes("T") ? l.timestamp.split("T") : l.timestamp.split(" ");
      var time = parts[1] ? parts[1].slice(0, 8) : "";
      return '<div class="log-entry ' + l.level + '">[' + time + '] <b>' + l.level + '</b>: ' + escapeHtml(l.message) + '</div>';
    }).join("");
    logDiv.scrollTop = logDiv.scrollHeight;
  } else {
    logDiv.innerHTML = '<div class="log-entry info">No events yet</div>';
  }
}

async function toggleMonitor() {
  var btn = document.getElementById("monitor-btn");
  var action = btn.textContent === "Start" ? "start" : "stop";
  btn.disabled = true;
  try {
    await fetch("/api/monitor/" + action, { method: "POST" });
    await fetchDashboard();
  } catch (err) {
    console.error("Monitor toggle failed:", err);
  }
  btn.disabled = false;
}

function escapeHtml(str) {
  var div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function openDiscover() {
  document.getElementById("discover-panel").style.display = "block";
  document.getElementById("discover-btn").style.display = "none";
}

function closeDiscover() {
  document.getElementById("discover-panel").style.display = "none";
  document.getElementById("discover-btn").style.display = "";
}

async function searchTraders() {
  var btn = document.getElementById("discover-search-btn");
  var loading = document.getElementById("discover-loading");
  var results = document.getElementById("discover-results");
  var period = document.getElementById("discover-period").value;
  var minVol = document.getElementById("discover-min-vol").value || "1000";

  btn.disabled = true;
  loading.style.display = "block";
  results.innerHTML = "";

  try {
    var res = await fetch("/api/discover-traders?period=" + period + "&min_volume=" + minVol);
    var data = await res.json();

    if (!data.ok || data.traders.length === 0) {
      results.innerHTML = '<p class="empty-state">No traders found. Try lowering minimum volume.</p>';
      return;
    }

    results.innerHTML = data.traders.map(function(t, i) {
      var addr = t.address.slice(0, 6) + ".." + t.address.slice(-4);
      var escapedName = escapeHtml(t.name);
      return '<div class="trader-row">' +
        '<div class="trader-info">' +
          '<div class="name">#' + (i + 1) + ' ' + escapedName + ' <span style="color:#555">(' + addr + ')</span></div>' +
          '<div class="stats">PnL: $' + t.pnl.toLocaleString() + ' | Vol: $' + t.volume.toLocaleString() + ' | Rank: ' + t.rank + '</div>' +
        '</div>' +
        '<button class="watch-btn" id="wb-' + i + '" onclick="addToWatchlist(\'' + t.address + '\', \'' + escapedName.replace(/'/g, "\\'") + '\', ' + t.volume + ', ' + t.pnl + ', ' + i + ')">+ Watch</button>' +
        '</div>';
    }).join("");
  } catch (err) {
    results.innerHTML = '<p class="empty-state">Error: ' + err.message + '</p>';
  } finally {
    btn.disabled = false;
    loading.style.display = "none";
  }
}

async function addToWatchlist(address, alias, volume, pnl, idx) {
  var btn = document.getElementById("wb-" + idx);
  btn.disabled = true;
  btn.textContent = "Adding...";

  try {
    await fetch("/api/watchlist/add", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address: address, alias: alias, volume: volume, pnl: pnl })
    });
    btn.textContent = "Added";
    btn.className = "watch-btn added";
    fetchDashboard();
  } catch (err) {
    btn.textContent = "Failed";
    btn.disabled = false;
  }
}

async function removeFromWatchlist(address) {
  try {
    await fetch("/api/watchlist/remove", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address: address })
    });
    fetchDashboard();
  } catch (err) {
    console.error("Remove failed:", err);
  }
}

// Resize handler for chart
window.addEventListener("resize", function() {
  if (pnlChartData.length > 0) drawPnlChart();
});

// Initial load
fetchDashboard();
fetchPnlHistory();
fetchPositions();

// Polling
setInterval(fetchDashboard, 10000);
setInterval(function() { fetchPnlHistory(); fetchPositions(); }, 30000);
