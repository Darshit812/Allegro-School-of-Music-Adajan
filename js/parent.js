// ============================================================
// parent.js — Parent portal controller
// ============================================================

import { requireRole, logout } from "./auth.js";
import { Students, Attendance, FeePlans, Homework, Batches, Notifications } from "./data-service.js";
import { toKey, monthLabel, monthGridDays, weekdayShort, batchDayCode } from "./calendar-utils.js";
import { db } from "./firebase-config.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const viewRoot = document.getElementById("viewRoot");
const STATUS_LABEL = { present: "Present", absent: "Absent", leave: "Leave", late: "Late" };

let studentCache = null;

// ============================================================
// MOBILE MENU (HAMBURGER) LOGIC
// ============================================================
const mobileMenuBtn = document.getElementById("mobileMenuBtn");
const sidebar = document.querySelector(".sidebar"); 
const mobileOverlay = document.getElementById("mobileOverlay");

if (mobileMenuBtn && sidebar) {
  mobileMenuBtn.addEventListener("click", () => {
    sidebar.classList.add("open");
    if(mobileOverlay) mobileOverlay.classList.add("open");
  });
}

if (mobileOverlay) {
  mobileOverlay.addEventListener("click", () => {
    sidebar.classList.remove("open");
    mobileOverlay.classList.remove("open");
  });
}

document.querySelectorAll(".sidebar .nav-item").forEach(item => {
  item.addEventListener("click", () => {
    if (window.innerWidth <= 768 && sidebar) {
      sidebar.classList.remove("open");
      if(mobileOverlay) mobileOverlay.classList.remove("open");
    }
  });
});

// ============================================================
// INITIALIZATION
// ============================================================
requireRole("parent", async (profile) => {
  document.getElementById("welcomeMsg").textContent = `Welcome, ${profile.name || "Parent"}`;

  if (!profile.studentId) {
    viewRoot.innerHTML = `<div class="card empty-state"><div class="icon">🎵</div>No linked student found. Contact the academy admin.</div>`;
    return;
  }
  const snap = await getDoc(doc(db, "students", profile.studentId));
  if (!snap.exists()) {
    viewRoot.innerHTML = `<div class="card empty-state"><div class="icon">🎵</div>Student record not found.</div>`;
    return;
  }
  studentCache = { id: snap.id, ...snap.data() };
  renderView("attendance");
});

document.getElementById("logoutBtn").addEventListener("click", logout);

document.querySelectorAll(".nav-item[data-view]").forEach(item => {
  item.addEventListener("click", () => {
    document.querySelectorAll(".nav-item[data-view]").forEach(i => i.classList.remove("active"));
    item.classList.add("active");
    renderView(item.dataset.view);
  });
});

function renderView(view) {
  if (!studentCache) return;
  if (view === "attendance") return renderAttendanceView();
  if (view === "fees") return renderFeesView();
  if (view === "homework") return renderHomeworkView();
  if (view === "calendar") return renderCalendarView();
  if (view === "notifications") return renderNotificationsView();
  const label = view.charAt(0).toUpperCase() + view.slice(1);
  viewRoot.innerHTML = `<div class="card empty-state"><div class="icon">🎼</div>${label} coming soon.</div>`;
}

// ============================================================
// NAYA APP VIEW: ATTENDANCE + HOMEWORK MERGED
// ============================================================
async function renderAttendanceView() {
  viewRoot.innerHTML = `<div class="card"><p>Loading App View…</p></div>`;
  
  const [attHistory, hwHistory] = await Promise.all([
    Attendance.listForStudent(studentCache.id, studentCache.batchId),
    Homework.listForStudent(studentCache.id, studentCache.batchId)
  ]);

  const allDates = [...new Set([...attHistory.map(a => a.date), ...hwHistory.map(h => h.date)])];
  allDates.sort((a, b) => b.localeCompare(a)); 

  let cardsHtml = "";
  
  if (!allDates.length) {
    cardsHtml = `<div class="card empty-state"><div class="icon">📅</div>No attendance or homework recorded yet.</div>`;
  } else {
    cardsHtml = allDates.map(dateStr => {
      const attRecord = attHistory.find(a => a.date === dateStr);
      const hwRecords = hwHistory.filter(h => h.date === dateStr);
      
      let attHtml = "";
      let borderColor = "#e0e0e0"; 
      
      if (attRecord) {
        const isPresent = attRecord.status === "present";
        const statusCls = isPresent ? "badge-active" : "badge-inactive";
        attHtml = `<span class="badge ${statusCls}" style="font-size:13px; padding:4px 8px;">${STATUS_LABEL[attRecord.status] || attRecord.status}</span>`;
        borderColor = isPresent ? "var(--color-primary)" : "#F44336"; 
      } else {
        attHtml = `<span class="hint-text" style="font-size:12px;">Not Marked</span>`;
      }

      let hwHtml = "";
      if (hwRecords.length) {
        hwHtml = `<div style="margin-top: 12px; padding-top: 12px; border-top: 1px dashed var(--color-border);">
          <div style="font-size:12px; color:var(--color-primary); font-weight:bold; margin-bottom:6px;">📝 HOMEWORK</div>
          ${hwRecords.map(h => `<p style="font-size:14px; color:#444; margin:0 0 6px 0; white-space:pre-wrap;">${h.description}</p>`).join("")}
        </div>`;
      }

      const parts = dateStr.split("-");
      const niceDate = parts.length === 3 ? `${parts[2]}-${parts[1]}-${parts[0]}` : dateStr;

      return `
        <div class="card" style="margin-bottom:12px; border-left: 4px solid ${borderColor}; padding:14px;">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <strong style="font-size:15px; color:#222;">🗓️ ${niceDate}</strong>
            ${attHtml}
          </div>
          ${hwHtml}
        </div>
      `;
    }).join("");
  }

  viewRoot.innerHTML = `
    <div class="card" style="margin-bottom:18px; display:flex; align-items:center; gap:12px; padding:12px; background:var(--color-primary); color:#fff; border-radius:10px;">
      <div style="width:48px; height:48px; border-radius:50%; background:rgba(255,255,255,0.2); display:flex; align-items:center; justify-content:center; font-size:24px;">🎓</div>
      <div>
        <h3 style="margin:0; font-size:18px; color:#fff;">${studentCache.name}</h3>
        <p style="margin:3px 0 0 0; font-size:13px; opacity:0.9;">Admission No. ${studentCache.admissionNo}</p>
      </div>
    </div>
    ${cardsHtml}
  `;
}

async function renderHomeworkView() {
  viewRoot.innerHTML = `<div class="card"><p>Loading homework…</p></div>`;
  const items = await Homework.listForStudent(studentCache.id, studentCache.batchId);

  viewRoot.innerHTML = items.length
    ? items.sort((a, b) => (b.date || "").localeCompare(a.date || "")).map(h => `
        <div class="card" style="margin-bottom:14px;">
          <div style="display:flex; justify-content:space-between; align-items:flex-start;">
            <span class="badge ${h.scope === "batch" ? "badge-active" : "badge-inactive"}">${h.scope === "batch" ? "Whole Batch" : "Just For You"}</span>
            <span class="hint-text">Date: ${h.date || "—"}</span>
          </div>
          <p style="margin-top:12px; font-size:15px; color:var(--color-text);">${h.description || ""}</p>
        </div>`).join("")
    : `<div class="card empty-state"><div class="icon">📚</div>No homework assigned yet.</div>`;
}

async function renderFeesView() {
  viewRoot.innerHTML = `<div class="card"><p>Loading fees…</p></div>`;
  const plan = await FeePlans.getForStudent(studentCache.id);

  if (!plan) {
    viewRoot.innerHTML = `<div class="card empty-state"><div class="icon">💰</div>No fee plan set up yet. Contact the academy admin.</div>`;
    return;
  }
  if (plan.isCharity) {
    viewRoot.innerHTML = `<div class="card"><p><strong>Charity Student</strong> — Free for All. No fees due. 🎉</p></div>`;
    return;
  }

  const pendingAmt = plan.installments.filter(i => i.status !== "paid").reduce((s, i) => s + i.amount, 0);
  viewRoot.innerHTML = `
    <div class="stat-grid" style="grid-template-columns:repeat(2,1fr); margin-bottom:22px;">
      <div class="stat-card"><div class="label">Total Fees</div><div class="value">₹${plan.totalAmount}</div></div>
      <div class="stat-card"><div class="label">Pending</div><div class="value">₹${pendingAmt}</div></div>
    </div>
    <div class="card"><div class="table-wrap"><table>
      <thead><tr><th>#</th><th>Amount</th><th>Due Date</th><th>Period</th><th>Status</th></tr></thead>
      <tbody>${plan.installments.map(i => `
        <tr><td>#${i.number}</td><td>₹${i.amount}</td><td>${i.dueDate}</td><td>${i.coursePeriod}</td>
        <td><span class="badge ${i.status === "paid" ? "badge-active" : "badge-inactive"}">${i.status === "paid" ? "Paid" : "Pending"}</span></td></tr>`).join("")}
      </tbody>
    </table></div></div>`;
}

/* ---------------- Calendar ---------------- */
const CAL_COLORS = { classday: "#4CAF50", courseEnd: "#000080", fee: "#F44336", birthday: "#FFA726" };
const CAL_LABELS = { classday: "Class Day", courseEnd: "Renewal Due", fee: "Fees Due", birthday: "Birthday" };
let calState = { year: new Date().getFullYear(), month: new Date().getMonth() };

async function renderCalendarView() {
  const { year, month } = calState;
  
  const [plan, batches] = await Promise.all([
    FeePlans.getForStudent(studentCache.id),
    Batches.list()
  ]);
  const myBatch = batches.find(b => b.id === studentCache.batchId);

  const agenda = {};
  const push = (key, type, label) => { if (!agenda[key]) agenda[key] = []; agenda[key].push({ type, label }); };

  const gridDays = monthGridDays(year, month);
  
  const studentDays = studentCache.selectedDays?.length ? studentCache.selectedDays : myBatch?.days || [];

  if (studentDays.length) {
    gridDays.forEach(d => {
      if (studentDays.includes(batchDayCode(d))) push(toKey(d), "classday", `${myBatch?.name || 'Batch'} · ${myBatch?.timing || ""}`);
    });
  }

  if (studentCache.dob) {
    const [y, m, day] = studentCache.dob.split("-").map(Number);
    gridDays.forEach(d => {
      if (d.getMonth() + 1 === m && d.getDate() === day) {
        push(toKey(d), "birthday", `${studentCache.name}'s Birthday 🎉`);
      }
    });
  }

  if (plan && !plan.isCharity) {
    (plan.installments || []).forEach(ins => {
      if (ins.status !== "paid" && ins.dueDate) push(ins.dueDate, "fee", `Installment #${ins.number} — ₹${ins.amount}`);
    });
    
    if (plan.endDate) {
       push(plan.endDate, "courseEnd", `Package Renewal Due`);
    } else if (studentCache.createdAt?.toDate) {
       const d = studentCache.createdAt.toDate();
       d.setMonth(d.getMonth() + 4);
       push(toKey(d), "courseEnd", `Package Renewal Due`);
    }
  }

  const todayKey = toKey(new Date());

  viewRoot.innerHTML = `
    <div class="cal-legend">
      ${Object.entries(CAL_LABELS).map(([k, l]) => `<span><span class="cal-dot" style="background:${CAL_COLORS[k]};"></span>${l}</span>`).join("")}
    </div>
    <div class="toolbar">
      <button class="btn btn-ghost btn-sm" id="prevMonthBtn">← Prev</button>
      <h3 style="font-size:20px;">${monthLabel(year, month)}</h3>
      <button class="btn btn-ghost btn-sm" id="nextMonthBtn">Next →</button>
    </div>
    <div class="cal-grid" style="margin-bottom:8px;">${[0,1,2,3,4,5,6].map(i => `<div class="cal-daylabel">${weekdayShort(i)}</div>`).join("")}</div>
    <div class="cal-grid" id="calCells"></div>`;

  document.getElementById("prevMonthBtn").addEventListener("click", () => {
    calState.month -= 1; if (calState.month < 0) { calState.month = 11; calState.year -= 1; }
    renderCalendarView();
  });
  document.getElementById("nextMonthBtn").addEventListener("click", () => {
    calState.month += 1; if (calState.month > 11) { calState.month = 0; calState.year += 1; }
    renderCalendarView();
  });

  const cellsWrap = document.getElementById("calCells");
  cellsWrap.innerHTML = gridDays.map(d => {
    const key = toKey(d);
    const inMonth = d.getMonth() === month;
    const items = agenda[key] || [];
    const dots = items.slice(0, 6).map(it => `<span class="cal-dot" style="background:${CAL_COLORS[it.type] || "#999"};"></span>`).join("");
    return `<div class="cal-cell ${inMonth ? "" : "dim"} ${key === todayKey ? "today" : ""}" data-key="${key}">
      <div class="cal-num">${d.getDate()}</div><div class="cal-dots">${dots}</div></div>`;
  }).join("");

  cellsWrap.querySelectorAll(".cal-cell").forEach(cell => {
    cell.addEventListener("click", () => {
      const items = agenda[cell.dataset.key] || [];
      openModal(new Date(cell.dataset.key).toDateString(), items.length ? items.map(it => `
        <div style="display:flex; align-items:center; gap:10px; padding:8px 0; border-bottom:1px solid var(--color-border);">
          <span class="cal-dot" style="background:${CAL_COLORS[it.type] || "#999"}; flex-shrink:0;"></span>
          <div><strong>${CAL_LABELS[it.type] || it.type}</strong><br/><span style="font-size:13.5px; color:var(--color-text-muted);">${it.label}</span></div>
        </div>`).join("") : `<div class="empty-state">Nothing scheduled for this day.</div>`);
    });
  });
}

function daysFromNow(dateStr) {
  if (!dateStr) return Infinity;
  const today = new Date();
  const todayKeyStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  return Math.round((new Date(dateStr) - new Date(todayKeyStr)) / 86400000);
}

async function renderNotificationsView() {
  viewRoot.innerHTML = `<div class="card"><p>Loading…</p></div>`;
  const [broadcasts, homework, plan] = await Promise.all([
    Notifications.list(),
    Homework.listForStudent(studentCache.id, studentCache.batchId),
    FeePlans.getForStudent(studentCache.id)
  ]);
  const myBroadcasts = broadcasts.filter(n => n.audience === "all" || n.audience === "parent");

  const items = [];
  homework.forEach(h => {
    const d = daysFromNow(h.dueDate);
    if (d >= 0 && d <= 7) items.push({ icon: "📚", text: `Homework due in ${d === 0 ? "today" : d + " day(s)"}: ${h.title}` });
  });
  if (plan && !plan.isCharity) {
    (plan.installments || []).forEach(ins => {
      if (ins.status === "paid") return;
      const d = daysFromNow(ins.dueDate);
      if (d <= 7) items.push({ icon: "💰", text: `${d < 0 ? "Overdue" : "Due in " + d + " day(s)"}: Installment #${ins.number} — ₹${ins.amount}` });
    });
  }
  
  if (studentCache.dob) {
    const today = new Date();
    const dob = new Date(studentCache.dob);
    if (dob.getMonth() === today.getMonth() && dob.getDate() === today.getDate()) {
      items.unshift({ icon: "🎂", text: `Happy Birthday, ${studentCache.name}! 🎉` });
    }
  }

  viewRoot.innerHTML = `
    <div class="card" style="margin-bottom:18px;">
      <h3 style="font-size:17px; margin-bottom:12px;">Reminders</h3>
      ${items.length ? items.map(r => `<div style="display:flex; gap:10px; padding:9px 0; border-bottom:1px solid var(--color-border);">
          <span>${r.icon}</span><span style="font-size:14.5px;">${r.text}</span>
        </div>`).join("") : `<div class="empty-state">Nothing new right now.</div>`}
    </div>
    <div class="card">
      <h3 style="font-size:17px; margin-bottom:12px;">Messages from Academy</h3>
      ${myBroadcasts.length ? myBroadcasts.map(n => `<div style="padding:9px 0; border-bottom:1px solid var(--color-border);">
          <strong>${n.title}</strong><p style="font-size:14px; color:var(--color-text-muted); margin-top:3px;">${n.message}</p>
        </div>`).join("") : `<div class="empty-state">No messages yet.</div>`}
    </div>`;
}

function openModal(title, bodyHtml) {
  document.getElementById("modalTitle").textContent = title;
  document.getElementById("modalBody").innerHTML = bodyHtml + `<button class="btn btn-ghost" style="margin-top:16px;" onclick="document.getElementById('modalOverlay').classList.remove('open')">Close</button>`;
  document.getElementById("modalOverlay").classList.add("open");
}
document.getElementById("modalClose")?.addEventListener("click", () => document.getElementById("modalOverlay").classList.remove("open"));
document.getElementById("modalOverlay")?.addEventListener("click", (e) => {
  if (e.target.id === "modalOverlay") e.target.classList.remove("open");
});