// --- Data model & persistence ----------------------------------------------

const STORAGE_KEY = "pickleball_rotation_v1";

// Player objects stored in memory
let players = [];
let courts = [];
let historyStack = [];
let currentRoundId = 0;
let timerInterval = null;
let timerRemaining = 15 * 60;

// Initialize 20 fixed slots
function initPlayers() {
  players = [];
  for (let i = 1; i <= 20; i++) {
    players.push({
      id: i,
      name: "",
      active: false,

      // Daily stats
      games: 0,
      rest: 0,
      wins: 0,
      losses: 0,
      partners: {},
      opponents: {},

      // Season stats (for roster save/load)
      seasonGames: 0,
      seasonWins: 0,
      seasonLosses: 0,
      seasonPartners: {},
      seasonOpponents: {}
    });
  }

  const saved = loadState();
  if (saved) {
    players = saved.players || players;
    courts = saved.courts || [];
    currentRoundId = saved.currentRoundId || 0;
    timerRemaining = saved.timerRemaining || 15 * 60;
  }
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

// --- DOM helpers -----------------------------------------------------------

const $ = (id) => document.getElementById(id);

function renderPlayersList() {
  const container = $("playersList");
  if (!container) return;
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
      p.name = nameInput.value.trim();
      saveState();
      renderStatsTable();
      renderSummary();
      renderNeedsToPlay();
    });

    const activeInput = document.createElement("input");
    activeInput.type = "checkbox";
    activeInput.checked = p.active;
    activeInput.addEventListener("change", () => {
      p.active = activeInput.checked;
      saveState();
      renderStatsTable();
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
  if (!tbody) return;
  tbody.innerHTML = "";

  players.forEach((p) => {
    const tr = document.createElement("tr");
    tr.dataset.playerId = p.id;

    const tdId = document.createElement("td");
    tdId.textContent = p.id;

    const tdName = document.createElement("td");
    tdName.textContent = p.name || "(empty)";

    const tdGames = document.createElement("td");
    tdGames.textContent = p.games;

    const tdRest = document.createElement("td");
    tdRest.textContent = p.rest;

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

function renderCourts() {
  const container = $("courtsContainer");
  if (!container) return;
  container.innerHTML = "";

  courts.forEach((court, index) => {
    const card = document.createElement("div");
    card.className = "court-card";

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
      if (!p) return;
      const tag = document.createElement("div");
      tag.className = "player-tag";
      tag.textContent = `#${p.id} ${p.name}`;
      team1.appendChild(tag);
    });

    court.team2.forEach((pid) => {
      const p = players.find((x) => x.id === pid);
      if (!p) return;
      const tag = document.createElement("div");
      tag.className = "player-tag";
      tag.textContent = `#${p.id} ${p.name}`;
      team2.appendChild(tag);
    });

    teamsDiv.appendChild(team1);
    teamsDiv.appendChild(team2);

    card.appendChild(header);
    card.appendChild(teamsDiv);
    container.appendChild(card);
  });
}

// --- Summary & Needs to Play ----------------------------------------------

function renderSummary() {
  const list = $("sessionSummary");
  if (!list) return;
  list.innerHTML = "";

  const activePlayers = players.filter((p) => p.active && p.name.trim());
  const totalPlayers = players.filter((p) => p.name.trim()).length;
  const totalGames = players.reduce((sum, p) => sum + p.games, 0);
  const totalWins = players.reduce((sum, p) => sum + p.wins, 0);
  const totalLosses = players.reduce((sum, p) => sum + p.losses, 0);

  list.innerHTML = `
    <li>Total players with names: ${totalPlayers}</li>
    <li>Active players this session: ${activePlayers.length}</li>
    <li>Total games counted: ${totalGames}</li>
    <li>Total wins recorded: ${totalWins}</li>
    <li>Total losses recorded: ${totalLosses}</li>
  `;
}

function renderNeedsToPlay() {
  const list = $("needsToPlayList");
  if (!list) return;
  list.innerHTML = "";

  const activePlayers = players.filter((p) => p.active && p.name.trim());
  if (activePlayers.length === 0) {
    list.innerHTML = "<li>No active players.</li>";
    return;
  }

  const sorted = [...activePlayers].sort((a, b) => {
    if (b.rest !== a.rest) return b.rest - a.rest;
    if (a.games !== b.games) return a.games - b.games;
    return a.id - b.id;
  });

  sorted.slice(0, 5).forEach((p) => {
    const li = document.createElement("li");
    li.textContent = `#${p.id} ${p.name} — Rest: ${p.rest}, Games: ${p.games}`;
    list.appendChild(li);
  });
}

// --- Player Details --------------------------------------------------------

function renderPlayerDetails(playerId) {
  const p = players.find((x) => x.id === playerId);
  const container = $("playerDetails");
  if (!container) return;

  if (!p) {
    container.innerHTML = "<p>No player selected.</p>";
    return;
  }

  const totalResults = p.wins + p.losses;
  const winPct =
    totalResults > 0 ? ((p.wins / totalResults) * 100).toFixed(1) + "%" : "—";

  container.innerHTML = `
    <h4>#${p.id} ${p.name}</h4>
    <p><strong>Games:</strong> ${p.games}</p>
    <p><strong>Rest rounds:</strong> ${p.rest}</p>
    <p><strong>Wins:</strong> ${p.wins}</p>
    <p><strong>Losses:</strong> ${p.losses}</p>
    <p><strong>Win %:</strong> ${winPct}</p>
  `;
}

// --- Rotation Logic --------------------------------------------------------

function generateNextRound() {
  const activePlayers = players.filter((p) => p.active && p.name.trim());
  if (activePlayers.length < 4) {
    alert("Need at least 4 active players with names.");
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
    newCourts.push({
      team1: [group[0].id, group[1].id],
      team2: [group[2].id, group[3].id],
    });
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

  courts = newCourts;
  currentRoundId += 1;
  saveState();
  renderCourts();
  renderStatsTable();
  renderSummary();
  renderNeedsToPlay();
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

// --- Wins/Losses Modal -----------------------------------------------------

let editWLPlayerId = null;

function openEditWLModal(playerId) {
  const p = players.find((x) => x.id === playerId);
  if (!p) return;
  editWLPlayerId = playerId;
  $("editWLPlayerName").textContent = `#${p.id} ${p.name}`;
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
  p.wins = parseInt($("editWinsInput").value, 10) || 0;
  p.losses = parseInt($("editLossesInput").value, 10) || 0;
  saveState();
  renderStatsTable();
  renderSummary();
  renderNeedsToPlay();
  closeEditWLModal();
}

// --- Results Modal ---------------------------------------------------------

function openResultsModal() {
  const modal = $("resultsModal");
  const select = $("winnerTeamSelect");
  const container = $("courtResultsContainer");

  if (!modal || !select || !container) return;

  // Clear old content
  select.innerHTML = "";
  container.innerHTML = "";

  // Build options for each court/team
  courts.forEach((court, index) => {
    const opt1 = document.createElement("option");
    opt1.value = `court${index}-team1`;
    opt1.textContent = `Court ${index + 1} - Team 1`;
    select.appendChild(opt1);

    const opt2 = document.createElement("option");
    opt2.value = `court${index}-team2`;
    opt2.textContent = `Court ${index + 1} - Team 2`;
    select.appendChild(opt2);

    // Display court teams inside modal
    const courtDiv = document.createElement("div");
    courtDiv.className = "court-result-block";

    courtDiv.innerHTML = `
      <h4>Court ${index + 1}</h4>
      <p><strong>Team 1:</strong> ${
        court.team1.map(id => players.find(p => p.id === id).name).join(", ")
      }</p>
      <p><strong>Team 2:</strong> ${
        court.team2.map(id => players.find(p => p.id === id).name).join(", ")
      }</p>
    `;

    container.appendChild(courtDiv);
  });

  modal.classList.remove("hidden");
}

function closeResultsModal() {
  const modal = $("resultsModal");
  if (modal) modal.classList.add("hidden");
}

function saveResults() {
  const select = $("winnerTeamSelect");
  if (!select) return closeResultsModal();

  const value = select.value;
  if (!value) return closeResultsModal();

  const match = value.match(/^court(\d+)-team(\d+)$/);
  if (!match) return closeResultsModal();

  const courtIndex = parseInt(match[1], 10);
  const teamNumber = parseInt(match[2], 10);

  const court = courts[courtIndex];
  if (!court) return closeResultsModal();

  const winners = teamNumber === 1 ? court.team1 : court.team2;
  const losers = teamNumber === 1 ? court.team2 : court.team1;

  players.forEach((p) => {
    if (winners.includes(p.id)) {
      p.wins += 1;
      p.seasonWins += 1;
      p.seasonGames += 1;
    } else if (losers.includes(p.id)) {
      p.losses += 1;
      p.seasonLosses += 1;
      p.seasonGames += 1;
    }
  });

  saveState();
  renderStatsTable();
  renderSummary();
  renderNeedsToPlay();
  closeResultsModal();
}

// --- Timer -----------------------------------------------------------------

function updateTimerDisplay() {
  const minutes = Math.floor(timerRemaining / 60);
  const seconds = timerRemaining % 60;
  const el = $("timerDisplay");
  if (!el) return;
  el.textContent =
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
      alert("Round time is up!");
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
  timerRemaining = (isNaN(minutes) ? 15 : minutes) * 60;
  updateTimerDisplay();
  saveState();
}

// --- Theme Toggle ----------------------------------------------------------

function initTheme() {
  const saved = localStorage.getItem("pickleball_theme");
  if (saved === "dark") {
    document.body.classList.add("dark-mode");
    $("themeIcon").textContent = "🌙";
  } else {
    document.body.classList.add("light-mode");
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

// --- Save/Load to GitHub (names only) -------------------------------------

document.getElementById("savePlayersBtn").addEventListener("click", async () => {
  const names = players.map((p) => p.name.trim());
  const rosterJson = JSON.stringify({ players: names });

  await fetch(
    "https://api.github.com/repos/gkhumble1/Organized-Pickleball-Manager/actions/workflows/update-roster.yml/dispatches",
    {
      method: "POST",
      headers: {
        "Accept": "application/vnd.github+json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ref: "main",
        inputs: { roster: rosterJson },
      }),
    }
  );

  alert("Players saved! The roster will update shortly.");
});

document.getElementById("loadPlayersBtn").addEventListener("click", async () => {
  const response = await fetch("players.json");
  const data = await response.json();
  const names = data.players || [];

  players.forEach((p, i) => {
    p.name = names[i] || "";
  });

  saveState();
  renderPlayersList();
  renderStatsTable();
  renderSummary();
  renderNeedsToPlay();

  alert("Saved players loaded!");
});

// --- Save Roster As… -------------------------------------------------------

document.getElementById("saveRosterBtn").addEventListener("click", async () => {
  const rosterName = $("rosterNameInput").value.trim();
  if (!rosterName) {
    alert("Please enter a roster name.");
    return;
  }

  const rosterData = {
    players: players.map((p) => ({
      name: p.name,
      seasonGames: p.seasonGames || 0,
      seasonWins: p.seasonWins || 0,
      seasonLosses: p.seasonLosses || 0,
      seasonPartners: p.seasonPartners || {},
      seasonOpponents: p.seasonOpponents || {}
    }))
  };

  await fetch(
    "https://api.github.com/repos/gkhumble1/Organized-Pickleball-Manager/actions/workflows/save-roster.yml/dispatches",
    {
      method: "POST",
      headers: {
        "Accept": "application/vnd.github+json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ref: "main",
        inputs: {
          roster_name: rosterName,
          roster_json: JSON.stringify(rosterData)
        }
      }),
    }
  );

  alert("Roster saved! It will appear in .rosters shortly.");
});

// --- Load Roster -----------------------------------------------------------

document.getElementById("loadRosterBtn").addEventListener("click", async () => {
  const rosterName = $("rosterNameInput").value.trim();
  if (!rosterName) {
    alert("Please enter a roster name.");
    return;
  }

  const filePath = `.rosters/${rosterName}.json`;

  try {
    const response = await fetch(filePath);
    if (!response.ok) {
      alert("Roster not found.");
      return;
    }

    const data = await response.json();

    players.forEach((p, i) => {
      const saved = data.players[i];
      if (saved) {
        p.name = saved.name;
        p.seasonGames = saved.seasonGames || 0;
        p.seasonWins = saved.seasonWins || 0;
        p.seasonLosses = saved.seasonLosses || 0;
        p.seasonPartners = saved.seasonPartners || {};
        p.seasonOpponents = saved.seasonOpponents || {};
      } else {
        p.name = "";
      }

      // Reset daily stats for new session
      p.games = 0;
      p.wins = 0;
      p.losses = 0;
      p.rest = 0;
      p.partners = {};
      p.opponents = {};
    });

    saveState();
    renderPlayersList();
    renderStatsTable();
    renderSummary();
    renderNeedsToPlay();

    alert("Roster loaded! Daily stats reset for a new session.");
  } catch (err) {
    alert("Error loading roster.");
  }
});

// --- Delete Roster ---------------------------------------------------------

document.getElementById("deleteRosterBtn").addEventListener("click", async () => {
  const rosterName = $("rosterNameInput").value.trim();
  if (!rosterName) {
    alert("Please enter a roster name.");
    return;
  }

  await fetch(
    "https://api.github.com/repos/gkhumble1/Organized-Pickleball-Manager/actions/workflows/delete-roster.yml/dispatches",
    {
      method: "POST",
      headers: {
        "Accept": "application/vnd.github+json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ref: "main",
        inputs: { roster_name: rosterName }
      }),
    }
  );

  alert("Roster deleted (if it existed).");
});

// --- Randomize / Reset helpers --------------------------------------------

function randomizeOrder() {
  // Shuffle players array but keep ids/stats
  for (let i = players.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [players[i], players[j]] = [players[j], players[i]];
  }
  saveState();
  renderPlayersList();
  renderStatsTable();
  renderSummary();
  renderNeedsToPlay();
}

function resetSessionKeepNames() {
  players.forEach((p) => {
    p.games = 0;
    p.rest = 0;
    p.wins = 0;
    p.losses = 0;
    p.partners = {};
    p.opponents = {};
  });
  courts = [];
  currentRoundId = 0;
  historyStack = [];
  saveState();
  renderCourts();
  renderPlayersList();
  renderStatsTable();
  renderSummary();
  renderNeedsToPlay();
}

function resetEverything() {
  if (!confirm("Are you sure you want to reset EVERYTHING?")) return;
  players = [];
  courts = [];
  historyStack = [];
  currentRoundId = 0;
  timerRemaining = 15 * 60;
  initPlayers();
  saveState();
  renderCourts();
  renderPlayersList();
  renderStatsTable();
  renderSummary();
  renderNeedsToPlay();
  updateTimerDisplay();
}
// --- Results Modal ---------------------------------------------------------

function openResultsModal() {
  const modal = $("resultsModal");
  const select = $("winnerTeamSelect");
  const container = $("courtResultsContainer");

  if (!modal || !select || !container) return;

  // Clear old content
  select.innerHTML = "";
  container.innerHTML = "";

  // Build options for each court/team
  courts.forEach((court, index) => {
    const opt1 = document.createElement("option");
    opt1.value = `court${index}-team1`;
    opt1.textContent = `Court ${index + 1} - Team 1`;
    select.appendChild(opt1);

    const opt2 = document.createElement("option");
    opt2.value = `court${index}-team2`;
    opt2.textContent = `Court ${index + 1} - Team 2`;
    select.appendChild(opt2);
  });

  modal.classList.remove("hidden");
}

function closeResultsModal() {
  const modal = $("resultsModal");
  if (modal) modal.classList.add("hidden");
}

function saveResults() {
  const select = $("winnerTeamSelect");
  if (!select) return closeResultsModal();

  const value = select.value;
  if (!value) return closeResultsModal();

  const match = value.match(/^court(\d+)-team(\d+)$/);
  if (!match) return closeResultsModal();

  const courtIndex = parseInt(match[1], 10);
  const teamNumber = parseInt(match[2], 10);

  const court = courts[courtIndex];
  if (!court) return closeResultsModal();

  const winners = teamNumber === 1 ? court.team1 : court.team2;
  const losers = teamNumber === 1 ? court.team2 : court.team1;

  players.forEach((p) => {
    if (winners.includes(p.id)) {
      p.wins += 1;
      p.seasonWins += 1;
      p.seasonGames += 1;
    } else if (losers.includes(p.id)) {
      p.losses += 1;
      p.seasonLosses += 1;
      p.seasonGames += 1;
    }
  });

  saveState();
  renderStatsTable();
  renderSummary();
  renderNeedsToPlay();
  closeResultsModal();
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
});

