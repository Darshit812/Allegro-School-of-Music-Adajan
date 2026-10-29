// ============================================================
// data-service.js — Firestore CRUD for the core dynamic entities:
// Courses, Teachers, Batches, Students (+ auto-created Parent users)
//
// Collections:
//   courses/{courseId}
//   teachers/{teacherId}
//   batches/{batchId}
//   students/{studentId}
//   users/{uid}            <- auth-linked profiles (admin/teacher/parent)
//   counters/{counterName}  <- for sequential admission numbers
// ============================================================

import { db, secondaryAuth } from "./firebase-config.js";
import {
  collection, doc, addDoc, updateDoc, deleteDoc, getDocs,
  query, orderBy, runTransaction, setDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  createUserWithEmailAndPassword, signOut as secondarySignOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const LOGIN_DOMAIN = "login.allegro.app";

/**
 * Creates a real Firebase Auth login (so the person can actually sign in)
 * for a Teacher or Parent, using the admin-chosen loginId + password —
 * entirely client-side, no Cloud Functions / Blaze plan required.
 * Runs on the secondary app instance so the admin's own session is untouched.
 */
async function createLoginAccount({ loginId, password, role, profileData }) {
  const email = `${loginId.trim().toUpperCase()}@${LOGIN_DOMAIN}`;
  const cred = await createUserWithEmailAndPassword(secondaryAuth, email, password);
  await setDoc(doc(db, "users", cred.user.uid), {
    role, active: true, loginId: loginId.trim().toUpperCase(), ...profileData
  });
  await secondarySignOut(secondaryAuth); // don't leave the secondary app "logged in" as this user
  return cred.user.uid;
}

/* ---------------- Generic helpers ---------------- */

async function listAll(colName, orderField = "createdAt") {
  const q = query(collection(db, colName), orderBy(orderField, "desc"));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

async function create(colName, data) {
  const ref = await addDoc(collection(db, colName), {
    ...data,
    createdAt: serverTimestamp()
  });
  return ref.id;
}

async function update(colName, id, data) {
  await updateDoc(doc(db, colName, id), data);
}

async function remove(colName, id) {
  await deleteDoc(doc(db, colName, id));
}

/* ---------------- Courses ---------------- */
// Course: { name, category, registrationFees, durationOptions[], feesStructure, active, teacherIds[] }

export const Courses = {
  list: () => listAll("courses"),
  create: (data) => create("courses", { active: true, ...data }),
  update: (id, data) => update("courses", id, data),
  remove: (id) => remove("courses", id)
};

/* ---------------- Teachers ---------------- */
// Teacher: { teacherId (= admin-chosen login ID), name, mobile, address, qualification,
//            joiningDate, salaryType ('fixed'|'partner'), courseIds[], active }

export const Teachers = {
  list: () => listAll("teachers"),

  /** Creates the teacher record AND their real login, using the ID/password the admin typed in. */
  async create(data, loginId, password) {
    const cleanedLoginId = loginId.trim().toUpperCase();
    
    // NAYA LOGIC: Pehle Auth account banao. Agar duplicate hoga, toh yahi error aayega aur process ruk jayega.
    await createLoginAccount({
      loginId: cleanedLoginId, password, role: "teacher",
      profileData: { name: data.name, mobile: data.mobile, teacherId: cleanedLoginId }
    });

    // Agar Auth ban gaya, tabhi niche aayega aur Teacher data save hoga
    const ref = await addDoc(collection(db, "teachers"), {
      ...data,
      teacherId: cleanedLoginId,
      loginPassword: password, // admin ko dikhane ke liye
      active: true,
      createdAt: serverTimestamp()
    });
    return { id: ref.id, teacherId: cleanedLoginId };
  },

  update: (id, data) => update("teachers", id, data),
  remove: (id) => remove("teachers", id)
};

/* ---------------- Batches ---------------- */
// Batch: { name, courseId, teacherId, timing, days[], capacity, currentStudents, active }

export const Batches = {
  list: () => listAll("batches"),
  create: (data) => create("batches", { active: true, currentStudents: 0, ...data }),
  update: (id, data) => update("batches", id, data),
  remove: (id) => remove("batches", id)
};

/* ---------------- Sequential Admission Numbers ---------------- */
// Uses a Firestore transaction on counters/admission to avoid duplicate numbers.
// (This is just the school's own record number — separate from login credentials.)

async function nextAdmissionNumber() {
  const counterRef = doc(db, "counters", "admission");
  const nextNum = await runTransaction(db, async (tx) => {
    const snap = await tx.get(counterRef);
    const current = snap.exists() ? snap.data().value : 0;
    const next = current + 1;
    tx.set(counterRef, { value: next }, { merge: true });
    return next;
  });
  // NAYA LOGIC: Agar number 10 se kam hai to ek '0' lagayega (01, 09), warna direct number (10, 95, 286...)
  return `ASM${nextNum < 10 ? "0" + nextNum : nextNum}`;
}

/* ---------------- Students + Parent account ---------------- */
// Student: { admissionNo, admissionDate, name, dob, address, fatherName,
//            motherName, mobile, email, courseId, batchId, otherInterest }
//
// Parent's login ID + password are chosen by the admin at admission time
// (typed into the form) — created directly via the secondary Auth app,
// no Cloud Functions needed.

export async function admitStudent(studentData, parentLoginId, parentPassword) {
  const admissionNo = await nextAdmissionNumber();

  // NAYA LOGIC: Pehle ek khali Student ID generate karo (data abhi save nahi kar rahe)
  const newStudentRef = doc(collection(db, "students"));

  // Us ID se pehle Auth account banao
  await createLoginAccount({
    loginId: parentLoginId, password: parentPassword, role: "parent",
    profileData: {
      name: studentData.fatherName || studentData.motherName || "Parent",
      mobile: studentData.mobile, studentId: newStudentRef.id
    }
  });

  // Agar account successfully ban gaya, tabhi Student data Firestore mein save karo
  await setDoc(newStudentRef, {
    ...studentData,
    parentLoginId: parentLoginId.trim().toUpperCase(),
    parentPassword: parentPassword,
    admissionNo,
    active: true,
    createdAt: serverTimestamp()
  });

  return { studentId: newStudentRef.id, admissionNo };
}

export const Students = {
  list: () => listAll("students"),
  update: (id, data) => update("students", id, data),
  remove: (id) => remove("students", id)
};

/* ---------------- Attendance ---------------- */
// One document per Batch + Date, so marking a whole class is a single write:
// attendance/{batchId_date} = { batchId, date, records: { studentId: 'present'|'absent'|'leave'|'late' }, markedBy, updatedAt }

import {
  getDoc as _getDoc, where as _where
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

function attendanceDocId(batchId, dateStr) {
  return `${batchId}_${dateStr}`;
}

export const Attendance = {
  /** Load (or get an empty shell for) a batch's attendance on a given date (YYYY-MM-DD). */
  async getForBatchDate(batchId, dateStr) {
    const ref = doc(db, "attendance", attendanceDocId(batchId, dateStr));
    const snap = await _getDoc(ref);
    return snap.exists() ? snap.data() : { batchId, date: dateStr, records: {} };
  },

  /** Save/overwrite attendance for a batch on a date. records = { studentId: status } */
  async saveForBatchDate(batchId, dateStr, records, markedByUid) {
    const ref = doc(db, "attendance", attendanceDocId(batchId, dateStr));
    await setDoc(ref, {
      batchId, date: dateStr, records, markedBy: markedByUid,
      updatedAt: serverTimestamp()
    }, { merge: true });
  },

  /** All attendance docs for one batch, across dates (for monthly view). */
  async listForBatch(batchId) {
    const q = query(collection(db, "attendance"), _where("batchId", "==", batchId));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  },

  /** All attendance docs that mention a given student (for parent view) — scans batch docs client-side. */
  async listForStudent(studentId, batchId) {
    const all = await Attendance.listForBatch(batchId);
    return all
      .filter(a => a.records && a.records[studentId])
      .map(a => ({ date: a.date, status: a.records[studentId] }))
      .sort((a, b) => b.date.localeCompare(a.date));
  }
};

/* ---------------- Fees & Installments ---------------- */
// feePlans/{id} = { studentId, courseId, batchId, totalAmount, isCharity,
//                    installments: [{ number, amount, dueDate, coursePeriod, status, receiptNo, paidAt }] }
// payments/{id} = { receiptNo, studentId, feePlanId, installmentNumber, amount,
//                    paymentDate, paymentTime, mode, account, coursePeriod, pendingAfter }

const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function addMonths(dateStr, months) {
  const d = new Date(dateStr);
  d.setMonth(d.getMonth() + months);
  return d;
}
function fmtDate(d) { return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; }

/** NAYA FUNCTION: Date ko "15/12/26" (DD/MM/YY) wale format mein dikhane ke liye */
function formatPrettyDate(d) {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yy = String(d.getFullYear()).slice(-2);
  return `${dd}/${mm}/${yy}`;
}

/** Splits totalAmount into `count` installments across `durationMonths`, starting at startDateStr. */
export function generateInstallmentSchedule(totalAmount, count, durationMonths, startDateStr) {
  const base = Math.floor(totalAmount / count);
  const remainder = totalAmount - base * count;
  const gapMonths = durationMonths / count;

  return Array.from({ length: count }, (_, i) => {
    const dueDate = addMonths(startDateStr, Math.round(gapMonths * i));
    
    // Exact start date (e.g. 22 June)
    const periodStart = addMonths(startDateStr, Math.round(gapMonths * i));
    
    // Exact end date (Next period start minus 1 day, e.g. 21 Oct)
    const periodEnd = addMonths(startDateStr, Math.round(gapMonths * (i + 1)));
    periodEnd.setDate(periodEnd.getDate() - 1);

    // NAYA: Dono exact dates ko jod kar course period banana
    const coursePeriod = `${formatPrettyDate(periodStart)} to ${formatPrettyDate(periodEnd)}`;
    
    return {
      number: i + 1,
      amount: base + (i === count - 1 ? remainder : 0),
      dueDate: fmtDate(dueDate),
      coursePeriod,
      status: "pending"
    };
  });
}

export const FeePlans = {
  async getForStudent(studentId) {
    const q = query(collection(db, "feePlans"), _where("studentId", "==", studentId));
    const snap = await getDocs(q);
    return snap.empty ? null : { id: snap.docs[0].id, ...snap.docs[0].data() };
  },
  async listAll() { return listAll("feePlans"); },
  async create(data) {
    const ref = await addDoc(collection(db, "feePlans"), { ...data, createdAt: serverTimestamp() });
    return ref.id;
  },
  async update(id, data) { await update("feePlans", id, data); }
};

async function nextReceiptNumber() {
  const counterRef = doc(db, "counters", "receipt");
  const nextNum = await runTransaction(db, async (tx) => {
    const snap = await tx.get(counterRef);
    const current = snap.exists() ? snap.data().value : 0;
    const next = current + 1;
    tx.set(counterRef, { value: next }, { merge: true });
    return next;
  });
  return `RCPT-${String(nextNum).padStart(5, "0")}`;
}

export const Payments = {
  /** Records a payment against one installment, marks it paid, and returns the receipt data. */
  async collect(feePlan, installmentNumber, { mode, account, amount, paymentDate: customDate }) {
    const installment = feePlan.installments.find(i => i.number === installmentNumber);
    if (!installment) throw new Error("Installment not found");
    if (installment.status === "paid") throw new Error("This installment is already paid");

    const receiptNo = await nextReceiptNumber();
    const now = new Date();
    // NAYA: Agar custom Date aayi hai to wo use hogi, warna current date
    const paymentDate = customDate || fmtDate(now); 
    const paymentTime = now.toTimeString().slice(0, 5);

    // NAYA LOGIC: Custom amount aur Pending Balance calculate karna
    const paidAmount = amount !== undefined ? Number(amount) : installment.amount;
    const difference = installment.amount - paidAmount;

    let updatedInstallments = feePlan.installments.map(i =>
      i.number === installmentNumber ? { ...i, status: "paid", amount: paidAmount, receiptNo, paidAt: paymentDate } : i
    );

    // Agar student ne kam fees di hai (difference > 0), toh bacha hua amount next installment mein jod do
    if (difference > 0) {
      const nextPending = updatedInstallments.find(i => i.status !== "paid" && i.number > installmentNumber);
      if (nextPending) {
        nextPending.amount += difference; // Next installment mein balance add kar diya
      } else {
        // Agar yeh aakhri installment thi, toh ek nayi installment bana do balance ke liye
        updatedInstallments.push({
          number: updatedInstallments.length + 1,
          amount: difference,
          dueDate: paymentDate, // Turant due dikhayega
          coursePeriod: "Pending Balance",
          status: "pending"
        });
      }
    }

    await FeePlans.update(feePlan.id, { installments: updatedInstallments });

    const pendingAfter = updatedInstallments
      .filter(i => i.status !== "paid")
      .reduce((sum, i) => sum + i.amount, 0);

    const receipt = {
      receiptNo, studentId: feePlan.studentId, feePlanId: feePlan.id,
      installmentNumber, amount: paidAmount, // NAYA: Jo actual amount mila wo receipt pe aayega
      paymentDate, paymentTime, mode, account,
      coursePeriod: installment.coursePeriod, pendingAfter,
      createdAt: serverTimestamp()
    };
    await addDoc(collection(db, "payments"), receipt);
    return receipt;
  },
  
  async listForStudent(studentId) {
    const q = query(collection(db, "payments"), _where("studentId", "==", studentId));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  },
  
  async listAll() {
    const snap = await getDocs(collection(db, "payments"));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  },
  
  // NAYA: Accounting ke liye Paid Receipts Edit karna
  async updateReceipt(receiptNo, updateData) {
    // 1. Receipt dhoondho
    const q = query(collection(db, "payments"), _where("receiptNo", "==", receiptNo));
    const snap = await getDocs(q);
    
    if (!snap.empty) {
      const docId = snap.docs[0].id;
      // 2. Receipt update karo (amount, account, date badal jayega)
      await updateDoc(doc(db, "payments", docId), {
        amount: updateData.amount,
        paymentDate: updateData.paymentDate,
        account: updateData.account
      });
    } else {
      throw new Error("Receipt record not found in Accounting!");
    }
  }
};

/* ---------------- Accounting: manual Income / Expense entries ---------------- */
// incomeEntries/{id}  = { category: 'registration'|'other', amount, date, notes, createdBy, createdAt }
// expenseEntries/{id} = { category: 'rent'|'electricity'|'maintenance'|'instruments'|'marketing'|'misc'|'custom',
//                          customLabel, amount, date, notes, createdBy, createdAt }
// Fees income (Payments) and Salary expense (Salary) are pulled in automatically at report time —
// no need to duplicate them here.

export const IncomeEntries = {
  async list() { return listAll("incomeEntries"); },
  async create(data) {
    const ref = await addDoc(collection(db, "incomeEntries"), { ...data, createdAt: serverTimestamp() });
    return ref.id;
  },
  async remove(id) { await remove("incomeEntries", id); }
};

export const ExpenseEntries = {
  async list() { return listAll("expenseEntries"); },
  async create(data) {
    const ref = await addDoc(collection(db, "expenseEntries"), { ...data, createdAt: serverTimestamp() });
    return ref.id;
  },
  async remove(id) { await remove("expenseEntries", id); }
};

/* ---------------- Calendar Events (Holiday / Event / Exam) ---------------- */
// events/{id} = { title, type: 'holiday'|'event'|'exam', date, notes, createdBy, createdAt }
// Admissions, birthdays, homework due dates and fee due dates are derived live from their
// own collections at render time (see calendar-utils.js) — only these three types need
// a dedicated collection since nothing else in the system tracks them.

export const Events = {
  async list() { return listAll("events"); },
  async create(data) {
    const ref = await addDoc(collection(db, "events"), { ...data, createdAt: serverTimestamp() });
    return ref.id;
  },
  async remove(id) { await remove("events", id); }
};

/* ---------------- Notifications (admin broadcasts) ---------------- */
// notifications/{id} = { title, message, audience: 'all'|'teacher'|'parent', createdBy, createdAt }
// Auto reminders (Homework due, Fees due, Holidays/Events/Exams, Birthdays) are computed live
// from their own collections in each portal's Notifications view — not stored here.

export const Notifications = {
  async list() { return listAll("notifications"); },
  async create(data) {
    const ref = await addDoc(collection(db, "notifications"), { ...data, createdAt: serverTimestamp() });
    return ref.id;
  },
  async remove(id) { await remove("notifications", id); }
};

/* ---------------- Activity Log (audit trail) ---------------- */
// activityLog/{id} = { action, entityLabel, performedBy (uid), performedByName, performedByRole, createdAt }
// Fire-and-forget: a logging failure should never block the actual operation, so callers
// don't need to await/try-catch this — write() below swallows its own errors.

export const ActivityLog = {
  async record(action, entityLabel, profile) {
    try {
      await addDoc(collection(db, "activityLog"), {
        action, entityLabel: entityLabel || "",
        performedBy: profile?.uid || null,
        performedByName: profile?.name || "Unknown",
        performedByRole: profile?.role || "unknown",
        createdAt: serverTimestamp()
      });
    } catch (e) { /* logging must never break the calling action */ }
  },
  async list() {
    const items = await listAll("activityLog");
    return items.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
  }
};

/* ---------------- Homework ---------------- */
// homework/{id} = {
//   scope: 'batch' | 'individual', batchId, studentId (only if individual),
//   title, description, date, dueDate,
//   createdBy (uid), createdByRole ('admin'|'teacher'), createdAt
// }
// Text-only by design — no file/image/audio/video attachments, so Firebase
// Storage isn't required for this app at all right now.

export const Homework = {
  async list() { return listAll("homework"); },

  async listForBatch(batchId) {
    const q = query(collection(db, "homework"), _where("batchId", "==", batchId));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  },

  /** For a parent/student: batch-wide homework for their batch + anything individually assigned to them. */
  async listForStudent(studentId, batchId) {
    const batchWork = await Homework.listForBatch(batchId);
    return batchWork
      .filter(h => h.scope === "batch" || h.studentId === studentId)
      .sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  },

  async create(data) {
    const ref = await addDoc(collection(db, "homework"), { ...data, createdAt: serverTimestamp() });
    return ref.id;
  },
  async update(id, data) { await update("homework", id, data); },
  async remove(id) { await remove("homework", id); }
};

/* ---------------- Salary ---------------- */
// One document per Teacher + Month, so re-paying the same month overwrites cleanly:
// salaryPayouts/{teacherId_YYYY-MM} = {
//   teacherId, month ('YYYY-MM'), amount, salaryType ('fixed'|'partner'),
//   notes, status: 'paid', paidDate, paidBy, updatedAt
// }

function salaryDocId(teacherId, month) {
  return `${teacherId}_${month}`;
}

export const Salary = {
  async getForTeacherMonth(teacherId, month) {
    const snap = await _getDoc(doc(db, "salaryPayouts", salaryDocId(teacherId, month)));
    return snap.exists() ? snap.data() : null;
  },

  async payTeacher({ teacherId, month, amount, account, salaryType, notes, paidBy }) { // account add kiya
    const ref = doc(db, "salaryPayouts", salaryDocId(teacherId, month));
    await setDoc(ref, {
      teacherId, month, amount: Number(amount), account: account || "account1", salaryType, notes: notes || "", // account save kiya
      status: "paid", paidDate: fmtDate(new Date()), paidBy, updatedAt: serverTimestamp()
    });
  },

  /** All payouts for one teacher, most recent month first (for salary history). */
  async listForTeacher(teacherId) {
    const q = query(collection(db, "salaryPayouts"), _where("teacherId", "==", teacherId));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => b.month.localeCompare(a.month));
  },

  /** All payouts across teachers for one month (for the monthly report). */
  async listForMonth(month) {
    const q = query(collection(db, "salaryPayouts"), _where("month", "==", month));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  },

  async listAll() {
    const snap = await getDocs(collection(db, "salaryPayouts"));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  }
};
