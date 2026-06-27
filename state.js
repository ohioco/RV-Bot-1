const fs = require('fs');
const path = require('path');

const STATE_FILE = path.join(__dirname, 'active-shifts.json');
const ROSTER_FILE = path.join(__dirname, 'roster.json');

// ---------- Roster ----------
function getRoster() {
  return JSON.parse(fs.readFileSync(ROSTER_FILE, 'utf8'));
}

function lookupPerson(userId, fallbackUsername) {
  const roster = getRoster();
  const entry = roster[userId];
  if (entry) return { name: entry.name, rank: entry.rank };
  return { name: fallbackUsername, rank: 'Unlisted' };
}

// ---------- Active shift state ----------
// Shape: { [userId]: { startedAt, status: 'on_shift'|'on_break', breakStartedAt, totalBreakMs, messageId, channelId } }
function loadState() {
  if (!fs.existsSync(STATE_FILE)) return {};
  return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
}

function saveState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

function getActiveShift(userId) {
  const state = loadState();
  return state[userId] || null;
}

function startShift(userId, messageId, channelId) {
  const state = loadState();
  state[userId] = {
    startedAt: new Date().toISOString(),
    status: 'on_shift',
    breakStartedAt: null,
    totalBreakMs: 0,
    messageId,
    channelId,
  };
  saveState(state);
  return state[userId];
}

function startBreak(userId) {
  const state = loadState();
  const shift = state[userId];
  if (!shift || shift.status !== 'on_shift') return null;
  shift.status = 'on_break';
  shift.breakStartedAt = new Date().toISOString();
  saveState(state);
  return shift;
}

function endBreak(userId) {
  const state = loadState();
  const shift = state[userId];
  if (!shift || shift.status !== 'on_break') return null;
  const breakMs = Date.now() - new Date(shift.breakStartedAt).getTime();
  shift.totalBreakMs += breakMs;
  shift.breakStartedAt = null;
  shift.status = 'on_shift';
  saveState(state);
  return shift;
}

function endShift(userId) {
  const state = loadState();
  const shift = state[userId];
  if (!shift) return null;

  // If they were on break when stopping, fold that break time in first
  if (shift.status === 'on_break' && shift.breakStartedAt) {
    const breakMs = Date.now() - new Date(shift.breakStartedAt).getTime();
    shift.totalBreakMs += breakMs;
  }

  delete state[userId];
  saveState(state);
  return shift;
}

// ---------- Time helpers ----------
function formatDuration(ms) {
  if (ms < 0) ms = 0;
  const totalMinutes = Math.floor(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h ${minutes}m`;
}

function formatClock(isoString) {
  return new Date(isoString).toLocaleString();
}

/**
 * Returns { elapsedMs, breakMs, workedMs } for a shift object at the current moment.
 * elapsedMs = wall-clock time since start (includes break)
 * breakMs = total break time so far (including an in-progress break)
 * workedMs = elapsedMs - breakMs (the "worked" total, break-adjusted)
 */
function computeTimes(shift) {
  const now = Date.now();
  const start = new Date(shift.startedAt).getTime();
  const elapsedMs = now - start;

  let breakMs = shift.totalBreakMs;
  if (shift.status === 'on_break' && shift.breakStartedAt) {
    breakMs += now - new Date(shift.breakStartedAt).getTime();
  }

  const workedMs = elapsedMs - breakMs;
  return { elapsedMs, breakMs, workedMs };
}

module.exports = {
  lookupPerson,
  getActiveShift,
  startShift,
  startBreak,
  endBreak,
  endShift,
  formatDuration,
  formatClock,
  computeTimes,
};
