// ============================================================
// calendar-utils.js — small pure helpers shared by every role's
// Calendar view (admin.js / teacher.js / parent.js).
// ============================================================

const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_LONG = ["January","February","March","April","May","June","July","August","September","October","November","December"];

function pad2(n) { return String(n).padStart(2, "0"); }

export function toKey(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

export function monthLabel(year, month) {
  return `${MONTH_LONG[month]} ${year}`;
}

/** Returns a flat array of Date objects covering full weeks (Sun–Sat) that span the given month. */
export function monthGridDays(year, month) {
  const firstOfMonth = new Date(year, month, 1);
  const startOffset = firstOfMonth.getDay(); // 0 = Sunday
  const gridStart = new Date(year, month, 1 - startOffset);

  const days = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    days.push(d);
  }
  return days;
}

export function weekdayShort(idx) { return WEEKDAY_SHORT[idx]; }

/** True if a DOB string (YYYY-MM-DD) falls on the same month+day as `date`. */
export function isBirthday(dobStr, date) {
  if (!dobStr) return false;
  const dob = new Date(dobStr);
  return dob.getMonth() === date.getMonth() && dob.getDate() === date.getDate();
}

/** Weekday short-code ('Sun'..'Sat') for a given Date, matching Batch.days values ('Mon','Tue',...). */
export function batchDayCode(date) {
  const codes = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return codes[date.getDay()];
}
