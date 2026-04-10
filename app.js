// --- Data model & persistence ----------------------------------------------

const STORAGE_KEY = "pickleball_rotation_v1";
const ROSTERS_KEY = "pickleball_rosters_v1"; // name -> players snapshot

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
    players = saved.players;
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
        partners: {}, // partnerId -> count
        opponents: {}, // opponentId -> count
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

// --- Roster persistence ----------------------------------------------------

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
    .sort()
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
      p.partners = {};
      p.opponents = {};
    } else {
      p.games = snap.games ?? p.games;
      p.rest = snap.rest ?? p.rest;
      p.wins = snap.wins ?? p.wins;
      p.losses = snap.losses ?? p.losses;
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

    tr.appendChild(tdId);
    tr.appendChild(tdName);
    tr.appendChild(tdGames);
    tr.appendChild(tdRest);
    tr.appendChild(tdWins);
    tr.appendChild(tdLosses);
    tr.appendChild(tdEdit);

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
  const totalWins = players.reduce((sum, p) => sum + p.wins, 0);
  const totalLosses = players.reduce((sum, p) => sum + p.losses, 0);

  const li1 = document.createElement("li");
  li1.textContent = `Total players with names: ${totalPlayers}`;
  const li2 = document.createElement("li");
  li2.textContent = `Active players this session: ${activePlayers.length}`;
  const li3 = document.createElement("li");
  li3.textContent = `Total games counted (sum of individual games): ${totalGames}`;
  const li4 = document.createElement("li");
  li4.textContent = `Total wins recorded: ${totalWins}`;
  const li5 = document.createElement("li");
  li5.textContent = `Total losses recorded: ${totalLosses}`;

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

  const totalGames = p.games;
  const totalResults = p.wins + p.losses;
  const winPct =
    totalResults > 0 ? ((p.wins / totalResults) * 100).toFixed(1) + "%" : "—";

  const partners = Object.entries(p.partners)
    .map(([pid, count]) => {
      const partner = players.find((x) => x.id === Number(pid));
      return `${partner ? partner.name || "#" + partner.id : "#" + pid} (${count})`;
    })
    .sort();

  const opponents = Object.entries(p.opponents)
    .map(([pid, count]) => {
      const opp = players.find((x) => x.id === Number(pid));
      return `${opp ? opp.name || "#" + opp.id : "#" + pid} (${count})`;
    })
    .sort();

  container.innerHTML = `
    <h4>#${p.id} ${p.name || "(empty)"}</h4>
    <p><strong>Games:</strong> ${totalGames}</p>
    <p><strong>Rest rounds:</strong> ${p.rest}</p>
    <p><strong>Wins:</strong> ${p.wins}</p>
    <p><strong>Losses:</strong> ${p.losses}</p>
    <p><strong>Win %:</strong> ${winPct}</p>
    <p><strong>Partners:</strong></p>
    <ul>${partners.length ? partners.map((x) => `<li>${x}</li>`).join("") : "<li>None yet</li>"}</ul>
    <p><strong>Opponents:</strong></p>
    <ul>${opponents.length ? opponents.map((x) => `<li>${x}</li>`).join("") : "<li>None yet</li>"}</ul>
  `;
}

// --- Rotation logic --------------------------------------------------------

function generateNextRound() {
  const activePlayers = players.filter((p) => p.active && p.name.trim());
  if (activePlayers.length < 4) {
    alert("Need at least 4 active players with names to create a round.");
    return;
  }

  const courtsCount = Math.min(3, Math.floor(activePlayers.length / 4));
  if (courtsCount === 0) {
    alert("Not enough players for a court.");
    return;
  }

  const sorted = [...activePlayers].sort((a, b) => {
    if (b.rest !== a.rest) return b.rest - a.rest;
    if (a.games !== b.games) return a.games - b.games;
    return a.id - b.id;
  });

  const playersThisRound = sorted.slice(0, courtsCount * 4);

  const newCourts = [];
  for (let c = 0; c < courtsCount; c++) {
    const group = playersThisRound.slice(c * 4, c * 4 + 4);
    const ids = group.map((p) => p.id);
    const bestSplit = chooseBestTeamSplit(ids);
    newCourts.push(bestSplit);
  }

  historyStack.push({
    roundId: currentRoundId + 1,
    players: JSON.parse(JSON.stringify(players)),
    courts: JSON.parse(JSON.stringify(courts)),
  });

  const playingIds = newCourts.flatMap((c) => [...c.team1, ...c.team2]);
  const playingSet = new Set(playingIds);

  players.forEach((p) => {
    if (playingSet.has(p.id)) {
      p.games += 1;
      p.rest = 0;
    } else if (p.active && p.name.trim()) {
      p.rest += 1;
    }
  });

  newCourts.forEach((court) => {
    const [a, b] = court.team1;
    const [c, d] = court.team2;

    addPartner(a, b);
    addPartner(b, a);
    addPartner(c, d);
    addPartner(d, c);

    [a, b].forEach((pid) => {
      addOpponent(pid, c);
      addOpponent(pid, d);
    });
    [c, d].forEach((pid) => {
      addOpponent(pid, a);
      addOpponent(pid, b);
    });
  });

  courts = newCourts;
  currentRoundId += 1;
  saveState();
  renderCourts();
  renderStatsTable();
  renderSummary();
  renderNeedsToPlay();
}

function addPartner(pid, partnerId) {
  const p = players.find((x) => x.id === pid);
  if (!p) return;
  p.partners[partnerId] = (p.partners[partnerId] || 0) + 1;
}

function addOpponent(pid, oppId) {
  const p = players.find((x) => x.id === pid);
  if (!p) return;
  p.opponents[oppId] = (p.opponents[oppId] || 0) + 1;
}

function chooseBestTeamSplit(ids) {
  const [p1, p2, p3, p4] = ids;
  const splits = [
    { team1: [p1, p2], team2: [p3, p4] },
    { team1: [p1, p3], team2: [p2, p4] },
    { team1: [p1, p4], team2: [p2, p3] },
  ];

  let best = splits[0];
  let bestScore = Infinity;

  splits.forEach((s) => {
    const score = teamSplitPenalty(s.team1, s.team2);
    if (score < bestScore) {
      bestScore = score;
      best = s;
    }
  });

  return best;
}

function teamSplitPenalty(team1, team2) {
  const [a, b] = team1;
  const [c, d] = team2;

  let penalty = 0;

  const pa = players.find((x) => x.id === a);
  const pb = players.find((x) => x.id === b);
  const pc = players.find((x) => x.id === c);
  const pd = players.find((x) => x.id === d);

  const partnerWeight = 3;
  const opponentWeight = 1;

  penalty += (pa.partners[b] || 0) * partnerWeight;
  penalty += (pb.partners[a] || 0) * partnerWeight;
  penalty += (pc.partners[d] || 0) * partnerWeight;
  penalty += (pd.partners[c] || 0) * partnerWeight;

  [a, b].forEach((pid) => {
    const p = players.find((x) => x.id === pid);
    penalty += (p.opponents[c] || 0) * opponentWeight;
    penalty += (p.opponents[d] || 0) * opponentWeight;
  });

  [c, d].forEach((pid) => {
    const p = players.find((x) => x.id === pid);
    penalty += (p.opponents[a] || 0) * opponentWeight;
    penalty += (p.opponents[b] || 0) * opponentWeight;
  });

  return penalty;
}

// --- Undo ------------------------------------------------------------------

function undoLastRound() {
  if (historyStack.length === 0) {
    alert("No previous round to undo.");
    return;
  }
  const snapshot = historyStack.pop();
  players = snapshot.players;
  courts = snapshot.courts;
  currentRoundId = snapshot.roundId - 1;
  saveState();
  renderCourts();
  renderStatsTable();
  renderSummary();
  renderNeedsToPlay();
}

// --- Results modal (wins/losses) ------------------------------------------

let pendingResults = null;

function openResultsModal() {
  if (!courts || courts.length === 0) {
    alert("No current round to record results for.");
    return;
  }
  pendingResults = {};
  const body = $("resultsModalBody");
  body.innerHTML = "";

  courts.forEach((court, index) => {
    const block = document.createElement("div");
    block.className = "results-court-block";

    const title = document.createElement("h4");
    title.textContent = `Court ${index + 1}`;
    block.appendChild(title);

    const team1Option = document.createElement("div");
    team1Option.className = "results-team-option";
    const team1Radio = document.createElement("input");
    team1Radio.type = "radio";
    team1Radio.name = "court" + index;
    team1Radio.value = "team1";
    const team1Label = document.createElement("div");
    team1Label.className = "results-team-label";
    court.team1.forEach((pid) => {
      const p = players.find((x) => x.id === pid);
      const span = document.createElement("span");
      span.textContent = `#${p.id} ${p.name || ""}`;
      team1Label.appendChild(span);
    });
    team1Option.appendChild(team1Radio);
    team1Option.appendChild(team1Label);

    const team2Option = document.createElement("div");
    team2Option.className = "results-team-option";
    const team2Radio = document.createElement("input");
    team2Radio.type = "radio";
    team2Radio.name = "court" + index;
    team2Radio.value = "team2";
    const team2Label = document.createElement("div");
    team2Label.className = "results-team-label";
    court.team2.forEach((pid) => {
      const p = players.find((x) => x.id === pid);
      const span = document.createElement("span");
      span.textContent = `#${p.id} ${p.name || ""}`;
      team2Label.appendChild(span);
    });
    team2Option.appendChild(team2Radio);
    team2Option.appendChild(team2Label);

    block.appendChild(team1Option);
    block.appendChild(team2Option);
    body.appendChild(block);
  });

  $("resultsModal").classList.remove("hidden");
}

function closeResultsModal() {
  $("resultsModal").classList.add("hidden");
  pendingResults = null;
}

function saveResults() {
  if (!courts || courts.length === 0) {
    closeResultsModal();
    return;
  }

  const winners = [];
  const losers = [];

  courts.forEach((court, index) => {
    const radios = document.querySelectorAll(`input[name="court${index}"]`);
    let winner = null;
    radios.forEach((r) => {
      if (r.checked) winner = r.value;
    });
    if (!winner) return;

    if (winner === "team1") {
      winners.push(...court.team1);
      losers.push(...court.team2);
    } else {
      winners.push(...court.team2);
      losers.push(...court.team1);
    }
  });

  winners.forEach((pid) => {
    const p = players.find((x) => x.id === pid);
    if (p) p.wins += 1;
  });
  losers.forEach((pid) => {
    const p = players.find((x) => x.id === pid);
    if (p) p.losses += 1;
  });

  saveState();
  renderStatsTable();
  renderSummary();
  renderNeedsToPlay();
  closeResultsModal();
}

// --- Edit Wins/Losses modal -----------------------------------------------

let editWLPlayerId = null;

function openEditWLModal(playerId) {
  const p = players.find((x) => x.id === playerId);
  if (!p) return;
  editWLPlayerId = playerId;
  $("editWLPlayerName").textContent = `#${p.id} ${p.name || "(empty)"}`;
  $("editWinsInput").value = p.wins;
  $("editLossesInput").value = p.losses;
  $("editWLModal").classList.remove("hidden");
}

function closeEditWLModal() {
  $("editWLModal").classList.add("hidden");
  editWLPlayerId = null;
}

function saveWL() {
  if (!editWLPlayerId) return;
  const p = players.find((x) => x.id === editWLPlayerId);
  if (!p) return;
  const wins = parseInt($("editWinsInput").value, 10);
  const losses = parseInt($("editLossesInput").value, 10);
  p.wins = isNaN(wins) ? 0 : wins;
  p.losses = isNaN(losses) ? 0 : losses;
  saveState();
  renderStatsTable();
  renderSummary();
  renderNeedsToPlay();
  closeEditWLModal();
}

// --- Timer -----------------------------------------------------------------

function updateTimerDisplay() {
  const minutes = Math.floor(timerRemaining / 60);
  const seconds = timerRemaining % 60;
  $("timerDisplay").textContent =
    String(minutes).padStart(2, "0") + ":" + String(seconds).padStart(2, "0");
}

function startTimer() {
  if (timerInterval) return;
  timerInterval = setInterval(() => {
    timerRemaining -= 1;
    if (timerRemaining <= 0) {
      timerRemaining = 0;
      clearInterval(timerInterval);
      timerInterval = null;
      updateTimerDisplay();
      alert("Round time is up! Consider generating the next round.");
      return;
    }
    updateTimerDisplay();
    saveState();
  }, 1000);
}

function pauseTimer() {
  if (!timerInterval) return;
  clearInterval(timerInterval);
  timerInterval = null;
}

function resetTimer() {
  const minutes = parseInt($("timerDuration").value, 10);
  timerRemaining = minutes * 60;
  updateTimerDisplay();
  saveState();
}

// --- Theme toggle ----------------------------------------------------------

function initTheme() {
  const saved = localStorage.getItem("pickleball_theme");
  if (saved === "dark") {
    document.body.classList.add("dark-mode");
    document.body.classList.remove("light-mode");
    $("themeIcon").textContent = "🌙";
  } else {
    document.body.classList.add("light-mode");
    document.body.classList.remove("dark-mode");
    $("themeIcon").textContent = "🌞";
  }
}

function toggleTheme() {
  const isDark = document.body.classList.contains("dark-mode");
  if (isDark) {
    document.body.classList.remove("dark-mode");
    document.body.classList.add("light-mode");
    $("themeIcon").textContent = "🌞";
    localStorage.setItem("pickleball_theme", "light");
  } else {
    document.body.classList.remove("light-mode");
    document.body.classList.add("dark-mode");
    $("themeIcon").textContent = "🌙";
    localStorage.setItem("pickleball_theme", "dark");
  }
}

// --- Controls --------------------------------------------------------------

function randomizeOrder() {
  const active = players.filter((p) => p.active && p.name.trim());
  const inactive = players.filter((p) => !p.active || !p.name.trim());
  for (let i = active.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [active[i], active[j]] = [active[j], active[i]];
  }
  const combined = [...active, ...inactive];
  combined.forEach((p, idx) => {
    p.id = idx + 1;
  });
  players = combined.sort((a, b) => a.id - b.id);
  saveState();
  renderPlayersList();
  renderStatsTable();
  renderSummary();
  renderNeedsToPlay();
}

function resetSessionKeepNames() {
  if (!confirm("Reset session stats (games, rest, partners, opponents) but keep names and wins/losses?")) {
    return;
  }
  players.forEach((p) => {
    p.games = 0;
    p.rest = 0;
    p.partners = {};
    p.opponents = {};
  });
  courts = [];
  currentRoundId = 0;
  historyStack = [];
  saveState();
  renderCourts();
  renderStatsTable();
  renderSummary();
  renderNeedsToPlay();
}

function resetEverything() {
  if (!confirm("Reset EVERYTHING (names, stats, wins, losses, history)?")) {
    return;
  }
  localStorage.removeItem(STORAGE_KEY);
  players = [];
  courts = [];
  historyStack = [];
  currentRoundId = 0;
  initPlayers();
  saveState();
  renderPlayersList();
  renderStatsTable();
  renderCourts();
  renderSummary();
  renderNeedsToPlay();
  $("playerDetails").innerHTML = "<p>No player selected.</p>";
}

// --- Init ------------------------------------------------------------------

window.addEventListener("DOMContentLoaded", () => {
  initPlayers();
  initTheme();
  renderPlayersList();
  renderStatsTable();
  renderCourts();
  renderSummary();
  renderNeedsToPlay();
  updateTimerDisplay();

  refreshRosterSelect();

  $("themeToggle").addEventListener("click", toggleTheme);
  $("nextRoundBtn").addEventListener("click", generateNextRound);
  $("undoBtn").addEventListener("click", undoLastRound);
  $("recordResultsBtn").addEventListener("click", openResultsModal);
  $("closeResultsModal").addEventListener("click", closeResultsModal);
  $("cancelResultsBtn").addEventListener("click", closeResultsModal);
  $("saveResultsBtn").addEventListener("click", saveResults);

  $("closeEditWLModal").addEventListener("click", closeEditWLModal);
  $("cancelWLBtn").addEventListener("click", closeEditWLModal);
  $("saveWLBtn").addEventListener("click", saveWL);

  $("randomizeOrderBtn").addEventListener("click", randomizeOrder);
  $("resetSessionBtn").addEventListener("click", resetSessionKeepNames);
  $("resetAllBtn").addEventListener("click", resetEverything);

  $("startTimerBtn").addEventListener("click", startTimer);
  $("pauseTimerBtn").addEventListener("click", pauseTimer);
  $("resetTimerBtn").addEventListener("click", resetTimer);
  $("timerDuration").addEventListener("change", resetTimer);

  const saveRosterBtn = $("saveRosterBtn");
  if (saveRosterBtn) {
    saveRosterBtn.addEventListener("click", saveCurrentRosterAs);
  }

  const loadRosterFromSelectBtn = $("loadRosterFromSelectBtn");
  if (loadRosterFromSelectBtn) {
    loadRosterFromSelectBtn.addEventListener("click", loadRosterFromSelect);
  }
});
