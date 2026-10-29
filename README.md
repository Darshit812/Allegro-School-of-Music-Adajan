# Allegro School of Music — Implementation Guide

Yeh guide step-by-step batayega ki jo foundation bana hai usko live kaise karna hai, aur baaki modules kaise add karne hain.

## Abhi kya ban chuka hai (Phase 1)

- **Login system** — Admin (email), Teacher (Teacher ID), Parent (Admission No.) — teeno ek hi `index.html` se, role-tab switch karke.
- **Dynamic Course Management** — bina coding ke koi bhi course add/edit/deactivate.
- **Dynamic Teacher Management** — teacher ko multiple courses se map kar sakte ho.
- **Dynamic Batch Management** — course + teacher + timing + days + capacity.
- **Student Admission** — auto admission number (`ASM000001`, `ASM000002`...) for school records, aur admin admission ke waqt khud Parent ka Login ID + Password type karta hai (login turant active ho jaata hai, no Cloud Function).
- **Attendance** — Admin ya Teacher batch + date select karke roster mark kar sakte hain (Present/Absent/Leave/Late), ek save mein poori class ho jaati hai. Parent apne child ki history read-only dekh sakta hai.
- **Teacher login accounts** — jab admin naya Teacher add kare, wahi form mein Login ID + Password khud type karta hai — turant active.
- **Firestore security rules** — role-based read/write already likhe hue hain (`firestore.rules`).
- **Fees & Installments** — Course fees se auto-suggested total, admin Full Payment ya 2/3/4 installments mein split kar sakta hai (due dates + course period auto-calculate hoti hai), "Charity (Free for All)" toggle bhi hai. Payment collect karte waqt Cash/Bank/UPI + Account 1/2 select karo, printable receipt auto-generate hota hai. "Due Today / Overdue / Upcoming" filters bhi hain.
- **Homework** — Admin ya Teacher, Whole Batch ya Individual Student ko homework assign kar sakte hain — Title, Description, Date, Due Date. Text-only by design (koi photo/PDF/audio upload nahi, isliye Firebase Storage ki zaroorat nahi hai). Parent apne child ka homework (batch-wide + individually assigned) dekh sakta hai.
- **Salary** — Har teacher (Fixed ya Partner) ko month select karke pay karo — Partner teachers ka amount har mahine alag daal sakte ho. Ek click mein Salary History dikh jaati hai (total paid + month-wise breakdown), aur monthly summary stats bhi.
- **Accounting** — Daily/Monthly/Yearly toggle se Income (Fees auto-pull + Registration/Other manual) vs Expenses (Salary auto-pull + Rent/Electricity/Maintenance/Instruments/Marketing/Misc/Custom manual) ka breakdown, aur **Profit & Loss** turant dikh jaata hai.
- **Calendar** — Teeno roles ke liye alag month-view calendar. **Admin**: Admissions, Birthdays, Homework Due, Fees Due, Holidays/Events/Exams (jo khud add kar sakta hai). **Teacher**: apni batches ke Class Days, Homework Due, Student Birthdays. **Parent**: apne child ka Class Day, Homework Due, Fees Due, Holidays/Exams. Kisi bhi date par tap karo → us din ka poora agenda dikh jaata hai.
- **Reports** — 9 report types ek jagah: Student List, Batch/Teacher/Course Wise Students, Attendance Summary, Fees Collection, Due Fees, Salary Report, Profit & Loss. Har report **Export CSV** karo — Excel mein khul jaata hai.
- **Notifications** — Admin **broadcast** bhej sakta hai (All / Teachers / Parents). Har role ke apne portal mein ek **live Reminders feed** (Homework Due, Fees Due, Holidays/Events/Exams, Birthdays) — koi extra data maintain nahi karna padta, sab existing collections se auto-calculate hota hai. Fees Due reminders par ek-click **"Send WhatsApp"** button hai (wa.me link se, koi backend/API zaroori nahi).
- **Activity Log** — Poora audit trail: Course/Teacher/Batch Added/Edited/Deleted, Student Admitted/Removed, Attendance Modified, Fees Edited, Homework Updated, Salary Paid, Income/Expense Added — sab automatically log hota hai (kisne, kab, kya kiya). Search + CSV export bhi hai.

**Poora spec cover ho gaya hai** — sab 15 modules (Admin/Teacher/Parent portals, Dynamic Course/Batch/Fees system, sab kuch) ban chuke hain.

## Kya baaki hai (Phase 2 onwards)

Attendance, Fees, Homework, Salary, Accounting, Calendar, Reports, Notifications, Activity Log — **sab ban chuke hain ✅**. Ab agar koi naya feature ya polish chahiye (jaise Cloud Functions deploy karna, ya kisi module ko refine karna), batao.

---

## Step 1 — Firebase Console Setup (Detailed Walkthrough)

Tumne already project bana liya hai aur Web app bhi add kar diya — perfect, ab yeh 2 cheeze karni hain (Storage abhi **skip kar sakte ho**, kyunki homework ab text-only hai, file upload hai hi nahi).

### A) Authentication ON karo
1. Left sidebar mein **Build** par click karo → **Authentication** dikhega, usko click karo.
2. Beech mein ek bada button hoga **"Get started"** — usko click karo.
3. Ek list khulegi providers ki (Email/Password, Google, Phone, etc.) — us list mein **"Email/Password"** waali row par click karo.
4. Ek panel side se khulega — **pehla toggle switch** ("Enable") ko ON karo.
5. Neeche **"Save"** button dabao.
6. Ho gaya — ab "Sign-in method" tab mein "Email/Password" ke saamne "Enabled" likha dikhna chahiye.

### B) Firestore Database banao
1. Left sidebar mein **Build → Firestore Database** par click karo.
2. **"Create database"** button dabao.
3. Ek popup khulega — **"Start in production mode"** select karo (radio button), phir **"Next"**.
4. Region select karna hoga — dropdown mein `asia-south1 (Mumbai)` dhundo aur select karo. **Yeh step important hai, baad mein change nahi ho sakta.**
5. **"Enable"** button dabao — thoda time lagega (10-20 seconds), database ban jayega.
6. Ho gaya — ab tumhe ek empty database dikhega "+ Start collection" button ke saath. Isme kuch abhi nahi karna, app khud data daalega.

### C) Storage — **Abhi zaroorat nahi, skip kar do**
Homework text-only hai (koi photo/PDF/audio upload nahi hai), toh Storage enable karne ki zaroorat hi nahi hai abhi. Agar future mein Student Photo upload jaisa feature chahiye hoga, tab enable kar lenge — 2 minute ka kaam hai.

### D) Config already mil chuka hai
Tumne bataya Project ID aur API key already aa gaye — bas unko `js/firebase-config.js` file mein paste karna hai (jahan abhi `YOUR_API_KEY`, `YOUR_PROJECT_ID` waghera likha hai). Poora config object Web app setup screen par milta hai:
```js
const firebaseConfig = {
  apiKey: "...",
  authDomain: "...",
  projectId: "...",
  storageBucket: "...",
  messagingSenderId: "...",
  appId: "..."
};
```
Agar yeh screen ab nahi dikh rahi: **Project Settings (⚙️ icon, top-left) → General tab → neeche scroll karo "Your apps" section tak → apni web app par click karo** — wahi config dikh jayega, copy-paste kar sakte ho.

## Step 2 — GitHub par push karo (GitHub hi tumhara deploy tool hai, koi CLI nahi)

Tum already GitHub par `allegro-erp` repo bana chuke ho. Ab yeh naya diya gaya files bhi usmein daal do (upload/replace kar do):
- `firebase.json`
- `.firebaserc`
- `.github/workflows/firebase-hosting.yml`

(GitHub website par hi "Add file → Upload files" se ho jayega — folder structure automatically bann jaata hai jab tum `.github/workflows/firebase-hosting.yml` jaisa path type karte ho upload karte waqt, ya poori zip dobara extract karke sab select kar lo.)

**Zaroori:** `.firebaserc` file mein project ID `allegro-school-of-music` likha hai — agar tumhara actual project ID isse alag hai (Firebase Console → Project Settings mein check kar sakte ho), toh us file ko edit karke sahi ID daal dena. Same ID `.github/workflows/firebase-hosting.yml` ke `projectId:` line mein bhi update karna.

## Step 3 — Firebase Service Account Key banao (Console se, koi CLI nahi)

Yeh key GitHub ko permission degi tumhare Firebase project mein deploy karne ki.

1. Firebase Console → **⚙️ (Project Settings)** → **"Service accounts"** tab
2. **"Generate new private key"** button dabao → confirm karo → ek `.json` file download hogi
3. Us file ko kisi text editor mein kholo (ya Notepad), **poora content copy karo**

## Step 4 — GitHub Secret Add Karo

1. GitHub repo (`allegro-erp`) kholo → **Settings** tab (top mein) → left sidebar mein **"Secrets and variables" → "Actions"**
2. **"New repository secret"** button dabao
3. Name: `FIREBASE_SERVICE_ACCOUNT`
4. Value: wahi poora JSON content jo Step 3 mein copy kiya tha, paste kar do
5. **"Add secret"** dabao

## Step 5 — Deploy Ho Jayega Automatically

Ab jab bhi tum GitHub repo mein koi file change/upload karoge (commit karoge), **GitHub khud Firebase par deploy kar dega** — koi terminal ya Cloud Shell touch nahi karna padega kabhi.

Deploy check karne ke liye: repo ke **"Actions"** tab par jao — wahan tumhe "Deploy to Firebase Hosting" workflow chalte hue dikhega (2-3 minute lagte hain). Green tick aa jaye toh live ho gaya.

**Live URL** hoga: `https://<tumhara-project-id>.web.app` (jaise `https://allegro-school-of-music.web.app`)

## Step 6 — Firestore Security Rules Deploy Karo (Console se, ek-time manual)

`firestore.rules` file ka content Firebase Console se hi daal sakte ho, CLI ki zaroorat nahi:
1. Firebase Console → **Build → Firestore Database → Rules** tab
2. `firestore.rules` file ka poora content copy karo, editor mein paste kar do (jo already wahan hai usko replace kar do)
3. **"Publish"** button dabao

Jab bhi `firestore.rules` file update ho, yeh step dobara karna padega (GitHub Actions abhi sirf website deploy karta hai, rules nahi — chaho toh baad mein add karva sakte hain).

## Step 7 — Pehla Admin User Banao

Client-side se koi khud ko "admin" nahi bana sakta (security ke liye), isliye pehla admin manually banate hain:

1. **Authentication → Users → Add User** → apna email + password daalo. Ek `uid` milega.
2. **Firestore Database → Start collection** → collection ID: `users` → Document ID: (wahi `uid` jo upar mila) → fields:
   ```
   role: "admin"   (string)
   name: "Darshit"  (string)
   active: true     (boolean)
   ```
3. Ab `index.html` par jaake Admin tab se login karo — dashboard khul jayega.

## Parent & Teacher Login — Ab Manual Hai (Cloud Functions ki zaroorat nahi)

Jaisa tumne chaha, ab **koi auto-generated ID/Password nahi hai**:

- **Naya Student admit karte waqt**, form mein hi "Parent Login ID" aur "Password" ke fields hain — tum jo bhi ID/password chaho type kar sakte ho (jaise `parent_ravi` / koi bhi password 6+ characters ka).
- **Naya Teacher add karte waqt**, same tarah "Teacher Login ID" aur "Password" fields form mein hi hain.

Yeh login **turant active ho jaata hai** — submit karte hi. Koi wait nahi karna padta, koi Cloud Function nahi chahiye, koi Blaze plan bhi zaroori nahi iske liye (Blaze sirf tab chahiye tha jab Cloud Functions use ho rahe the — ab woh removed hai, toh chaho toh Spark/free plan par wapas ja sakte ho, though Blaze rakhne mein koi nuksaan nahi, free tier ke andar hi rahoge).

**Technical note (agar interested ho):** Yeh kaam karta hai ek "secondary" Firebase app instance ki wajah se (`js/firebase-config.js` mein `secondaryAuth`) — jab admin naya login banata hai, wo login secondary instance par create hota hai taaki admin apne khud ke session se logout na ho jaye. Yeh sab automatically handle ho raha hai code mein, tumhe kuch extra nahi karna.

## WhatsApp Se Credentials Bhejna

Admission/Teacher confirm hone ke baad screen par Login ID + Password dikh jaate hain — unko copy karke WhatsApp par manually bhej sakte ho. Fees Due reminders ke liye already ek-click "Send WhatsApp" button bhi hai (Notifications page mein) jo `wa.me` link use karta hai — koi extra setup nahi chahiye.

---

## Naya Module Add Karne Ka Pattern

Har naya module (Attendance, Fees, etc.) is pattern se banega:

1. `js/data-service.js` mein naya export object banao (jaise `Courses`, `Teachers`):
   ```js
   export const Attendance = {
     list: () => listAll("attendance"),
     create: (data) => create("attendance", data),
     update: (id, data) => update("attendance", id, data),
   };
   ```
2. `js/admin.js` mein `renderCourses()` copy karke `renderAttendance()` banao — table + "+ Add" button + modal form.
3. `admin.html` sidebar mein already `data-view="attendance"` nav-item maujood hai — router mein case add karo (`js/admin.js` ke `render()` function mein).
4. `firestore.rules` mein already scaffolding hai — permissions adjust karo.

Poora spec ban chuka hai. Ab priority yeh honi chahiye:
1. **GitHub push karo** (Step 2-5 upar) — pehli baar site live karne ke liye
2. **Firestore rules publish karo** (Step 6) — console se, one-time
3. **Pehla admin banao** (Step 7) — phir login karke test karo
4. Jo bhi bugs ya polish chahiye ho, real usage ke baad batana — chhote fixes turant ho jayenge

---

## File Structure

```
allegro-erp/
├── index.html          → Login (Admin/Teacher/Parent tabs)
├── admin.html           → Admin dashboard shell
├── teacher.html          → Teacher dashboard (Attendance + Homework)
├── parent.html           → Parent dashboard (Attendance + Homework + Fees)
├── firestore.rules       → Firestore security rules (paste into Console → Rules tab)
├── storage.rules         → (Optional, currently unused — homework is text-only, no file uploads)
├── firebase.json         → Tells Firebase Hosting which files to serve
├── .firebaserc           → Your Firebase project ID (update if it doesn't match)
├── .github/workflows/
│   └── firebase-hosting.yml → Auto-deploys to Firebase on every GitHub push
├── css/style.css         → Full design system
└── js/
    ├── firebase-config.js  → Your Firebase keys go here (has a secondary app for admin-created logins)
    ├── auth.js              → Login/logout/role-guard logic
    ├── data-service.js      → Firestore CRUD (Courses/Teachers/Batches/Students/Attendance/Fees/Homework/Salary/Accounting/Events)
    ├── calendar-utils.js     → Shared date helpers for all 3 Calendar views
    ├── admin.js              → Admin dashboard rendering + forms
    ├── teacher.js            → Teacher portal (attendance + homework + calendar)
    └── parent.js             → Parent portal (attendance + homework + fees + calendar)
```
