// ============================================================
// teacher.js — Teacher portal controller
// Scope for this phase: view own batches + mark attendance.
// Homework/Progress modules follow the same pattern (see README).
// ============================================================

import { requireRole, logout } from "./auth.js";
import { Teachers, Batches, Students, Attendance, Homework, Notifications, ActivityLog, Courses } from "./data-service.js";

const viewRoot = document.getElementById("viewRoot");
let teacherProfile = null;
let myBatchesCache = [];

const STATUS_OPTS = [
  { val: "present", label: "Present", color: "#4CAF50" }, 
  { val: "absent", label: "Absent", color: "#F44336" },   
  { val: "late", label: "Late", color: "#FFA726" }        
];

// NAYA HELPER: Teacher ke khud ke batches nikalne ke liye
async function fetchMyBatches() {
  if (myBatchesCache.length) return myBatchesCache;
  const allBatches = await Batches.list();
  const allTeachers = await Teachers.list(); 
  const myRealId = allTeachers.find(t => t.teacherId === teacherProfile.teacherId)?.id;
  myBatchesCache = allBatches.filter(b => (b.teacherId === myRealId || (b.teacherIds && b.teacherIds.includes(myRealId))) && b.active !== false);
  return myBatchesCache;
}

requireRole("teacher", (profile) => {
  teacherProfile = profile;
  document.getElementById("welcomeMsg").textContent = `Welcome, ${profile.name || "Teacher"}`;
  renderTabs("attendance");
});

document.getElementById("logoutBtn").addEventListener("click", logout);
document.getElementById("modalClose").addEventListener("click", () => document.getElementById("modalOverlay").classList.remove("open"));
document.getElementById("modalOverlay").addEventListener("click", (e) => {
  if (e.target.id === "modalOverlay") e.target.classList.remove("open");
});

// ============================================================
// NAYA: MOBILE MENU (HAMBURGER) LOGIC
// ============================================================
const mobileMenuBtn = document.getElementById("mobileMenuBtn");
const sidebar = document.querySelector(".sidebar"); 
const mobileOverlay = document.getElementById("mobileOverlay");

if (mobileMenuBtn && sidebar) {
  // 1. Button dabane par menu khulega
  mobileMenuBtn.addEventListener("click", () => {
    sidebar.classList.add("open");
    if(mobileOverlay) mobileOverlay.classList.add("open");
  });
}

if (mobileOverlay) {
  // 2. Bahar dark area (overlay) par click karne se menu band ho jayega
  mobileOverlay.addEventListener("click", () => {
    sidebar.classList.remove("open");
    mobileOverlay.classList.remove("open");
  });
}

// 3. Jab sidebar mein koi link click ho (jaise Logout), toh menu band ho jaye
document.querySelectorAll(".sidebar .nav-item").forEach(item => {
  item.addEventListener("click", () => {
    if (window.innerWidth <= 768 && sidebar) {
      sidebar.classList.remove("open");
      if(mobileOverlay) mobileOverlay.classList.remove("open");
    }
  });
});

function toast(msg, isError = false) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.toggle("error", isError);
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 2800);
}

function renderTabs(active) {
  const tabsHtml = `
    <div class="pill-toggle" style="margin-bottom:20px; flex-wrap:wrap;">
      <div class="pill ${active === "attendance" ? "active" : ""}" id="tabAttendance">Attendance & HW</div>
      <div class="pill ${active === "homework" ? "active" : ""}" id="tabHomework">Homework History</div>
      <div class="pill ${active === "notifications" ? "active" : ""}" id="tabNotifications">Notifications</div>
    </div>
    <div id="tabBody"></div>`;
  viewRoot.innerHTML = tabsHtml;
  document.getElementById("tabAttendance").addEventListener("click", () => renderTabs("attendance"));
  document.getElementById("tabHomework").addEventListener("click", () => renderTabs("homework"));
  document.getElementById("tabNotifications").addEventListener("click", () => renderTabs("notifications"));

  if (active === "attendance") renderMyBatches();
  else if (active === "homework") renderMyHomework();
  else renderMyNotifications();
}

/* ---------------- Notifications (broadcasts for teachers + reminders for my batches) ---------------- */
function daysFromNow(dateStr) {
  if (!dateStr) return Infinity;
  const today = new Date();
  const todayKeyStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  return Math.round((new Date(dateStr) - new Date(todayKeyStr)) / 86400000);
}

async function renderMyNotifications() {
  const body = document.getElementById("tabBody");
  const myBatches = await fetchMyBatches();

  // NAYA: Events fetch hataya
  const [broadcasts, students, homeworkLists] = await Promise.all([
    Notifications.list(), Students.list(),
    Promise.all(myBatches.map(b => Homework.listForBatch(b.id)))
  ]);
  const homework = homeworkLists.flat();
  const myStudents = students.filter(s => myBatches.some(b => b.id === s.batchId));
  const myBroadcasts = broadcasts.filter(n => n.audience === "all" || n.audience === "teacher");

  const items = [];
  homework.forEach(h => {
    const d = daysFromNow(h.dueDate);
    if (d >= 0 && d <= 7) items.push({ icon: "📚", text: `Homework due in ${d === 0 ? "today" : d + " day(s)"}: ${h.title}`, date: h.dueDate });
  });
  
  const today = new Date();
  myStudents.forEach(s => {
    if (!s.dob) return;
    const dob = new Date(s.dob);
    const thisYearBday = new Date(today.getFullYear(), dob.getMonth(), dob.getDate());
    const d = daysFromNow(`${thisYearBday.getFullYear()}-${String(thisYearBday.getMonth() + 1).padStart(2, "0")}-${String(thisYearBday.getDate()).padStart(2, "0")}`);
    if (d >= 0 && d <= 7) items.push({ icon: "🎂", text: `${s.name}'s Birthday in ${d === 0 ? "today" : d + " day(s)"}`, date: s.dob });
  });
  items.sort((a, b) => (a.date || "").localeCompare(b.date || ""));

  body.innerHTML = `
    <div class="card" style="margin-bottom:18px;">
      <h3 style="font-size:17px; margin-bottom:12px;">Reminders — Next 7 Days</h3>
      ${items.length ? items.map(r => `<div style="display:flex; gap:10px; padding:9px 0; border-bottom:1px solid var(--color-border);">
          <span>${r.icon}</span><span style="font-size:14.5px;">${r.text}</span>
        </div>`).join("") : `<div class="empty-state">Nothing coming up in the next 7 days.</div>`}
    </div>
    <div class="card">
      <h3 style="font-size:17px; margin-bottom:12px;">Messages from Admin</h3>
      ${myBroadcasts.length ? myBroadcasts.map(n => `<div style="padding:9px 0; border-bottom:1px solid var(--color-border);">
          <strong>${n.title}</strong><p style="font-size:14px; color:var(--color-text-muted); margin-top:3px;">${n.message}</p>
        </div>`).join("") : `<div class="empty-state">No messages yet.</div>`}
    </div>`;
}

async function renderMyBatches() {
  const myBatches = await fetchMyBatches();
  const body = document.getElementById("tabBody");

  if (!myBatches.length) {
    body.innerHTML = `<div class="card empty-state"><div class="icon">🎻</div>No batches assigned to you yet. Contact admin.</div>`;
    return;
  }

  const today = `${new Date().getFullYear()}-${String(new Date().getMonth()+1).padStart(2,"0")}-${String(new Date().getDate()).padStart(2,"0")}`;
  
  // NAYA: 'All Students' checkbox add kiya gaya hai
  body.innerHTML = `
    <div class="card">
      <div class="field-row" style="align-items:flex-end;">
        <div class="field"><label>Batch</label>
          <select id="tBatch">${myBatches.map(b => `<option value="${b.id}">${b.name}</option>`).join("")}</select>
        </div>
        <div class="field" style="max-width: 150px;">
          <label style="display:flex; align-items:center; gap:6px; cursor:pointer; height: 38px; margin: 0; padding-bottom: 5px;">
            <input type="checkbox" id="tAllStudents" style="width:auto; margin:0;" /> All Students
          </label>
        </div>
        <div class="field"><label>Date</label><input type="date" id="tDate" value="${today}" max="${today}" /></div>
      </div>
    </div>
    <div id="tAttWrap" style="margin-top:20px;"></div>`;

  const students = await Students.list();

  const loadFor = async () => {
    const batchId = document.getElementById("tBatch").value;
    const dateStr = document.getElementById("tDate").value;
    const isAll = document.getElementById("tAllStudents").checked; // Checkbox status
    
    if(!batchId && !isAll) return;

    // Agar All Students checked hai to Batch dropdown disable kar do
    document.getElementById("tBatch").disabled = isAll;

    const [y, m, d] = dateStr.split("-").map(Number);
    const dayCode = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][new Date(y, m - 1, d).getDay()];

    // NAYA: Roster mein specific students filter karna (Batch wise ya All)
    let roster = students.filter(s => {
      if (s.active === false) return false;
      
      if (isAll) {
         if (!myBatches.some(b => b.id === s.batchId)) return false; // Teacher ke kisi bhi batch ka hona chahiye
      } else {
         if (s.batchId !== batchId) return false;
      }

      if (s.selectedDays && s.selectedDays.length > 0) {
        return s.selectedDays.includes(dayCode);
      }
      return true;
    });

    // NAYA: Existing records nikalna (Agar All hai to sab batches ke merge karke laayega)
    let existingRecords = {};
    if (isAll) {
      for (let b of myBatches) {
        const ex = await Attendance.getForBatchDate(b.id, dateStr);
        Object.assign(existingRecords, ex.records || {});
      }
    } else {
      const ex = await Attendance.getForBatchDate(batchId, dateStr);
      existingRecords = ex.records || {};
    }

    const wrap = document.getElementById("tAttWrap");

    const rosterIds = new Set(roster.map(s => s.id));
    Object.keys(existingRecords).forEach(guestId => {
      if (!rosterIds.has(guestId)) {
        const guestStudent = students.find(s => s.id === guestId);
        if (guestStudent) roster.push({ ...guestStudent, isGuest: true });
      }
    });

    const paintRoster = () => {
      if (!roster.length) {
        wrap.innerHTML = `
          <div class="card empty-state"><div class="icon">🎼</div>No students scheduled for this day.</div>
          <button class="btn btn-ghost" id="addGuestBtn" style="margin-top:16px;">+ Add Guest Student</button>`;
      } else {
        wrap.innerHTML = `
          <div class="card"><div class="table-wrap"><table>
            <thead><tr><th>Admission No.</th><th>Student</th>${isAll ? '<th>Batch</th>' : ''}<th>Status</th><th>Action</th></tr></thead>
            <tbody>${roster.map(s => {
              const current = existingRecords[s.id] || "";
              const sBatch = myBatches.find(b => b.id === s.batchId)?.name || "—";
              return `<tr data-student="${s.id}" data-batch="${s.batchId}">
                <td>${s.admissionNo}${s.isGuest ? '<span class="badge badge-inactive" style="margin-left:6px;">Guest</span>' : ''}</td>
                <td>${s.name}</td>
                ${isAll ? `<td><span style="font-size:12px; color:#666;">${sBatch}</span></td>` : ''}
                <td><div class="pill-toggle" data-current="${current}">
                  ${STATUS_OPTS.map(o => {
                    const isActive = current === o.val;
                    const style = isActive ? `background-color:${o.color}; color:#fff; border-color:${o.color};` : "";
                    return `<div class="pill status-pill ${isActive ? "active" : ""}" data-val="${o.val}" data-color="${o.color}" style="${style}">${o.label}</div>`;
                  }).join("")}
                </div></td>
                <td><button class="btn btn-ghost btn-sm quick-hw-btn" data-sid="${s.id}" data-sname="${s.name}" data-batch="${s.batchId}" style="padding:4px 8px; color:var(--color-primary);" title="Give Individual Homework">📝 HW</button></td>
              </tr>`;
            }).join("")}</tbody>
          </table></div>
          <div style="display:flex; justify-content:space-between; align-items:center; margin-top:18px;">
            <div style="display:flex; gap:10px; flex-wrap:wrap;">
              <button class="btn btn-ghost" id="addGuestBtn">+ Add Guest</button>
              <button class="btn btn-ghost" id="batchHwBtn" style="color:var(--color-primary);">+ Assign Batch HW</button>
            </div>
            <button class="btn btn-primary" id="tSaveBtn">Save Attendance</button>
          </div>
          </div>`;
      }

      wrap.querySelectorAll(".status-pill").forEach(p => p.addEventListener("click", () => {
        const group = p.closest(".pill-toggle");
        const isAlreadyActive = p.classList.contains("active");
        group.querySelectorAll(".pill").forEach(x => { x.classList.remove("active"); x.style.backgroundColor = ""; x.style.color = ""; x.style.borderColor = ""; });
        if (!isAlreadyActive) {
          p.classList.add("active"); p.style.backgroundColor = p.dataset.color; p.style.color = "#fff"; p.style.borderColor = p.dataset.color; group.dataset.current = p.dataset.val;
        } else { group.dataset.current = ""; }
      }));

      // NAYA: Save Logic (Multi-batch support)
      document.getElementById("tSaveBtn")?.addEventListener("click", async () => {
        const recordsByBatch = {};
        if (isAll) {
            myBatches.forEach(b => recordsByBatch[b.id] = {});
        } else {
            recordsByBatch[batchId] = {};
        }

        wrap.querySelectorAll("tr[data-student]").forEach(tr => {
          const val = tr.querySelector(".pill-toggle").dataset.current;
          const sId = tr.dataset.student;
          const sBatch = tr.dataset.batch;
          if (val) {
              if (!recordsByBatch[sBatch]) recordsByBatch[sBatch] = {};
              recordsByBatch[sBatch][sId] = val;
          }
        });
        
        try {
          const promises = Object.keys(recordsByBatch).map(bId => 
             Attendance.saveForBatchDate(bId, dateStr, recordsByBatch[bId], teacherProfile.uid)
          );
          await Promise.all(promises);
          toast("Attendance saved");
          ActivityLog.record("Attendance Modified", isAll ? `All Batches on ${dateStr}` : `Batch on ${dateStr}`, teacherProfile);
        } catch (err) { toast(err.message, true); }
      });

      wrap.querySelectorAll(".quick-hw-btn").forEach(btn => {
        btn.addEventListener("click", () => openQuickHwModal("individual", btn.dataset.batch, btn.dataset.sid, btn.dataset.sname, dateStr));
      });

      document.getElementById("batchHwBtn")?.addEventListener("click", () => {
        if (isAll) {
            toast("Please uncheck 'All Students' to assign Batch HW.", true);
            return;
        }
        const bName = myBatches.find(b => b.id === batchId)?.name;
        openQuickHwModal("batch", batchId, null, bName, dateStr);
      });

      document.getElementById("addGuestBtn")?.addEventListener("click", () => {
        let validGuests = students.filter(s => {
           if (s.active === false || roster.some(r => r.id === s.id)) return false;
           if (isAll) {
               const myCourseIds = myBatches.map(b => b.courseId);
               return myCourseIds.includes(s.courseId);
           } else {
               const currentBatch = myBatches.find(b => b.id === batchId);
               return s.courseId === currentBatch?.courseId;
           }
        });
        validGuests.sort((a, b) => (a.name || "").localeCompare(b.name || ""));

        document.getElementById("modalTitle").textContent = "Add Guest Student";
        document.getElementById("modalBody").innerHTML = `
          <div class="field">
            <label>Select Student (Filtered by Course)</label>
            <select id="guestSelect" style="margin-bottom:12px;">
              ${validGuests.length ? validGuests.map(s => `<option value="${s.id}">${s.name} (${s.admissionNo})</option>`).join("") : `<option value="" disabled>No eligible students found in this course</option>`}
            </select>
          </div>
          <div style="display:flex; gap:10px;">
            <button class="btn btn-primary" id="confirmGuestBtn" ${!validGuests.length ? 'disabled' : ''}>Add to Roster</button>
            <button type="button" class="btn btn-ghost" id="cancelGuestBtn">Cancel</button>
          </div>
        `;
        document.getElementById("modalOverlay").classList.add("open");

        document.getElementById("cancelGuestBtn").addEventListener("click", () => document.getElementById("modalOverlay").classList.remove("open"));
        document.getElementById("confirmGuestBtn").addEventListener("click", () => {
          const selectedId = document.getElementById("guestSelect").value;
          const guest = students.find(s => s.id === selectedId);
          if (guest) { roster.push({ ...guest, isGuest: true }); document.getElementById("modalOverlay").classList.remove("open"); paintRoster(); }
        });
      });
    };
    paintRoster();
  }; 

  document.getElementById("tBatch").addEventListener("change", loadFor);
  document.getElementById("tDate").addEventListener("change", loadFor);
  document.getElementById("tAllStudents").addEventListener("change", loadFor); // NAYA Listener
  
  if(document.getElementById("tBatch").value) loadFor(); 
}


/* ---------------- HOMEWORK HISTORY (Teacher views history by Date/Batch) ---------------- */
async function renderMyHomework() {
  const body = document.getElementById("tabBody");
  
  const [items, students] = await Promise.all([
    Homework.list(), Students.list()
  ]);
  const myBatches = await fetchMyBatches();
  
  const today = `${new Date().getFullYear()}-${String(new Date().getMonth()+1).padStart(2,"0")}-${String(new Date().getDate()).padStart(2,"0")}`;

  body.innerHTML = `
    <div class="card" style="margin-bottom: 20px;">
      <div class="field-row">
        <div class="field">
          <label>Select Batch</label>
          <select id="hwFilterBatch">
            <option value="">Select a batch...</option>
            ${myBatches.map(b => `<option value="${b.id}">${b.name}</option>`).join("")}
          </select>
        </div>
        <div class="field">
          <label>Select Date</label>
          <input type="date" id="hwFilterDate" value="${today}" />
        </div>
      </div>
    </div>
    
    <div id="hwHistoryWrap">
      <div class="card empty-state"><div class="icon">🔍</div>Select a batch to view homework.</div>
    </div>`;

  const loadHistory = () => {
    const bId = document.getElementById("hwFilterBatch").value;
    const dateStr = document.getElementById("hwFilterDate").value;
    const wrap = document.getElementById("hwHistoryWrap");

    if (!bId || !dateStr) {
      wrap.innerHTML = `<div class="card empty-state"><div class="icon">🔍</div>Select a batch to view homework.</div>`;
      return;
    }

    const batchStudents = students.filter(s => s.batchId === bId);
    const batchStudentIds = batchStudents.map(s => s.id);
    
    const filtered = items.filter(h => h.date === dateStr && (h.batchId === bId || batchStudentIds.includes(h.studentId)));

    if (!filtered.length) {
      wrap.innerHTML = `<div class="card empty-state">No homework assigned for this date & batch.</div>`;
      return;
    }

    const batchHw = filtered.filter(h => h.scope === "batch");
    const indHw = filtered.filter(h => h.scope === "individual");

    let html = "";

    if (batchHw.length) {
      html += `<div class="card" style="margin-bottom:16px; border-left:4px solid var(--color-primary);">
        <h3 style="margin-bottom:8px; font-size:16px;">📢 Whole Batch Homework</h3>
        ${batchHw.map(h => `
          <p style="white-space: pre-wrap; color:#333; font-size:14.5px; margin-bottom:8px;">${h.description}</p>
          <div style="display:flex; justify-content:space-between; align-items:center;">
             <small style="color:#777;">By: ${h.createdByRole === 'admin' ? 'Admin' : 'Teacher'}</small>
             <button class="btn btn-danger btn-sm" data-del="${h.id}" style="padding:2px 8px; font-size:12px;">Delete</button>
          </div>
        `).join("<hr style='margin:10px 0; border:0; border-top:1px dashed #ddd;'/>")}
      </div>`;
    }

    if (indHw.length) {
      html += `<h3 style="font-size:16px; margin: 20px 0 10px 0;">👤 Individual Homework</h3>`;
      html += indHw.map(h => {
        const sName = students.find(s => s.id === h.studentId)?.name || "Unknown Student";
        return `
        <div class="card" style="margin-bottom:10px;">
          <strong style="display:block; color:var(--color-primary); margin-bottom:6px; font-size:15px;">${sName}</strong>
          <p style="white-space: pre-wrap; font-size:14px; color:#444; margin-bottom:10px;">${h.description}</p>
          <div style="display:flex; justify-content:space-between; align-items:center;">
             <small style="color:#777;">By: ${h.createdByRole === 'admin' ? 'Admin' : 'Teacher'}</small>
             <button class="btn btn-danger btn-sm" data-del="${h.id}" style="padding:2px 8px; font-size:12px;">Delete</button>
          </div>
        </div>`;
      }).join("");
    }

    wrap.innerHTML = html;

    wrap.querySelectorAll("[data-del]").forEach(b => b.addEventListener("click", async () => {
      if (!confirm("Are you sure you want to delete this homework?")) return;
      await Homework.remove(b.dataset.del);
      toast("Homework deleted");
      loadHistory(); 
    }));
  };

  document.getElementById("hwFilterBatch").addEventListener("change", loadHistory);
  document.getElementById("hwFilterDate").addEventListener("change", loadHistory);
}

// ============================================================
// NAYA: QUICK HOMEWORK MODAL (From Attendance View)
// ============================================================
function openQuickHwModal(scope, batchId, studentId, targetName, defaultDate) {
  const title = scope === "batch" ? `Batch Homework — ${targetName}` : `Individual Homework — ${targetName}`;
  
  document.getElementById("modalTitle").textContent = title;
  document.getElementById("modalBody").innerHTML = `
    <form id="quickHwForm">
      <div class="field"><label>Date</label><input type="date" id="qhDate" value="${defaultDate}" required /></div>
      <div class="field"><label>Homework Details</label><textarea id="qhDesc" rows="4" placeholder="Type practice details, scales, pages here..." required></textarea></div>
      <div style="display:flex; gap:10px; margin-top:20px;">
        <button type="submit" class="btn btn-primary">Assign Homework</button>
        <button type="button" class="btn btn-ghost" id="qhCancel">Cancel</button>
      </div>
    </form>
  `;
  document.getElementById("modalOverlay").classList.add("open");

  document.getElementById("qhCancel").addEventListener("click", () => {
    document.getElementById("modalOverlay").classList.remove("open");
  });

  document.getElementById("quickHwForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const submitBtn = e.target.querySelector("button[type='submit']");
    submitBtn.disabled = true;
    submitBtn.textContent = "Saving...";
    
    try {
      await Homework.create({
        scope,
        batchId,
        studentId,
        description: document.getElementById("qhDesc").value.trim(),
        date: document.getElementById("qhDate").value,
        createdBy: teacherProfile.uid,
        createdByRole: "teacher"
      });
      ActivityLog.record("Homework Added", `By Teacher (${scope})`, teacherProfile);
      toast("Homework assigned");
      document.getElementById("modalOverlay").classList.remove("open");
    } catch (err) {
      toast(err.message, true);
      submitBtn.disabled = false;
      submitBtn.textContent = "Assign Homework";
    }
  });
}
