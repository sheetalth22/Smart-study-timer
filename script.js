/* ================= Configuration ================= */
const STUDY_TIME_MIN = 1; // change for testing (e.g. 0.1)
const BREAK_TIME_MIN = 1;

let studyTime = Math.round(STUDY_TIME_MIN * 60);
let breakTime = Math.round(BREAK_TIME_MIN * 60);

/* ================= DOM ================= */
const timerDisplay = document.getElementById("timer");
const statusText = document.getElementById("status");
const startBtn = document.getElementById("start");
const pauseBtn = document.getElementById("pause");
const resetBtn = document.getElementById("reset");
const deleteAllBtn = document.getElementById("deleteAll");
const historyList = document.getElementById("history");
const totalEl = document.getElementById("total");
const ctx = document.getElementById("studyChart").getContext("2d");

/* ================= State ================= */
let timeLeft = studyTime;
let isRunning = false;
let isStudySession = true;
let timerInterval = null;
let sessionStartTime = null; // ms timestamp when a study session started
let sessions = JSON.parse(localStorage.getItem("sessions")) || [];
let chart = null;

/* ================= Helpers ================= */
function formatClock(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s < 10 ? "0" : ""}${s}`;
}

function saveSessionsToStorage() {
  localStorage.setItem("sessions", JSON.stringify(sessions));
}

/* ================= Display / History / Chart ================= */
function updateDisplay() {
  timerDisplay.textContent = formatClock(timeLeft);
  statusText.textContent = isStudySession ? "Focus Time" : "Break Time ☕";
}

function saveSession(durationMin) {
  const entry = {
    date: new Date().toLocaleDateString(),
    time: new Date().toLocaleTimeString(),
    duration: Math.round(durationMin)
  };
  sessions.push(entry);
  saveSessionsToStorage();
  updateHistory();
}

function updateHistory() {
  historyList.innerHTML = "";
  let totalToday = 0;
  const today = new Date().toLocaleDateString();

  // Show newest first
  [...sessions].reverse().forEach((s, revIndex) => {
    const originalIndex = sessions.length - 1 - revIndex;

    const li = document.createElement("li");

    // Use <details> for easy expand/collapse
    const details = document.createElement("details");
    const summary = document.createElement("summary");
    summary.className = "detail-summary";

    const summaryText = document.createElement("span");
    summaryText.textContent = `${s.date} • ${s.time} — ${s.duration} mins`;
    summary.appendChild(summaryText);

    // delete button
    const delBtn = document.createElement("button");
    delBtn.className = "del";
    delBtn.title = "Delete entry";
    delBtn.innerText = "🗑️";
    delBtn.addEventListener("click", (ev) => {
      ev.stopPropagation(); // prevent toggling details
      if (!confirm("Delete this entry?")) return;
      sessions.splice(originalIndex, 1);
      saveSessionsToStorage();
      updateHistory();
    });
    summary.appendChild(delBtn);

    details.appendChild(summary);

    const body = document.createElement("div");
    body.className = "detail-body";
    body.innerHTML = `<strong>Started:</strong> ${s.time}<br/><strong>Duration:</strong> ${s.duration} mins`;
    details.appendChild(body);

    li.appendChild(details);
    historyList.appendChild(li);

    if (s.date === today) totalToday += s.duration;
  });

  totalEl.textContent = totalToday.toFixed(0);
  updateChart();
}

function aggregateByDate() {
  const agg = {};
  sessions.forEach(s => {
    agg[s.date] = (agg[s.date] || 0) + s.duration;
  });
  return agg;
}

function updateChart() {
  const byDate = aggregateByDate();
  let labels = Object.keys(byDate);
  let values = labels.map(d => byDate[d]);

  // handle no-data scenario
  if (labels.length === 0) {
    labels = ["No Data"];
    values = [0];
  }

  // destroy old chart
  if (chart) chart.destroy();

  chart = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [{
        label: "Study Minutes",
        data: values,
        backgroundColor: "rgba(76,175,80,0.75)",
        borderRadius: 6,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          beginAtZero: true,
          suggestedMax: Math.max(...values, 30),
          title: { display: true, text: "Minutes" }
        },
        x: {
          title: { display: true, text: "Date" }
        }
      },
      plugins: {
        legend: { display: false },
        title: { display: true, text: "Study Progress (by date)" }
      }
    }
  });
}

/* ================= Timer Controls ================= */
function tick() {
  timeLeft--;
  updateDisplay();

  if (timeLeft <= 0) {
    clearInterval(timerInterval);
    timerInterval = null;
    isRunning = false;
    startBtn.disabled = false;
    pauseBtn.disabled = true;

    // If the session that just finished was a study session, save its duration
    if (isStudySession) {
      // Compute actual duration from start if available, else fallback
      let durationMin = STUDY_TIME_MIN;
      if (sessionStartTime) {
        const ms = Date.now() - sessionStartTime;
        const mins = Math.round(ms / 60000);
        // don't save 0 minutes if for some reason computed 0 -> fallback to configured
        if (mins > 0) durationMin = mins;
      }
      saveSession(durationMin);
      sessionStartTime = null;
    }

    // Toggle to next phase
    isStudySession = !isStudySession;
    timeLeft = isStudySession ? studyTime : breakTime;
    updateDisplay();

    // Auto-start next phase after 1 second if you want:
    setTimeout(() => {
      // start next phase automatically
      startTimer();
    }, 1000);
  }
}

function startTimer() {
  if (isRunning) return;
  isRunning = true;
  startBtn.disabled = true;
  pauseBtn.disabled = false;

  // When starting a fresh study session, set the start timestamp
  if (isStudySession && !sessionStartTime) {
    sessionStartTime = Date.now();
  }

  // Safeguard: ensure we have a valid interval
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = setInterval(tick, 1000);
}

function pauseTimer() {
  if (!isRunning) return;
  clearInterval(timerInterval);
  timerInterval = null;
  isRunning = false;
  startBtn.disabled = false;
  pauseBtn.disabled = true;

  // If paused during a study session, keep sessionStartTime to compute actual minutes later.
}

function resetTimer() {
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = null;
  isRunning = false;
  isStudySession = true;
  timeLeft = studyTime;
  sessionStartTime = null;
  startBtn.disabled = false;
  pauseBtn.disabled = true;
  updateDisplay();
}

/* ================= Delete All ================= */
deleteAllBtn.addEventListener("click", () => {
  if (!confirm("Are you sure you want to delete all study history? This cannot be undone.")) return;
  sessions = [];
  localStorage.removeItem("sessions");
  updateHistory();
});

/* ================= Events ================= */
startBtn.addEventListener("click", startTimer);
pauseBtn.addEventListener("click", pauseTimer);
resetBtn.addEventListener("click", resetTimer);

/* ================= Init ================= */
updateDisplay();
updateHistory();
