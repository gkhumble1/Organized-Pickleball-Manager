// --- Cloudflare Worker URL ----------------------------------------------
const WORKER_URL = "https://floral-silence-525b.mariyam-abdulkarim123.workers.dev";

// Helper to call Worker endpoints
async function workerGet(path) {
  const res = await fetch(`${WORKER_URL}${path}`);

  let payload;
  const contentType = res.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    payload = await res.json();
  } else {
    payload = await res.text();
  }

  if (!res.ok) {
    const message =
      payload?.error ||
      payload?.message ||
      `Worker GET failed: ${path}`;
    throw new Error(message);
  }

  return payload;
}

async function workerPost(path, body) {
  const res = await fetch(`${WORKER_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  let payload;
  const contentType = res.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    payload = await res.json();
  } else {
    payload = await res.text();
  }

  if (!res.ok) {
    const message =
      payload?.error ||
      payload?.message ||
      `Worker POST failed: ${path}`;
    throw new Error(message);
  }

  return payload;
}

// --- Data model & persistence ----------------------------------------------

const STORAGE_KEY = "pickleball_rotation_v1";
const ROSTERS_KEY = "pickleball_rosters_v1"; // name -> players snapshot
const THEME_KEY = "pickleball_theme";

let players = [];
let courts = [];
let historyStack = [];
let currentRoundId = 0;
let timerInterval = null;
let timerRemaining = 15 * 60;

// Initialize 20 fixed slots
function initPlayers() {
  const saved = loadState();
  if (saved && saved.players && Array.isArray(saved.players)) {
    players = saved.players.map((p, idx) => ({
      id: p.id ?? idx + 1,
      name: p.name || "",
      active: !!p.active,
      games: p.games || 0,
      rest: p.rest || 0,
      wins: p.wins || 0,
      losses: p.losses || 0,
      dailyWins: p.dailyWins || 0,
      dailyLosses: p.dailyLosses || 0,
      partners: p.partners || {},
      opponents: p.opponents || {},
    }));
  } else {
    players = [];
    for (let i = 1; i <= 20; i++) {
      players.push({
        id: i,
        name: "",
        active: false,
        games: 0,
        rest: 0,
        wins: 0,
        losses: 0,
        dailyWins: 0,
        dailyLosses: 0,
        partners: {},
        opponents: {},
      });
    }
  }
  courts = saved?.courts || [];
  currentRoundId = saved?.currentRoundId || 0;
  timerRemaining = saved?.timerRemaining || 15 * 60;
}

function saveState() {
  const state = {
    players,
    courts,
    currentRoundId,
    timerRemaining,
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// --- Local roster persistence ----------------------------------------------

function loadRostersMap() {
  try {
    const raw = localStorage.getItem(ROSTERS_KEY);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function saveRostersMap(map) {
  localStorage.setItem(ROSTERS_KEY, JSON.stringify(map));
}

function refreshRosterSelect() {
  const select = $("rosterSelect");
  if (!select) return;

  const rostersMap = loadRostersMap();
  const currentValue = select.value;

  select.innerHTML = '<option value="">(No roster selected)</option>';

  Object.keys(rostersMap)
    .sort((a, b) => a.localeCompare(b))
    .forEach((name) => {
      const opt = document.createElement("option");
      opt.value = name;
      opt.textContent = name;
      select.appendChild(opt);
    });

  if (currentValue && rostersMap[currentValue]) {
    select.value = currentValue;
  }
}

function saveCurrentRosterAs() {
  const rostersMap = loadRostersMap();

  const defaultName = $("rosterSelect")?.value || "";
  const rosterName = prompt("Enter a name for this roster:", defaultName || "New Roster");
  if (!rosterName) return;

  const snapshot = players.map((p) => ({
    name: p.name,
    games: p.games,
    rest: p.rest,
    wins: p.wins,
    losses: p.losses,
    dailyWins: p.dailyWins,
    dailyLosses: p.dailyLosses,
  }));

  rostersMap[rosterName] = snapshot;
  saveRostersMap(rostersMap);
  refreshRosterSelect();
  $("rosterSelect").value = rosterName;
  alert(`Roster "${rosterName}" saved on this device.`);
}

function loadRosterFromSelect() {
  const select = $("rosterSelect");
  if (!select) return;

  const rosterName = select.value;
  if (!rosterName) {
    alert("Please select a roster first.");
    return;
  }

  const rostersMap = loadRostersMap();
  const snapshot = rostersMap[rosterName];
  if (!snapshot) {
    alert("Roster not found on this device.");
    return;
  }

  if (!confirm(`Load roster "${rosterName}"? This will update players and stats.`)) {
    return;
  }

  for (let i = 0; i < players.length; i++) {
    const p = players[i];
    const snap = snapshot[i];

    if (!snap || !snap.name) {
      if (p.name) {
        p.name = "";
        p.games = 0;
        p.rest = 0;
        p.wins = 0;
        p.losses = 0;
        p.dailyWins = 0;
        p.dailyLosses = 0;
        p.partners = {};
        p.opponents = {};
      }
      continue;
    }

    if (p.name !== snap.name) {
      p.name = snap.name;
      p.games = snap.games || 0;
      p.rest = snap.rest || 0;
      p.wins = snap.wins || 0;
      p.losses = snap.losses || 0;
      p.dailyWins = snap.dailyWins || 0;
      p.dailyLosses = snap.dailyLosses || 0;
      p.partners = {};
      p.opponents = {};
    } else {
      p.games = snap.games ?? p.games;
      p.rest = snap.rest ?? p.rest;
      p.wins = snap.wins ?? p.wins;
      p.losses = snap.losses ?? p.losses;
      p.dailyWins = snap.dailyWins ?? p.dailyWins;
      p.dailyLosses = snap.dailyLosses ?? p.dailyLosses;
    }
  }

  courts = [];
  historyStack = [];
  currentRoundId = 0;

  saveState();
  renderPlayersList();
  renderStatsTable();
  renderCourts();
  renderSummary();
  renderNeedsToPlay();
  $("playerDetails").innerHTML = "<p>No player selected.</p>";

  alert(`Roster "${rosterName}" loaded.`);
}

// --- Cloud rosters (via Cloudflare Worker) ---------------------------------

async function refreshCloudRosters() {
  const select = $("cloudRosterSelect");
  if (!select) return;

  select.innerHTML = '<option value="">(No cloud roster selected)</option>';

  try {
    const list = await workerGet("/list");

    if (!Array.isArray(list)) {
      throw new Error("Invalid roster list returned from cloud.");
    }

    list
      .sort((a, b) => a.localeCompare(b))
      .forEach((name) => {
        const clean = name.replace(/\.json$/i, "");
        const opt = document.createElement("option");
        opt.value = clean;
        opt.textContent = clean;
        select.appendChild(opt);
      });
  } catch (err) {
    console.error(err);
    alert(`Failed to load cloud roster list: ${err.message}`);
  }
}

async function saveCurrentRosterToCloud() {
  const defaultName = $("cloudRosterSelect")?.value || "";
  const rosterName = prompt(
    "Enter a name for this cloud roster:",
    defaultName || "New Cloud Roster"
  );
  if (!rosterName) return;

  const snapshot = players.map((p) => ({
    id: p.id,
    name: p.name,
    active: p.active,
    games: p.games,
    rest: p.rest,
    dailyWins: p.dailyWins,
    dailyLosses: p.dailyLosses,
    wins: p.wins,
    losses: p.losses,
  }));

  try {
    await workerPost("/save", {
      name: rosterName,
      data: snapshot,
    });

    alert(`Cloud roster "${rosterName}" saved.`);
    await refreshCloudRosters();
    $("cloudRosterSelect").value = rosterName;
  } catch (err) {
    console.error(err);
    alert(`Error saving roster to cloud: ${err.message}`);
  }
}

async function loadSelectedCloudRoster() {
  const select = $("cloudRosterSelect");
  if (!select) return;

  const rosterName = select.value;
  if (!rosterName) {
    alert("Please select a cloud roster first.");
    return;
  }

  if (!confirm(`Load cloud roster "${rosterName}"? This will update players and stats.`)) {
    return;
  }

  try {
    const snapshot = await workerGet(`/load?name=${encodeURIComponent(rosterName)}`);

    if (!Array.isArray(snapshot)) {
      throw new Error("Invalid cloud roster format.");
    }

    for (let i = 0; i < players.length; i++) {
      const p = players[i];
      const snap = snapshot[i];

      if (!snap || !snap.name) {
        p.name = "";
        p.active = false;
        p.games = 0;
        p.rest = 0;
        p.wins = 0;
        p.losses = 0;
        p.dailyWins = 0;
        p.dailyLosses = 0;
        p.partners = {};
        p.opponents = {};
        continue;
      }

      p.name = snap.name || "";
      p.active = !!snap.active;
      p.games = snap.games || 0;
      p.rest = snap.rest || 0;
      p.dailyWins = snap.dailyWins || 0;
      p.dailyLosses = snap.dailyLosses || 0;
      p.wins = snap.wins || 0;
      p.losses = snap.losses || 0;
      p.partners = {};
      p.opponents = {};
    }

    courts = [];
    historyStack = [];
    currentRoundId = 0;

    saveState();
    renderPlayersList();
    renderStatsTable();
    renderCourts();
    renderSummary();
    renderNeedsToPlay();
    $("playerDetails").innerHTML = "<p>No player selected.</p>";

    alert(`Cloud roster "${rosterName}" loaded.`);
  } catch (err) {
    console.error(err);
    alert(`Error loading cloud roster: ${err.message}`);
  }
}

async function deleteSelectedCloudRoster() {
  const select = $("cloudRosterSelect");
  if (!select) return;

  const rosterName = select.value;
  if (!rosterName) {
    alert("Please select a cloud roster first.");
    return;
  }

  if (!confirm(`Delete cloud roster "${rosterName}"? This cannot be undone.`)) {
    return;
  }

  try {
    await workerPost("/delete", { name: rosterName });
    alert(`Cloud roster "${rosterName}" deleted.`);
    await refreshCloudRosters();
  } catch (err) {
    console.error(err);
    alert(`Error deleting cloud roster: ${err.message}`);
  }
}

// --- DOM helpers -----------------------------------------------------------

const $ = (id) => document.getElementById(id);

function renderPlayersList() {
  const container = $("playersList");
  container.innerHTML = "";
  players.forEach((p) => {
    const row = document.createElement("div");
    row.className = "player-row";

    const numSpan = document.createElement("span");
    numSpan.textContent = p.id;

    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.value = p.name;
    nameInput.placeholder = "Player " + p.id;
    nameInput.className = "player-name";
    nameInput.addEventListener("input", () => {
      const oldName = p.name;
      const newName = nameInput.value.trim();
      if (newName === oldName) return;
      p.name = newName;
      if (oldName && oldName !== newName) {
        p.games = 0;
        p.rest = 0;
        p.wins = 0;
        p.losses = 0;
        p.dailyWins = 0;
        p.dailyLosses = 0;
        p.partners = {};
        p.opponents = {};
      }
      saveState();
      renderStatsTable();
      renderSummary();
      renderNeedsToPlay();
    });

    nameInput.addEventListener("keydown", function (e) {
      if (e.key === "Enter") {
        e.preventDefault();
        const inputs = document.querySelectorAll(".player-name");
        const index = Array.from(inputs).indexOf(nameInput);
        if (index < inputs.length - 1) {
          inputs[index + 1].focus();
        }
      }
    });

    const activeInput = document.createElement("input");
    activeInput.type = "checkbox";
    activeInput.checked = p.active;
    activeInput.addEventListener("change", () => {
      p.active = activeInput.checked;
      saveState();
      renderSummary();
      renderNeedsToPlay();
    });

    row.appendChild(numSpan);
    row.appendChild(nameInput);
    row.appendChild(activeInput);
    container.appendChild(row);
  });
}

function renderStatsTable() {
  const tbody = $("statsTableBody");
  tbody.innerHTML = "";
  players.forEach((p) => {
    const tr = document.createElement("tr");
    tr.dataset.playerId = p.id;

    const tdId = document.createElement("td");
    tdId.textContent = p.id;

    const tdName = document.createElement("td");
    tdName.textContent = p.name || "(empty)";

    const tdGames = document.createElement("td");
    const gamesChip = document.createElement("span");
    gamesChip.className = "stats-chip " + gamesChipClass(p.games);
    gamesChip.textContent = p.games;
    tdGames.appendChild(gamesChip);

    const tdRest = document.createElement("td");
    const restChip = document.createElement("span");
    restChip.className = "stats-chip " + restChipClass(p.rest);
    restChip.textContent = p.rest;
    tdRest.appendChild(restChip);

    const tdWins = document.createElement("td");
    tdWins.textContent = p.wins;

    const tdLosses = document.createElement("td");
    tdLosses.textContent = p.losses;

    const tdEdit = document.createElement("td");
    const editBtn = document.createElement("button");
    editBtn.textContent = "Edit";
    editBtn.className = "secondary";
    editBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      openEditWLModal(p.id);
    });
    tdEdit.appendChild(editBtn);

    const tdDelete = document.createElement("td");
    const deleteBtn = document.createElement("button");
    deleteBtn.textContent = "Delete";
    deleteBtn.className = "danger";
    deleteBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      deletePlayer(p.id);
    });
    tdDelete.appendChild(deleteBtn);

    tr.appendChild(tdId);
    tr.appendChild(tdName);
    tr.appendChild(tdGames);
    tr.appendChild(tdRest);
    tr.appendChild(tdWins);
    tr.appendChild(tdLosses);
    tr.appendChild(tdEdit);
    tr.appendChild(tdDelete);

    tr.addEventListener("click", () => {
      renderPlayerDetails(p.id);
    });

    tbody.appendChild(tr);
  });
}

function gamesChipClass(games) {
  if (games <= 2) return "games-low";
  if (games <= 5) return "games-mid";
  return "games-high";
}

function restChipClass(rest) {
  if (rest >= 3) return "rest-high";
  if (rest === 2) return "rest-mid";
  return "rest-low";
}

function renderCourts() {
  const container = $("courtsContainer");
  container.innerHTML = "";
  courts.forEach((court, index) => {
    const card = document.createElement("div");
    card.className = "court-card";
    card.style.background =
      index === 0
        ? "var(--court1)"
        : index === 1
        ? "var(--court2)"
        : "var(--court3)";

    const header = document.createElement("div");
    header.className = "court-header";

    const title = document.createElement("h3");
    title.textContent = `Court ${index + 1}`;

    const meta = document.createElement("span");
    meta.textContent = "Round " + currentRoundId;

    header.appendChild(title);
    header.appendChild(meta);

    const teamsDiv = document.createElement("div");
    teamsDiv.className = "court-teams";

    const team1 = document.createElement("div");
    team1.className = "team-card";
    const team1Title = document.createElement("div");
    team1Title.className = "team-title";
    team1Title.textContent = "Team 1";
    team1.appendChild(team1Title);

    const team2 = document.createElement("div");
    team2.className = "team-card";
    const team2Title = document.createElement("div");
    team2Title.className = "team-title";
    team2Title.textContent = "Team 2";
    team2.appendChild(team2Title);

    court.team1.forEach((pid) => {
      const p = players.find((x) => x.id === pid);
      const tag = document.createElement("div");
      tag.className = "player-tag";
      const left = document.createElement("span");
      left.innerHTML = `<span class="player-number">#${p.id}</span><span class="player-name">${p.name || "(empty)"}</span>`;
      const right = document.createElement("span");
      right.className = "player-meta";
      right.textContent = `${p.games}G / ${p.wins}W`;
      tag.appendChild(left);
      tag.appendChild(right);
      team1.appendChild(tag);
    });

    court.team2.forEach((pid) => {
      const p = players.find((x) => x.id === pid);
      const tag = document.createElement("div");
      tag.className = "player-tag";
      const left = document.createElement("span");
      left.innerHTML = `<span class="player-number">#${p.id}</span><span class="player-name">${p.name || "(empty)"}</span>`;
      const right = document.createElement("span");
      right.className = "player-meta";
      right.textContent = `${p.games}G / ${p.wins}W`;
      tag.appendChild(left);
      tag.appendChild(right);
      team2.appendChild(tag);
    });

    teamsDiv.appendChild(team1);
    teamsDiv.appendChild(team2);

    card.appendChild(header);
    card.appendChild(teamsDiv);
    container.appendChild(card);
  });
}

function renderSummary() {
  const list = $("sessionSummary");
  list.innerHTML = "";

  const activePlayers = players.filter((p) => p.active && p.name.trim());
  const totalPlayers = players.filter((p) => p.name.trim()).length;
  const totalGames = players.reduce((sum, p) => sum + p.games, 0);
  const totalWinsSeason = players.reduce((sum, p) => sum + p.wins, 0);
  const totalLossesSeason = players.reduce((sum, p) => sum + p.losses, 0);

  const li1 = document.createElement("li");
  li1.textContent = `Total players with names: ${totalPlayers}`;
  const li2 = document.createElement("li");
  li2.textContent = `Active players this session: ${activePlayers.length}`;
  const li3 = document.createElement("li");
  li3.textContent = `Total games today (sum of individual games): ${totalGames}`;
  const li4 = document.createElement("li");
  li4.textContent = `Total season wins recorded: ${totalWinsSeason}`;
  const li5 = document.createElement("li");
  li5.textContent = `Total season losses recorded: ${totalLossesSeason}`;

  list.appendChild(li1);
  list.appendChild(li2);
  list.appendChild(li3);
  list.appendChild(li4);
  list.appendChild(li5);
}

function renderNeedsToPlay() {
  const list = $("needsToPlayList");
  list.innerHTML = "";

  const activePlayers = players.filter((p) => p.active && p.name.trim());
  if (activePlayers.length === 0) {
    const li = document.createElement("li");
    li.textContent = "No active players.";
    list.appendChild(li);
    return;
  }

  const sorted = [...activePlayers].sort((a, b) => {
    if (b.rest !== a.rest) return b.rest - a.rest;
    if (a.games !== b.games) return a.games - b.games;
    return a.id - b.id;
  });

  sorted.slice(0, 5).forEach((p) => {
    const li = document.createElement("li");
    li.textContent = `#${p.id} ${p.name || "(empty)"} — Rest: ${p.rest}, Games: ${p.games}`;
    list.appendChild(li);
  });
}

function renderPlayerDetails(playerId) {
  const p = players.find((x) => x.id === playerId);
  const container = $("playerDetails");
  if (!p) {
    container.innerHTML = "<p>No player selected.</p>";
    return;
  }

  const dailyGames = p.games;
  const dailyResults = p.dailyWins + p.dailyLosses;
  const dailyWinPct =
    dailyResults > 0 ? ((p.dailyWins / dailyResults) * 100).toFixed(1) + "%" : "—";

  const seasonResults = p.wins + p.losses;
  const seasonWinPct =
    seasonResults > 0 ? ((p.wins / seasonResults) * 100).toFixed(1) + "%" : "—";

  container.innerHTML = `
    <h4>#${p.id} ${p.name || "(empty)"}</h4>
    <table class="player-stats-compare">
      <thead>
        <tr>
          <th></th>
          <th>Daily</th>
          <th>Season</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>Wins</td>
          <td>${p.dailyWins}</td>
          <td>${p.wins}</td>
        </tr>
        <tr>
          <td>Losses</td>
          <td>${p.dailyLosses}</td>
          <td>${p.losses}</td>
        </tr>
        <tr>
          <td>Win %</td>
          <td>${dailyWinPct}</td>
          <td>${seasonWinPct}</td>
        </tr>
        <tr>
          <td>Games</td>
          <td>${dailyGames}</td>
          <td>—</td>
        </tr>
        <tr>
          <td>Rest</td>
          <td>${p.rest}</td>
          <td>—</td>
        </tr>
      </tbody>
    </table>
  `;
}

function deletePlayer(playerId) {
  const p = players.find((x) => x.id === playerId);
  if (!p) return;

  if (!confirm(`Delete player #${p.id} "${p.name || ""}" for this season? This clears their name and stats.`)) {
    return;
  }

  p.name = "";
  p.active = false;
  p.games = 0;
  p.rest = 0;
  p.wins = 0;
  p.losses = 0;
  p.dailyWins = 0;
  p.dailyLosses = 0;
  p.partners = {};
  p.opponents = {};

  saveState();
  renderPlayersList();
