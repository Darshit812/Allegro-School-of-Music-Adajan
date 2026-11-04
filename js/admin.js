// ============================================================
// admin.js — Admin console controller
// Pattern for every module: list() from Firestore -> render table
// -> "+ Add" opens modal form -> create()/update() -> re-render.
// Copy the Courses module pattern to build Fees/Attendance/etc.
// ============================================================

import { requireRole, logout } from "./auth.js";
import { Courses, Teachers, Batches, Students, admitStudent, Attendance, TeacherAttendance, FeePlans, Payments, generateInstallmentSchedule, Homework, Salary, IncomeEntries, ExpenseEntries, Events, Notifications, ActivityLog } from "./data-service.js";
import { toKey, monthLabel, monthGridDays, weekdayShort, isBirthday, batchDayCode } from "./calendar-utils.js";

const viewRoot = document.getElementById("viewRoot");
let adminProfile = null;

// Cache so tabs don't refetch every click; each CRUD action refreshes its own cache.
const cache = { courses: [], teachers: [], batches: [], students: [] };

requireRole("admin", (profile) => {
  adminProfile = profile;
  render("dashboard");
});

document.getElementById("logoutBtn").addEventListener("click", logout);

document.querySelectorAll(".nav-item[data-view]").forEach(item => {
  item.addEventListener("click", () => {
    document.querySelectorAll(".nav-item[data-view]").forEach(i => i.classList.remove("active"));
    item.classList.add("active");
    render(item.dataset.view);
  });
});

// ============================================================
// NAYA: MOBILE MENU (HAMBURGER) LOGIC
// ============================================================
const mobileMenuBtn = document.getElementById("mobileMenuBtn");
const sidebar = document.querySelector(".sidebar"); // ⚠️ DHYAN DEIN: Agar aapki HTML mein left menu ka div 'nav' ya 'side-nav' hai, toh usko yahan update karein
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

/* ---------------- Toast ---------------- */
function toast(msg, isError = false) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.toggle("error", isError);
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 2800);
}

/** Fire-and-forget audit log entry. Never awaited/blocking — see ActivityLog.record(). */
function logActivity(action, entityLabel) {
  ActivityLog.record(action, entityLabel, adminProfile);
}

/* ---------------- Modal ---------------- */
function openModal(title, bodyHtml) {
  document.getElementById("modalTitle").textContent = title;
  document.getElementById("modalBody").innerHTML = bodyHtml;
  document.getElementById("modalOverlay").classList.add("open");
}
function closeModal() {
  document.getElementById("modalOverlay").classList.remove("open");
}
document.getElementById("modalClose").addEventListener("click", closeModal);
document.getElementById("modalOverlay").addEventListener("click", (e) => {
  if (e.target.id === "modalOverlay") closeModal();
});

// NAYA: Left sidebar mein Fees ke aage 'Pending' badge dikhane ke liye
async function updateSidebarFeesBadge() {
  try {
    const [allStudents, allPlans] = await Promise.all([Students.list(), FeePlans.listAll()]);
    const planByStudent = Object.fromEntries(allPlans.map(p => [p.studentId, p]));
    const pendingCount = allStudents.filter(s => s.active !== false && !planByStudent[s.id]).length;
    
    const feesNav = document.querySelector('.nav-item[data-view="fees"]');
    if (feesNav) {
      if (pendingCount > 0) {
        feesNav.innerHTML = `<span class="dot"></span> Fees <span class="badge" style="margin-left:auto; background-color:#F44336; color:#fff; font-size:10px; padding:2px 6px; border:none; line-height:1;">${pendingCount} Pending</span>`;
      } else {
        feesNav.innerHTML = `<span class="dot"></span> Fees`;
      }
    }
  } catch (e) {}
}

/* ---------------- Router ---------------- */
async function render(view) {
  updateSidebarFeesBadge(); // NAYA: Har tab change par badge update hoga
  switch (view) {
    case "dashboard": return renderDashboard();
    case "courses": return renderCourses();
    case "teachers": return renderTeachers();
    case "batches": return renderBatches();
    case "students": return renderStudents();
    case "attendance": return renderAttendance();
    case "fees": return renderFees();
    case "homework": return renderHomework();
    case "salary": return renderSalary();
    case "accounting": return renderAccounting();
    case "calendar": return renderCalendar();
    case "reports": return renderReports();
    case "notifications": return renderNotifications();
    case "activity": return renderActivityLog();
    default: return renderComingSoon(view);
  }
}

function renderComingSoon(view) {
  const label = view.charAt(0).toUpperCase() + view.slice(1);
  viewRoot.innerHTML = `
    <div class="main-header"><div><h2>${label}</h2><div class="sub">This module follows the same pattern as Courses/Teachers — ready to build next.</div></div></div>
    <div class="card empty-state">
      <div class="icon">🎼</div>
      <p>${label} module coming in the next build phase.</p>
    </div>`;
}

/* ================================================================
   DASHBOARD
   ================================================================ */
async function renderDashboard() {
  viewRoot.innerHTML = `<div class="main-header"><div><h2>Dashboard</h2><div class="sub">Welcome back, ${adminProfile.name || "Admin"}</div></div></div>
    <div class="stat-grid" id="statGrid">
      <div class="stat-card"><div class="label">Active Courses</div><div class="value">—</div></div>
      <div class="stat-card"><div class="label">Teachers</div><div class="value">—</div></div>
      <div class="stat-card"><div class="label">Batches</div><div class="value">—</div></div>
      <div class="stat-card"><div class="label">Students</div><div class="value">—</div></div>
    </div>
    <div class="staff-rule"></div>
    <div class="card">
      <h3 style="margin-bottom:8px;">Getting started</h3>
      <p class="hint-text" style="font-size:14px;">1. Add your Courses (Piano, Guitar, etc.) &nbsp; 2. Add Teachers and map them to Courses &nbsp; 3. Create Batches &nbsp; 4. Admit Students into a Batch.</p>
    </div>`;

  const [courses, teachers, batches, students] = await Promise.all([
    Courses.list(), Teachers.list(), Batches.list(), Students.list()
  ]);
  cache.courses = courses; cache.teachers = teachers; cache.batches = batches; cache.students = students;

  const values = document.querySelectorAll("#statGrid .value");
  values[0].textContent = courses.filter(c => c.active).length;
  values[1].textContent = teachers.filter(t => t.active).length;
  values[2].textContent = batches.filter(b => b.active).length;
  values[3].textContent = students.filter(s => s.active).length;
}

/* ================================================================
   COURSES  (reference module — copy this pattern for new modules)
   ================================================================ */
async function renderCourses() {
  viewRoot.innerHTML = `
    <div class="main-header">
      <div><h2>Courses</h2><div class="sub">Dynamic — add, edit or retire any course without touching code.</div></div>
      <button class="btn btn-accent" id="addCourseBtn">+ Add Course</button>
    </div>
    <div class="card"><div class="table-wrap"><table id="courseTable">
      <thead><tr><th>Course</th><th>Category</th><th>Reg. Fees</th><th>Status</th><th></th></tr></thead>
      <tbody><tr><td colspan="5" class="empty-state">Loading…</td></tr></tbody>
    </table></div></div>`;

  document.getElementById("addCourseBtn").addEventListener("click", () => openCourseForm());

  const courses = await Courses.list();
  cache.courses = courses;
  const tbody = document.querySelector("#courseTable tbody");

  if (!courses.length) {
    tbody.innerHTML = `<tr><td colspan="5"><div class="empty-state"><div class="icon">🎹</div>No courses yet. Add your first one — Piano, Guitar, Vocal…</div></td></tr>`;
    return;
  }

  tbody.innerHTML = courses.map(c => `
    <tr>
      <td><strong>${c.name}</strong></td>
      <td>${c.category || "—"}</td>
      <td>₹${c.registrationFees ?? 0}</td>
      <td><span class="badge ${c.active ? "badge-active" : "badge-inactive"}">${c.active ? "Active" : "Inactive"}</span></td>
      <td>
        <button class="btn btn-ghost btn-sm" data-edit="${c.id}">Edit</button>
        <button class="btn btn-danger btn-sm" data-del="${c.id}">Delete</button>
      </td>
    </tr>`).join("");

  tbody.querySelectorAll("[data-edit]").forEach(b => b.addEventListener("click", () =>
    openCourseForm(courses.find(c => c.id === b.dataset.edit))));
  tbody.querySelectorAll("[data-del]").forEach(b => b.addEventListener("click", async () => {
    if (!confirm("Delete this course? This cannot be undone.")) return;
    const deletedCourse = courses.find(c => c.id === b.dataset.del);
    await Courses.remove(b.dataset.del);
    toast("Course deleted");
    logActivity("Course Deleted", deletedCourse?.name);
    renderCourses();
  }));
}

function openCourseForm(course = null) {
  const isEdit = !!course;
  openModal(isEdit ? "Edit Course" : "Add Course", `
    <form id="courseForm">
      <div class="field"><label>Course Name</label>
        <input type="text" id="cName" value="${course?.name || ""}" placeholder="e.g. Piano" required /></div>
      <div class="field-row">
        <div class="field"><label>Category</label>
          <input type="text" id="cCategory" value="${course?.category || ""}" placeholder="e.g. Instrumental" /></div>
        <div class="field"><label>Registration Fees (₹)</label>
          <input type="number" id="cRegFees" value="${course?.registrationFees ?? ""}" min="0" /></div>
      </div>
      <div class="field-row" style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:10px;">
        <div class="field"><label>4 Months Fee (₹)</label>
          <input type="number" id="cFee4" value="${course?.fee4 ?? ""}" placeholder="e.g. 5000" min="0" required /></div>
        <div class="field"><label>8 Months Fee (₹)</label>
          <input type="number" id="cFee8" value="${course?.fee8 ?? ""}" placeholder="e.g. 8000" min="0" required /></div>
        <div class="field"><label>12 Months Fee (₹)</label>
          <input type="number" id="cFee12" value="${course?.fee12 ?? ""}" placeholder="e.g. 12000" min="0" required /></div>
      </div>
      <div class="field">
        <label>Status</label>
        <div class="pill-toggle">
          <div class="pill ${course?.active !== false ? "active" : ""}" data-val="true">Active</div>
          <div class="pill ${course?.active === false ? "active" : ""}" data-val="false">Inactive</div>
        </div>
        <input type="hidden" id="cActive" value="${course?.active !== false}" />
      </div>
      <div style="display:flex; gap:10px; margin-top:20px;">
        <button type="submit" class="btn btn-primary">${isEdit ? "Save Changes" : "Add Course"}</button>
        <button type="button" class="btn btn-ghost" id="cancelBtn">Cancel</button>
      </div>
    </form>`);

  document.querySelectorAll("#courseForm .pill").forEach(p => p.addEventListener("click", () => {
    document.querySelectorAll("#courseForm .pill").forEach(x => x.classList.remove("active"));
    p.classList.add("active");
    document.getElementById("cActive").value = p.dataset.val;
  }));
  document.getElementById("cancelBtn").addEventListener("click", closeModal);

  document.getElementById("courseForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const data = {
      name: document.getElementById("cName").value.trim(),
      category: document.getElementById("cCategory").value.trim(),
      registrationFees: Number(document.getElementById("cRegFees").value || 0),
      fee4: Number(document.getElementById("cFee4").value || 0),
      fee8: Number(document.getElementById("cFee8").value || 0),
      fee12: Number(document.getElementById("cFee12").value || 0),
      active: document.getElementById("cActive").value === "true"
    };
    try {
      if (isEdit) await Courses.update(course.id, data);
      else await Courses.create(data);
      toast(isEdit ? "Course updated" : "Course added");
      logActivity(isEdit ? "Course Edited" : "Course Added", data.name);
      closeModal();
      renderCourses();
    } catch (err) {
      toast(err.message, true);
    }
  });
}

/* ================================================================
   TEACHERS
   ================================================================ */
async function renderTeachers() {
  viewRoot.innerHTML = `
    <div class="main-header">
      <div><h2>Teachers</h2><div class="sub">Map teachers to one or more courses.</div></div>
      <button class="btn btn-accent" id="addTeacherBtn">+ Add Teacher</button>
    </div>
    <div class="card"><div class="table-wrap"><table id="teacherTable">
      <thead><tr><th>Name</th><th>Mobile</th><th>Courses</th><th>Login Details</th><th>Salary Type</th><th>Status</th><th></th></tr></thead>
      <tbody><tr><td colspan="6" class="empty-state">Loading…</td></tr></tbody>
    </table></div></div>`;

  const [teachers, courses] = await Promise.all([Teachers.list(), Courses.list()]);
  cache.teachers = teachers; cache.courses = courses;
  document.getElementById("addTeacherBtn").addEventListener("click", () => openTeacherForm(null, courses));

  const tbody = document.querySelector("#teacherTable tbody");
  if (!teachers.length) {
    tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state"><div class="icon">🎻</div>No teachers yet.</div></td></tr>`;
    return;
  }
  tbody.innerHTML = teachers.map(t => {
    const courseNames = (t.courseIds || []).map(id => courses.find(c => c.id === id)?.name).filter(Boolean).join(", ") || "—";
    return `<tr>
      <td><strong>${t.name}</strong></td>
      <td>${t.mobile || "—"}</td>
      <td>${courseNames}</td>
      <td><small style="color:var(--color-primary); font-weight:600;">ID: ${t.teacherId || "—"}<br/>Pass: ${t.loginPassword || "—"}</small></td>
      <td>${t.salaryType === "partner" ? "Partner (variable)" : "Fixed"}</td>
      <td><span class="badge ${t.active ? "badge-active" : "badge-inactive"}">${t.active ? "Active" : "Inactive"}</span></td>
      <td>
        <button class="btn btn-ghost btn-sm" data-wa="${t.id}" title="Share on WhatsApp">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="#25D366" viewBox="0 0 16 16">
              <path d="M13.601 2.326A7.85 7.85 0 0 0 7.994 0C3.627 0 .068 3.558.064 7.926c0 1.399.366 2.76 1.057 3.965L0 16l4.204-1.102a7.9 7.9 0 0 0 3.79.965h.004c4.368 0 7.926-3.558 7.93-7.93A7.9 7.9 0 0 0 13.6 2.326zM7.994 14.521a6.6 6.6 0 0 1-3.356-.92l-.24-.144-2.494.654.666-2.433-.156-.251a6.56 6.56 0 0 1-1.007-3.505c0-3.626 2.957-6.584 6.591-6.584a6.56 6.56 0 0 1 4.66 1.931 6.56 6.56 0 0 1 1.928 4.66c-.004 3.639-2.961 6.592-6.592 6.592m3.615-4.934c-.197-.099-1.17-.578-1.353-.646-.182-.065-.315-.099-.445.099-.133.197-.513.646-.627.775-.114.133-.232.148-.43.05-.197-.1-.836-.308-1.592-.985-.59-.525-.985-1.175-1.103-1.372-.114-.198-.011-.304.088-.403.087-.088.197-.232.296-.346.1-.114.133-.198.198-.33.065-.134.034-.248-.015-.347-.05-.099-.445-1.076-.612-1.47-.16-.389-.323-.335-.445-.34-.114-.007-.247-.007-.38-.007a.73.73 0 0 0-.529.247c-.182.198-.691.677-.691 1.654s.71 1.916.81 2.049c.098.133 1.394 2.132 3.383 2.992.47.205.84.326 1.129.418.475.152.904.129 1.246.08.38-.058 1.171-.48 1.338-.943.164-.464.164-.86.114-.943-.049-.084-.182-.133-.38-.232"/>
            </svg>
        </button>
        <button class="btn btn-ghost btn-sm" data-edit="${t.id}">Edit</button>
        <button class="btn btn-danger btn-sm" data-del="${t.id}">Delete</button>
      </td>
    </tr>`;
  }).join("");

  // NAYA: WhatsApp Button Listener for Teachers
  tbody.querySelectorAll("[data-wa]").forEach(b => b.addEventListener("click", () => {
    const teacher = teachers.find(x => x.id === b.dataset.wa);
    shareCredentialsWhatsApp(teacher.name, teacher.mobile, teacher.teacherId, teacher.loginPassword, "Teacher");
  }));

  // Aapka purana Edit Listener
  tbody.querySelectorAll("[data-edit]").forEach(b => b.addEventListener("click", () =>
    openTeacherForm(teachers.find(t => t.id === b.dataset.edit), courses)));
    
  // Aapka purana Delete Listener
  tbody.querySelectorAll("[data-del]").forEach(b => b.addEventListener("click", async () => {
    if (!confirm("Delete this teacher?")) return;
    const deletedTeacher = teachers.find(t => t.id === b.dataset.del);
    await Teachers.remove(b.dataset.del);
    toast("Teacher deleted");
    logActivity("Teacher Deleted", deletedTeacher?.name);
    renderTeachers();
  }));
}

function openTeacherForm(teacher, courses) {
  const isEdit = !!teacher;
  const courseOptions = courses.map(c => `
    <label style="display:flex; align-items:center; gap:8px; font-weight:400; margin-bottom:6px;">
      <input type="checkbox" value="${c.id}" class="cCheck" ${teacher?.courseIds?.includes(c.id) ? "checked" : ""} style="width:auto;" /> ${c.name}
    </label>`).join("");

  openModal(isEdit ? "Edit Teacher" : "Add Teacher", `
    <form id="teacherForm">
      <div class="field-row">
        <div class="field"><label>Full Name</label><input type="text" id="tName" value="${teacher?.name || ""}" required /></div>
        <div class="field"><label>Mobile</label><input type="text" id="tMobile" value="${teacher?.mobile || ""}" required /></div>
      </div>
      <div class="field"><label>Address</label><input type="text" id="tAddress" value="${teacher?.address || ""}" /></div>
      <div class="field-row">
        <div class="field"><label>Qualification</label><input type="text" id="tQual" value="${teacher?.qualification || ""}" /></div>
        <div class="field"><label>Joining Date</label><input type="date" id="tJoin" value="${teacher?.joiningDate || ""}" /></div>
      </div>
      <div class="field"><label>Salary Type</label>
        <select id="tSalaryType">
          <option value="fixed" ${teacher?.salaryType !== "partner" ? "selected" : ""}>Fixed Salary</option>
          <option value="partner" ${teacher?.salaryType === "partner" ? "selected" : ""}>Partner Teacher (variable payout)</option>
        </select></div>
      <div class="field"><label>Courses Taught</label>${courseOptions || "<p class='hint-text'>Add a course first.</p>"}</div>
      ${!isEdit ? `
      <div class="card" style="background:var(--color-surface-alt); margin-bottom:16px;">
        <p class="hint-text" style="margin-bottom:10px;">Set this teacher's login (they'll use it to sign in to their portal):</p>
        <div class="field-row">
          <div class="field"><label>Login ID</label><input type="text" id="tLoginId" placeholder="e.g. teacher_ravi" required /></div>
          <div class="field"><label>Password</label><input type="text" id="tLoginPassword" placeholder="Set a password" required minlength="6" /></div>
        </div>
      </div>` : ""}
      <div style="display:flex; gap:10px; margin-top:20px;">
        <button type="submit" class="btn btn-primary" id="teacherSubmitBtn">${isEdit ? "Save Changes" : "Add Teacher"}</button>
        <button type="button" class="btn btn-ghost" id="cancelBtn">Cancel</button>
      </div>
    </form>`);

  document.getElementById("cancelBtn").addEventListener("click", closeModal);
  document.getElementById("teacherForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const courseIds = Array.from(document.querySelectorAll(".cCheck:checked")).map(c => c.value);
    const data = {
      name: document.getElementById("tName").value.trim(),
      mobile: document.getElementById("tMobile").value.trim(),
      address: document.getElementById("tAddress").value.trim(),
      qualification: document.getElementById("tQual").value.trim(),
      joiningDate: document.getElementById("tJoin").value,
      salaryType: document.getElementById("tSalaryType").value,
      courseIds
    };
    const submitBtn = document.getElementById("teacherSubmitBtn");
    submitBtn.disabled = true;
    try {
      if (isEdit) {
        await Teachers.update(teacher.id, data);
        toast("Teacher updated");
        logActivity("Teacher Edited", data.name);
        closeModal();
        renderTeachers();
      } else {
        const loginId = document.getElementById("tLoginId").value.trim();
        const password = document.getElementById("tLoginPassword").value;
        await Teachers.create(data, loginId, password);
        logActivity("Teacher Added", data.name);
        toast("Teacher added — login is ready");
        closeModal();
        
        // NAYA: Success Modal open karein manual Share button ke sath
        openModal("Teacher Added Successfully", `
          <p style="font-size:15px; margin-bottom:14px;">Share these login details with the teacher:</p>
          <div class="card" style="background:var(--color-surface-alt);">
            <p><strong>Login ID:</strong> ${loginId}</p>
            <p><strong>Password:</strong> ${password}</p>
          </div>
          <div style="display:flex; gap:10px; margin-top:20px;">
            <button class="btn btn-primary" id="waShareTeacherBtn" style="display:flex; align-items:center; gap:8px;">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                <path d="M13.601 2.326A7.85 7.85 0 0 0 7.994 0C3.627 0 .068 3.558.064 7.926c0 1.399.366 2.76 1.057 3.965L0 16l4.204-1.102a7.9 7.9 0 0 0 3.79.965h.004c4.368 0 7.926-3.558 7.93-7.93A7.9 7.9 0 0 0 13.6 2.326zM7.994 14.521a6.6 6.6 0 0 1-3.356-.92l-.24-.144-2.494.654.666-2.433-.156-.251a6.56 6.56 0 0 1-1.007-3.505c0-3.626 2.957-6.584 6.591-6.584a6.56 6.56 0 0 1 4.66 1.931 6.56 6.56 0 0 1 1.928 4.66c-.004 3.639-2.961 6.592-6.592 6.592m3.615-4.934c-.197-.099-1.17-.578-1.353-.646-.182-.065-.315-.099-.445.099-.133.197-.513.646-.627.775-.114.133-.232.148-.43.05-.197-.1-.836-.308-1.592-.985-.59-.525-.985-1.175-1.103-1.372-.114-.198-.011-.304.088-.403.087-.088.197-.232.296-.346.1-.114.133-.198.198-.33.065-.134.034-.248-.015-.347-.05-.099-.445-1.076-.612-1.47-.16-.389-.323-.335-.445-.34-.114-.007-.247-.007-.38-.007a.73.73 0 0 0-.529.247c-.182.198-.691.677-.691 1.654s.71 1.916.81 2.049c.098.133 1.394 2.132 3.383 2.992.47.205.84.326 1.129.418.475.152.904.129 1.246.08.38-.058 1.171-.48 1.338-.943.164-.464.164-.86.114-.943-.049-.084-.182-.133-.38-.232"/>
              </svg>
              Share on WhatsApp
            </button>
            <button class="btn btn-ghost" id="doneTeacherBtn">Done</button>
          </div>`);
          
        document.getElementById("waShareTeacherBtn").addEventListener("click", () => {
          shareCredentialsWhatsApp(data.name, data.mobile, loginId, password, "Teacher");
        });
        document.getElementById("doneTeacherBtn").addEventListener("click", () => { 
          closeModal(); 
          renderTeachers(); 
        });
      }
    } catch (err) {
      toast(err.message.includes("email-already-in-use") ? "This Login ID is already taken — pick another." : err.message, true);
      submitBtn.disabled = false;
    }
  });
}

/* ================================================================
   BATCHES
   ================================================================ */
let currentBatchView = 'list'; 
let currentTimetableCourseFilter = 'all'; 
let showTtTeachers = true; // NAYA: Teacher toggle track karne ke liye
let showTtStudents = true; // NAYA: Student toggle track karne ke liye

async function renderBatches() {
  const [batches, courses, teachers, students] = await Promise.all([Batches.list(), Courses.list(), Teachers.list(), Students.list()]);
  cache.batches = batches; cache.courses = courses; cache.teachers = teachers; cache.students = students;

  viewRoot.innerHTML = `
    <div class="main-header" style="flex-wrap: wrap; gap: 15px;">
      <div style="flex: 1 1 auto; min-width: 200px;"><h2>Batches</h2><div class="sub">Group students under a course, teacher and timing.</div></div>
      
      <!-- NAYA: Sab kuch ek straight line mein lane ke liye flex-wrap: nowrap aur height fix ki gayi hai -->
      <div style="display:flex; gap:8px; align-items:center; flex-wrap: nowrap; overflow-x: auto; padding-bottom: 4px;">
        ${currentBatchView === 'grid' ? `
          <select id="ttCourseFilter" style="padding:0 10px; height:34px; font-size:14px; border-radius:4px; border:1px solid var(--color-border); background:var(--color-surface);">
            <option value="all">All Courses</option>
            ${courses.map(c => `<option value="${c.id}" ${currentTimetableCourseFilter === c.id ? 'selected' : ''}>${c.name}</option>`).join('')}
          </select>
          
          <div style="display:flex; gap:10px; align-items:center; background:var(--color-surface-alt); padding:0 10px; height:34px; border-radius:4px; border:1px solid var(--color-border); white-space:nowrap;">
             <label style="font-size:13px; display:flex; align-items:center; gap:4px; cursor:pointer; margin:0;"><input type="checkbox" id="ttShowTeachers" ${showTtTeachers ? 'checked' : ''} style="width:auto; margin:0;" /> Teachers</label>
             <label style="font-size:13px; display:flex; align-items:center; gap:4px; cursor:pointer; margin:0;"><input type="checkbox" id="ttShowStudents" ${showTtStudents ? 'checked' : ''} style="width:auto; margin:0;" /> Students</label>
          </div>

          <button class="btn btn-ghost" id="printTtBtn" title="Print Timetable" style="height:34px; padding:0 12px; display:flex; align-items:center; gap:5px; white-space:nowrap;">
            🖨️ Print
          </button>
        ` : ''}
        <button class="btn btn-ghost" id="toggleViewBtn" style="height:34px; padding:0 12px; white-space:nowrap;">${currentBatchView === 'list' ? 'Timetable View' : 'List View'}</button>
        <button class="btn btn-accent" id="addBatchBtn" style="height:34px; padding:0 16px; white-space:nowrap;">+ Add Batch</button>
      </div>
    </div>
    <div id="batchContentArea"></div>`;

  document.getElementById("addBatchBtn").addEventListener("click", () => openBatchForm(null, courses, teachers));
  
  document.getElementById("toggleViewBtn").addEventListener("click", () => {
    currentBatchView = currentBatchView === 'list' ? 'grid' : 'list';
    renderBatches();
  });

  // NAYA: Filter aur Print button ke event listeners
  if (currentBatchView === 'grid') {
    document.getElementById("ttCourseFilter").addEventListener("change", (e) => {
      currentTimetableCourseFilter = e.target.value;
      renderBatches();
    });
    document.getElementById("ttShowTeachers").addEventListener("change", (e) => {
      showTtTeachers = e.target.checked;
      renderBatches();
    });
    document.getElementById("ttShowStudents").addEventListener("change", (e) => {
      showTtStudents = e.target.checked;
      renderBatches();
    });
    document.getElementById("printTtBtn").addEventListener("click", () => {
      printTimetable(generateTimetableHTML(batches, students, courses, teachers, currentTimetableCourseFilter, showTtTeachers, showTtStudents, true)); 
    });
  }

  const contentArea = document.getElementById("batchContentArea");

  if (currentBatchView === 'list') {
    contentArea.innerHTML = `
      <div class="card"><div class="table-wrap"><table id="batchTable">
        <thead><tr><th>Batch</th><th>Course</th><th>Teacher</th><th>Timing</th><th>Students</th><th>Status</th><th></th></tr></thead>
        <tbody></tbody>
      </table></div></div>`;
      
    const tbody = document.querySelector("#batchTable tbody");
    if (!batches.length) {
      tbody.innerHTML = `<tr><td colspan="7"><div class="empty-state"><div class="icon">🥁</div>No batches yet.</div></td></tr>`;
      return;
    }
    tbody.innerHTML = batches.map(b => {
      // NAYA: Actual students ginega, capacity hata di gayi hai
      const studentCount = students.filter(s => s.batchId === b.id && s.active !== false).length;
      
      // NAYA: Ek se zyada teachers nikalne ka logic
      const tIds = b.teacherIds && b.teacherIds.length ? b.teacherIds : [b.teacherId];
      const teacherNames = tIds.map(id => teachers.find(t => t.id === id)?.name).filter(Boolean).join(", ") || "—";
      
      return `
      <tr>
        <td><strong>${b.name}</strong></td>
        <td>${courses.find(c => c.id === b.courseId)?.name || "—"}</td>
        <td>${teacherNames}</td>
        <td>${b.timing || "—"} ${b.days?.length ? "· " + b.days.join(", ") : ""}</td>
        <td>${studentCount}</td>
        <td><span class="badge ${b.active ? "badge-active" : "badge-inactive"}">${b.active ? "Active" : "Inactive"}</span></td>
        <!-- NAYA: Edit/Delete buttons ko flex div de kar ek line mein laya -->
        <td><div style="display:flex; gap:5px;"><button class="btn btn-ghost btn-sm" data-edit="${b.id}">Edit</button>
            <button class="btn btn-danger btn-sm" data-del="${b.id}">Delete</button></div></td>
      </tr>`;
    }).join("");

    tbody.querySelectorAll("[data-edit]").forEach(el => el.addEventListener("click", () =>
      openBatchForm(batches.find(b => b.id === el.dataset.edit), courses, teachers)));
    tbody.querySelectorAll("[data-del]").forEach(el => el.addEventListener("click", async () => {
      const studentsInThisBatch = students.filter(s => s.batchId === el.dataset.del && s.active !== false);
      if (studentsInThisBatch.length > 0) {
        alert(`Stop! Is batch mein abhi ${studentsInThisBatch.length} active students hain. Pehle unhe kisi aur batch mein shift karein.`);
        return;
      }
      if (!confirm("Delete this batch?")) return;
      const deletedBatch = batches.find(b => b.id === el.dataset.del);
      await Batches.remove(el.dataset.del);
      toast("Batch deleted");
      logActivity("Batch Deleted", deletedBatch?.name);
      renderBatches();
    }));
  } else {
    // NAYA: Timetable View render karega naye parameters ke sath
    contentArea.innerHTML = generateTimetableHTML(batches, students, courses, teachers, currentTimetableCourseFilter, showTtTeachers, showTtStudents, false);
  }
}

function openBatchForm(batch, courses, teachers) {
  const isEdit = !!batch;
  const dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  
  // Purane batches backward compatibility
  const existingTeacherIds = isEdit ? (batch.teacherIds || (batch.teacherId ? [batch.teacherId] : [])) : [];
  if(existingTeacherIds.length === 0) existingTeacherIds.push(""); // Kam se kam ek khali dropdown aaye

  openModal(isEdit ? "Edit Batch" : "Add Batch", `
    <form id="batchForm">
      <div class="field-row">
        <div class="field"><label>Course</label>
          <select id="bCourse" required>
            <option value="" disabled ${!isEdit ? 'selected' : ''}>Select a Course...</option>
            ${courses.map(c => `<option value="${c.id}" ${batch?.courseId === c.id ? "selected" : ""}>${c.name}</option>`).join("")}
          </select></div>
        <div class="field" style="display:flex; flex-direction:column;">
          <label>Teacher(s)</label>
          <div id="teacherDropdownContainer" style="display:flex; flex-direction:column; gap:6px;">
            <!-- JS yahan dropdowns bharega -->
          </div>
          <button type="button" class="btn btn-ghost btn-sm" id="addCoTeacherBtn" style="margin-top:6px; align-self:flex-start; padding:4px 8px;">+ Add Co-Teacher</button>
        </div>
      </div>
      <div class="field"><label>Timing</label><input type="text" id="bTiming" value="${batch?.timing || ""}" placeholder="e.g. 5 to 6" required /></div>
      <div class="field"><label>Days</label>
        <div style="display:flex; flex-wrap:wrap; gap:8px;">
          ${dayNames.map(d => `<label style="display:flex; align-items:center; gap:5px; font-weight:400;"><input type="checkbox" value="${d}" class="dCheck" ${batch?.days?.includes(d) ? "checked" : ""} style="width:auto;" />${d}</label>`).join("")}
        </div>
      </div>
      
      <!-- NAYA: Batch Name Neeche aur Disable (Readonly) -->
      <div class="field" style="margin-top:16px;">
        <label>Auto-generated Batch Name</label>
        <input type="text" id="bName" value="${batch?.name || ""}" placeholder="Course (Timing)" required readonly style="background-color: var(--color-surface-alt); font-size: 13px; color: var(--color-text-muted); cursor: not-allowed; border: 1px dashed var(--color-border);" />
      </div>

      <div style="display:flex; gap:10px; margin-top:20px;">
        <button type="submit" class="btn btn-primary">${isEdit ? "Save Changes" : "Add Batch"}</button>
        <button type="button" class="btn btn-ghost" id="cancelBtn">Cancel</button>
      </div>
    </form>`);

  const teacherContainer = document.getElementById("teacherDropdownContainer");
  
  // Jo course select hua hai, sirf uske teachers ki list banana
  const getValidTeachersHtml = (selectedValue) => {
    const courseId = document.getElementById("bCourse").value;
    const validTeachers = teachers.filter(t => (t.courseIds || []).includes(courseId));
    if(!validTeachers.length) return `<option value="" disabled selected>First select a course...</option>`;
    
    return `<option value="" disabled ${!selectedValue ? 'selected' : ''}>Select a teacher...</option>` +
           validTeachers.map(t => `<option value="${t.id}" ${selectedValue === t.id ? 'selected' : ''}>${t.name}</option>`).join("");
  };

  // Naya dropdown UI row add karna
  const addTeacherRow = (selectedValue = "", isPrimary = false) => {
    const row = document.createElement("div");
    row.style.display = "flex";
    row.style.gap = "6px";
    
    const select = document.createElement("select");
    select.className = "bTeacherSelect";
    select.required = true;
    select.style.flex = "1";
    select.innerHTML = getValidTeachersHtml(selectedValue);
    
    row.appendChild(select);
    
    // Pehle teacher ko chhod kar baaki sabme delete (❌) button dena
    if(!isPrimary) {
      const delBtn = document.createElement("button");
      delBtn.type = "button";
      delBtn.className = "btn btn-danger btn-sm";
      delBtn.style.padding = "0 8px";
      delBtn.textContent = "❌";
      delBtn.onclick = () => row.remove();
      row.appendChild(delBtn);
    }
    teacherContainer.appendChild(row);
  };

  // Popup khulte hi purane teachers load karna
  existingTeacherIds.forEach((id, index) => addTeacherRow(id, index === 0));

  // Course badalne par sabhi teacher dropdowns update karna
  document.getElementById("bCourse").addEventListener("change", () => {
     document.querySelectorAll(".bTeacherSelect").forEach(select => {
        const currentVal = select.value;
        select.innerHTML = getValidTeachersHtml(currentVal);
     });
  });

  // "+ Add Co-Teacher" dabane par naya dibba banana
  document.getElementById("addCoTeacherBtn").addEventListener("click", () => {
     addTeacherRow();
  });

  // NAYA: Auto-generate Batch Name (Course Name + Time)
  const updateBatchName = () => {
    const cDropdown = document.getElementById("bCourse");
    const tInput = document.getElementById("bTiming");
    const cName = cDropdown.options[cDropdown.selectedIndex]?.text;
    if (cName && cName !== "Select a Course..." && tInput.value.trim()) {
      document.getElementById("bName").value = `${cName} (${tInput.value.trim()})`;
    }
  };
  document.getElementById("bCourse").addEventListener("change", updateBatchName);
  document.getElementById("bTiming").addEventListener("input", updateBatchName);

  document.getElementById("cancelBtn").addEventListener("click", closeModal);
  document.getElementById("batchForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const days = Array.from(document.querySelectorAll(".dCheck:checked")).map(c => c.value);
    
    // NAYA: Sabhi select dabbon se value nikal kar array banana
    const teacherSelects = document.querySelectorAll(".bTeacherSelect");
    const selectedTeacherIds = Array.from(teacherSelects).map(s => s.value).filter(Boolean);

    const data = {
      name: document.getElementById("bName").value.trim(),
      courseId: document.getElementById("bCourse").value,
      teacherId: selectedTeacherIds[0] || null, // Backward compatibility ke liye pehla teacher
      teacherIds: selectedTeacherIds,           // NAYA: Pura array database mein jayega
      timing: document.getElementById("bTiming").value.trim(),
      days 
    };
    try {
      if (isEdit) await Batches.update(batch.id, data);
      else await Batches.create(data);
      toast(isEdit ? "Batch updated" : "Batch added");
      logActivity(isEdit ? "Batch Edited" : "Batch Added", data.name);
      closeModal();
      renderBatches();
    } catch (err) { toast(err.message, true); }
  });
}

/* ================================================================
   STUDENTS (admission) — also queues auto parent-account creation
   ================================================================ */
async function renderStudents() {
  viewRoot.innerHTML = `
    <div class="main-header">
      <div><h2>Students</h2><div class="sub">Admission creates the student record and a parent login automatically.</div></div>
      <button class="btn btn-accent" id="addStudentBtn">+ New Admission</button>
    </div>
    <div class="toolbar">
      <input type="text" class="search-input" id="studentSearch" placeholder="Search by name, admission no, or mobile…" style="width:100%; max-width:400px;" />
    </div>
    <div class="card"><div class="table-wrap"><table id="studentTable">
      <!-- NAYA: Course / Batch ki jagah sirf Batch -->
      <thead><tr><th>Admission No.</th><th>Name</th><th>Batch</th><th>Mobile</th><th>Status</th><th>Parent Login</th><th></th></tr></thead>
      <tbody><tr><td colspan="7" class="empty-state">Loading…</td></tr></tbody>
    </table></div></div>`;

  const [students, courses, batches] = await Promise.all([Students.list(), Courses.list(), Batches.list()]);
  cache.students = students; cache.courses = courses; cache.batches = batches;
  document.getElementById("addStudentBtn").addEventListener("click", () => openStudentForm(courses, batches));

  // SORTING: Active pehle, Inactive baad mein. Fir A-Z sort.
  students.sort((a, b) => {
    if (a.active === b.active) return (a.name || "").localeCompare(b.name || "");
    return a.active ? -1 : 1;
  });

  const tbody = document.querySelector("#studentTable tbody");
  const searchInput = document.getElementById("studentSearch");

  const paintTable = (list) => {
    if (!list.length) {
      tbody.innerHTML = `<tr><td colspan="7"><div class="empty-state"><div class="icon">🎓</div>No students found.</div></td></tr>`;
      return;
    }
    tbody.innerHTML = list.map(s => `
      <tr style="${s.active === false ? 'opacity:0.5;' : ''}">
        <td><strong>${s.admissionNo}</strong></td>
        <td>${s.name}</td>
        <!-- NAYA: Sirf batch name -->
        <td>${batches.find(b => b.id === s.batchId)?.name || "—"}</td>
        <td>${s.mobile || "—"}</td>
        <td><span class="badge ${s.active ? "badge-active" : "badge-inactive"}">${s.active ? "Active" : "Inactive"}</span></td>
        <td><small style="color:var(--color-primary); font-weight:600;">ID: ${s.parentLoginId || "—"}<br/>Pass: ${s.parentPassword || "—"}</small></td>
        <td>
          <!-- NAYA: Buttons ek line me lane ke liye flex div lagaya -->
          <div style="display:flex; gap:5px; align-items:center;">
            <button class="btn btn-ghost btn-sm" data-wa="${s.id}" title="Share on WhatsApp" style="padding:4px 8px; display:flex; align-items:center;">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="#25D366" viewBox="0 0 16 16">
                <path d="M13.601 2.326A7.85 7.85 0 0 0 7.994 0C3.627 0 .068 3.558.064 7.926c0 1.399.366 2.76 1.057 3.965L0 16l4.204-1.102a7.9 7.9 0 0 0 3.79.965h.004c4.368 0 7.926-3.558 7.93-7.93A7.9 7.9 0 0 0 13.6 2.326zM7.994 14.521a6.6 6.6 0 0 1-3.356-.92l-.24-.144-2.494.654.666-2.433-.156-.251a6.56 6.56 0 0 1-1.007-3.505c0-3.626 2.957-6.584 6.591-6.584a6.56 6.56 0 0 1 4.66 1.931 6.56 6.56 0 0 1 1.928 4.66c-.004 3.639-2.961 6.592-6.592 6.592m3.615-4.934c-.197-.099-1.17-.578-1.353-.646-.182-.065-.315-.099-.445.099-.133.197-.513.646-.627.775-.114.133-.232.148-.43.05-.197-.1-.836-.308-1.592-.985-.59-.525-.985-1.175-1.103-1.372-.114-.198-.011-.304.088-.403.087-.088.197-.232.296-.346.1-.114.133-.198.198-.33.065-.134.034-.248-.015-.347-.05-.099-.445-1.076-.612-1.47-.16-.389-.323-.335-.445-.34-.114-.007-.247-.007-.38-.007a.73.73 0 0 0-.529.247c-.182.198-.691.677-.691 1.654s.71 1.916.81 2.049c.098.133 1.394 2.132 3.383 2.992.47.205.84.326 1.129.418.475.152.904.129 1.246.08.38-.058 1.171-.48 1.338-.943.164-.464.164-.86.114-.943-.049-.084-.182-.133-.38-.232"/>
              </svg>
            </button>
            <button class="btn btn-ghost btn-sm" data-edit="${s.id}">Edit</button>
            <button class="btn btn-danger btn-sm" data-del="${s.id}">Remove</button>
          </div>
        </td>
      </tr>`).join("");

    // NAYA: WhatsApp Button Listener
    tbody.querySelectorAll("[data-wa]").forEach(el => el.addEventListener("click", () => {
      const st = students.find(x => x.id === el.dataset.wa);
      shareCredentialsWhatsApp(st.name, st.mobile, st.parentLoginId, st.parentPassword, "Parent/Student");
    }));

    // Aapka purana Edit Listener
    tbody.querySelectorAll("[data-edit]").forEach(el => el.addEventListener("click", () => openEditStudentForm(list.find(s => s.id === el.dataset.edit), courses, batches)));

    // Aapka purana Remove Listener
    tbody.querySelectorAll("[data-del]").forEach(el => el.addEventListener("click", async () => {
      if (!confirm("Remove this student record?")) return;
      const removedStudent = students.find(s => s.id === el.dataset.del);
      await Students.remove(el.dataset.del);
      toast("Student removed");
      logActivity("Student Removed", removedStudent?.name);
      renderStudents();
    }));
  };

  paintTable(students);

  // LIVE SEARCH LOGIC
  searchInput.addEventListener("input", (e) => {
    const q = e.target.value.toLowerCase().trim();
    const filtered = students.filter(s => 
      (s.name || "").toLowerCase().includes(q) || 
      (s.admissionNo || "").toLowerCase().includes(q) || 
      (s.mobile || "").includes(q)
    );
    paintTable(filtered);
  });
}

// NAYA FUNCTION: Student ko edit karne ke liye
function openEditStudentForm(student, courses, batches) {
  openModal(`Edit Student — ${student.name}`, `
    <form id="editStudentForm">
      <div class="field"><label>Student Name</label><input type="text" id="esName" value="${student.name}" required /></div>
      <div class="field-row">
        <div class="field"><label>Admission Date</label><input type="date" id="esAdmissionDate" value="${student.admissionDate || ""}" required /></div>
        <div class="field"><label>Date of Birth</label><input type="date" id="esDob" value="${student.dob || ""}" /></div>
      </div>
      <div class="field"><label>Address</label><input type="text" id="esAddress" value="${student.address || ""}" /></div>
      <div class="field-row">
        <div class="field"><label>Mobile (WhatsApp)</label><input type="tel" id="esMobile" value="${student.mobile || ""}" required /></div>
        <div class="field"><label>Email (optional)</label><input type="email" id="esEmail" value="${student.email || ""}" /></div>
      </div>
      <div class="field-row">
        <div class="field"><label>Father's Name</label><input type="text" id="esFather" value="${student.fatherName || ""}" /></div>
        <div class="field"><label>Father's Mobile</label><input type="tel" id="esFatherMobile" value="${student.fatherMobile || ""}" /></div>
      </div>
      <div class="field-row">
        <div class="field"><label>Mother's Name</label><input type="text" id="esMother" value="${student.motherName || ""}" /></div>
        <div class="field"><label>Mother's Mobile</label><input type="tel" id="esMotherMobile" value="${student.motherMobile || ""}" /></div>
      </div>
      <div class="field-row">
        <div class="field"><label>Course</label>
          <select id="esCourse">
            ${courses.map(c => `<option value="${c.id}" ${student.courseId === c.id ? "selected" : ""}>${c.name}</option>`).join("")}
          </select></div>
        <div class="field"><label>Batch</label>
          <select id="esBatch">
             <!-- Options JS se bhari jayengi -->
          </select></div>
      </div>
      <!-- NAYA: Edit me Days tick karna -->
      <div class="field">
        <label>Student's Attendance Days <span style="color:red;">*</span></label>
        <div id="esDaysContainer" style="display:flex; flex-wrap:wrap; gap:8px; padding: 6px 0;">
          <!-- JS se bharega -->
        </div>
      </div>
      <div class="field">
        <label>Status (Inactive karne se attendance aur active lists se hat jayega)</label>
        <div class="pill-toggle">
          <div class="pill ${student.active !== false ? "active" : ""}" data-val="true">Active</div>
          <div class="pill ${student.active === false ? "active" : ""}" data-val="false">Inactive</div>
        </div>
        <input type="hidden" id="esActive" value="${student.active !== false}" />
      </div>
      <div style="display:flex; gap:10px; margin-top:20px;">
        <button type="submit" class="btn btn-primary">Save Changes</button>
        <button type="button" class="btn btn-ghost" id="editCancelBtn">Cancel</button>
      </div>
    </form>`);

  document.getElementById("editCancelBtn").addEventListener("click", closeModal);

  // NAYA: Smart Batch Dropdown Logic (Edit Student)
  const updateEditBatchDropdown = () => {
    const courseId = document.getElementById("esCourse").value;
    const validBatches = batches.filter(b => b.courseId === courseId);
    const batchSelect = document.getElementById("esBatch");
    
    if (validBatches.length === 0) {
      batchSelect.innerHTML = `<option value="" disabled selected>No batches available</option>`;
    } else {
      batchSelect.innerHTML = validBatches.map(b => `<option value="${b.id}" ${student.batchId === b.id ? "selected" : ""}>${b.name} (${b.timing || ''})</option>`).join("");
    }
    // NAYA: Manually trigger karo taaki days load ho jayein
    batchSelect.dispatchEvent(new Event("change"));
  };
  
  document.getElementById("esCourse").addEventListener("change", updateEditBatchDropdown);

  // NAYA: Batch select hone par days dikhao aur existing ones tick karo
  document.getElementById("esBatch").addEventListener("change", (e) => {
    const batchId = e.target.value;
    const batch = batches.find(b => b.id === batchId);
    const container = document.getElementById("esDaysContainer");
    
    if (batch && batch.days && batch.days.length > 0) {
      container.innerHTML = batch.days.map(d => {
        const isChecked = (student.selectedDays || []).includes(d) ? "checked" : "";
        return `<label style="display:flex; align-items:center; gap:5px; font-weight:400; cursor:pointer;"><input type="checkbox" value="${d}" class="esDayCheck" ${isChecked} style="width:auto;" />${d}</label>`;
      }).join("");
    } else {
      container.innerHTML = `<span class="hint-text" style="color:var(--color-danger);">This batch has no days assigned. Edit batch first.</span>`;
    }
  });

  updateEditBatchDropdown(); // Open hote hi pehli baar chalega

  document.querySelectorAll("#editStudentForm .pill").forEach(p => p.addEventListener("click", () => {
    document.querySelectorAll("#editStudentForm .pill").forEach(x => x.classList.remove("active"));
    p.classList.add("active");
    document.getElementById("esActive").value = p.dataset.val;
  }));

  document.getElementById("editStudentForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    
    // NAYA: Compulsory Check
    const selectedDays = Array.from(document.querySelectorAll(".esDayCheck:checked")).map(c => c.value);
    if (selectedDays.length === 0) {
      toast("Please tick at least one attendance day.", true);
      return;
    }

    const data = {
      name: document.getElementById("esName").value.trim(),
      admissionDate: document.getElementById("esAdmissionDate").value, // NAYA
      dob: document.getElementById("esDob").value,
      address: document.getElementById("esAddress").value.trim(),
      mobile: document.getElementById("esMobile").value.trim(),
      email: document.getElementById("esEmail").value.trim(),
      fatherName: document.getElementById("esFather").value.trim(),
      fatherMobile: document.getElementById("esFatherMobile").value.trim(),
      motherName: document.getElementById("esMother").value.trim(),
      motherMobile: document.getElementById("esMotherMobile").value.trim(),
      courseId: document.getElementById("esCourse").value,
      batchId: document.getElementById("esBatch").value,
      selectedDays: selectedDays, // NAYA
      active: document.getElementById("esActive").value === "true"
    };
    try {
      await Students.update(student.id, data);
      toast("Student updated");
      logActivity("Student Edited", data.name);
      closeModal();
      renderStudents();
    } catch(err) { toast(err.message, true); }
  });
}

/* ================================================================
   ATTENDANCE — mark a whole batch for a chosen date OR mark teachers.
   ================================================================ */
const STATUS_OPTS = [
  { val: "present", label: "Present", color: "#4CAF50" }, 
  { val: "absent", label: "Absent", color: "#F44336" },   
  { val: "late", label: "Late", color: "#FFA726" }        
];

let currentAttView = 'student'; // 'student' or 'teacher'

async function renderAttendance() {
  viewRoot.innerHTML = `
    <div class="main-header">
      <div><h2>Attendance</h2><div class="sub">Mark attendance for students or teachers.</div></div>
    </div>
    <div class="pill-toggle" style="margin-bottom:18px;">
      <div class="pill ${currentAttView === 'student' ? 'active' : ''}" id="tabAttStudent">Student Attendance</div>
      <div class="pill ${currentAttView === 'teacher' ? 'active' : ''}" id="tabAttTeacher">Teacher's Attendance</div>
    </div>
    <div id="attendanceContentArea"></div>`;

  document.getElementById("tabAttStudent").addEventListener("click", () => {
    currentAttView = 'student';
    renderAttendance();
  });
  document.getElementById("tabAttTeacher").addEventListener("click", () => {
    currentAttView = 'teacher';
    renderAttendance();
  });

  if (currentAttView === 'student') {
    renderStudentAttendanceUI();
  } else {
    renderTeacherAttendanceUI();
  }
}

async function renderStudentAttendanceUI() {
  const area = document.getElementById("attendanceContentArea");
  area.innerHTML = `
    <div class="card" style="margin-bottom:18px;">
      <div class="field-row" style="align-items:flex-end;">
        <div class="field"><label>Batch</label><select id="attBatch"><option value="" selected disabled>Select a batch…</option></select></div>
        <div class="field"><label>Date</label><input type="date" id="attDate" value="${fmtLocalDate(new Date())}" max="${fmtLocalDate(new Date())}" /></div>
      </div>
    </div>
    <div id="attTableWrap"></div>`;

  const [batches, students] = await Promise.all([Batches.list(), Students.list()]);
  const activeBatches = batches.filter(b => b.active !== false);
  const batchSelect = document.getElementById("attBatch");
  
  if (!activeBatches.length) {
    batchSelect.innerHTML = `<option value="">No active batches available</option>`;
    batchSelect.disabled = true;
  } else {
    batchSelect.innerHTML += activeBatches.map(b => `<option value="${b.id}">${b.name}</option>`).join("");
  }

  const loadFor = async () => {
    const batchId = document.getElementById("attBatch").value;
    const dateStr = document.getElementById("attDate").value;
    if (!batchId) return;

    const [y, m, d] = dateStr.split("-").map(Number);
    const dayCode = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][new Date(y, m - 1, d).getDay()];

    let roster = students.filter(s => {
      if (s.batchId !== batchId || s.active === false) return false;
      if (s.selectedDays && s.selectedDays.length > 0) {
        return s.selectedDays.includes(dayCode);
      }
      return true; 
    });

    const existing = await Attendance.getForBatchDate(batchId, dateStr);
    const wrap = document.getElementById("attTableWrap");

    const rosterIds = new Set(roster.map(s => s.id));
    Object.keys(existing.records || {}).forEach(guestId => {
      if (!rosterIds.has(guestId)) {
        const guestStudent = students.find(s => s.id === guestId);
        if (guestStudent) roster.push({ ...guestStudent, isGuest: true });
      }
    });

    const paintRoster = () => {
      if (!roster.length) {
        wrap.innerHTML = `
          <div class="card empty-state"><div class="icon">🎼</div>No active students in this batch.</div>
          <button class="btn btn-ghost" id="addGuestBtn" style="margin-top:16px;">+ Add Guest Student</button>`;
      } else {
        wrap.innerHTML = `
          <div class="card"><div class="table-wrap"><table id="rosterTable">
            <thead><tr><th>Admission No.</th><th>Student</th><th>Status</th></tr></thead>
            <tbody>${roster.map(s => {
              const current = existing.records?.[s.id] || ""; 
              return `<tr data-student="${s.id}">
                <td>${s.admissionNo} ${s.isGuest ? '<span class="badge badge-inactive" style="margin-left:6px;">Guest</span>' : ''}</td>
                <td>${s.name}</td>
                <td><div class="pill-toggle" data-current="${current}">
                  ${STATUS_OPTS.map(o => {
                    const isActive = current === o.val;
                    const style = isActive ? `background-color:${o.color}; color:#fff; border-color:${o.color};` : "";
                    return `<div class="pill status-pill ${isActive ? "active" : ""}" data-val="${o.val}" data-color="${o.color}" style="${style}">${o.label}</div>`;
                  }).join("")}
                </div></td>
              </tr>`;
            }).join("")}</tbody>
          </table></div>
          <div style="display:flex; justify-content:space-between; align-items:center; margin-top:18px;">
            <button class="btn btn-ghost" id="addGuestBtn">+ Add Guest Student</button>
            <button class="btn btn-primary" id="saveAttBtn">Save Attendance</button>
          </div>
          </div>`;
      }

      wrap.querySelectorAll(".status-pill").forEach(p => p.addEventListener("click", () => {
        const group = p.closest(".pill-toggle");
        const isAlreadyActive = p.classList.contains("active");

        group.querySelectorAll(".pill").forEach(x => {
          x.classList.remove("active");
          x.style.backgroundColor = ""; x.style.color = ""; x.style.borderColor = "";
        });

        if (!isAlreadyActive) {
          p.classList.add("active");
          p.style.backgroundColor = p.dataset.color;
          p.style.color = "#fff";
          p.style.borderColor = p.dataset.color;
          group.dataset.current = p.dataset.val;
        } else {
          group.dataset.current = ""; 
        }
      }));

      document.getElementById("saveAttBtn")?.addEventListener("click", async () => {
        const records = {};
        wrap.querySelectorAll("tr[data-student]").forEach(tr => {
          const val = tr.querySelector(".pill-toggle").dataset.current;
          if (val) records[tr.dataset.student] = val; 
        });
        try {
          await Attendance.saveForBatchDate(batchId, dateStr, records, adminProfile.uid);
          toast("Attendance saved");
          logActivity("Attendance Modified", `${batches.find(b => b.id === batchId)?.name || batchId} — ${dateStr}`);
        } catch (err) { toast(err.message, true); }
      });

      document.getElementById("addGuestBtn")?.addEventListener("click", () => {
        const allActive = students.filter(s => s.active !== false && !roster.some(r => r.id === s.id));
        openModal("Add Guest Student", `
          <div class="field">
            <label>Select Student to mark present in today's class</label>
            <select id="guestSelect" style="margin-bottom:12px;">
              ${allActive.map(s => `<option value="${s.id}">${s.name} (${s.admissionNo})</option>`).join("")}
            </select>
          </div>
          <div style="display:flex; gap:10px;">
            <button class="btn btn-primary" id="confirmGuestBtn">Add to Roster</button>
            <button class="btn btn-ghost" id="cancelGuestBtn">Cancel</button>
          </div>
        `);
        document.getElementById("cancelGuestBtn").addEventListener("click", closeModal);
        document.getElementById("confirmGuestBtn").addEventListener("click", () => {
          const selectedId = document.getElementById("guestSelect").value;
          const guest = students.find(s => s.id === selectedId);
          if (guest) { roster.push({ ...guest, isGuest: true }); closeModal(); paintRoster(); }
        });
      });
    };
    paintRoster();
  };

  document.getElementById("attBatch").addEventListener("change", loadFor);
  document.getElementById("attDate").addEventListener("change", loadFor);
  if(document.getElementById("attBatch").value) loadFor(); 
}

async function renderTeacherAttendanceUI() {
  const area = document.getElementById("attendanceContentArea");
  area.innerHTML = `
    <div class="card" style="margin-bottom:18px;">
      <div class="field-row" style="align-items:flex-end;">
        <div class="field"><label>Date</label><input type="date" id="tAttDate" value="${fmtLocalDate(new Date())}" max="${fmtLocalDate(new Date())}" /></div>
      </div>
    </div>
    <div id="tAttTableWrap"></div>
  `;

  const teachers = await Teachers.list();
  const activeTeachers = teachers.filter(t => t.active !== false);

  const loadTeacherAtt = async () => {
    const dateStr = document.getElementById("tAttDate").value;
    const wrap = document.getElementById("tAttTableWrap");
    
    if (!activeTeachers.length) {
      wrap.innerHTML = `<div class="card empty-state"><div class="icon">🎻</div>No active teachers found.</div>`;
      return;
    }

    const existing = await TeacherAttendance.getForDate(dateStr);
    
    wrap.innerHTML = `
      <div class="card"><div class="table-wrap"><table id="tAttRosterTable">
        <thead><tr><th>Teacher Name</th><th>Mobile</th><th>Status</th></tr></thead>
        <tbody>${activeTeachers.map(t => {
          const current = existing.records?.[t.id] || ""; 
          return `<tr data-teacher="${t.id}">
            <td><strong>${t.name}</strong></td>
            <td>${t.mobile || "—"}</td>
            <td><div class="pill-toggle" data-current="${current}">
              ${STATUS_OPTS.map(o => {
                const isActive = current === o.val;
                const style = isActive ? `background-color:${o.color}; color:#fff; border-color:${o.color};` : "";
                return `<div class="pill status-pill ${isActive ? "active" : ""}" data-val="${o.val}" data-color="${o.color}" style="${style}">${o.label}</div>`;
              }).join("")}
            </div></td>
          </tr>`;
        }).join("")}</tbody>
      </table></div>
      <div style="display:flex; justify-content:flex-end; align-items:center; margin-top:18px;">
        <button class="btn btn-primary" id="saveTAttBtn">Save Teacher Attendance</button>
      </div>
      </div>
    `;

    wrap.querySelectorAll(".status-pill").forEach(p => p.addEventListener("click", () => {
      const group = p.closest(".pill-toggle");
      const isAlreadyActive = p.classList.contains("active");

      group.querySelectorAll(".pill").forEach(x => {
        x.classList.remove("active");
        x.style.backgroundColor = ""; x.style.color = ""; x.style.borderColor = "";
      });

      if (!isAlreadyActive) {
        p.classList.add("active");
        p.style.backgroundColor = p.dataset.color;
        p.style.color = "#fff";
        p.style.borderColor = p.dataset.color;
        group.dataset.current = p.dataset.val;
      } else {
        group.dataset.current = ""; 
      }
    }));

    document.getElementById("saveTAttBtn")?.addEventListener("click", async () => {
      const records = {};
      wrap.querySelectorAll("tr[data-teacher]").forEach(tr => {
        const val = tr.querySelector(".pill-toggle").dataset.current;
        if (val) records[tr.dataset.teacher] = val; 
      });
      try {
        await TeacherAttendance.saveForDate(dateStr, records, adminProfile.uid);
        toast("Teacher Attendance saved");
        logActivity("Teacher Attendance Modified", `${dateStr}`);
      } catch (err) { toast(err.message, true); }
    });
  };

  document.getElementById("tAttDate").addEventListener("change", loadTeacherAtt);
  loadTeacherAtt();
}  

function openStudentForm(courses, batches) {
  openModal("New Admission", `
    <form id="studentForm">
      <div class="field"><label>Student Name</label><input type="text" id="sName" required /></div>
      <div class="field-row">
        <div class="field"><label>Admission Date</label><input type="date" id="sAdmissionDate" value="${new Date().toISOString().split('T')[0]}" required /></div>
        <div class="field"><label>Date of Birth</label><input type="date" id="sDob" /></div>
      </div>
      <div class="field"><label>Address</label><input type="text" id="sAddress" /></div>
      <div class="field-row">
        <div class="field"><label>Mobile (WhatsApp - Primary)</label><input type="tel" id="sMobile" required /></div>
        <div class="field"><label>Email (optional)</label><input type="email" id="sEmail" /></div>
      </div>
      <div class="field-row">
        <div class="field"><label>Father's Name</label><input type="text" id="sFather" /></div>
        <div class="field"><label>Father's Mobile (optional)</label><input type="tel" id="sFatherMobile" /></div>
      </div>
      <div class="field-row">
        <div class="field"><label>Mother's Name</label><input type="text" id="sMother" /></div>
        <div class="field"><label>Mother's Mobile (optional)</label><input type="tel" id="sMotherMobile" /></div>
      </div>
      <div class="field-row">
        <div class="field"><label>Course</label>
          <select id="sCourse" required>
            <option value="" disabled selected>Select a Course...</option>
            ${courses.map(c => `<option value="${c.id}">${c.name}</option>`).join("")}
          </select></div>
        <div class="field"><label>Batch</label>
          <select id="sBatch" required>
            <option value="" disabled selected>First select a course...</option>
          </select></div>
      </div>
      <!-- NAYA: Compulsory Days Selection -->
      <div class="field">
        <label>Student's Attendance Days <span style="color:red;">*</span></label>
        <div id="sDaysContainer" style="display:flex; flex-wrap:wrap; gap:8px; padding: 6px 0;">
          <span class="hint-text">First select a batch to see available days...</span>
        </div>
      </div>
      <div class="field"><label>Other Interest (optional)</label><input type="text" id="sInterest" /></div>
      <div class="card" style="background:var(--color-surface-alt); margin-bottom:16px;">
        <p class="hint-text" style="margin-bottom:10px;">Set the parent's login (they'll use it to sign in to their portal):</p>
        <div class="field-row">
          <div class="field"><label>Login ID</label><input type="text" id="sLoginId" placeholder="e.g. parent_ravi" required /></div>
          <div class="field"><label>Password</label><input type="text" id="sLoginPassword" placeholder="Set a password" required minlength="6" /></div>
        </div>
      </div>
      <div style="display:flex; gap:10px; margin-top:20px;">
        <button type="submit" class="btn btn-primary" id="admitSubmitBtn">Confirm Admission</button>
        <button type="button" class="btn btn-ghost" id="cancelBtn">Cancel</button>
      </div>
    </form>`);
	// NAYA: Smart Batch Dropdown Logic (New Admission)
  document.getElementById("sCourse").addEventListener("change", (e) => {
    const courseId = e.target.value;
    const validBatches = batches.filter(b => b.courseId === courseId);
    const batchSelect = document.getElementById("sBatch");
    
    if (validBatches.length === 0) {
      batchSelect.innerHTML = `<option value="" disabled selected>No batches available</option>`;
    } else {
      batchSelect.innerHTML = `<option value="" disabled selected>Select a batch...</option>` + validBatches.map(b => `<option value="${b.id}">${b.name} (${b.timing || ''})</option>`).join("");
    }
    document.getElementById("sDaysContainer").innerHTML = `<span class="hint-text">First select a batch to see available days...</span>`;
  });

  // NAYA: Jo batch select ho, sirf uske din (days) screen par dikhao
  document.getElementById("sBatch").addEventListener("change", (e) => {
    const batchId = e.target.value;
    const batch = batches.find(b => b.id === batchId);
    const container = document.getElementById("sDaysContainer");
    
    if (batch && batch.days && batch.days.length > 0) {
      container.innerHTML = batch.days.map(d => `<label style="display:flex; align-items:center; gap:5px; font-weight:400; cursor:pointer;"><input type="checkbox" value="${d}" class="sDayCheck" style="width:auto;" />${d}</label>`).join("");
    } else {
      container.innerHTML = `<span class="hint-text" style="color:var(--color-danger);">This batch has no days assigned. Edit batch first.</span>`;
    }
  });

  document.getElementById("cancelBtn").addEventListener("click", closeModal);
  document.getElementById("studentForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    
    // NAYA: Compulsory Check
    const selectedDays = Array.from(document.querySelectorAll(".sDayCheck:checked")).map(c => c.value);
    if (selectedDays.length === 0) {
      toast("Please tick at least one attendance day for the student.", true);
      return;
    }

    const data = {
      name: document.getElementById("sName").value.trim(),
      admissionDate: document.getElementById("sAdmissionDate").value, // NAYA
      dob: document.getElementById("sDob").value,
      address: document.getElementById("sAddress").value.trim(),
      mobile: document.getElementById("sMobile").value.trim(),
      email: document.getElementById("sEmail").value.trim(),
      fatherName: document.getElementById("sFather").value.trim(),
      fatherMobile: document.getElementById("sFatherMobile").value.trim(), // NAYA
      motherName: document.getElementById("sMother").value.trim(),
      motherMobile: document.getElementById("sMotherMobile").value.trim(), // NAYA
      courseId: document.getElementById("sCourse").value,
      batchId: document.getElementById("sBatch").value,
      selectedDays: selectedDays, // NAYA: Data save ho raha hai
      otherInterest: document.getElementById("sInterest").value.trim()
    };
    const loginId = document.getElementById("sLoginId").value.trim();
    const password = document.getElementById("sLoginPassword").value;
    const submitBtn = document.getElementById("admitSubmitBtn");
    submitBtn.disabled = true;
    try {
      const result = await admitStudent(data, loginId, password);
      closeModal();
      toast(`Admitted! ID: ${result.admissionNo}`);
      logActivity("Student Admitted", `${data.name} (${result.admissionNo})`);
      
      // Modal open karein naye Share button ke sath
      openModal("Admission Successful", `
        <div style="background: #eef2ff; color: #4f46e5; padding: 12px; border-radius: 6px; margin-bottom: 16px; font-weight: 500; font-size: 14.5px; border: 1px solid #c7d2fe;">
          Important: Set up the fee plan for this student now!
        </div>
        <p style="font-size:15px; margin-bottom:14px;">Share these login details with the parent:</p>
        <div class="card" style="background:var(--color-surface-alt);">
          <p><strong>Login ID:</strong> ${loginId}</p>
          <p><strong>Password:</strong> ${password}</p>
        </div>
        <p class="hint-text" style="margin-top:14px;">This login is already active — the parent can sign in right away.</p>
        
        <!-- NAYA: Buttons update kiye gaye -->
        <div style="display:flex; gap:10px; margin-top:20px; flex-wrap:wrap;">
          <button class="btn btn-accent" id="setupFeesNowBtn">Setup Fees Now</button>
          <button class="btn btn-primary" id="waShareBtn" style="display:flex; align-items:center; gap:8px;">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
              <path d="M13.601 2.326A7.85 7.85 0 0 0 7.994 0C3.627 0 .068 3.558.064 7.926c0 1.399.366 2.76 1.057 3.965L0 16l4.204-1.102a7.9 7.9 0 0 0 3.79.965h.004c4.368 0 7.926-3.558 7.93-7.93A7.9 7.9 0 0 0 13.6 2.326zM7.994 14.521a6.6 6.6 0 0 1-3.356-.92l-.24-.144-2.494.654.666-2.433-.156-.251a6.56 6.56 0 0 1-1.007-3.505c0-3.626 2.957-6.584 6.591-6.584a6.56 6.56 0 0 1 4.66 1.931 6.56 6.56 0 0 1 1.928 4.66c-.004 3.639-2.961 6.592-6.592 6.592m3.615-4.934c-.197-.099-1.17-.578-1.353-.646-.182-.065-.315-.099-.445.099-.133.197-.513.646-.627.775-.114.133-.232.148-.43.05-.197-.1-.836-.308-1.592-.985-.59-.525-.985-1.175-1.103-1.372-.114-.198-.011-.304.088-.403.087-.088.197-.232.296-.346.1-.114.133-.198.198-.33.065-.134.034-.248-.015-.347-.05-.099-.445-1.076-.612-1.47-.16-.389-.323-.335-.445-.34-.114-.007-.247-.007-.38-.007a.73.73 0 0 0-.529.247c-.182.198-.691.677-.691 1.654s.71 1.916.81 2.049c.098.133 1.394 2.132 3.383 2.992.47.205.84.326 1.129.418.475.152.904.129 1.246.08.38-.058 1.171-.48 1.338-.943.164-.464.164-.86.114-.943-.049-.084-.182-.133-.38-.232"/>
            </svg> 
            WhatsApp
          </button>
          <button class="btn btn-ghost" id="doneBtn">Later</button>
        </div>`);
        
      document.getElementById("waShareBtn").addEventListener("click", () => {
        shareCredentialsWhatsApp(data.name, data.mobile, loginId, password, "Parent/Student");
      });
      document.getElementById("doneBtn").addEventListener("click", () => { closeModal(); renderStudents(); });
      
      // NAYA: Setup Fees Auto-open logic ko fast aur bulletproof banaya gaya
      document.getElementById("setupFeesNowBtn").addEventListener("click", () => {
        closeModal();
        // Form ka data humare paas already hai, sirf result ki ID merge karenge
        const newlyAddedStudent = { ...data, id: result.id || result.studentId || result.uid || "new", admissionNo: result.admissionNo };
        const course = courses.find(c => c.id === data.courseId);
        
        // Thoda animation delay (300ms) de rahe hain taaki pehla popup properly band ho jaye
        setTimeout(() => {
          openSetupFeesForm(newlyAddedStudent, course, batches);
        }, 300);
      });
      
    } catch (err) {
      toast(err.message.includes("email-already-in-use") ? "This Login ID is already taken — pick another." : err.message, true);
      submitBtn.disabled = false;
    }
  });
}

/* ================================================================
   FEES & INSTALLMENTS
   Pattern: Students without a plan -> "Setup Fees" (generates schedule).
   Students with a plan -> "View / Collect" (mark installments paid, print receipt).
   Pills filter the table by due status across all students' installments.
   ================================================================ */
const today = () => fmtLocalDate(new Date());

function planStatusFor(plan) {
  // NAYA: 'No Plan' ko 'Setup Pending' kar diya
  if (!plan) return { label: "Setup Pending", cls: "badge-inactive" };
  if (plan.isCharity) return { label: "Charity (Free)", cls: "badge-active" };
  const pending = plan.installments.filter(i => i.status !== "paid");
  if (!pending.length) return { label: "Fully Paid", cls: "badge-active" };
  const overdue = pending.some(i => i.dueDate < today());
  return overdue ? { label: "Overdue", cls: "badge-inactive" } : { label: "Active", cls: "badge-active" };
}

async function renderFees(filterPill = "all") {
  const [students, courses, batches, plans] = await Promise.all([
    Students.list(), Courses.list(), Batches.list(), FeePlans.listAll()
  ]);
  cache.students = students; cache.courses = courses; cache.batches = batches;
  const planByStudent = Object.fromEntries(plans.map(p => [p.studentId, p]));

  viewRoot.innerHTML = `
    <div class="main-header">
      <div><h2>Fees & Installments</h2><div class="sub">Set up a payment plan at admission, collect installments, print receipts.</div></div>
    </div>
    <div class="pill-toggle" id="feesPills" style="margin-bottom:18px;">
      <div class="pill ${filterPill === "all" ? "active" : ""}" data-p="all">All Students</div>
      <div class="pill ${filterPill === "due" ? "active" : ""}" data-p="due">Due Today</div>
      <div class="pill ${filterPill === "overdue" ? "active" : ""}" data-p="overdue">Overdue</div>
      <div class="pill ${filterPill === "upcoming" ? "active" : ""}" data-p="upcoming">Upcoming</div>
    </div>
    <div class="card"><div class="table-wrap"><table id="feesTable">
      <thead><tr><th>Admission No.</th><th>Student</th><th>Course</th><th>Total</th><th>Pending</th><th>Status</th><th></th></tr></thead>
      <tbody></tbody>
    </table></div></div>`;

  document.querySelectorAll("#feesPills .pill").forEach(p => p.addEventListener("click", () => renderFees(p.dataset.p)));

  const rows = students.map(s => {
    const plan = planByStudent[s.id] || null;
    const pendingAmt = plan ? plan.installments.filter(i => i.status !== "paid").reduce((sum, i) => sum + i.amount, 0) : 0;
    const nextDue = plan ? plan.installments.find(i => i.status !== "paid")?.dueDate : null;
    return { student: s, plan, pendingAmt, nextDue };
  }).filter(r => {
    if (filterPill === "all") return true;
    if (!r.plan || r.plan.isCharity || !r.nextDue) return false;
    if (filterPill === "due") return r.nextDue === today();
    if (filterPill === "overdue") return r.nextDue < today();
    if (filterPill === "upcoming") return r.nextDue > today();
    return true;
  });

  const tbody = document.querySelector("#feesTable tbody");
  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="7"><div class="empty-state"><div class="icon">💰</div>No students in this view.</div></td></tr>`;
    return;
  }

  tbody.innerHTML = rows.map(({ student: s, plan, pendingAmt }) => {
    const status = planStatusFor(plan);
    const courseName = courses.find(c => c.id === s.courseId)?.name || "—";
    return `<tr>
      <td><strong>${s.admissionNo}</strong></td>
      <td>${s.name}</td>
      <td>${courseName}</td>
      <td>${plan ? "₹" + plan.totalAmount : "—"}</td>
      <td>${plan && !plan.isCharity ? "₹" + pendingAmt : "—"}</td>
      <td><span class="badge ${status.cls}">${status.label}</span></td>
      <td><button class="btn btn-ghost btn-sm" data-student="${s.id}">${plan ? "Manage" : "Setup Fees"}</button></td>
    </tr>`;
  }).join("");

  tbody.querySelectorAll("[data-student]").forEach(btn => btn.addEventListener("click", () => {
    const studentId = btn.dataset.student;
    const student = students.find(s => s.id === studentId);
    const plan = planByStudent[studentId];
    const course = courses.find(c => c.id === student.courseId);
    if (plan) openManagePlan(plan, student, course, batches);
    else openSetupFeesForm(student, course, batches);
  }));
}

function openSetupFeesForm(student, course, batches) {
  const fee4 = course?.fee4 || 0;
  const fee8 = course?.fee8 || 0;
  const fee12 = course?.fee12 || 0;

  openModal(`Setup Fees — ${student.name}`, `
    <form id="feesSetupForm">
      <div class="field">
        <label>Plan Type</label>
        <div class="pill-toggle">
          <div class="pill active" data-val="regular">Regular</div>
          <div class="pill" data-val="charity">Charity (Free for All)</div>
        </div>
        <input type="hidden" id="fCharity" value="false" />
      </div>
      <div id="regularFields">
        <div class="field-row">
          <div class="field">
            <label>Select Package</label>
            <select id="fPackage">
              <option value="4" data-amt="${fee4}">4 Months Package</option>
              <option value="8" data-amt="${fee8}">8 Months Package</option>
              <option value="12" data-amt="${fee12}">12 Months Package</option>
            </select>
          </div>
          <div class="field">
            <label>Total Amount (₹) <small style="font-weight:normal;">(Editable)</small></label>
            <input type="number" id="fTotal" value="${fee4}" min="0" required />
          </div>
        </div>
        <div class="field-row">
          <div class="field"><label>Start Date</label><input type="date" id="fStart" value="${fmtLocalDate(new Date())}" required /></div>
          <div class="field"><label>Installments Count</label>
            <select id="fCount">
              <option value="1">Full Payment</option>
              <option value="2">2 Installments</option>
              <option value="3">3 Installments</option>
              <option value="4" selected>4 Installments</option>
              <option value="8">8 Installments</option>
              <option value="12">12 Installments</option>
            </select>
          </div>
        </div>
        <!-- NAYA: Custom Installment Breakdown Grid -->
        <div class="field" id="instBreakdownWrap" style="background: var(--color-surface-alt); padding: 12px; border-radius: 8px; border: 1px dashed var(--color-border);">
          <label style="margin-bottom: 10px;">Customize Installments <small>(Adjust amounts manually)</small></label>
          <div id="instBreakdownGrid" style="display:flex; flex-direction:column; gap:8px;"></div>
        </div>
      </div>
      <div style="display:flex; gap:10px; margin-top:20px;">
        <button type="submit" class="btn btn-primary">Create Fee Plan</button>
        <button type="button" class="btn btn-ghost" id="cancelBtn">Cancel</button>
      </div>
    </form>`);

  const regularFields = document.getElementById("regularFields");
  const breakdownGrid = document.getElementById("instBreakdownGrid");

  const renderBreakdown = () => {
    const total = Number(document.getElementById("fTotal").value || 0);
    const count = Number(document.getElementById("fCount").value || 4);
    const duration = Number(document.getElementById("fPackage").value || 4);
    const start = document.getElementById("fStart").value;

    const defaultInsts = generateInstallmentSchedule(total, count, duration, start);
    
    breakdownGrid.innerHTML = defaultInsts.map((inst, i) => `
      <div style="display:flex; gap:10px; align-items:center;">
        <span style="font-size:13px; font-weight:bold; width:30px;">#${inst.number}</span>
        <div class="field" style="margin:0; flex:1;">
          <input type="number" class="c-amt" data-idx="${i}" value="${inst.amount}" required />
        </div>
        <div class="field" style="margin:0; flex:1;">
          <input type="date" class="c-date" data-idx="${i}" value="${inst.dueDate}" required />
        </div>
      </div>
    `).join("");
  };

  document.getElementById("fPackage").addEventListener("change", (e) => {
    const selectedOption = e.target.options[e.target.selectedIndex];
    document.getElementById("fTotal").value = selectedOption.dataset.amt;
    const months = e.target.value;
    document.getElementById("fCount").value = months === "8" ? "8" : months === "12" ? "12" : "4";
    renderBreakdown();
  });
  document.getElementById("fTotal").addEventListener("input", renderBreakdown);
  document.getElementById("fCount").addEventListener("change", renderBreakdown);
  document.getElementById("fStart").addEventListener("change", renderBreakdown);

  renderBreakdown();

  document.querySelectorAll("#feesSetupForm .pill").forEach(p => p.addEventListener("click", () => {
    document.querySelectorAll("#feesSetupForm .pill").forEach(x => x.classList.remove("active"));
    p.classList.add("active");
    const isCharity = p.dataset.val === "charity";
    document.getElementById("fCharity").value = isCharity;
    regularFields.style.display = isCharity ? "none" : "block";
  }));
  document.getElementById("cancelBtn").addEventListener("click", closeModal);

  document.getElementById("feesSetupForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const isCharity = document.getElementById("fCharity").value === "true";
    try {
      let planData;
      if (isCharity) {
        planData = {
          studentId: student.id, courseId: student.courseId, batchId: student.batchId,
          totalAmount: 0, isCharity: true, installments: []
        };
      } else {
        const total = Number(document.getElementById("fTotal").value || 0);
        const duration = Number(document.getElementById("fPackage").value); 
        const start = document.getElementById("fStart").value;
        
        const manualAmts = Array.from(document.querySelectorAll(".c-amt")).map(el => Number(el.value));
        const manualDates = Array.from(document.querySelectorAll(".c-date")).map(el => el.value);
        
        const sumAmts = manualAmts.reduce((a,b)=>a+b, 0);
        if (sumAmts !== total) {
          toast(`Sum of installments (₹${sumAmts}) does not match Total (₹${total})`, true);
          return;
        }

        const defaultInsts = generateInstallmentSchedule(total, manualAmts.length, duration, start);
        const installments = defaultInsts.map((inst, i) => ({
          ...inst,
          amount: manualAmts[i],
          dueDate: manualDates[i]
        }));
        
        const endDateObj = new Date(start);
        endDateObj.setMonth(endDateObj.getMonth() + duration);
        const endDate = fmtLocalDate(endDateObj);

        planData = { studentId: student.id, courseId: student.courseId, batchId: student.batchId, totalAmount: total, isCharity: false, installments, endDate };
      }
      await FeePlans.create(planData);
      toast("Fee plan created");
      logActivity("Fee Plan Created", student.name);
      closeModal();
      renderFees();
    } catch (err) { toast(err.message, true); }
  });
}

function openManagePlan(plan, student, course, batches) {
  const batchName = batches.find(b => b.id === student.batchId)?.name || "—";
  if (plan.isCharity) {
    openModal(`Fees — ${student.name}`, `
      <div class="card" style="background:var(--color-surface-alt);"><p><strong>Charity Student</strong> — Free for All. No fees due.</p></div>
      <button class="btn btn-ghost" style="margin-top:16px;" id="closeBtn">Close</button>`);
    document.getElementById("closeBtn").addEventListener("click", closeModal);
    return;
  }

  const rowsHtml = plan.installments.map(i => `
  <tr>
    <td>#${i.number}</td><td>₹${i.amount}</td><td>${i.dueDate}</td><td>${i.coursePeriod}</td>
    <td><span class="badge ${i.status === "paid" ? "badge-active" : "badge-inactive"}">${i.status === "paid" ? "Paid" : "Pending"}</span></td>
    <td style="text-align:right;">${i.status === "paid"
      ? `<div style="display:flex; gap:5px; justify-content:flex-end;">
           <button class="btn btn-ghost btn-sm" data-receipt="${i.number}">Receipt</button>
           <button class="btn btn-ghost btn-sm" data-edit-paid="${i.number}" title="Edit Paid Record" style="padding:4px 8px;">✏️</button>
         </div>`
      : `<div style="display:flex; gap:5px; justify-content:flex-end;">
           <button class="btn btn-accent btn-sm" data-collect="${i.number}">Collect</button>
           <button class="btn btn-ghost btn-sm" data-edit-inst="${i.number}" title="Edit Installment" style="padding:4px 8px;">✏️</button>
           <button class="btn btn-danger btn-sm" data-cancel-inst="${i.number}" title="Delete Installment" style="padding:4px 8px;">❌</button>
         </div>`}
    </td>
  </tr>`).join("");

  openModal(`Fees — ${student.name}`, `
    <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:14px;">
      <p class="hint-text" style="margin:0;">${course?.name || ""} · ${batchName}</p>
      <button class="btn btn-primary btn-sm" id="renewPackageBtn">+ Renew Package</button>
    </div>
    <div class="table-wrap"><table>
      <thead><tr><th>#</th><th>Amount</th><th>Due Date</th><th>Period</th><th>Status</th><th></th></tr></thead>
      <tbody>${rowsHtml || `<tr><td colspan="6"><div class="empty-state">No installments left.</div></td></tr>`}</tbody>
    </table></div>
    <button class="btn btn-ghost" style="margin-top:16px;" id="closeBtn">Close</button>`);

  document.getElementById("closeBtn").addEventListener("click", closeModal);
  
  document.querySelectorAll("[data-collect]").forEach(btn => btn.addEventListener("click", () =>
    openCollectForm(plan, Number(btn.dataset.collect), student, course, batchName)));
    
  document.querySelectorAll("[data-receipt]").forEach(btn => btn.addEventListener("click", () => {
    const inst = plan.installments.find(i => i.number === Number(btn.dataset.receipt));
    showReceipt({
      receiptNo: inst.receiptNo, studentName: student.name, courseName: course?.name, batchName,
      installmentNumber: inst.number, amount: inst.amount, coursePeriod: inst.coursePeriod,
      paymentDate: inst.paidAt, pendingAfter: plan.installments.filter(x => x.status !== "paid").reduce((s, x) => s + x.amount, 0)
    });
  }));

  document.querySelectorAll("[data-cancel-inst]").forEach(btn => btn.addEventListener("click", async () => {
    if (!confirm("Are you sure you want to DELETE this unpaid installment?")) return;
    const instNum = Number(btn.dataset.cancelInst);
    const instToRemove = plan.installments.find(i => i.number === instNum);
    
    const updatedInstallments = plan.installments.filter(i => i.number !== instNum);
    const newTotalAmount = plan.totalAmount - instToRemove.amount;
    
    try {
      await FeePlans.update(plan.id, { installments: updatedInstallments, totalAmount: newTotalAmount });
      toast("Installment deleted");
      logActivity("Fees Edited", `${student.name} — Deleted Installment #${instNum}`);
      closeModal();
      renderFees(); 
    } catch(e) { toast(e.message, true); }
  }));

  document.querySelectorAll("[data-edit-inst]").forEach(btn => btn.addEventListener("click", () => {
    const instNum = Number(btn.dataset.editInst);
    const instToEdit = plan.installments.find(i => i.number === instNum);
    
    openModal(`Edit Installment #${instNum} — ${student.name}`, `
      <form id="editInstForm">
        <div class="field-row">
          <div class="field"><label>Amount (₹)</label><input type="number" id="eiAmount" value="${instToEdit.amount}" required /></div>
          <div class="field"><label>Due Date</label><input type="date" id="eiDate" value="${instToEdit.dueDate}" required /></div>
        </div>
        <div style="display:flex; gap:10px; margin-top:20px;">
          <button type="submit" class="btn btn-primary">Update Installment</button>
          <button type="button" class="btn btn-ghost" id="eiCancelBtn">Back</button>
        </div>
      </form>
    `);

    document.getElementById("eiCancelBtn").addEventListener("click", () => openManagePlan(plan, student, course, batches));
    
    document.getElementById("editInstForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const newAmt = Number(document.getElementById("eiAmount").value);
      const newDate = document.getElementById("eiDate").value;
      
      const amountDiff = newAmt - instToEdit.amount;
      const newTotalAmount = plan.totalAmount + amountDiff;

      const updatedInstallments = plan.installments.map(i => 
        i.number === instNum ? { ...i, amount: newAmt, dueDate: newDate } : i
      );

      try {
        await FeePlans.update(plan.id, { installments: updatedInstallments, totalAmount: newTotalAmount });
        toast("Installment Updated");
        logActivity("Fees Edited", `${student.name} — Updated Installment #${instNum}`);
        closeModal();
        renderFees(); 
      } catch(err) { toast(err.message, true); }
    });
  }));

  document.getElementById("renewPackageBtn").addEventListener("click", () => {
     openRenewPackageForm(plan, student, course, batches);
  });

  // NAYA: Edit PAID Installment (Reflects in Accounting)
  document.querySelectorAll("[data-edit-paid]").forEach(btn => btn.addEventListener("click", () => {
    const instNum = Number(btn.dataset.editPaid);
    const instToEdit = plan.installments.find(i => i.number === instNum);
    
    openModal(`Edit Paid Fee — Installment #${instNum}`, `
      <form id="editPaidForm">
        <div class="card" style="background:var(--color-surface-alt); margin-bottom:16px;">
          <p class="hint-text">Warning: Modifying this will automatically update your Accounting Ledger.</p>
        </div>
        <div class="field-row">
          <div class="field"><label>Amount Received (₹)</label><input type="number" id="epAmount" value="${instToEdit.amount}" required /></div>
          <div class="field"><label>Collection Date</label><input type="date" id="epDate" value="${instToEdit.paidAt || today()}" required /></div>
        </div>
        <div class="field"><label>Received Account</label>
          <select id="epAccount">
            <option value="account1" ${instToEdit.account === 'account1' ? 'selected' : ''}>Union Current</option>
            <option value="account2" ${instToEdit.account === 'account2' ? 'selected' : ''}>ICICI HUF</option>
            <option value="account3" ${instToEdit.account === 'account3' ? 'selected' : ''}>SBI</option>
          </select>
        </div>
        <div style="display:flex; gap:10px; margin-top:20px;">
          <button type="submit" class="btn btn-danger">Confirm & Update</button>
          <button type="button" class="btn btn-ghost" id="epCancelBtn">Back</button>
        </div>
      </form>
    `);

    document.getElementById("epCancelBtn").addEventListener("click", () => openManagePlan(plan, student, course, batches));
    
    document.getElementById("editPaidForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const newAmt = Number(document.getElementById("epAmount").value);
      const newDate = document.getElementById("epDate").value;
      const newAcc = document.getElementById("epAccount").value;
      
      const updatedInstallments = plan.installments.map(i => 
        i.number === instNum ? { ...i, amount: newAmt, paidAt: newDate, account: newAcc } : i
      );
      const amountDiff = newAmt - instToEdit.amount;
      const newTotalAmount = plan.totalAmount + amountDiff;

      try {
        await FeePlans.update(plan.id, { installments: updatedInstallments, totalAmount: newTotalAmount });
        
        if (Payments.updateReceipt) {
           await Payments.updateReceipt(instToEdit.receiptNo, { amount: newAmt, paymentDate: newDate, account: newAcc });
        } else {
           console.warn("Backend updateReceipt function is missing.");
        }

        toast("Paid Record Updated");
        logActivity("Fees Edited (Paid)", `${student.name} — Updated Receipt #${instToEdit.receiptNo}`);
        closeModal();
        renderFees(); 
      } catch(err) { toast(err.message, true); }
    });
  }));
}

// NAYA FUNCTION: Purane plan mein naye mahine add karne ke liye
function openRenewPackageForm(plan, student, course, batches) {
  const fee4 = course?.fee4 || 0;
  const fee8 = course?.fee8 || 0;
  const fee12 = course?.fee12 || 0;
  const todayStr = today(); // Helper function already exists

  openModal(`Renew Package — ${student.name}`, `
    <form id="renewForm">
      <div class="field-row">
        <div class="field">
          <label>Select New Package</label>
          <select id="rPackage">
            <option value="4" data-amt="${fee4}">4 Months Package</option>
            <option value="8" data-amt="${fee8}">8 Months Package</option>
            <option value="12" data-amt="${fee12}">12 Months Package</option>
          </select>
        </div>
        <div class="field">
          <label>Amount (₹)</label>
          <input type="number" id="rTotal" value="${fee4}" min="0" required />
        </div>
      </div>
      <div class="field-row">
        <div class="field"><label>Start Date</label><input type="date" id="rStart" value="${todayStr}" required /></div>
        <div class="field"><label>Installments</label>
          <select id="rCount">
            <option value="1">Full Payment</option>
            <option value="2">2 Installments</option>
            <option value="3">3 Installments</option>
            <option value="4" selected>4 Installments</option>
            <option value="8">8 Installments</option>
            <option value="12">12 Installments</option>
          </select>
        </div>
      </div>
      <div style="display:flex; gap:10px; margin-top:20px;">
        <button type="submit" class="btn btn-primary">Add Installments</button>
        <button type="button" class="btn btn-ghost" id="rCancelBtn">Back</button>
      </div>
    </form>`);

  // Dropdown se amount auto-fill
  document.getElementById("rPackage")?.addEventListener("change", (e) => {
    const selectedOption = e.target.options[e.target.selectedIndex];
    document.getElementById("rTotal").value = selectedOption.dataset.amt;
    const months = e.target.value;
    if(months === "8") document.getElementById("rCount").value = "8";
    else if(months === "12") document.getElementById("rCount").value = "12";
    else document.getElementById("rCount").value = "4";
  });

  // Back button dabane pe wapas pichle popup pe jayega
  document.getElementById("rCancelBtn").addEventListener("click", () => openManagePlan(plan, student, course, batches));

  // Form Submit Logic
  document.getElementById("renewForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      const total = Number(document.getElementById("rTotal").value || 0);
      const count = Number(document.getElementById("rCount").value);
      const duration = Number(document.getElementById("rPackage").value);
      const start = document.getElementById("rStart").value;

      // Naya schedule generate karo
      const newSchedule = generateInstallmentSchedule(total, count, duration, start);
      
      // Jo purani installments hain, unme sabse bada number dhoondho (e.g. agar pehle 4 thi, toh ab 5 se shuru hoga)
      const maxInstNum = plan.installments.reduce((max, i) => Math.max(max, i.number), 0);
      
      // Naye schedule ke numbers adjust karo
      newSchedule.forEach((inst, index) => {
        inst.number = maxInstNum + index + 1;
      });

      // Purani aur Nayi dono ko jod do
      const updatedInstallments = [...plan.installments, ...newSchedule];
      const newTotalAmount = plan.totalAmount + total;

      // NAYA: Naya End Date nikalna
      let currentEnd = plan.endDate ? new Date(plan.endDate) : new Date(start);
      currentEnd.setMonth(currentEnd.getMonth() + duration);
      const edY = currentEnd.getFullYear();
      const edM = String(currentEnd.getMonth() + 1).padStart(2, '0');
      const edD = String(currentEnd.getDate()).padStart(2, '0');
      const newEndDate = `${edY}-${edM}-${edD}`;

      await FeePlans.update(plan.id, { installments: updatedInstallments, totalAmount: newTotalAmount, endDate: newEndDate });
      toast("Package Renewed Successfully");
      logActivity("Fees Edited", `${student.name} — Renewed Package (+₹${total})`);
      closeModal();
      renderFees();
    } catch (err) { toast(err.message, true); }
  });
}

function openCollectForm(plan, installmentNumber, student, course, batchName) {
  const installment = plan.installments.find(i => i.number === installmentNumber);
  const defaultDate = fmtLocalDate(new Date());

  openModal(`Collect Payment — Installment #${installmentNumber}`, `
    <form id="collectForm">
      <div class="card" style="background:var(--color-surface-alt); margin-bottom:16px;">
        <p><strong>Course Period:</strong> ${installment.coursePeriod}</p>
      </div>
      <div class="field-row">
        <div class="field">
          <label>Collection Amount (₹)</label>
          <input type="number" id="payAmount" value="${installment.amount}" max="${installment.amount}" required />
        </div>
        <div class="field">
          <label>Collection Date</label>
          <input type="date" id="payDate" value="${defaultDate}" required />
        </div>
      </div>
      <div class="field-row">
        <div class="field"><label>Payment Mode</label>
          <select id="payMode"><option value="cash">Cash</option><option value="bank">Bank</option><option value="upi">UPI</option></select></div>
        <div class="field"><label>Received Account</label>
          <select id="payAccount">
            <option value="account1">Union Current</option>
            <option value="account2">ICICI HUF</option>
            <option value="account3">SBI</option>
          </select></div>
      </div>
      <div style="display:flex; gap:10px; margin-top:20px;">
        <button type="submit" class="btn btn-primary">Confirm & Generate Receipt</button>
        <button type="button" class="btn btn-ghost" id="cancelBtn">Cancel</button>
      </div>
    </form>`);

  document.getElementById("cancelBtn").addEventListener("click", closeModal);
  document.getElementById("collectForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      const amountToPay = Number(document.getElementById("payAmount").value);
      if (amountToPay <= 0) {
        toast("Amount must be greater than zero", true);
        return;
      }
      
      const receipt = await Payments.collect(plan, installmentNumber, {
        mode: document.getElementById("payMode").value,
        account: document.getElementById("payAccount").value,
        amount: amountToPay,
        paymentDate: document.getElementById("payDate").value 
      });
      closeModal();
      toast("Payment collected");
      logActivity("Fees Collected", `${student.name} — Installment #${installmentNumber}`);
      showReceipt({
        receiptNo: receipt.receiptNo, studentName: student.name, courseName: course?.name, batchName,
        installmentNumber: receipt.installmentNumber, amount: receipt.amount, coursePeriod: receipt.coursePeriod,
        paymentDate: receipt.paymentDate, paymentTime: receipt.paymentTime, mode: receipt.mode,
        account: receipt.account, pendingAfter: receipt.pendingAfter
      });
      renderFees();
    } catch (err) { toast(err.message, true); }
  });
}

function showReceipt(r) {
  const printWindow = window.open('', '_blank', 'width=800,height=600');
  
  // Clean default values
  const mode = r.mode ? r.mode.toUpperCase() : "CASH";
  const accnt = r.account === "account1" ? "Union Current" : r.account === "account2" ? "ICICI HUF" : r.account === "account3" ? "SBI" : "";
  const d = new Date(r.paymentDate).toLocaleDateString("en-IN");
  
  // NAYA: WhatsApp Message Text (Auto-typed) - Updated Format
  const waText = `Hello ${r.studentName},%0A%0AHere is your fee payment confirmation from *Allegro School of Music*:%0A%0A📅 *Date:* ${d}%0A🧾 *Receipt No:* ${r.receiptNo || "AUTO"}%0A🗓️ *Course Period:* ${r.coursePeriod || "—"}%0A💰 *Amount Paid:* ₹${r.amount}%0A🎹 *Course:* ${r.courseName || "—"}%0A⏳ *Pending Balance:* ₹${r.pendingAfter}%0A%0AThank you! 🎵`;
  const waLink = `https://wa.me/?text=${waText}`;
  
  const html = `
    <html>
      <head>
        <title>Fee Receipt - ${r.receiptNo || "AUTO"}</title>
        <style>
          @media print { 
            body { margin: 0; padding: 0; }
            @page { size: A4 portrait; margin: 1cm; } 
            /* NAYA: Print karte time buttons gayab ho jayenge */
            .no-print { display: none !important; }
          }
          body { font-family: 'Segoe UI', Tahoma, Geneva, sans-serif; padding: 20px; color: #333; }
          .receipt-box { max-width: 700px; margin: auto; border: 2px solid #222; padding: 20px; border-radius: 8px; }
          .header { text-align: center; border-bottom: 2px solid #222; padding-bottom: 10px; margin-bottom: 20px; }
          .header h1 { margin: 0; color: #1a1a1a; letter-spacing: 1px; font-size: 24px; }
          .header p { margin: 5px 0 0 0; color: #555; font-size: 14px; }
          .info-table { width: 100%; margin-bottom: 20px; border-collapse: collapse; }
          .info-table td { padding: 8px; font-size: 14px; }
          .amount-box { background: #f4f4f4; padding: 15px; text-align: center; border: 1px dashed #777; margin: 20px 0; font-size: 18px; }
          .footer { margin-top: 40px; display: flex; justify-content: space-between; font-size: 14px; font-weight: bold; }
          .sign-line { border-top: 1px solid #000; width: 150px; text-align: center; padding-top: 5px; }
          
          /* NAYA: Buttons CSS */
          .action-buttons { text-align: center; margin-top: 30px; display: flex; justify-content: center; gap: 15px; }
          .btn { padding: 12px 20px; border: none; border-radius: 5px; cursor: pointer; font-size: 14px; font-weight: bold; text-decoration: none; color: #fff; display: inline-block; }
          .btn-print { background: #222; }
          .btn-wa { background: #25D366; }
        </style>
      </head>
      <body>
        <div class="receipt-box">
          <div class="header">
            <h1>ALLEGRO SCHOOL OF MUSIC</h1>
            <p>Fee Acknowledgment Receipt</p>
          </div>
          <table class="info-table">
            <tr>
              <td><strong>Receipt No:</strong> ${r.receiptNo || "—"}</td>
              <td style="text-align:right;"><strong>Date:</strong> ${d}</td>
            </tr>
            <tr>
              <td><strong>Received From:</strong> ${r.studentName}</td>
              <td style="text-align:right;"><strong>Payment Mode:</strong> ${mode} ${accnt ? `(${accnt})` : ""}</td>
            </tr>
            <tr>
              <td><strong>Course / Batch:</strong> ${r.courseName || "—"} / ${r.batchName || "—"}</td>
              <td style="text-align:right;"><strong>Course Period:</strong> ${r.coursePeriod || "—"}</td>
            </tr>
          </table>
          
          <div class="amount-box">
            Received with thanks an amount of <strong>₹${r.amount}</strong> 
            <br/><small style="color:#666;">(Towards Installment #${r.installmentNumber})</small>
          </div>

          <div style="font-size: 13px; text-align: center; margin-bottom: 20px; color: #555;">
            Remaining Pending Amount: ₹${r.pendingAfter}
          </div>

          <div class="footer">
            <div>Authorized By:<br><br><br><div class="sign-line">Admin Signature</div></div>
            <div style="text-align:right;">Notes:<br><span style="font-weight:normal; font-size:12px;">This is a computer generated receipt.</span></div>
          </div>
        </div>
        
        <!-- NAYA: Buttons Section -->
        <div class="action-buttons no-print">
          <button class="btn btn-print" onclick="window.print()">🖨️ Print / Save PDF</button>
          <a href="${waLink}" target="_blank" class="btn btn-wa">💬 Share on WhatsApp</a>
        </div>
      </body>
    </html>
  `;
  printWindow.document.write(html);
  printWindow.document.close();
}

/* ================================================================
   HOMEWORK HISTORY — View previously assigned homework by Date & Batch
   ================================================================ */
async function renderHomework() {
  const [items, batches, courses, students] = await Promise.all([
    Homework.list(), Batches.list(), Courses.list(), Students.list()
  ]);
  const today = fmtLocalDate(new Date());

  viewRoot.innerHTML = `
    <div class="main-header">
      <div><h2>Homework History</h2><div class="sub">Check assigned homework by date and batch.</div></div>
    </div>
    
    <div class="card" style="margin-bottom: 20px;">
      <div class="field-row" style="align-items: flex-end;">
        <div class="field"><label>Select Batch</label>
          <select id="hwFilterBatch">
            <option value="">Select a batch...</option>
            ${batches.map(b => `<option value="${b.id}">${b.name}</option>`).join("")}
          </select>
        </div>
        <div class="field"><label>Select Date</label>
          <input type="date" id="hwFilterDate" value="${today}" />
        </div>
      </div>
    </div>
    
    <div id="hwHistoryWrap">
      <div class="card empty-state"><div class="icon">🔍</div>Select a batch to view homework history.</div>
    </div>`;

  const loadHistory = () => {
    const bId = document.getElementById("hwFilterBatch").value;
    const dateStr = document.getElementById("hwFilterDate").value;
    const wrap = document.getElementById("hwHistoryWrap");

    if (!bId || !dateStr) {
      wrap.innerHTML = `<div class="card empty-state"><div class="icon">🔍</div>Select a batch to view homework.</div>`;
      return;
    }

    // Filter Logic: HW jo us batch ko diya gaya HO, ya us batch ke kisi specific student ko
    const batchStudents = students.filter(s => s.batchId === bId).map(s => s.id);
    const filtered = items.filter(h => h.date === dateStr && (h.batchId === bId || batchStudents.includes(h.studentId)));

    if (!filtered.length) {
      wrap.innerHTML = `<div class="card empty-state">No homework found for this date & batch.</div>`;
      return;
    }

    wrap.innerHTML = `
      <div class="card"><div class="table-wrap"><table>
        <thead><tr><th>Assigned To</th><th>Details</th><th>Assigned By</th><th></th></tr></thead>
        <tbody>${filtered.map(h => {
          const target = h.scope === "batch" 
            ? "Whole Batch" 
            : (students.find(s => s.id === h.studentId)?.name || "Unknown") + " (Individual)";
          
          return `<tr>
            <td><strong>${target}</strong></td>
            <td style="white-space: pre-wrap; min-width: 200px;">${h.description || "—"}</td>
            <td><span class="badge ${h.createdByRole === 'admin' ? 'badge-active' : 'badge-inactive'}">${h.createdByRole}</span></td>
            <td><button class="btn btn-danger btn-sm" data-del="${h.id}">Delete</button></td>
          </tr>`;
        }).join("")}</tbody>
      </table></div></div>`;

    // Delete Logic
    wrap.querySelectorAll("[data-del]").forEach(b => b.addEventListener("click", async () => {
      if (!confirm("Are you sure you want to delete this homework?")) return;
      await Homework.remove(b.dataset.del);
      toast("Homework deleted");
      loadHistory(); // Reload current list silently
    }));
  };

  document.getElementById("hwFilterBatch").addEventListener("change", loadHistory);
  document.getElementById("hwFilterDate").addEventListener("change", loadHistory);
}

/* ================================================================
   SALARY — pay teachers per month. Fixed teachers: same amount each
   time (admin can still override). Partner teachers: variable payout,
   entered fresh every month. One payout per teacher+month.
   ================================================================ */
function currentMonth() { return new Date().toISOString().slice(0, 7); } // 'YYYY-MM'

async function renderSalary(selectedMonth = currentMonth()) {
  const teachers = await Teachers.list();
  cache.teachers = teachers;
  const payouts = await Salary.listForMonth(selectedMonth);
  const payoutByTeacher = Object.fromEntries(payouts.map(p => [p.teacherId, p]));
  
  const totalPaid = payouts.reduce((sum, p) => sum + p.amount, 0);
  const tUnion Current = payouts.filter(p => p.account !== "account2" && p.account !== "account3").reduce((sum, p) => sum + p.amount, 0);
  const tICICI HUF = payouts.filter(p => p.account === "account2").reduce((sum, p) => sum + p.amount, 0);
  const tSBI = payouts.filter(p => p.account === "account3").reduce((sum, p) => sum + p.amount, 0); // NAYA

  viewRoot.innerHTML = `
    <div class="main-header">
      <div><h2>Salary</h2><div class="sub">Pay teachers monthly — fixed salary or variable partner payout.</div></div>
    </div>
    <div class="card" style="margin-bottom:20px;">
      <div class="field" style="max-width:220px;">
        <label>Month</label>
        <input type="month" id="salMonth" value="${selectedMonth}" />
      </div>
    </div>
    <div class="stat-grid" style="grid-template-columns:repeat(3,1fr); margin-bottom:22px;">
      <div class="stat-card"><div class="label">Teachers</div><div class="value">${teachers.filter(t => t.active).length}</div></div>
      <div class="stat-card"><div class="label">Paid This Month</div><div class="value">${payouts.length}</div></div>
      <div class="stat-card"><div class="label">Total Paid (₹)</div><div class="value">₹${totalPaid}</div><div style="font-size:11px; color:#666; margin-top:4px;">Union Current: ₹${tUnion Current} | ICICI HUF: ₹${tICICI HUF} | SBI: ₹${tSBI}</div></div>
    </div>
    <div class="card"><div class="table-wrap"><table id="salTable">
      <thead><tr><th>Teacher</th><th>Type</th><th>Amount</th><th>Status</th><th></th></tr></thead>
      <tbody></tbody>
    </table></div></div>`;

  document.getElementById("salMonth").addEventListener("change", (e) => renderSalary(e.target.value));

  const tbody = document.querySelector("#salTable tbody");
  const activeTeachers = teachers.filter(t => t.active !== false);
  if (!activeTeachers.length) {
    tbody.innerHTML = `<tr><td colspan="5"><div class="empty-state"><div class="icon">🎼</div>No active teachers yet.</div></td></tr>`;
    return;
  }

  tbody.innerHTML = activeTeachers.map(t => {
    const payout = payoutByTeacher[t.id];
    const typeLabel = t.salaryType === "partner" ? "Partner (variable)" : "Fixed";
    return `<tr>
      <td><strong>${t.name}</strong></td>
      <td>${typeLabel}</td>
      <td>${payout ? "₹" + payout.amount : "—"}</td>
      <td><span class="badge ${payout ? "badge-active" : "badge-inactive"}">${payout ? "Paid" : "Pending"}</span></td>
      <td>
        <button class="btn btn-ghost btn-sm" data-pay="${t.id}">${payout ? "Update" : "Pay Salary"}</button>
        <button class="btn btn-ghost btn-sm" data-history="${t.id}">History</button>
      </td>
    </tr>`;
  }).join("");

  tbody.querySelectorAll("[data-pay]").forEach(btn => btn.addEventListener("click", () =>
    openPaySalaryForm(teachers.find(t => t.id === btn.dataset.pay), selectedMonth, payoutByTeacher[btn.dataset.pay])));
  tbody.querySelectorAll("[data-history]").forEach(btn => btn.addEventListener("click", () =>
    openSalaryHistory(teachers.find(t => t.id === btn.dataset.history))));
}

function openPaySalaryForm(teacher, month, existingPayout) {
  openModal(`Pay Salary — ${teacher.name}`, `
    <form id="salForm">
      <div class="card" style="background:var(--color-surface-alt); margin-bottom:16px;">
        <p><strong>Month:</strong> ${month}</p>
        <p><strong>Salary Type:</strong> ${teacher.salaryType === "partner" ? "Partner (variable payout)" : "Fixed"}</p>
      </div>
      <div class="field-row">
        <div class="field"><label>Amount (₹)</label>
          <input type="number" id="salAmount" min="0" value="${existingPayout?.amount ?? ""}" required /></div>
        <div class="field"><label>Paid From Account</label>
          <select id="salAccount">
            <option value="account1" ${existingPayout?.account === 'account1' ? 'selected' : ''}>Union Current</option>
            <option value="account2" ${existingPayout?.account === 'account2' ? 'selected' : ''}>ICICI HUF</option>
            <option value="account3" ${existingPayout?.account === 'account3' ? 'selected' : ''}>SBI</option>
          </select></div>
      </div>
      <div class="field">
        <label>Notes (optional)</label>
        <input type="text" id="salNotes" value="${existingPayout?.notes || ""}" placeholder="e.g. Includes bonus for extra batch" />
      </div>
      <div style="display:flex; gap:10px; margin-top:20px;">
        <button type="submit" class="btn btn-primary">Confirm Payment</button>
        <button type="button" class="btn btn-ghost" id="cancelBtn">Cancel</button>
      </div>
    </form>`);

  document.getElementById("cancelBtn").addEventListener("click", closeModal);
  document.getElementById("salForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      await Salary.payTeacher({
        teacherId: teacher.id, month,
        amount: document.getElementById("salAmount").value,
        account: document.getElementById("salAccount").value, // NAYA: Account pass ho raha hai
        salaryType: teacher.salaryType || "fixed",
        notes: document.getElementById("salNotes").value.trim(),
        paidBy: adminProfile.uid
      });
      toast("Salary paid");
      logActivity("Salary Paid", `${teacher.name} — ${month}`);
      closeModal();
      renderSalary(month);
    } catch (err) { toast(err.message, true); }
  });
}

async function openSalaryHistory(teacher) {
  openModal(`Salary History — ${teacher.name}`, `<p class="hint-text">Loading…</p>`);
  const history = await Salary.listForTeacher(teacher.id);
  const total = history.reduce((sum, p) => sum + p.amount, 0);

  document.getElementById("modalBody").innerHTML = `
    <p class="hint-text" style="margin-bottom:14px;">Total paid to date: <strong>₹${total}</strong></p>
    <div class="table-wrap"><table>
      <thead><tr><th>Month</th><th>Amount</th><th>Paid On</th><th>Notes</th></tr></thead>
      <tbody>${
        history.length
          ? history.map(p => `<tr><td>${p.month}</td><td>₹${p.amount}</td><td>${p.paidDate}</td><td>${p.notes || "—"}</td></tr>`).join("")
          : `<tr><td colspan="4"><div class="empty-state">No salary history yet.</div></td></tr>`
      }</tbody>
    </table></div>
    <button class="btn btn-ghost" style="margin-top:16px;" id="closeHistBtn">Close</button>`;
  document.getElementById("closeHistBtn").addEventListener("click", closeModal);
}

/* ================================================================
   ACCOUNTING — Income (Fees auto-pulled from Payments + manual
   Registration/Other) vs Expenses (Salary auto-pulled + manual
   Rent/Electricity/etc). Profit & Loss for Today / This Month / This Year.
   ================================================================ */
function fmtLocalDate(d) { return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; }

// NAYA HELPER: Current Financial Year nikalne ke liye (April to March)
function getCurrentFinYear() {
  const now = new Date();
  const year = now.getFullYear();
  return now.getMonth() < 3 ? `${year - 1}-${year}` : `${year}-${year + 1}`;
}

// NAYA HELPER: Fin Year Options generate karne ke liye (Auto next year add karega)
function getFinYearOptions(selectedVal) {
  const currentY = new Date().getFullYear();
  let opts = '';
  // 2024 se shuru karke (current year + 1) tak banayega
  for(let y = 2024; y <= currentY + 1; y++) {
    const fy = `${y}-${y+1}`;
    opts += `<option value="${fy}" ${selectedVal === fy ? 'selected' : ''}>FY ${y}-${(y+1).toString().slice(2)}</option>`;
  }
  return opts;
}

const EXPENSE_CATEGORY_LABELS = {
  rent: "Rent", electricity: "Electricity", maintenance: "Maintenance",
  instruments: "Instruments", marketing: "Marketing", misc: "Miscellaneous"
};

async function renderAccounting(filterType = "month", filterValue = null) {
  // Default Values Set Karna
  if (!filterValue) {
     if (filterType === 'daily') filterValue = fmtLocalDate(new Date());
     if (filterType === 'month') filterValue = new Date().toISOString().slice(0, 7);
     if (filterType === 'year') filterValue = getCurrentFinYear();
  }

  // Date Range Calculate Karna
  let start, end, label;
  if (filterType === 'daily') {
     start = filterValue; end = filterValue; 
     const [y,m,d] = filterValue.split("-");
     label = `Date: ${d}-${m}-${y}`;
  } else if (filterType === 'month') {
     const [y, m] = filterValue.split("-");
     const first = new Date(y, m - 1, 1);
     const last = new Date(y, m, 0);
     start = fmtLocalDate(first); end = fmtLocalDate(last);
     label = `Month: ${first.toLocaleString("en-IN", { month: "long", year: "numeric" })}`;
  } else if (filterType === 'year') {
     const [y1, y2] = filterValue.split("-");
     start = `${y1}-04-01`; 
     end = `${y2}-03-31`;   
     label = `Financial Year ${y1}-${y2}`;
  }

  const inRange = (dateStr) => dateStr && dateStr >= start && dateStr <= end;

  const [payments, salaryPayouts, incomeEntries, expenseEntries] = await Promise.all([
    Payments.listAll(), Salary.listAll(), IncomeEntries.list(), ExpenseEntries.list()
  ]);

  const getSplit = (arr) => {
    let a1 = 0, a2 = 0, a3 = 0;
    arr.forEach(x => { 
      if (x.account === "account2") a2 += x.amount; 
      else if (x.account === "account3") a3 += x.amount; 
      else a1 += x.amount; 
    });
    return { total: a1 + a2 + a3, a1, a2, a3 };
  };

  const feesIncome = getSplit(payments.filter(p => inRange(p.paymentDate)));
  const regIncome = getSplit(incomeEntries.filter(e => e.category === "registration" && inRange(e.date)));
  const otherIncome = getSplit(incomeEntries.filter(e => e.category === "other" && inRange(e.date)));
  
  const totalIncome = {
    total: feesIncome.total + regIncome.total + otherIncome.total,
    a1: feesIncome.a1 + regIncome.a1 + otherIncome.a1,
    a2: feesIncome.a2 + regIncome.a2 + otherIncome.a2,
    a3: feesIncome.a3 + regIncome.a3 + otherIncome.a3
  };

  const salaryExpense = getSplit(salaryPayouts.filter(p => inRange(p.paidDate)));
  const periodExpensesList = expenseEntries.filter(e => inRange(e.date));
  const manualExpenseTotal = getSplit(periodExpensesList);
  
  const totalExpense = {
    total: salaryExpense.total + manualExpenseTotal.total,
    a1: salaryExpense.a1 + manualExpenseTotal.a1,
    a2: salaryExpense.a2 + manualExpenseTotal.a2,
    a3: salaryExpense.a3 + manualExpenseTotal.a3
  };

  const profit = {
    total: totalIncome.total - totalExpense.total,
    a1: totalIncome.a1 - totalExpense.a1,
    a2: totalIncome.a2 - totalExpense.a2,
    a3: totalIncome.a3 - totalExpense.a3
  };

  const expenseByCat = {};
  periodExpensesList.forEach(e => {
    const key = e.category === "custom" ? (e.customLabel || "Custom") : (EXPENSE_CATEGORY_LABELS[e.category] || e.category);
    if (!expenseByCat[key]) expenseByCat[key] = { total: 0, a1: 0, a2: 0, a3: 0 };
    expenseByCat[key].total += e.amount;
    if (e.account === "account2") expenseByCat[key].a2 += e.amount;
    else if (e.account === "account3") expenseByCat[key].a3 += e.amount;
    else expenseByCat[key].a1 += e.amount;
  });

  // NAYA: Filter UI aur Responsive Breakdown
  viewRoot.innerHTML = `
    <div class="main-header">
      <div><h2>Accounting</h2><div class="sub">Income vs expenses — ${label}</div></div>
      <div style="display:flex; gap:10px;">
        <button class="btn btn-ghost" id="addIncomeBtn">+ Add Income</button>
        <button class="btn btn-accent" id="addExpenseBtn">+ Add Expense</button>
      </div>
    </div>

    <div class="card" style="margin-bottom:20px; display:flex; gap:15px; flex-wrap:wrap; align-items:flex-end;">
      <div class="field" style="margin:0; min-width:150px;">
          <label>Period Type</label>
          <select id="acctPeriodType">
              <option value="daily" ${filterType === 'daily' ? 'selected' : ''}>Daily</option>
              <option value="month" ${filterType === 'month' ? 'selected' : ''}>Monthly</option>
              <option value="year" ${filterType === 'year' ? 'selected' : ''}>Financial Year</option>
          </select>
      </div>
      <div class="field" style="margin:0; flex:1; min-width:150px; max-width:250px;">
          ${filterType === 'daily' ? `<label>Select Date</label><input type="date" id="acctFilterVal" value="${filterValue}" />` : ''}
          ${filterType === 'month' ? `<label>Select Month</label><input type="month" id="acctFilterVal" value="${filterValue}" />` : ''}
          ${filterType === 'year' ? `<label>Select Fin Year</label><select id="acctFilterVal">${getFinYearOptions(filterValue)}</select>` : ''}
      </div>
    </div>

    <div class="stat-grid" style="grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); margin-bottom:26px;">
      <div class="stat-card">
        <div class="label">Total Income</div>
        <div class="value" style="color:var(--color-teal);">₹${totalIncome.total}</div>
        <div style="font-size:11px; color:#666; margin-top:4px;">Union Current: ₹${totalIncome.a1} | ICICI HUF: ₹${totalIncome.a2} | SBI: ₹${totalIncome.a3}</div>
      </div>
      <div class="stat-card">
        <div class="label">Total Expenses</div>
        <div class="value" style="color:var(--color-danger);">₹${totalExpense.total}</div>
        <div style="font-size:11px; color:#666; margin-top:4px;">Union Current: ₹${totalExpense.a1} | ICICI HUF: ₹${totalExpense.a2} | SBI: ₹${totalExpense.a3}</div>
      </div>
      <div class="stat-card">
        <div class="label">${profit.total >= 0 ? "Profit" : "Loss"}</div>
        <div class="value" style="color:${profit.total >= 0 ? "var(--color-teal)" : "var(--color-danger)"};">₹${Math.abs(profit.total)}</div>
        <div style="font-size:11px; color:#666; margin-top:4px;">Union Current: ₹${profit.a1} | ICICI HUF: ₹${profit.a2} | SBI: ₹${profit.a3}</div>
      </div>
    </div>

    <!-- NAYA: Perfect Grid Alignment without Scroll Issue -->
    <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(320px, 1fr)); gap:20px; align-items:start;">
      <div class="card">
        <h3 style="margin-bottom:12px; font-size:18px;">Income Breakdown</h3>
        <table style="width:100%; min-width:auto; border-collapse:collapse; white-space:normal;">
          <tbody>
            <tr>
              <td style="padding:8px 0; border-bottom:1px solid var(--color-border);">Fees Collection<br><small style="color:#777;">S: ₹${feesIncome.a1} | P: ₹${feesIncome.a2} | So: ₹${feesIncome.a3}</small></td>
              <td style="padding:8px 0; text-align:right; vertical-align:top; font-weight:500; border-bottom:1px solid var(--color-border);">₹${feesIncome.total}</td>
            </tr>
            <tr>
              <td style="padding:8px 0; border-bottom:1px solid var(--color-border);">Registration<br><small style="color:#777;">S: ₹${regIncome.a1} | P: ₹${regIncome.a2} | So: ₹${regIncome.a3}</small></td>
              <td style="padding:8px 0; text-align:right; vertical-align:top; font-weight:500; border-bottom:1px solid var(--color-border);">₹${regIncome.total}</td>
            </tr>
            <tr>
              <td style="padding:8px 0; border-bottom:1px solid var(--color-border);">Other Income<br><small style="color:#777;">S: ₹${otherIncome.a1} | P: ₹${otherIncome.a2} | So: ₹${otherIncome.a3}</small></td>
              <td style="padding:8px 0; text-align:right; vertical-align:top; font-weight:500; border-bottom:1px solid var(--color-border);">₹${otherIncome.total}</td>
            </tr>
            <tr>
              <td style="padding:12px 0 4px 0;"><strong>Total</strong><br><small style="color:#777; font-weight:normal;">S: ₹${totalIncome.a1} | P: ₹${totalIncome.a2} | So: ₹${totalIncome.a3}</small></td>
              <td style="padding:12px 0 4px 0; text-align:right; vertical-align:top; font-size:16px;"><strong>₹${totalIncome.total}</strong></td>
            </tr>
          </tbody>
        </table>
      </div>
      
      <div class="card">
        <h3 style="margin-bottom:12px; font-size:18px;">Expense Breakdown</h3>
        <table style="width:100%; min-width:auto; border-collapse:collapse; white-space:normal;">
          <tbody>
            <tr>
              <td style="padding:8px 0; border-bottom:1px solid var(--color-border);">Salary<br><small style="color:#777;">S: ₹${salaryExpense.a1} | P: ₹${salaryExpense.a2} | So: ₹${salaryExpense.a3}</small></td>
              <td style="padding:8px 0; text-align:right; vertical-align:top; font-weight:500; border-bottom:1px solid var(--color-border);">₹${salaryExpense.total}</td>
            </tr>
            ${Object.entries(expenseByCat).map(([k, v]) => `
            <tr>
              <td style="padding:8px 0; border-bottom:1px solid var(--color-border);">${k}<br><small style="color:#777;">S: ₹${v.a1} | P: ₹${v.a2} | So: ₹${v.a3}</small></td>
              <td style="padding:8px 0; text-align:right; vertical-align:top; font-weight:500; border-bottom:1px solid var(--color-border);">₹${v.total}</td>
            </tr>`).join("") || `<tr><td colspan="2" class="hint-text" style="padding:8px 0;">No other expenses logged</td></tr>`}
            <tr>
              <td style="padding:12px 0 4px 0;"><strong>Total</strong><br><small style="color:#777; font-weight:normal;">S: ₹${totalExpense.a1} | P: ₹${totalExpense.a2} | So: ₹${totalExpense.a3}</small></td>
              <td style="padding:12px 0 4px 0; text-align:right; vertical-align:top; font-size:16px;"><strong>₹${totalExpense.total}</strong></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div class="card" style="margin-top:22px; overflow:hidden;">
      <h3 style="margin-bottom:12px; font-size:18px;">Manual Entries — ${label}</h3>
      <div class="table-wrap" style="overflow-x:auto;">
        <table style="width:100%; white-space:nowrap;">
        <thead><tr><th>Type</th><th>Category</th><th>Amount</th><th>Date</th><th>Account</th><th>Notes</th><th></th></tr></thead>
        <tbody>${
          (() => {
            const rows = [
              ...incomeEntries.filter(e => inRange(e.date)).map(e => ({ ...e, kind: "income", col: "incomeEntries" })),
              ...periodExpensesList.map(e => ({ ...e, kind: "expense", col: "expenseEntries" }))
            ].sort((a, b) => (b.date || "").localeCompare(a.date || ""));
            if (!rows.length) return `<tr><td colspan="7"><div class="empty-state">No manual entries for ${label}.</div></td></tr>`;
            return rows.map(r => `
              <tr>
                <td><span class="badge ${r.kind === "income" ? "badge-active" : "badge-inactive"}">${r.kind === "income" ? "Income" : "Expense"}</span></td>
                <td>${r.category === "custom" ? (r.customLabel || "Custom") : (EXPENSE_CATEGORY_LABELS[r.category] || r.category)}</td>
                <td>₹${r.amount}</td><td>${r.date}</td>
                <td><span class="badge" style="background:#eef2ff; color:#4f46e5; border:1px solid #c7d2fe;">${r.account === 'account3' ? 'SBI' : r.account === 'account2' ? 'ICICI HUF' : 'Union Current'}</span></td>
                <td>${r.notes || "—"}</td>
                <td><button class="btn btn-danger btn-sm" data-del="${r.id}" data-col="${r.col}">Delete</button></td>
              </tr>`).join("");
          })()
        }</tbody>
      </table></div>
    </div>`;

  // Event Listeners for Filters
  document.getElementById("acctPeriodType").addEventListener("change", (e) => {
    renderAccounting(e.target.value, null); 
  });
  document.getElementById("acctFilterVal")?.addEventListener("change", (e) => {
    renderAccounting(filterType, e.target.value);
  });

  document.getElementById("addIncomeBtn").addEventListener("click", () => openEntryForm("income"));
  document.getElementById("addExpenseBtn").addEventListener("click", () => openEntryForm("expense"));

  viewRoot.querySelectorAll("[data-del]").forEach(btn => btn.addEventListener("click", async () => {
    if (!confirm("Delete this entry?")) return;
    if (btn.dataset.col === "incomeEntries") await IncomeEntries.remove(btn.dataset.del);
    else await ExpenseEntries.remove(btn.dataset.del);
    toast("Entry deleted");
    renderAccounting(filterType, filterValue);
  }));
}

function openEntryForm(kind) {
  const isIncome = kind === "income";
  const categories = isIncome
    ? [{ v: "registration", l: "Registration" }, { v: "other", l: "Other Income" }]
    : [{ v: "rent", l: "Rent" }, { v: "electricity", l: "Electricity" }, { v: "maintenance", l: "Maintenance" },
       { v: "instruments", l: "Instruments" }, { v: "marketing", l: "Marketing" }, { v: "misc", l: "Miscellaneous" },
       { v: "custom", l: "Custom…" }];
  const today = fmtLocalDate(new Date());

  openModal(isIncome ? "Add Income" : "Add Expense", `
    <form id="entryForm">
      <div class="field"><label>Category</label>
        <select id="entCategory">${categories.map(c => `<option value="${c.v}">${c.l}</option>`).join("")}</select></div>
      <div class="field" id="customLabelField" style="display:none;"><label>Custom Label</label><input type="text" id="entCustomLabel" placeholder="e.g. Diwali Event" /></div>
      <div class="field-row">
        <div class="field"><label>Amount (₹)</label><input type="number" id="entAmount" min="0" required /></div>
        <div class="field"><label>Date</label><input type="date" id="entDate" value="${today}" /></div>
      </div>
      <div class="field-row">
        <div class="field"><label>Account</label>
          <select id="entAccount">
            <option value="account1">Union Current</option>
            <option value="account2">ICICI HUF</option>
            <option value="account3">SBI</option>
          </select></div>
        <div class="field"><label>Notes (optional)</label><input type="text" id="entNotes" /></div>
      </div>
      <div style="display:flex; gap:10px; margin-top:20px;">
        <button type="submit" class="btn btn-primary">Save</button>
        <button type="button" class="btn btn-ghost" id="cancelBtn">Cancel</button>
      </div>
    </form>`);

  if (!isIncome) {
    document.getElementById("entCategory").addEventListener("change", (e) => {
      document.getElementById("customLabelField").style.display = e.target.value === "custom" ? "block" : "none";
    });
  }
  document.getElementById("cancelBtn").addEventListener("click", closeModal);
  document.getElementById("entryForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const data = {
      category: document.getElementById("entCategory").value,
      // NAYA: 'undefined' ki jagah 'null' use kiya gaya hai taaki Firebase crash na ho
      customLabel: !isIncome ? document.getElementById("entCustomLabel")?.value.trim() : null,
      amount: Number(document.getElementById("entAmount").value || 0),
      account: document.getElementById("entAccount").value, 
      date: document.getElementById("entDate").value,
      notes: document.getElementById("entNotes").value.trim(),
      createdBy: adminProfile.uid
    };
    try {
      if (isIncome) await IncomeEntries.create(data);
      else await ExpenseEntries.create(data);
      toast(isIncome ? "Income added" : "Expense added");
      logActivity(isIncome ? "Income Added" : "Expense Added", `${data.category} — ₹${data.amount}`);
      closeModal();
      renderAccounting();
    } catch (err) { toast(err.message, true); }
  });
}

/* ================================================================
   CALENDAR — one month grid, color-coded dots per category, click a
   date for the full day agenda. Admissions/birthdays/homework/fees
   are derived live from their own collections; Holidays/Events/Exams
   are the only things admin logs directly here.
   ================================================================ */
const CAL_COLORS = {
  admission: "#4CAF50", // Green
  courseEnd: "#000080", // Navy Blue
  fee: "#F44336",       // Red
  birthday: "#FFA726"   // Light Orange
};
const CAL_LABELS = {
  admission: "New Admission", 
  courseEnd: "Renewal Due", 
  fee: "Fees Due",
  birthday: "Birthday"
};

let calState = { year: new Date().getFullYear(), month: new Date().getMonth() };

async function renderCalendar() {
  const { year, month } = calState;
  
  // Homework fetch hata diya gaya hai
  const [students, feePlans] = await Promise.all([
    Students.list(), FeePlans.listAll()
  ]);

  const agenda = {};
  const push = (key, type, label) => {
    if (!agenda[key]) agenda[key] = [];
    agenda[key].push({ type, label });
  };

  const gridDays = monthGridDays(year, month);
  gridDays.forEach(d => {
    students.forEach(s => {
      if (isBirthday(s.dob, d)) push(toKey(d), "birthday", `${s.name}'s Birthday`);
    });
  });

  students.forEach(s => {
    if (s.createdAt?.toDate) {
      const admitDate = s.createdAt.toDate();
      if (admitDate.getFullYear() === year && admitDate.getMonth() === month) {
        push(toKey(admitDate), "admission", `${s.name} Admitted (${s.admissionNo})`);
      }
    }
  });

  feePlans.forEach(plan => {
    if (plan.isCharity) return;
    const student = students.find(s => s.id === plan.studentId);
    
    // Fees Due 
    (plan.installments || []).forEach(ins => {
      if (ins.status !== "paid" && ins.dueDate) {
        push(ins.dueDate, "fee", `${student?.name || "Student"} — Installment #${ins.number} (₹${ins.amount})`);
      }
    });

    // NAYA: Package Expiry / Renewal Due 
    if (student) {
      if (plan.endDate) {
        push(plan.endDate, "courseEnd", `${student.name}'s Package Renewal Due`);
      } else if (student.createdAt?.toDate) {
        // Fallback: Agar purana record hai jisme endDate nahi hai, toh Admission Date + 4 months
        const d = student.createdAt.toDate();
        d.setMonth(d.getMonth() + 4);
        push(toKey(d), "courseEnd", `${student.name}'s Package Renewal Due`);
      }
    }
  });

  const todayKey = toKey(new Date());

  viewRoot.innerHTML = `
    <div class="main-header">
      <div><h2>Calendar</h2><div class="sub">Admissions, Birthdays, Renewals, and Fees Due — all in one view.</div></div>
    </div>

    <div class="cal-legend">
      ${Object.entries(CAL_LABELS).map(([k, l]) => `<span><span class="cal-dot" style="background:${CAL_COLORS[k]};"></span>${l}</span>`).join("")}
    </div>

    <div class="toolbar">
      <button class="btn btn-ghost btn-sm" id="prevMonthBtn">← Prev</button>
      <h3 style="font-size:20px;">${monthLabel(year, month)}</h3>
      <button class="btn btn-ghost btn-sm" id="nextMonthBtn">Next →</button>
    </div>

    <div class="cal-grid" style="margin-bottom:8px;">
      ${[0,1,2,3,4,5,6].map(i => `<div class="cal-daylabel">${weekdayShort(i)}</div>`).join("")}
    </div>
    <div class="cal-grid" id="calCells"></div>`;

  document.getElementById("prevMonthBtn").addEventListener("click", () => {
    calState.month -= 1;
    if (calState.month < 0) { calState.month = 11; calState.year -= 1; }
    renderCalendar();
  });
  document.getElementById("nextMonthBtn").addEventListener("click", () => {
    calState.month += 1;
    if (calState.month > 11) { calState.month = 0; calState.year += 1; }
    renderCalendar();
  });

  const cellsWrap = document.getElementById("calCells");
  cellsWrap.innerHTML = gridDays.map(d => {
    const key = toKey(d);
    const inMonth = d.getMonth() === month;
    const items = agenda[key] || [];
    const dots = items.slice(0, 6).map(it => `<span class="cal-dot" style="background:${CAL_COLORS[it.type] || "#999"};"></span>`).join("");
    return `<div class="cal-cell ${inMonth ? "" : "dim"} ${key === todayKey ? "today" : ""}" data-key="${key}">
      <div class="cal-num">${d.getDate()}</div>
      <div class="cal-dots">${dots}</div>
    </div>`;
  }).join("");

  cellsWrap.querySelectorAll(".cal-cell").forEach(cell => {
    cell.addEventListener("click", () => openDayAgenda(cell.dataset.key, agenda[cell.dataset.key] || []));
  });
}

function openDayAgenda(dateKey, items) {
  openModal(new Date(dateKey).toDateString(), `
    ${items.length ? items.map(it => `
      <div style="display:flex; align-items:center; gap:10px; padding:8px 0; border-bottom:1px solid var(--color-border);">
        <span class="cal-dot" style="background:${CAL_COLORS[it.type] || "#999"}; flex-shrink:0;"></span>
        <div><strong>${CAL_LABELS[it.type] || it.type}</strong><br/><span style="font-size:13.5px; color:var(--color-text-muted);">${it.label}</span></div>
      </div>`).join("") : `<div class="empty-state"><div class="icon">🎼</div>Nothing scheduled for this day.</div>`}
    <button class="btn btn-ghost" style="margin-top:16px;" id="closeAgendaBtn">Close</button>`);
  document.getElementById("closeAgendaBtn").addEventListener("click", closeModal);
}

/* ================================================================
   REPORTS — a hub of read-only tables pulled from data already
   captured elsewhere (Students/Batches/Attendance/Fees/Salary/Accounting).
   Every report has a "Export CSV" button.
   ================================================================ */
const REPORT_TYPES = [
  { key: "students", label: "Student List" },
  { key: "batchStudents", label: "Batch Wise Students" },
  { key: "teacherStudents", label: "Teacher Wise Students" },
  { key: "courseStudents", label: "Course Wise Students" },
  { key: "attendance", label: "Student Attendance" },
  { key: "teacherAttendance", label: "Teacher Attendance" }, // NAYA
  { key: "feesCollection", label: "Fees Collection" },
  { key: "dueFees", label: "Due Fees" },
  { key: "salary", label: "Salary Report" },
  { key: "pnl", label: "Profit & Loss (CA Report)" } // NAYA
];

function exportCSV(filename, headers, rows) {
  const escape = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const csv = [headers.map(escape).join(","), ...rows.map(r => r.map(escape).join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

async function renderReports(activeKey = "students") {
  viewRoot.innerHTML = `
    <div class="main-header"><div><h2>Reports</h2><div class="sub">Read-only summaries, exportable as CSV.</div></div></div>
    <div class="pill-toggle" id="reportPills" style="flex-wrap:wrap; margin-bottom:20px;">
      ${REPORT_TYPES.map(r => `<div class="pill ${r.key === activeKey ? "active" : ""}" data-r="${r.key}">${r.label}</div>`).join("")}
    </div>
    <div id="reportBody"><p class="hint-text">Loading…</p></div>`;

  document.querySelectorAll("#reportPills .pill").forEach(p => p.addEventListener("click", () => renderReports(p.dataset.r)));

  const body = document.getElementById("reportBody");
  const [students, batches, courses, teachers] = await Promise.all([
    Students.list(), Batches.list(), Courses.list(), Teachers.list()
  ]);

  if (activeKey === "students") {
    const rows = students.map(s => [s.admissionNo, s.name, courses.find(c => c.id === s.courseId)?.name || "—",
      batches.find(b => b.id === s.batchId)?.name || "—", s.mobile || "—", s.active ? "Active" : "Inactive"]);
    renderTableReport(body, "Student List", ["Admission No.", "Name", "Course", "Batch", "Mobile", "Status"], rows, "student-list.csv");

  } else if (activeKey === "batchStudents") {
    body.innerHTML = batches.map(b => {
      const roster = students.filter(s => s.batchId === b.id);
      return `<div class="card" style="margin-bottom:16px;">
        <h3 style="font-size:17px; margin-bottom:8px;">${b.name} <span class="hint-text">(${roster.length} students)</span></h3>
        <div class="table-wrap"><table><tbody>${
          roster.length ? roster.map(s => `<tr><td>${s.admissionNo}</td><td>${s.name}</td></tr>`).join("") : `<tr><td class="hint-text">No students</td></tr>`
        }</tbody></table></div></div>`;
    }).join("") || `<div class="card empty-state">No batches yet.</div>`;

  } else if (activeKey === "teacherStudents") {
    body.innerHTML = teachers.map(t => {
      const myBatches = batches.filter(b => b.teacherId === t.id || (b.teacherIds && b.teacherIds.includes(t.id)));
      const count = students.filter(s => myBatches.some(b => b.id === s.batchId)).length;
      return `<div class="card" style="margin-bottom:12px; display:flex; justify-content:space-between; align-items:center;">
        <div><strong>${t.name}</strong><p class="hint-text">${myBatches.map(b => b.name).join(", ") || "No batches"}</p></div>
        <div class="stat-card" style="min-width:100px; text-align:center;"><div class="label">Students</div><div class="value">${count}</div></div>
      </div>`;
    }).join("") || `<div class="card empty-state">No teachers yet.</div>`;

  } else if (activeKey === "courseStudents") {
    const rows = courses.map(c => [c.name, students.filter(s => s.courseId === c.id).length]);
    renderTableReport(body, "Course Wise Students", ["Course", "Students"], rows, "course-wise-students.csv");

  } else if (activeKey === "attendance") {
    await renderAttendanceReport(body, batches, students);

  } else if (activeKey === "teacherAttendance") { // NAYA
    await renderTeacherAttendanceReport(body, teachers);

  } else if (activeKey === "feesCollection") {
    await renderFeesCollectionReport(body, students, courses, batches);

  } else if (activeKey === "dueFees") {
    await renderDueFeesReport(body, students, courses, batches);

  } else if (activeKey === "salary") {
    await renderSalaryReport(body, teachers);

  } else if (activeKey === "pnl") {
    await renderPnlReport(body, "month", null); // NAYA arguments
  }
}

function renderTableReport(body, title, headers, rows, filename) {
  body.innerHTML = `
    <div class="toolbar"><h3 style="font-size:18px;">${title}</h3><button class="btn btn-ghost btn-sm" id="csvBtn">Export CSV</button></div>
    <div class="card" style="overflow-x:auto;"><div class="table-wrap" style="min-width:600px;"><table>
      <thead><tr>${headers.map(h => `<th>${h}</th>`).join("")}</tr></thead>
      <tbody>${rows.length ? rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join("")}</tr>`).join("") : `<tr><td colspan="${headers.length}"><div class="empty-state">No data yet.</div></td></tr>`}</tbody>
    </table></div></div>`;
  document.getElementById("csvBtn").addEventListener("click", () => exportCSV(filename, headers, rows));
}

async function renderAttendanceReport(body, batches, students) {
  const thisMonth = currentMonth();
  body.innerHTML = `
    <div class="card" style="margin-bottom:18px;">
      <div class="field-row" style="align-items:flex-end;">
        <div class="field"><label>Batch</label>
          <select id="repBatch">
            <option value="all">🌟 All Batches (Combined)</option> <!-- NAYA -->
            ${batches.map(b => `<option value="${b.id}">${b.name}</option>`).join("") || "<option disabled>No batches</option>"}
          </select>
        </div>
        <div class="field"><label>Month</label><input type="month" id="repMonth" value="${thisMonth}" /></div>
      </div>
    </div>
    <div id="repTableWrap"></div>`;

  const load = async () => {
    const batchId = document.getElementById("repBatch").value;
    const month = document.getElementById("repMonth").value;
    if (!batchId) return;
    
    let docs = [];
    let roster = [];
    
    // NAYA: All Batches Logic
    if (batchId === "all") {
      roster = students.filter(s => s.active !== false);
      const promises = batches.map(b => Attendance.listForBatch(b.id));
      const results = await Promise.all(promises);
      docs = results.flat().filter(d => d.date && d.date.startsWith(month));
    } else {
      docs = (await Attendance.listForBatch(batchId)).filter(d => d.date && d.date.startsWith(month));
      roster = students.filter(s => s.batchId === batchId);
    }

    const tally = {};
    roster.forEach(s => { tally[s.id] = { present: 0, absent: 0, leave: 0, late: 0 }; });
    docs.forEach(d => Object.entries(d.records || {}).forEach(([sid, status]) => {
      if (tally[sid] && tally[sid][status] !== undefined) tally[sid][status]++;
    }));

    const headers = ["Admission No.", "Name", "Batch", "Present", "Absent", "Late"];
    const rows = roster.map(s => [s.admissionNo, s.name, batches.find(b=>b.id===s.batchId)?.name||"-", tally[s.id].present, tally[s.id].absent, tally[s.id].late]);
    
    const fileNameSuffix = batchId === "all" ? "All_Batches" : (batches.find(b=>b.id===batchId)?.name || "Batch").replace(/\s+/g, '_');
    renderTableReport(document.getElementById("repTableWrap"), `Attendance — ${month}`, headers, rows, `attendance_${fileNameSuffix}_${month}.csv`);
  };
  
  document.getElementById("repBatch").addEventListener("change", load);
  document.getElementById("repMonth").addEventListener("change", load);
  if (batches.length) load();
}

// NAYA: Teacher Attendance Report
async function renderTeacherAttendanceReport(body, teachers) {
  const thisMonth = currentMonth();
  body.innerHTML = `
    <div class="card" style="margin-bottom:18px;">
      <div class="field" style="max-width:220px;"><label>Month</label><input type="month" id="repTAttMonth" value="${thisMonth}" /></div>
    </div>
    <div id="repTAttWrap"></div>`;

  const load = async () => {
    const month = document.getElementById("repTAttMonth").value;
    const allAtt = await TeacherAttendance.listAll();
    const docs = allAtt.filter(d => d.date && d.date.startsWith(month));

    const tally = {};
    teachers.forEach(t => { tally[t.id] = { present: 0, absent: 0, late: 0 }; });
    docs.forEach(d => Object.entries(d.records || {}).forEach(([tid, status]) => {
      if (tally[tid] && tally[tid][status] !== undefined) tally[tid][status]++;
    }));

    const headers = ["Teacher Name", "Mobile", "Present", "Absent", "Late"];
    const rows = teachers.filter(t => t.active !== false).map(t => [t.name, t.mobile || "-", tally[t.id].present, tally[t.id].absent, tally[t.id].late]);
    renderTableReport(document.getElementById("repTAttWrap"), `Teacher Attendance — ${month}`, headers, rows, `teacher_attendance_${month}.csv`);
  };
  
  document.getElementById("repTAttMonth").addEventListener("change", load);
  load();
}

async function renderFeesCollectionReport(body, students, courses, batches) {
  const payments = await Payments.listAll();
  const rows = payments
    .sort((a, b) => (b.paymentDate || "").localeCompare(a.paymentDate || ""))
    .map(p => {
      const s = students.find(st => st.id === p.studentId);
      return [p.receiptNo, s?.name || "—", `₹${p.amount}`, p.paymentDate, p.mode || "—", p.account === "account1" ? "Union Current" : p.account === "account2" ? "ICICI HUF" : p.account === "account3" ? "SBI" : "—"];
    });
  renderTableReport(body, "Fees Collection", ["Receipt No.", "Student", "Amount", "Date", "Mode", "Account"], rows, "fees-collection.csv");
}

async function renderDueFeesReport(body, students, courses, batches) {
  const plans = await FeePlans.listAll();
  const today = fmtLocalDate(new Date());
  const rows = [];
  plans.forEach(plan => {
    if (plan.isCharity) return;
    const s = students.find(st => st.id === plan.studentId);
    (plan.installments || []).forEach(ins => {
      if (ins.status !== "paid") {
        rows.push([s?.name || "—", `#${ins.number}`, `₹${ins.amount}`, ins.dueDate, ins.dueDate < today ? "Overdue" : "Upcoming"]);
      }
    });
  });
  rows.sort((a, b) => a[3].localeCompare(b[3]));
  renderTableReport(body, "Due Fees", ["Student", "Installment", "Amount", "Due Date", "Status"], rows, "due-fees.csv");
}

async function renderSalaryReport(body, teachers) {
  const thisMonth = currentMonth();
  body.innerHTML = `
    <div class="card" style="margin-bottom:18px;">
      <div class="field" style="max-width:220px;"><label>Month</label><input type="month" id="repSalMonth" value="${thisMonth}" /></div>
    </div>
    <div id="repSalWrap"></div>`;

  const load = async () => {
    const month = document.getElementById("repSalMonth").value;
    const payouts = await Salary.listForMonth(month);
    const rows = payouts.map(p => [teachers.find(t => t.id === p.teacherId)?.name || "—", p.salaryType === "partner" ? "Partner" : "Fixed", `₹${p.amount}`, p.paidDate, p.notes || "—"]);
    renderTableReport(document.getElementById("repSalWrap"), `Salary — ${month}`, ["Teacher", "Type", "Amount", "Paid Date", "Notes"], rows, `salary-${month}.csv`);
  };
  document.getElementById("repSalMonth").addEventListener("change", load);
  load();
}

// NAYA: Poora Naya PNL / CA Ledger Report
async function renderPnlReport(body, filterType = "month", filterValue = null) {
  if (!filterValue) {
     if (filterType === 'daily') filterValue = fmtLocalDate(new Date());
     if (filterType === 'month') filterValue = new Date().toISOString().slice(0, 7);
     if (filterType === 'year') filterValue = getCurrentFinYear();
  }

  let start, end, label;
  if (filterType === 'daily') {
     start = filterValue; end = filterValue; 
     const [y,m,d] = filterValue.split("-");
     label = `Date: ${d}-${m}-${y}`;
  } else if (filterType === 'month') {
     const [y, m] = filterValue.split("-");
     const first = new Date(y, m - 1, 1);
     const last = new Date(y, m, 0);
     start = fmtLocalDate(first); end = fmtLocalDate(last);
     label = `Month: ${first.toLocaleString("en-IN", { month: "long", year: "numeric" })}`;
  } else if (filterType === 'year') {
     const [y1, y2] = filterValue.split("-");
     start = `${y1}-04-01`; 
     end = `${y2}-03-31`;   
     label = `FY_${y1}-${y2}`;
  }

  const inRange = (d) => d && d >= start && d <= end;
  
  const [payments, salaryPayouts, incomeEntries, expenseEntries, students, teachers] = await Promise.all([
    Payments.listAll(), Salary.listAll(), IncomeEntries.list(), ExpenseEntries.list(), Students.list(), Teachers.list()
  ]);

  let totalIn = 0, totalOut = 0;
  const detailRows = []; // [Date, Type, Category, Description, Mode, Account, Income, Expense]

  payments.filter(p => inRange(p.paymentDate)).forEach(p => {
    totalIn += p.amount;
    const s = students.find(x => x.id === p.studentId);
    const acc = p.account === 'account3' ? 'SBI' : p.account === 'account2' ? 'ICICI HUF' : 'Union Current';
    detailRows.push([p.paymentDate, "Income", "Fee Collection", `Student: ${s?.name||'Unknown'} (Rcpt: ${p.receiptNo})`, p.mode||'cash', acc, p.amount, 0]);
  });

  incomeEntries.filter(e => inRange(e.date)).forEach(e => {
    totalIn += e.amount;
    const acc = e.account === 'account3' ? 'SBI' : e.account === 'account2' ? 'ICICI HUF' : 'Union Current';
    const cat = e.category === 'registration' ? 'Registration Fee' : 'Other Income';
    detailRows.push([e.date, "Income", cat, e.notes||'-', "-", acc, e.amount, 0]);
  });

  salaryPayouts.filter(p => inRange(p.paidDate)).forEach(p => {
    totalOut += p.amount;
    const t = teachers.find(x => x.id === p.teacherId);
    const acc = p.account === 'account3' ? 'SBI' : p.account === 'account2' ? 'ICICI HUF' : 'Union Current';
    detailRows.push([p.paidDate, "Expense", "Salary", `Teacher: ${t?.name||'Unknown'} (${p.month}) ${p.notes||''}`, "-", acc, 0, p.amount]);
  });

  expenseEntries.filter(e => inRange(e.date)).forEach(e => {
    totalOut += e.amount;
    const acc = e.account === 'account3' ? 'SBI' : e.account === 'account2' ? 'ICICI HUF' : 'Union Current';
    const cat = e.category === 'custom' ? (e.customLabel || 'Custom') : (EXPENSE_CATEGORY_LABELS[e.category] || e.category);
    detailRows.push([e.date, "Expense", cat, e.notes||'-', "-", acc, 0, e.amount]);
  });

  // Sort by Date (oldest to newest)
  detailRows.sort((a, b) => a[0].localeCompare(b[0]));
  const profit = totalIn - totalOut;

  body.innerHTML = `
    <div class="card" style="margin-bottom:20px; display:flex; gap:15px; flex-wrap:wrap; align-items:flex-end;">
      <div class="field" style="margin:0; min-width:150px;">
          <label>Period Type</label>
          <select id="pnlPeriodType">
              <option value="daily" ${filterType === 'daily' ? 'selected' : ''}>Daily</option>
              <option value="month" ${filterType === 'month' ? 'selected' : ''}>Monthly</option>
              <option value="year" ${filterType === 'year' ? 'selected' : ''}>Financial Year</option>
          </select>
      </div>
      <div class="field" style="margin:0; flex:1; min-width:150px; max-width:250px;">
          ${filterType === 'daily' ? `<label>Select Date</label><input type="date" id="pnlFilterVal" value="${filterValue}" />` : ''}
          ${filterType === 'month' ? `<label>Select Month</label><input type="month" id="pnlFilterVal" value="${filterValue}" />` : ''}
          ${filterType === 'year' ? `<label>Select Fin Year</label><select id="pnlFilterVal">${getFinYearOptions(filterValue)}</select>` : ''}
      </div>
    </div>

    <div class="stat-grid" style="grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); margin-bottom: 20px;">
      <div class="stat-card">
        <div class="label">Total Income</div>
        <div class="value" style="color:var(--color-teal);">₹${totalIn}</div>
      </div>
      <div class="stat-card">
        <div class="label">Total Expenses</div>
        <div class="value" style="color:var(--color-danger);">₹${totalOut}</div>
      </div>
      <div class="stat-card">
        <div class="label">${profit >= 0 ? "Net Profit" : "Net Loss"}</div>
        <div class="value" style="color:${profit >= 0 ? "var(--color-teal)" : "var(--color-danger)"};">₹${Math.abs(profit)}</div>
      </div>
    </div>
    
    <div id="pnlTableWrap"></div>
  `;

  document.getElementById("pnlPeriodType").addEventListener("change", (e) => {
    renderPnlReport(body, e.target.value, null); 
  });
  document.getElementById("pnlFilterVal")?.addEventListener("change", (e) => {
    renderPnlReport(body, filterType, e.target.value);
  });

  // Render the detailed table with CSV Export
  const headers = ["Date", "Type", "Category", "Description", "Payment Mode", "Account", "Income (₹)", "Expense (₹)"];
  renderTableReport(document.getElementById("pnlTableWrap"), `CA Ledger (P&L) — ${label}`, headers, detailRows, `CA_Ledger_Report_${label.replace(/\s+/g, '_')}.csv`);
}

/* ================================================================
   NOTIFICATIONS — Admin can broadcast a message to All/Teachers/Parents.
   Below that: a live reminders feed (Homework due, Fees due, upcoming
   Holidays/Events/Exams, Birthdays) computed from existing data —
   nothing extra to maintain, always current.
   ================================================================ */
function daysFromNow(dateStr) {
  if (!dateStr) return Infinity;
  const diffMs = new Date(dateStr) - new Date(fmtLocalDate(new Date()));
  return Math.round(diffMs / 86400000);
}

async function buildReminderFeed() {
  const [homework, plans, students] = await Promise.all([
    Homework.list(), FeePlans.listAll(), Students.list()
  ]);
  const items = [];

  homework.forEach(h => {
    const d = daysFromNow(h.dueDate);
    if (d >= 0 && d <= 7) items.push({ icon: "📚", text: `Homework due in ${d === 0 ? "today" : d + " day(s)"}: ${h.title}`, date: h.dueDate });
  });

  plans.forEach(plan => {
    if (plan.isCharity) return;
    const s = students.find(st => st.id === plan.studentId);
    (plan.installments || []).forEach(ins => {
      if (ins.status === "paid") return;
      const d = daysFromNow(ins.dueDate);
      if (d <= 7) items.push({
        icon: "💰",
        text: `${d < 0 ? "Overdue" : "Due in " + d + " day(s)"}: ${s?.name || "Student"} — ₹${ins.amount}`,
        date: ins.dueDate,
        mobile: s?.mobile,
        waMessage: `Namaste! This is a reminder from Allegro School of Music — ${s?.name || "your child"}'s fee installment of ₹${ins.amount} was due on ${ins.dueDate}. Please pay at your earliest convenience. Thank you!`
      });
    });
  });

  // NAYA: Events loop completely removed

  const today = new Date();
  students.forEach(s => {
    if (!s.dob) return;
    const dob = new Date(s.dob);
    const thisYearBday = new Date(today.getFullYear(), dob.getMonth(), dob.getDate());
    const d = Math.round((thisYearBday - new Date(fmtLocalDate(today))) / 86400000);
    if (d >= 0 && d <= 7) items.push({ icon: "🎂", text: `${s.name}'s Birthday in ${d === 0 ? "today" : d + " day(s)"}`, date: fmtLocalDate(thisYearBday) });
  });

  return items.sort((a, b) => a.date.localeCompare(b.date));
}

async function renderNotifications() {
  const [sent, reminders] = await Promise.all([Notifications.list(), buildReminderFeed()]);

  viewRoot.innerHTML = `
    <div class="main-header">
      <div><h2>Notifications</h2><div class="sub">Broadcast messages, plus live reminders pulled from Homework, Fees, Events & Birthdays.</div></div>
      <button class="btn btn-accent" id="composeBtn">+ Compose Broadcast</button>
    </div>

    <div class="card" style="margin-bottom:22px;">
      <h3 style="font-size:17px; margin-bottom:12px;">Reminders — Next 7 Days</h3>
      <div id="reminderList">${
        reminders.length
          ? reminders.map(r => `<div style="display:flex; gap:10px; padding:9px 0; border-bottom:1px solid var(--color-border); align-items:center; justify-content:space-between;">
              <div style="display:flex; gap:10px;"><span>${r.icon}</span><span style="font-size:14.5px;">${r.text}</span></div>
              ${r.mobile ? `<a class="btn btn-ghost btn-sm" target="_blank" href="https://wa.me/91${r.mobile.replace(/\D/g, "").slice(-10)}?text=${encodeURIComponent(r.waMessage)}">Send WhatsApp</a>` : ""}
            </div>`).join("")
          : `<div class="empty-state">Nothing coming up in the next 7 days.</div>`
      }</div>
    </div>

    <div class="card">
      <h3 style="font-size:17px; margin-bottom:12px;">Sent Broadcasts</h3>
      <div class="table-wrap"><table>
        <thead><tr><th>Title</th><th>Message</th><th>Audience</th><th></th></tr></thead>
        <tbody>${
          sent.length
            ? sent.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)).map(n => `
                <tr><td><strong>${n.title}</strong></td><td>${n.message}</td>
                <td><span class="badge badge-active">${n.audience === "all" ? "Everyone" : n.audience === "teacher" ? "Teachers" : "Parents"}</span></td>
                <td><button class="btn btn-danger btn-sm" data-del="${n.id}">Delete</button></td></tr>`).join("")
            : `<tr><td colspan="4"><div class="empty-state">No broadcasts sent yet.</div></td></tr>`
        }</tbody>
      </table></div>
    </div>`;

  document.getElementById("composeBtn").addEventListener("click", openBroadcastForm);
  viewRoot.querySelectorAll("[data-del]").forEach(btn => btn.addEventListener("click", async () => {
    if (!confirm("Delete this broadcast?")) return;
    await Notifications.remove(btn.dataset.del);
    toast("Broadcast deleted");
    renderNotifications();
  }));
}

function openBroadcastForm() {
  openModal("Compose Broadcast", `
    <form id="broadcastForm">
      <div class="field"><label>Audience</label>
        <select id="bcAudience">
          <option value="all">Everyone (Teachers + Parents)</option>
          <option value="teacher">Teachers Only</option>
          <option value="parent">Parents Only</option>
        </select></div>
      <div class="field"><label>Title</label><input type="text" id="bcTitle" placeholder="e.g. Diwali Holiday Notice" required /></div>
      <div class="field"><label>Message</label><textarea id="bcMessage" rows="4" required></textarea></div>
      <div style="display:flex; gap:10px; margin-top:20px;">
        <button type="submit" class="btn btn-primary">Send Broadcast</button>
        <button type="button" class="btn btn-ghost" id="cancelBtn">Cancel</button>
      </div>
    </form>`);

  document.getElementById("cancelBtn").addEventListener("click", closeModal);
  document.getElementById("broadcastForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      await Notifications.create({
        audience: document.getElementById("bcAudience").value,
        title: document.getElementById("bcTitle").value.trim(),
        message: document.getElementById("bcMessage").value.trim(),
        createdBy: adminProfile.uid
      });
      toast("Broadcast sent");
      closeModal();
      renderNotifications();
    } catch (err) { toast(err.message, true); }
  });
}

/* ================================================================
   ACTIVITY LOG — read-only audit trail: who changed what, and when.
   Entries are written automatically by logActivity() at each mutation
   point across the app (see Courses/Students/Fees/Attendance/etc above).
   ================================================================ */
async function renderActivityLog() {
  viewRoot.innerHTML = `
    <div class="main-header">
      <div><h2>Activity Log</h2><div class="sub">Complete audit history — who edited, added, or deleted what.</div></div>
    </div>
    <div class="toolbar">
      <input type="text" class="search-input" id="logSearch" placeholder="Search by action, person, or item…" />
      <button class="btn btn-ghost btn-sm" id="logCsvBtn">Export CSV</button>
    </div>
    <div id="logTableWrap"><p class="hint-text">Loading…</p></div>`;

  const all = await ActivityLog.list();
  const fmtWhen = (ts) => ts?.seconds ? new Date(ts.seconds * 1000).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "—";
  const wrap = document.getElementById("logTableWrap");
  let currentFiltered = all;

  const paint = (rows) => {
    wrap.innerHTML = `
      <div class="card"><div class="table-wrap"><table>
        <thead><tr><th>Action</th><th>Details</th><th>By</th><th>Role</th><th>When</th></tr></thead>
        <tbody>${
          rows.length
            ? rows.map(e => `<tr>
                <td><strong>${e.action}</strong></td>
                <td>${e.entityLabel || "—"}</td>
                <td>${e.performedByName}</td>
                <td><span class="badge badge-active">${e.performedByRole}</span></td>
                <td>${fmtWhen(e.createdAt)}</td>
              </tr>`).join("")
            : `<tr><td colspan="5"><div class="empty-state"><div class="icon">📝</div>No activity recorded yet.</div></td></tr>`
        }</tbody>
      </table></div></div>`;
  };
  paint(all);

  document.getElementById("logSearch").addEventListener("input", (e) => {
    const q = e.target.value.trim().toLowerCase();
    currentFiltered = q ? all.filter(x => `${x.action} ${x.entityLabel} ${x.performedByName}`.toLowerCase().includes(q)) : all;
    paint(currentFiltered);
  });

  document.getElementById("logCsvBtn").addEventListener("click", () => {
    exportCSV(
      "activity-log.csv",
      ["Action", "Details", "By", "Role", "When"],
      currentFiltered.map(e => [e.action, e.entityLabel || "", e.performedByName, e.performedByRole, fmtWhen(e.createdAt)])
    );
  });
}

function shareCredentialsWhatsApp(name, mobile, loginId, password, role) {
  const appLink = window.location.origin; // Aapki website ka link automatically le lega
  const text = `Hello *${name}*,\n\nWelcome to *Allegro School of Music*! 🎵\n\nHere are your ${role} portal login details:\n🌐 *Link:* ${appLink}\n👤 *Login ID:* ${loginId}\n🔑 *Password:* ${password}\n\nPlease login to check your dashboard, attendance, and updates.\n\nThank You!`;
  
  // WhatsApp web/app open karne ka link (91 lagaya hai Indian numbers ke liye)
  const url = `https://wa.me/91${mobile}?text=${encodeURIComponent(text)}`;
  window.open(url, '_blank');
}

// NAYA FUNCTION: Timetable Grid Generate karne ke liye
function generateTimetableHTML(allBatches, allStudents, allCourses, allTeachers, courseFilter, showTeachers, showStudents, isPrintMode = false) {
  const allPossibleDays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  
  let filteredBatches = allBatches;
  if (courseFilter !== 'all') {
    filteredBatches = allBatches.filter(b => b.courseId === courseFilter);
  }

  // NAYA: Sirf wahi din nikalo jinme actual mein koi batch ho, khali dino ko hata do
  const activeDays = allPossibleDays.filter(day => 
    filteredBatches.some(b => (b.days || []).includes(day))
  );

  const timeSlots = [...new Set(filteredBatches.map(b => b.timing))].filter(Boolean).sort();

  if (!timeSlots.length || !activeDays.length) return `<div class="card empty-state">No batches found for this selection.</div>`;

  let html = `<div class="${isPrintMode ? '' : 'card'}" style="${isPrintMode ? '' : 'overflow-x:auto; padding:0;'}">
                <table class="table" style="width:100%; text-align:center; min-width:800px; margin:0; border-collapse: collapse;" border="${isPrintMode ? '1' : '0'}">
                <thead style="background:${isPrintMode ? '#f0f0f0' : 'var(--color-surface-alt)'};">
                  <tr>
                    <th style="${isPrintMode ? 'border:1px solid #000;' : 'border-right:1px solid var(--color-border);'} padding:10px;">Time / Days</th>
                    ${activeDays.map(day => `<th style="${isPrintMode ? 'border:1px solid #000;' : ''} padding:10px;">${day}</th>`).join('')}
                  </tr>
                </thead>
                <tbody>`;

  timeSlots.forEach(time => {
    html += `<tr><td style="font-weight:bold; ${isPrintMode ? 'border:1px solid #000;' : 'border-right:1px solid var(--color-border);'} white-space:nowrap; padding:10px;">${time}</td>`;
    
    activeDays.forEach(day => {
      const batchesInSlot = filteredBatches.filter(b => b.timing === time && (b.days || []).includes(day));
      
      let cellContent = "";
      batchesInSlot.forEach(batch => {
        
        // NAYA: Ab check karega ki student actually current 'day' column ke din aata hai ya nahi
        const studentsInBatch = allStudents.filter(s => {
          if (s.batchId !== batch.id || s.active === false) return false;
          if (s.selectedDays && s.selectedDays.length > 0) {
            return s.selectedDays.includes(day); // Sirf column wale din hi true hoga
          }
          return true; // Agar specific din nahi hain toh roz dikhega
        });

        const courseName = allCourses.find(c => c.id === batch.courseId)?.name || "Unknown";
        
        const tIds = batch.teacherIds && batch.teacherIds.length ? batch.teacherIds : [batch.teacherId];
        const teacherNames = tIds.map(id => allTeachers.find(t => t.id === id)?.name).filter(Boolean).join(", ") || "Unknown";

        cellContent += `<div style="background:${isPrintMode ? '#fff' : 'var(--color-surface-alt)'}; border:1px solid ${isPrintMode ? '#555' : 'var(--color-border)'}; border-radius:4px; margin-bottom:6px; padding:6px; font-size:12px; text-align:left;">`;
        
        // Sirf Course Name dikhega (Pichla update)
        cellContent += `<strong style="color:${isPrintMode ? '#000' : 'var(--color-primary)'}; display:block; font-size:14px; line-height:1.2; margin-bottom:2px;">${courseName}</strong>`;
        
        // Toggle Logic For Teacher
        if (showTeachers) {
            const btmBorder = showStudents ? '1px solid #ddd' : 'none';
            const btmPad = showStudents ? '3px' : '0';
            cellContent += `<span style="font-size:11px; color:#666; display:block; margin-bottom:5px; border-bottom:${btmBorder}; padding-bottom:${btmPad};">by ${teacherNames}</span>`;
        }
        
        // Toggle Logic For Students
        if (showStudents) {
            if(studentsInBatch.length > 0) {
                cellContent += studentsInBatch.map(s => s.name).join('<br/>');
            } else {
                cellContent += `<span style="color:#aaa; font-style:italic;">No students yet</span>`;
            }
        }
        
        cellContent += `</div>`;
      });
      
      html += `<td style="vertical-align:top; padding:8px; min-width:130px; ${isPrintMode ? 'border:1px solid #000;' : ''}">${cellContent || '<span style="color:#ccc;">-</span>'}</td>`;
    });
    
    html += `</tr>`;
  });

  html += `</tbody></table></div>`;
  return html;
}

// NAYA FUNCTION: Pop-up window mein A4 Portrait print karne ke liye
function printTimetable(htmlContent) {
  const printWindow = window.open('', '_blank', 'width=1000,height=700');
  
  // Custom CSS inject kar rahe hain A4 Portrait ke liye
  const printDoc = `
    <html>
      <head>
        <title>Master Timetable Print</title>
        <style>
          @media print { 
            @page { size: A4 portrait; margin: 10mm; }
            body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          }
          body { font-family: 'Segoe UI', Tahoma, Geneva, sans-serif; padding: 20px; color: #000; }
          h2 { text-align: center; font-size: 24px; margin-bottom: 5px; text-transform: uppercase; letter-spacing: 1px; }
          .sub { text-align: center; color: #555; margin-bottom: 20px; font-size: 14px; }
          table { width: 100%; border-collapse: collapse; margin-top: 10px; }
          th, td { border: 1px solid #000; padding: 8px; font-size: 13px; }
          th { background-color: #eaeaea; font-weight: bold; }
        </style>
      </head>
      <body>
        <h2>ALLEGRO SCHOOL OF MUSIC</h2>
        <div class="sub">Master Timetable (Class Schedule)</div>
        ${htmlContent}
        <script>
          // Thoda delay de rahe hain taaki table theek se render ho jaye uske baad print dialog open ho
          setTimeout(() => { window.print(); window.close(); }, 500);
        </script>
      </body>
    </html>
  `;
  
  printWindow.document.write(printDoc);
  printWindow.document.close();
}