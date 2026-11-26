'use strict';

// ===== Tiện ích =====
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const norm = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd');

// ===== Lưu trữ =====
const STORE_KEY = 'dokchampa-school';
const PREF_KEY = 'dokchampa-prefs';
const AUTH_KEY = 'dokchampa-auth';

// Nâng cấp dữ liệu phiên bản cũ (v1, v2): xóa học sinh / giáo viên mẫu, giữ lại những gì người dùng tự thêm
function migrate(d) {
  if (d.version < 3) {
    const num = (id) => parseInt(String(id).slice(1), 10);
    const sampleS = new Set(d.students.filter((s) => num(s.id) <= OLD_SAMPLE.students).map((s) => s.id));
    const sampleT = new Set(d.teachers.filter((x) => num(x.id) <= OLD_SAMPLE.teachers).map((x) => x.id));
    d.students = d.students.filter((s) => !sampleS.has(s.id));
    d.teachers = d.teachers.filter((x) => !sampleT.has(x.id));
    Object.keys(d.grades || {}).forEach((k) => { if (sampleS.has(k.split('|')[0])) delete d.grades[k]; });
    Object.keys(d.attendance || {}).forEach((k) => {
      const rec = d.attendance[k];
      Object.keys(rec).forEach((sid) => { if (sampleS.has(sid)) delete rec[sid]; });
      if (!Object.keys(rec).length) delete d.attendance[k];
    });
    d.classes.forEach((c) => {
      if (sampleT.has(c.homeroomId)) c.homeroomId = '';
      c.teachers = c.teachers || {};
      Object.keys(c.teachers).forEach((k) => { if (sampleT.has(c.teachers[k])) delete c.teachers[k]; });
    });
    if (!Array.isArray(d.accounts)) {
      const old = d.account || { pass: 'admin123' };
      d.accounts = [{ id: 'a1', email: `admin@${EMAIL_DOMAIN}`, pass: old.pass, role: 'admin', refId: '', name: 'Admin', perms: ROLE_PERMS.admin.slice(), active: true, lastLogin: '' }];
    }
    delete d.account;
    d.accounts = d.accounts.filter((a) => !(a.role === 'student' && sampleS.has(a.refId)) && !(a.role === 'teacher' && sampleT.has(a.refId)));
    if (!d.students.length) d.seq.s = 0;
    if (!d.teachers.length) d.seq.t = 0;
    d.version = 3;
  }
  // v4: chuyển điểm cũ (miệng/15 phút/giữa kỳ/cuối kỳ) sang thi tháng + thi học kỳ
  if (d.version < 4) {
    Object.values(d.grades || {}).forEach((g) => {
      if (!g || !('oral' in g || 't15' in g || 'mid' in g || 'final' in g)) return;
      Object.assign(g, { m1: g.oral ?? null, m2: g.t15 ?? null, m3: g.mid ?? null, m4: null, exam: g.final ?? null });
      delete g.oral; delete g.t15; delete g.mid; delete g.final;
    });
    d.version = 4;
  }
  // v5: bỏ chức năng học phí
  if (d.version < 5) {
    delete d.payments;
    if (d.seq) delete d.seq.p;
    if (d.settings) { delete d.settings.feeLower; delete d.settings.feeUpper; }
    (d.accounts || []).forEach((a) => { a.perms = (a.perms || []).filter((p) => p !== 'fees' && p !== 'sfees'); });
    // Hệ thống còn trống → tạo sẵn danh sách mẫu để dùng thử
    d.grades = d.grades || {}; d.attendance = d.attendance || {};
    if (!d.students.length && !d.teachers.length) addDemo(d);
    d.version = 5;
  }
  // v6: lịch thi theo khối (M1–M4 thi cuối năm tháng 5, M5–M7 tháng 6)
  if (d.version < 6) {
    d.settings.examPlan = d.settings.examPlan || JSON.parse(JSON.stringify(EXAM_PLAN_DEFAULT));
    d.version = 6;
  }
  // v7: thông báo — thêm danh sách thông báo và quyền xem / đăng thông báo cho các tài khoản đang có
  if (d.version < 7) {
    d.notices = d.notices || [];
    (d.accounts || []).forEach((a) => {
      const k = a.role === 'student' ? 'snotices' : 'notices';
      if (!a.perms.includes(k)) a.perms.push(k);
    });
    if (hasDemo(d) && !d.notices.length) addDemoNotices(d);
    d.version = 7;
  }
  // v8: chương trình theo khối (M1–M3 / M4–M7), thi giữa kỳ / cuối kỳ, điểm phẩm chất,
  //     thêm thông tin cá nhân (ngày sinh, nơi sinh, địa chỉ, SĐT học sinh, tốt nghiệp)
  if (d.version < 8) {
    // Danh sách mẫu được tạo lại theo chương trình mới (chỉ bản ghi mẫu, dữ liệu tự nhập giữ nguyên)
    if (hasDemo(d)) { removeDemo(d); addDemo(d); }
    // Thời khóa biểu M1–M3: Lý, Hóa → Khoa học tự nhiên, Sinh → Nghệ thuật
    const swap13 = { phys: 'sci', chem: 'sci', bio: 'art' };
    d.classes.forEach((c) => {
      if (groupOfGrade(c.grade) !== 'g13') return;
      const grid = d.timetable[c.id] || {};
      Object.keys(grid).forEach((k) => { if (swap13[grid[k]]) grid[k] = swap13[grid[k]]; });
    });
    d.version = 8;
  }
  // Luôn còn ít nhất 1 tài khoản quản lý để đăng nhập
  const idNum = (a) => parseInt(a.id.slice(1), 10) || 0;
  if (!d.accounts.some((a) => a.role === 'admin' && a.active && a.perms.includes('accounts'))) {
    const email = `admin@${EMAIL_DOMAIN}`;
    const existing = d.accounts.find((a) => a.email.toLowerCase() === email);
    if (existing) Object.assign(existing, { role: 'admin', refId: '', perms: ROLE_PERMS.admin.slice(), active: true });
    else d.accounts.push({ id: 'a' + (Math.max(0, ...d.accounts.map(idNum)) + 1), email, pass: 'admin123', role: 'admin', refId: '', name: 'Admin', perms: ROLE_PERMS.admin.slice(), active: true, lastLogin: '' });
  }
  d.seq.a = Math.max(d.seq.a || 0, ...d.accounts.map(idNum));
  return d;
}
const validDb = (d) => d && [1, 2, 3, 4, 5, 6, 7, 8].includes(d.version) && Array.isArray(d.students) && Array.isArray(d.classes) && Array.isArray(d.teachers) && d.settings && d.seq;

function loadDb() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      const d = JSON.parse(raw);
      if (validDb(d)) return migrate(d);
    }
  } catch (e) { /* bỏ qua, dùng dữ liệu mẫu */ }
  return createSeed();
}

let db = loadDb();
function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(db)); } catch (e) { toast('localStorage error', 'error'); }
}
save();

const prefs = { lang: 'vi', theme: '' };
try { Object.assign(prefs, JSON.parse(localStorage.getItem(PREF_KEY)) || {}); } catch (e) { /* ignore */ }
function savePrefs() { try { localStorage.setItem(PREF_KEY, JSON.stringify(prefs)); } catch (e) { /* ignore */ } }
LANG = prefs.lang === 'lo' ? 'lo' : 'vi';

// ===== Phiên đăng nhập & phân quyền =====
let memAuth = '';
const authId = () => { try { return sessionStorage.getItem(AUTH_KEY) || ''; } catch (e) { return memAuth; } };
const setAuth = (id) => { memAuth = id; try { id ? sessionStorage.setItem(AUTH_KEY, id) : sessionStorage.removeItem(AUTH_KEY); } catch (e) { /* ignore */ } };
function me() {
  const a = db.accounts.find((x) => x.id === authId());
  return a && a.active ? a : null;
}
const isLoggedIn = () => !!me();
const can = (perm) => { const u = me(); return !!u && u.perms.includes(perm); };
const myPerson = () => {
  const u = me();
  if (!u) return null;
  return u.role === 'teacher' ? teacherById(u.refId) : u.role === 'student' ? studentById(u.refId) : null;
};
const accountOf = (role, refId) => db.accounts.find((a) => a.role === role && a.refId === refId);
function displayName(a) {
  const p = a.role === 'teacher' ? teacherById(a.refId) : a.role === 'student' ? studentById(a.refId) : null;
  return p ? p.name : a.name || a.email;
}

// ===== Định dạng =====
const fmtNum = (n) => Number(n || 0).toLocaleString(LANG === 'vi' ? 'vi-VN' : 'en-US');
const fmtDate = (iso) => { if (!iso) return ''; const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}`; };
const todayIso = () => isoDate(new Date());
const fmtScore = (v) => (v == null ? '' : v.toFixed(1));
const pct = (v) => (v == null ? '—' : `${Math.round(v * 100)}%`);

// ===== Tra cứu =====
const classById = (id) => db.classes.find((c) => c.id === id);
const teacherById = (id) => db.teachers.find((x) => x.id === id);
const studentById = (id) => db.students.find((s) => s.id === id);
const byName = (a, b) => a.name.localeCompare(b.name);
const className = (c) => (c ? (LANG === 'lo' ? c.name.replace(/^M/, 'ມ.') : c.name) : '—');
const gradeLabel = (g) => (LANG === 'lo' ? 'ມ.' : 'M') + g;
const genderLabel = (g) => t(g === 'F' ? 'c.female' : 'c.male');
const schoolName = () => (LANG === 'lo' ? db.settings.nameLo : db.settings.nameVi) || db.settings.nameVi;
const sortedClasses = () => db.classes.slice().sort((a, b) => a.grade - b.grade || a.name.localeCompare(b.name, undefined, { numeric: true }));
const studentsOf = (cid) => db.students.filter((s) => s.classId === cid).sort(byName);
const nextId = (k) => k + ++db.seq[k];
const initials = (name) => name.split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
const classOrder = (s) => { const c = classById(s.classId); return c ? c.grade * 100 + parseInt(c.name.split('/')[1] || 0, 10) : 9999; };

function classOptions(sel, withAll, list = sortedClasses()) {
  return (withAll ? `<option value="">${t('c.class')}: ${t('c.all')}</option>` : '') +
    list.map((c) => `<option value="${c.id}"${c.id === sel ? ' selected' : ''}>${esc(className(c))}</option>`).join('');
}

// ===== Chương trình học theo khối =====
const curOf = (cid) => { const c = classById(cid); return CURRICULUM[groupOfGrade(c ? c.grade : 1)]; };
// Môn có điểm học kỳ (cột trong bảng tổng kết, tính TB chung)
const classSubjects = (cid) => { const m = curOf(cid).month; return SUBJECTS.filter((s) => m.includes(s.id)); };
// Môn thi giữa kỳ / cuối kỳ
const examSubjects = (cid) => { const e = curOf(cid).exam; return SUBJECTS.filter((s) => e.includes(s.id)); };
// Mọi môn có thể nhập điểm (thi tháng hoặc thi giữa / cuối kỳ)
const entrySubjects = (cid) => { const c = curOf(cid); return SUBJECTS.filter((s) => c.month.includes(s.id) || c.exam.includes(s.id)); };
const hasMonth = (cid, sub) => sub === CONDUCT.id || curOf(cid).month.includes(sub);
const hasExam = (cid, sub) => curOf(cid).exam.includes(sub);
// Điểm thi giữa / cuối kỳ dùng cho môn: chính nó, hoặc bài Khoa học tự nhiên chung (Lý, Hóa, Sinh ở M4–M7)
const examSrc = (cid, sub) => (hasExam(cid, sub) ? sub : SCI_PARTS.includes(sub) && hasExam(cid, 'sci') ? 'sci' : null);

// Phạm vi dữ liệu: giáo viên chỉ thấy lớp được phân công / chủ nhiệm
function myClasses() {
  const u = me();
  if (!u || u.role !== 'teacher') return sortedClasses();
  return sortedClasses().filter((c) => c.homeroomId === u.refId || Object.values(c.teachers || {}).includes(u.refId));
}
const isHomeroomOf = (cid, u = me()) => !!u && u.role === 'teacher' && !!u.refId && (classById(cid) || {}).homeroomId === u.refId;
// Nhập điểm cả lớp (mọi môn + phẩm chất): quản lý và giáo viên chủ nhiệm của lớp
const canWholeClass = (cid) => { const u = me(); return !!u && (u.role === 'admin' || isHomeroomOf(cid, u)); };
// Môn được nhập điểm: chủ nhiệm / quản lý → mọi môn của lớp + phẩm chất; giáo viên bộ môn → môn mình dạy
function mySubjects(cid) {
  const all = [...entrySubjects(cid), CONDUCT];
  const u = me();
  if (!u || u.role !== 'teacher') return all;
  if (isHomeroomOf(cid, u)) return all;
  const c = classById(cid);
  return all.filter((s) => c && c.teachers && c.teachers[s.id] === u.refId);
}
// Môn giáo viên được phân công dạy ở lớp (để hiển thị)
function taughtSubjects(cid) {
  const u = me();
  const c = classById(cid);
  if (!u || !c) return [];
  return SUBJECTS.filter((s) => c.teachers && c.teachers[s.id] === u.refId);
}

// ===== Quyền xem thông tin cá nhân =====
// Ngày sinh, SĐT, địa chỉ, nơi sinh, phụ huynh: chỉ quản lý, giáo viên chủ nhiệm của lớp và chính học sinh đó
function canSeeStudentInfo(s, u = me()) {
  if (!u || !s) return false;
  if (u.role === 'admin') return true;
  if (u.role === 'student') return u.refId === s.id;
  return isHomeroomOf(s.classId, u);
}
// Thông tin cá nhân giáo viên: quản lý và chính giáo viên đó
const canSeeTeacherInfo = (x, u = me()) => !!u && !!x && (u.role === 'admin' || (u.role === 'teacher' && u.refId === x.id));
const teacherFor = (sub, cid) => { const c = classById(cid); return c && c.teachers ? teacherById(c.teachers[sub]) : null; };
const PERIOD_TIME = ['07:30', '08:25', '09:30', '10:25', '13:30', '14:25'];
const todayDow = () => new Date().getDay(); // 1 = Thứ Hai … 5 = Thứ Sáu
function lessonsOfTeacher(tid) {
  const out = [];
  db.classes.forEach((c) => {
    Object.entries(db.timetable[c.id] || {}).forEach(([slot, sub]) => {
      if (sub && c.teachers && c.teachers[sub] === tid) {
        const [d, p] = slot.split('-').map(Number);
        out.push({ c, d, p, sub: subjectById(sub) });
      }
    });
  });
  return out.sort((a, b) => a.d - b.d || a.p - b.p);
}
const fmtDateTime = (iso) => { if (!iso) return ''; const d = new Date(iso); return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const opts = (list, sel) => list.map((o) => `<option value="${esc(o.v)}"${String(o.v) === String(sel) ? ' selected' : ''}>${esc(o.l)}</option>`).join('');

// ===== Điểm số =====
// Hệ thống Lào: mỗi năm 2 học kỳ; mỗi học kỳ có các bài thi tháng (tối đa 4), rồi thi giữa kỳ (HK1) / cuối kỳ (HK2).
//   Điểm TB tháng = trung bình các bài thi tháng đã có
//   Điểm học kỳ   = (TB tháng + Thi giữa kỳ hoặc cuối kỳ) / 2
//                   môn không thi giữa / cuối kỳ (Lịch sử, ICT, Nghệ thuật, Khối lượng học tập) = TB tháng
//                   M4–M7: Lý, Hóa, Sinh dùng chung điểm thi Khoa học tự nhiên
//   Điểm cả năm   = (Học kỳ 1 + Học kỳ 2) / 2
// Lịch thi theo khối (Cài đặt → Lịch thi): M1–M4 thi cuối năm tháng 5, M5–M7 thi cuối năm tháng 6.
const MONTH_PARTS = ['m1', 'm2', 'm3', 'm4'];
const PARTS = [...MONTH_PARTS, 'exam'];
const levelOfGrade = (g) => (g <= 4 ? 'lower' : 'upper');
const examPlan = () => db.settings.examPlan || EXAM_PLAN_DEFAULT;
function planOf(cid, sem) {
  const c = classById(cid);
  const lv = examPlan()[levelOfGrade(c ? c.grade : 1)] || EXAM_PLAN_DEFAULT.lower;
  return lv[String(sem)] || lv['1'];
}
// Các bài thi tháng đang dùng của lớp trong học kỳ (m1..mN)
const monthParts = (cid, sem) => MONTH_PARTS.slice(0, Math.max(1, planOf(cid, sem).months.length));
const partsOf = (cid, sem) => [...monthParts(cid, sem), 'exam'];
const examLabel = (sem) => t(String(sem) === '2' ? 'gr.final' : 'gr.mid');
const partLabel = (p, sem, cid) => (p === 'exam' ? examLabel(sem) : t('gr.month', { m: planOf(cid, sem).months[MONTH_PARTS.indexOf(p)] ?? MONTH_PARTS.indexOf(p) + 1 }));
const examMonthNote = (sem, cid) => t('gr.examMonth', { m: planOf(cid, sem).exam });
const round1 = (v) => Math.round(v * 10) / 10;
const mean = (arr) => { const v = arr.filter((x) => x != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
const gradeRec = (sid, sub, sem) => db.grades[`${sid}|${sub}|${sem}`];
function monthAvgOf(g, parts = MONTH_PARTS) {
  if (!g) return null;
  const m = mean(parts.map((p) => g[p]));
  return m == null ? null : round1(m);
}
// Điểm học kỳ của một môn (parts = các bài thi tháng đang dùng)
function avgOf(g, parts = MONTH_PARTS) {
  if (!g) return null;
  const m = monthAvgOf(g, parts), e = g.exam;
  if (m == null && e == null) return null;
  if (m == null) return round1(e);
  if (e == null) return m;
  return round1((m + e) / 2);
}
const studentClass = (sid) => { const s = studentById(sid); return s ? s.classId : ''; };
const examOf = (sid, sub, sem) => { const g = gradeRec(sid, sub, sem); return g && g.exam != null ? g.exam : null; };
// Điểm học kỳ của một môn theo chương trình của lớp
function semScore(sid, sub, sem) {
  const cid = studentClass(sid);
  const src = examSrc(cid, sub);
  const e = src ? examOf(sid, src, sem) : null;
  if (!hasMonth(cid, sub)) return e == null ? null : round1(e); // chỉ có bài thi (KHTN ở M4–M7)
  const m = monthAvgOf(gradeRec(sid, sub, sem), monthParts(cid, sem));
  if (m == null && e == null) return null;
  if (m == null) return round1(e);
  if (e == null) return m;
  return round1((m + e) / 2);
}
// Điểm một môn theo học kỳ ('1' | '2') hoặc cả năm ('y')
function subAvg(sid, sub, sem) {
  if (String(sem) !== 'y') return semScore(sid, sub, sem);
  const a = semScore(sid, sub, 1), b = semScore(sid, sub, 2);
  return a == null || b == null ? null : round1((a + b) / 2);
}
function overallAvg(sid, sem) {
  const m = mean(classSubjects(studentClass(sid)).map((s) => subAvg(sid, s.id, sem)));
  return m == null ? null : round1(m);
}
function rankOf(avg) {
  if (avg == null) return null;
  if (avg >= 9) return { k: 'r.excellent', c: 'exc' };
  if (avg >= 8) return { k: 'r.good', c: 'good' };
  if (avg >= 6.5) return { k: 'r.fair', c: 'info' };
  if (avg >= 5) return { k: 'r.average', c: 'warn' };
  return { k: 'r.weak', c: 'bad' };
}
const rankBadge = (avg) => { const r = rankOf(avg); return r ? `<span class="badge ${r.c}">${t(r.k)}</span>` : '<span class="muted">—</span>'; };

// ===== Điểm danh =====
const ATT = [
  { k: 'P', l: 'at.present', c: 'good', i: 'fa-check' },
  { k: 'L', l: 'at.late', c: 'warn', i: 'fa-clock' },
  { k: 'E', l: 'at.excused', c: 'info', i: 'fa-envelope-open-text' },
  { k: 'A', l: 'at.absent', c: 'bad', i: 'fa-xmark' },
];
function attStats(sid) {
  const c = { P: 0, L: 0, E: 0, A: 0, total: 0 };
  for (const key in db.attendance) {
    const v = db.attendance[key][sid];
    if (v) { c[v]++; c.total++; }
  }
  c.rate = c.total ? (c.P + c.L) / c.total : null;
  return c;
}
// Tỷ lệ chuyên cần của học sinh trong một tháng (1–12) → dùng để chấm điểm phẩm chất
function attMonthRate(sid, mo) {
  let n = 0, p = 0;
  for (const key in db.attendance) {
    if (Number(key.split('|')[1].slice(5, 7)) !== mo) continue;
    const v = db.attendance[key][sid];
    if (v) { n++; if (v === 'P' || v === 'L') p++; }
  }
  return n ? p / n : null;
}

// ===== Thành phần giao diện =====
function toast(msg, type = 'ok') {
  let box = $('#toasts');
  if (!box) { box = document.createElement('div'); box.id = 'toasts'; document.body.appendChild(box); }
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<i class="fa-solid ${type === 'error' ? 'fa-circle-exclamation' : 'fa-circle-check'}"></i><span></span>`;
  el.querySelector('span').textContent = msg;
  box.appendChild(el);
  setTimeout(() => el.classList.add('hide'), 2600);
  setTimeout(() => el.remove(), 3000);
}

function openModal({ title, body, foot = '', wide = false }) {
  closeModal();
  const m = document.createElement('div');
  m.className = 'modal-backdrop';
  m.innerHTML = `<div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true">
    <div class="modal-head"><h3>${esc(title)}</h3><button class="icon-btn" data-close aria-label="${t('c.close')}"><i class="fa-solid fa-xmark"></i></button></div>
    <div class="modal-body">${body}</div>
    ${foot ? `<div class="modal-foot">${foot}</div>` : ''}
  </div>`;
  m.addEventListener('click', (e) => { if (e.target === m || e.target.closest('[data-close]')) closeModal(); });
  document.body.appendChild(m);
  requestAnimationFrame(() => m.classList.add('show'));
  return m;
}
function closeModal() { $$('.modal-backdrop').forEach((m) => m.remove()); }

function fieldHtml(f, v) {
  const val = v ?? '';
  const req = f.required ? ' required' : '';
  const star = f.required ? ' <span class="req">*</span>' : '';
  let input;
  if (f.type === 'select') input = `<select name="${f.name}"${req}>${opts(f.options, val)}</select>`;
  else if (f.type === 'textarea') input = `<textarea name="${f.name}" rows="3">${esc(val)}</textarea>`;
  else input = `<input type="${f.type || 'text'}" name="${f.name}" value="${esc(val)}"${req}${f.attrs || ''}>`;
  return `<label class="field${f.full ? ' full' : ''}"><span>${esc(f.label)}${star}</span>${input}</label>`;
}

function formModal({ title, fields, values = {}, submitLabel, onSubmit, intro = '' }) {
  const m = openModal({
    title,
    body: `${intro}<form class="form-grid" novalidate>${fields.map((f) => fieldHtml(f, values[f.name])).join('')}<p class="form-error full" hidden></p></form>`,
    foot: `<button class="btn ghost" data-close>${t('c.cancel')}</button><button class="btn primary" data-submit><i class="fa-solid fa-check"></i> ${esc(submitLabel || t('c.save'))}</button>`,
  });
  const form = $('form', m);
  const err = $('.form-error', form);
  const submit = () => {
    const vals = {};
    let missing = false;
    fields.forEach((f) => {
      const el = form.elements[f.name];
      const v = el.value.trim();
      const bad = f.required && !v;
      el.classList.toggle('invalid', bad);
      if (bad) missing = true;
      vals[f.name] = f.type === 'number' ? (v === '' ? null : Number(v)) : v;
    });
    if (missing) { err.textContent = t('c.required'); err.hidden = false; return; }
    const res = onSubmit(vals);
    if (typeof res === 'string') { err.textContent = res; err.hidden = false; return; }
    closeModal();
  };
  $('[data-submit]', m).addEventListener('click', submit);
  form.addEventListener('submit', (e) => { e.preventDefault(); submit(); });
  form.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') { e.preventDefault(); submit(); } });
  setTimeout(() => { const first = form.querySelector('input, select'); if (first) first.focus(); }, 60);
  return m;
}

function confirmBox(msg, onYes) {
  const m = openModal({
    title: t('c.confirm'),
    body: `<div class="confirm"><i class="fa-solid fa-triangle-exclamation"></i><p>${esc(msg)}</p></div>`,
    foot: `<button class="btn ghost" data-close>${t('c.cancel')}</button><button class="btn danger" data-yes><i class="fa-solid fa-check"></i> ${t('c.confirm')}</button>`,
  });
  $('[data-yes]', m).addEventListener('click', () => { closeModal(); onYes(); });
}

function download(name, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function downloadCsv(name, rows) {
  const csv = '﻿' + rows.map((r) => r.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n');
  download(name, csv, 'text/csv;charset=utf-8');
}

function printHtml(html) {
  $('#printArea').innerHTML = html;
  window.print();
}
// Trang in có tiêu đề trường + chỗ ký tên (signers: danh sách [chức danh, họ tên])
function printDoc(title, sub, inner, signers = []) {
  printHtml(`<div class="print-doc">
    <div class="pd-head"><b>${esc(schoolName())}</b><span>${esc(db.settings.address || '')}</span></div>
    <h2>${esc(title)}</h2>${sub ? `<p class="pd-sub">${sub}</p>` : ''}
    ${inner}
    ${signers.length ? `<div class="pd-sign">${signers.map(([role, name]) => `<div><span>${esc(role)}</span><b>${esc(name || '')}</b></div>`).join('')}</div>` : ''}
    <p class="pd-date">${t('c.printedAt')}: ${fmtDateTime(new Date().toISOString())}</p>
  </div>`);
}

// Tooltip dùng chung cho biểu đồ
const tip = document.createElement('div');
tip.className = 'tooltip';
document.body.appendChild(tip);
function showTip(el, x, y) {
  tip.textContent = el.dataset.tip;
  tip.classList.add('show');
  const r = tip.getBoundingClientRect();
  tip.style.left = Math.min(window.innerWidth - r.width - 8, Math.max(8, x - r.width / 2)) + 'px';
  tip.style.top = Math.max(8, y - r.height - 12) + 'px';
}
document.addEventListener('mousemove', (e) => {
  const el = e.target.closest && e.target.closest('[data-tip]');
  if (el) showTip(el, e.clientX, e.clientY); else tip.classList.remove('show');
});
document.addEventListener('focusin', (e) => {
  const el = e.target.closest && e.target.closest('[data-tip]');
  if (el) { const r = el.getBoundingClientRect(); showTip(el, r.left + r.width / 2, r.top); } else tip.classList.remove('show');
});

// ===== Giao diện: chủ đề =====
function applyTheme() {
  if (prefs.theme) document.documentElement.dataset.theme = prefs.theme;
  else delete document.documentElement.dataset.theme;
  document.documentElement.lang = LANG;
}
const isDark = () => prefs.theme === 'dark' || (!prefs.theme && window.matchMedia('(prefers-color-scheme: dark)').matches);

// ===== Khung ứng dụng =====
// Menu theo vai trò. Mỗi mục (trừ trang chủ) là một quyền mà quản lý bật / tắt cho từng tài khoản
const NAV = {
  admin: [
    ['dashboard', 'fa-gauge-high'],
    ['notices', 'fa-bullhorn'],
    ['students', 'fa-user-graduate'],
    ['teachers', 'fa-chalkboard-user'],
    ['classes', 'fa-school'],
    ['grades', 'fa-star-half-stroke'],
    ['attendance', 'fa-clipboard-check'],
    ['timetable', 'fa-calendar-days'],
    ['accounts', 'fa-user-shield'],
    ['settings', 'fa-gear'],
  ],
  teacher: [
    ['thome', 'fa-house'],
    ['notices', 'fa-bullhorn'],
    ['tschedule', 'fa-calendar-week'],
    ['tclasses', 'fa-people-roof'],
    ['attendance', 'fa-clipboard-check'],
    ['grades', 'fa-star-half-stroke'],
  ],
  student: [
    ['shome', 'fa-house'],
    ['snotices', 'fa-bullhorn'],
    ['sclass', 'fa-people-roof'],
    ['sschedule', 'fa-calendar-days'],
    ['sattendance', 'fa-clipboard-check'],
    ['sgrades', 'fa-star-half-stroke'],
  ],
};
const ALWAYS = ['thome', 'shome', 'profile'];
const PERM_ICON = Object.fromEntries([...NAV.admin, ...NAV.teacher, ...NAV.student]);

function allowedNav() {
  const u = me();
  if (!u) return [];
  return NAV[u.role].filter(([k]) => ALWAYS.includes(k) || u.perms.includes(k));
}
const allowedPages = () => allowedNav().map(([k]) => k).concat('profile');

const langSwitch = () => `<div class="seg lang-seg" role="group" aria-label="Language">
  <button data-act="setLang" data-v="vi" class="${LANG === 'vi' ? 'on' : ''}">VI</button>
  <button data-act="setLang" data-v="lo" class="${LANG === 'lo' ? 'on' : ''}">ລາວ</button>
</div>`;

// Tài khoản quản lý mặc định (tài khoản giáo viên / học sinh do quản lý tự tạo)
const DEMO = [
  ['admin', `admin@${EMAIL_DOMAIN}`, 'admin123', 'fa-user-shield'],
];

function renderLogin() {
  document.title = `${t('login.title')} · ${schoolName()}`;
  $('#app').innerHTML = `
  <div class="login">
    <div class="login-flag" aria-hidden="true"><span></span><span></span><span></span></div>
    <form class="login-card" id="loginForm" novalidate>
      <div class="login-top">${langSwitch()}</div>
      <div class="login-logo"><i class="fa-solid fa-spa"></i></div>
      <h1>${esc(schoolName())}</h1>
      <p class="muted">${t('app.title')}</p>
      <label class="field"><span>${t('login.email')}</span><input name="user" type="email" autocomplete="username" placeholder="name@${EMAIL_DOMAIN}"></label>
      <label class="field"><span>${t('login.pass')}</span><input name="pass" type="password" autocomplete="current-password"></label>
      <p class="form-error" hidden></p>
      <button class="btn primary block" type="submit"><i class="fa-solid fa-right-to-bracket"></i> ${t('login.submit')}</button>
      <div class="demo">
        <span class="muted">${t('login.demo')}</span>
        <div class="demo-btns">${[...DEMO, ...db.accounts.filter((a) => a.demo && a.active).map((a) => [a.role, a.email, a.pass, a.role === 'teacher' ? 'fa-chalkboard-user' : 'fa-user-graduate'])].map(([r, e, p, i]) => `<button type="button" class="btn sm ghost" data-act="fillDemo" data-e="${e}" data-p="${p}"><i class="fa-solid ${i}"></i> ${t('role.' + r)}</button>`).join('')}</div>
      </div>
    </form>
  </div>`;
  const f = $('#loginForm');
  f.addEventListener('submit', (e) => {
    e.preventDefault();
    const email = f.elements.user.value.trim().toLowerCase();
    const acc = db.accounts.find((a) => a.email.toLowerCase() === email && a.pass === f.elements.pass.value);
    const err = $('.form-error', f);
    if (!acc) { err.textContent = t('login.fail'); err.hidden = false; return; }
    if (!acc.active) { err.textContent = t('login.locked'); err.hidden = false; return; }
    acc.lastLogin = new Date().toISOString();
    save();
    setAuth(acc.id);
    history.replaceState(null, '', '#' + allowedPages()[0]);
    renderApp();
  });
  f.elements.user.focus();
}

function renderApp() {
  const u = me();
  if (!u) return renderLogin();
  document.title = `${t('app.short')} · ${schoolName()}`;
  const name = displayName(u);
  $('#app').innerHTML = `
  <div class="shell">
    <aside class="sidebar">
      <div class="brand">
        <div class="brand-logo"><i class="fa-solid fa-spa"></i></div>
        <div class="brand-text"><b>${esc(schoolName())}</b><small>${t('app.title')}</small></div>
      </div>
      <div class="role-tag role-${u.role}"><i class="fa-solid ${u.role === 'admin' ? 'fa-user-shield' : u.role === 'teacher' ? 'fa-chalkboard-user' : 'fa-user-graduate'}"></i> ${t('role.' + u.role)}</div>
      <nav class="nav">
        ${allowedNav().map(([k, i]) => `<a href="#${k}" data-page="${k}"><i class="fa-solid ${i}"></i><span>${t('nav.' + k)}</span></a>`).join('')}
        <a href="#profile" data-page="profile" class="nav-profile"><i class="fa-solid fa-id-badge"></i><span>${t('nav.profile')}</span></a>
      </nav>
      <div class="side-foot"><i class="fa-regular fa-calendar"></i> ${t('se.year')}: ${esc(db.settings.year)}</div>
    </aside>
    <div class="overlay" data-act="closeSide"></div>
    <main class="main">
      <header class="topbar">
        <button class="icon-btn menu-btn" data-act="openSide" aria-label="Menu"><i class="fa-solid fa-bars"></i></button>
        <h1 id="pageTitle"></h1>
        <div class="top-actions">
          ${allowedPages().includes(noticePage()) ? `<a class="icon-btn bell" href="#${noticePage()}" aria-label="${t('no.title')}" title="${t('no.title')}"><i class="fa-regular fa-bell"></i><span class="bell-count" id="bellCount" hidden></span></a>` : ''}
          ${langSwitch()}
          <button class="icon-btn" data-act="toggleTheme" aria-label="${t('se.theme')}"><i class="fa-solid ${isDark() ? 'fa-sun' : 'fa-moon'}"></i></button>
          <a class="user-chip" href="#profile"><span class="avatar ${u.role === 'admin' ? 'M' : (myPerson() || {}).gender || 'M'}">${esc(initials(name))}</span><div><b>${esc(name)}</b><small>${t('role.' + u.role)}</small></div></a>
          <button class="icon-btn" data-act="logout" aria-label="${t('login.logout')}" title="${t('login.logout')}"><i class="fa-solid fa-right-from-bracket"></i></button>
        </div>
      </header>
      <section id="view" class="view"></section>
    </main>
  </div>`;
  renderView();
}

let lastPage = '';
function currentPage() {
  const allowed = allowedPages();
  const p = location.hash.slice(1);
  if (allowed.includes(p)) return p;
  if (PAGES[p] && p !== lastPage) toast(t('c.noPerm'), 'error');
  return allowed[0];
}
function renderView() {
  if (!isLoggedIn()) return renderLogin();
  const view = $('#view');
  if (!view) return renderApp();
  const p = currentPage();
  $$('.nav a').forEach((a) => a.classList.toggle('active', a.dataset.page === p));
  $('#pageTitle').textContent = t('nav.' + p);
  view.innerHTML = PAGES[p]();
  document.body.classList.remove('side-open');
  if (p !== lastPage) window.scrollTo(0, 0);
  lastPage = p;
  updateBell();
}
window.addEventListener('hashchange', renderView);

// ===== Trạng thái bộ lọc từng trang =====
const ui = {
  st: { q: '', cls: '', gender: '', page: 1 },
  tc: { q: '', sub: '' },
  gr: { cls: '', sub: 'math', sem: '1', mode: 'entry', view: 'avg' },
  at: { cls: '', date: todayIso() },
  tt: { cls: '', edit: false },
  acc: { q: '', role: '', page: 1 },
  sg: { sem: '1', view: '' }, // view: m1..m4 | exam | sum ('' = tự chọn tháng mới nhất có điểm)
  no: { q: '', aud: '', seen: '' },
};
const ensureClass = (o, list = sortedClasses()) => { if (!list.some((c) => c.id === o.cls)) o.cls = (list[0] || {}).id || ''; return o.cls; };
const PAGE_SIZE = 12;

function pager(total, page, act) {
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (pages <= 1) return '';
  let btns = '';
  for (let i = 1; i <= pages; i++) btns += `<button class="${i === page ? 'on' : ''}" data-act="${act}" data-p="${i}">${i}</button>`;
  return `<div class="pager"><span class="muted">${t('c.page')} ${page}${t('c.of')}${pages}</span>
    <div class="pager-btns"><button data-act="${act}" data-p="${page - 1}" ${page <= 1 ? 'disabled' : ''} aria-label="prev"><i class="fa-solid fa-chevron-left"></i></button>${btns}<button data-act="${act}" data-p="${page + 1}" ${page >= pages ? 'disabled' : ''} aria-label="next"><i class="fa-solid fa-chevron-right"></i></button></div></div>`;
}
const emptyRow = (cols) => `<tr><td colspan="${cols}" class="empty"><i class="fa-regular fa-folder-open"></i> ${t('c.noData')}</td></tr>`;
const pageHead = (title, sub, actions = '') => `<div class="page-head"><div><h2>${title}</h2>${sub ? `<p class="muted">${sub}</p>` : ''}</div><div class="head-actions">${actions}</div></div>`;
const rowActions = (kind, id) => `<div class="row-actions">
  ${kind === 'Student' || kind === 'Teacher' ? `<button class="icon-btn sm" data-act="view${kind}" data-id="${id}" title="${t('c.view')}" aria-label="${t('c.view')}"><i class="fa-regular fa-eye"></i></button>` : ''}
  <button class="icon-btn sm" data-act="edit${kind}" data-id="${id}" title="${t('c.edit')}" aria-label="${t('c.edit')}"><i class="fa-regular fa-pen-to-square"></i></button>
  <button class="icon-btn sm danger" data-act="del${kind}" data-id="${id}" title="${t('c.delete')}" aria-label="${t('c.delete')}"><i class="fa-regular fa-trash-can"></i></button>
</div>`;
// Ô "tài khoản" trong bảng học sinh / giáo viên: đã có → xem email, chưa có → nút tạo (nếu có quyền)
function accountCell(role, refId) {
  const a = accountOf(role, refId);
  if (a) {
    const inner = `<span class="badge ${a.active ? 'good' : 'bad'}"><i class="fa-solid ${a.active ? 'fa-user-check' : 'fa-lock'}"></i> ${esc(a.email)}</span>`;
    return can('accounts') ? `<button class="plain" data-act="editAccount" data-id="${a.id}" title="${t('acc.editTitle')}">${inner}</button>` : inner;
  }
  return can('accounts')
    ? `<button class="btn sm ghost" data-act="newAccountFor" data-role="${role}" data-ref="${refId}"><i class="fa-solid fa-user-plus"></i> ${t('acc.createFor')}</button>`
    : `<span class="muted">${t('acc.noAccount')}</span>`;
}
const personCell = (p, sub) => `<div class="person"><span class="avatar ${p.gender}">${esc(initials(p.name))}</span><div><b>${esc(p.name)}</b><small>${sub}</small></div></div>`;

// ===== Các trang =====
const PAGES = {};

// ---------- Tổng quan ----------
PAGES.dashboard = () => {
  const S = db.students;
  const male = S.filter((s) => s.gender === 'M').length;
  const today = todayIso();

  let taken = 0, pres = 0, tot = 0;
  db.classes.forEach((c) => {
    const r = db.attendance[`${c.id}|${today}`];
    if (r && Object.keys(r).length) {
      taken++;
      Object.values(r).forEach((v) => { tot++; if (v === 'P' || v === 'L') pres++; });
    }
  });

  // Phân loại học lực HK1 (ĐTB chung)
  const RANKS = [['exc', 'r.excellent'], ['good', 'r.good'], ['info', 'r.fair'], ['warn', 'r.average'], ['bad', 'r.weak']];
  const rk = { exc: 0, good: 0, info: 0, warn: 0, bad: 0 };
  let graded = 0;
  S.forEach((s) => { const a = overallAvg(s.id, 1); if (a != null) { graded++; rk[rankOf(a).c]++; } });

  const byGrade = GRADES.map((g) => {
    const cls = db.classes.filter((c) => c.grade === g);
    return { g, n: S.filter((s) => cls.some((c) => c.id === s.classId)).length, k: cls.length };
  });
  const max = Math.max(1, ...byGrade.map((x) => x.n));
  const niceMax = Math.ceil(max / 10) * 10 || 10;

  const top = S.map((s) => ({ s, a: overallAvg(s.id, 1) })).filter((x) => x.a != null).sort((a, b) => b.a - a.a).slice(0, 5);
  const events = db.events.filter((e) => e.date >= today).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 6);
  const lower = db.classes.filter((c) => c.grade <= 4).length;

  const tile = (icon, tone, label, value, sub, href) => `
    <a class="stat ${tone}" href="#${href}">
      <div class="stat-icon"><i class="fa-solid ${icon}"></i></div>
      <div><span class="stat-label">${label}</span><b class="stat-value">${value}</b><small>${sub}</small></div>
    </a>`;

  return `
  <div class="hero">
    <div><h2>${t('dash.welcome')}</h2><p>${esc(schoolName())} · ${t('dash.sub')} · ${fmtDate(today)}</p></div>
    <div class="hero-flag" aria-hidden="true"><span></span><span></span><span></span></div>
  </div>

  <div class="stats">
    ${tile('fa-user-graduate', 't1', t('dash.students'), fmtNum(S.length), `${t('c.male')} ${male} · ${t('c.female')} ${S.length - male}`, 'students')}
    ${tile('fa-chalkboard-user', 't2', t('dash.teachers'), fmtNum(db.teachers.length), `${SUBJECTS.length} ${t('c.subject').toLowerCase()}`, 'teachers')}
    ${tile('fa-school', 't3', t('dash.classes'), fmtNum(db.classes.length), `${gradeLabel(1)}–${gradeLabel(4)}: ${lower} · ${gradeLabel(5)}–${gradeLabel(7)}: ${db.classes.length - lower}`, 'classes')}
    ${tile('fa-clipboard-check', 't4', t('dash.attToday'), tot ? `${Math.round((pres / tot) * 100)}%` : `<span class="stat-na">${t('dash.notTaken')}</span>`, t('dash.classesTaken', { n: taken, t: db.classes.length }), 'attendance')}
  </div>

  ${!db.teachers.length || !S.length ? `
  <div class="card getting-started">
    <div class="card-head"><h3><i class="fa-solid fa-flag-checkered"></i> ${t('gs.title')}</h3></div>
    <ol class="gs-steps">
      ${[['teachers', 'fa-chalkboard-user', db.teachers.length], ['classes', 'fa-user-tie', db.classes.some((c) => Object.keys(c.teachers || {}).length)], ['students', 'fa-user-graduate', S.length], ['accounts', 'fa-user-shield', db.accounts.length > 1]]
        .map(([p, i, done], k) => `<li class="${done ? 'done' : ''}"><a href="#${p}"><span class="gs-num">${done ? '<i class="fa-solid fa-check"></i>' : k + 1}</span><i class="fa-solid ${i}"></i><span>${t('gs.' + (k + 1))}</span></a></li>`).join('')}
    </ol>
  </div>` : ''}

  ${latestNoticesCard()}

  <div class="grid-2">
    <div class="card">
      <div class="card-head"><h3>${t('dash.byGrade')}</h3><span class="muted">${fmtNum(S.length)} ${t('c.students')}</span></div>
      <div class="barchart" role="img" aria-label="${t('dash.byGrade')}: ${byGrade.map((x) => `${gradeLabel(x.g)} ${x.n}`).join(', ')}">
        <div class="bc-grid">${[1, 0.5, 0].map((f) => `<div><span>${Math.round(niceMax * f)}</span></div>`).join('')}</div>
        <div class="bc-bars">
          ${byGrade.map((x) => `
            <div class="bc-col" tabindex="0" data-tip="${gradeLabel(x.g)}: ${x.n} ${t('c.students')} · ${x.k} ${t('c.class').toLowerCase()}">
              <span class="bc-val">${x.n}</span>
              <div class="bc-bar" style="height:${(x.n / niceMax) * 100}%"></div>
            </div>`).join('')}
        </div>
        <div class="bc-axis">${byGrade.map((x) => `<span>${gradeLabel(x.g)}</span>`).join('')}</div>
      </div>
    </div>

    <div class="card">
      <div class="card-head"><h3>${t('dash.rankDist')} · ${t('c.sem1')}</h3><a class="link" href="#grades">${t('nav.grades')} <i class="fa-solid fa-arrow-right"></i></a></div>
      <div class="meter-big"><b>${graded}/${S.length}</b><span class="muted">${t('dash.graded')}</span></div>
      <div class="meter" role="progressbar" aria-valuenow="${S.length ? Math.round((graded / S.length) * 100) : 0}" aria-valuemin="0" aria-valuemax="100"><div style="width:${S.length ? (graded / S.length) * 100 : 0}%"></div></div>
      <ul class="fee-split">
        ${RANKS.map(([c, k]) => `<li><span class="badge ${c}">${t(k)}</span><b>${rk[c]}</b><span class="muted">${t('c.students')}</span></li>`).join('')}
      </ul>
    </div>

    <div class="card">
      <div class="card-head"><h3>${t('dash.topStudents')}</h3><a class="link" href="#grades">${t('nav.grades')} <i class="fa-solid fa-arrow-right"></i></a></div>
      <ol class="top-list">
        ${top.map((x, i) => `<li><span class="pos p${i + 1}">${i + 1}</span>${personCell(x.s, className(classById(x.s.classId)))}<span class="score-pill">${fmtScore(x.a)}</span>${rankBadge(x.a)}</li>`).join('') || `<li class="muted">${t('c.noData')}</li>`}
      </ol>
    </div>

    <div class="card">
      <div class="card-head"><h3>${t('dash.events')}</h3><button class="btn sm ghost" data-act="addEvent"><i class="fa-solid fa-plus"></i> ${t('dash.addEvent')}</button></div>
      <ul class="events">
        ${events.map((e) => {
          const [y, m, d] = e.date.split('-');
          return `<li><div class="ev-date"><b>${d}</b><small>${m}/${y}</small></div><span class="ev-name">${esc(e.name)}</span><button class="icon-btn sm danger" data-act="delEvent" data-id="${e.id}" aria-label="${t('c.delete')}"><i class="fa-regular fa-trash-can"></i></button></li>`;
        }).join('') || `<li class="muted">${t('c.noData')}</li>`}
      </ul>
    </div>
  </div>`;
};

// ---------- Học sinh ----------
function filteredStudents() {
  const q = norm(ui.st.q);
  return db.students
    .filter((s) => (!ui.st.cls || s.classId === ui.st.cls) && (!ui.st.gender || s.gender === ui.st.gender) &&
      (!q || norm(`${s.name} ${s.code} ${s.parent} ${s.parentPhone} ${s.phone || ''}`).includes(q)))
    .sort((a, b) => classOrder(a) - classOrder(b) || byName(a, b));
}

function studentList() {
  const list = filteredStudents();
  const pages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
  ui.st.page = Math.min(Math.max(1, ui.st.page), pages);
  const rows = list.slice((ui.st.page - 1) * PAGE_SIZE, ui.st.page * PAGE_SIZE);
  return `<div class="table-wrap"><table class="table">
    <thead><tr><th>${t('c.code')}</th><th>${t('c.name')}</th><th>${t('st.dob')}</th><th>${t('c.class')}</th><th>${t('st.phone')}</th><th>${t('st.parent')}</th><th>${t('acc.email')}</th><th class="right">${t('c.actions')}</th></tr></thead>
    <tbody>${rows.map((s) => `<tr>
      <td class="mono">${esc(s.code)}</td>
      <td>${personCell(s, `${genderLabel(s.gender)} · ${esc(loc(ETHNICS[s.ethnic]))}`)}</td>
      <td>${fmtDate(s.dob)}<small class="block muted">${esc(s.birthplace || '')}</small></td>
      <td><span class="chip">${esc(className(classById(s.classId)))}</span></td>
      <td>${esc(s.phone || '') || '<span class="muted">—</span>'}</td>
      <td>${esc(s.parent)}<small class="block muted">${esc(s.parentPhone)}</small></td>
      <td>${accountCell('student', s.id)}</td>
      <td class="right">${rowActions('Student', s.id)}</td>
    </tr>`).join('') || emptyRow(8)}</tbody>
  </table></div>
  <div class="list-foot"><span class="muted">${t('c.total')}: ${list.length}</span>${pager(list.length, ui.st.page, 'stPage')}</div>`;
}

PAGES.students = () => `
  ${pageHead(t('st.title'), `${db.students.length} ${t('c.students')}`, `
    <button class="btn ghost" data-act="printStudents"><i class="fa-solid fa-print"></i> ${t('st.printList')}</button>
    <button class="btn ghost" data-act="exportStudents"><i class="fa-solid fa-file-export"></i> ${t('c.exportXlsx')}</button>
    <button class="btn ghost" data-act="importStudents"><i class="fa-solid fa-file-excel"></i> ${t('im.btn')}</button>
    <button class="btn primary" data-act="addStudent"><i class="fa-solid fa-plus"></i> ${t('st.add')}</button>`)}
  <div class="card">
    <div class="toolbar">
      <div class="search"><i class="fa-solid fa-magnifying-glass"></i><input type="search" placeholder="${t('c.search')}" value="${esc(ui.st.q)}" data-input="stSearch" aria-label="${t('c.search')}"></div>
      <select data-change="stClass" aria-label="${t('c.class')}">${classOptions(ui.st.cls, true)}</select>
      <select data-change="stGender" aria-label="${t('c.gender')}">${opts([{ v: '', l: `${t('c.gender')}: ${t('c.all')}` }, { v: 'M', l: t('c.male') }, { v: 'F', l: t('c.female') }], ui.st.gender)}</select>
    </div>
    <div id="stList">${studentList()}</div>
  </div>`;

const refreshStudents = () => { const el = $('#stList'); if (el) el.innerHTML = studentList(); };

function studentForm(s) {
  const isNew = !s;
  formModal({
    title: isNew ? t('st.add') : t('st.editTitle'),
    values: s || { code: 'HS' + pad(db.seq.s + 1, 4), gender: 'M', classId: ui.st.cls || (sortedClasses()[0] || {}).id, province: 0, ethnic: 0 },
    fields: [
      { name: 'code', label: t('c.code'), required: true },
      { name: 'name', label: t('c.name'), required: true },
      { name: 'gender', label: t('c.gender'), type: 'select', options: [{ v: 'M', l: t('c.male') }, { v: 'F', l: t('c.female') }] },
      { name: 'dob', label: t('st.dob'), type: 'date' },
      { name: 'classId', label: t('c.class'), type: 'select', required: true, options: sortedClasses().map((c) => ({ v: c.id, l: className(c) })) },
      { name: 'phone', label: t('st.phone'), type: 'tel' },
      { name: 'ethnic', label: t('st.ethnic'), type: 'select', options: ETHNICS.map((e, i) => ({ v: i, l: loc(e) })) },
      { name: 'birthplace', label: t('st.birthplace') },
      { name: 'province', label: t('st.province'), type: 'select', options: PROVINCES.map((p, i) => ({ v: i, l: loc(p) })) },
      { name: 'address', label: t('st.address'), full: true },
      { name: 'parent', label: t('st.parent') },
      { name: 'parentPhone', label: t('st.parentPhone'), type: 'tel' },
    ],
    onSubmit: (v) => {
      if (db.students.some((x) => x.code.toLowerCase() === v.code.toLowerCase() && x !== s)) return `${t('c.code')} "${v.code}" đã tồn tại / ມີແລ້ວ`;
      v.province = Number(v.province);
      v.ethnic = Number(v.ethnic);
      const id = isNew ? nextId('s') : s.id;
      if (isNew) db.students.push({ id, ...v });
      else Object.assign(s, v);
      save();
      toast(t('c.saved'));
      renderView();
      // Quản lý tạo xong hồ sơ → mở luôn form cấp tài khoản cho học sinh
      if (isNew && can('accounts')) setTimeout(() => accountForm(null, { role: 'student', refId: id }), 0);
    },
  });
}

// ---------- Nhập dữ liệu từ Excel (.xlsx/.xls), CSV hoặc dán từ Excel ----------
// Dùng chung cho: danh sách học sinh, danh sách giáo viên, điểm số.

// Thư viện SheetJS chỉ tải khi cần (lần đầu mở file Excel / tải file mẫu)
let xlsxLoading = null;
function loadXlsx() {
  if (window.XLSX) return Promise.resolve(window.XLSX);
  if (!xlsxLoading) {
    xlsxLoading = new Promise((res, rej) => {
      const urls = ['https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js', 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js'];
      const tryNext = (i) => {
        if (i >= urls.length) { xlsxLoading = null; rej(new Error('xlsx')); return; }
        const s = document.createElement('script');
        s.src = urls[i];
        s.onload = () => (window.XLSX ? res(window.XLSX) : tryNext(i + 1));
        s.onerror = () => { s.remove(); tryNext(i + 1); };
        document.head.appendChild(s);
      };
      tryNext(0);
    });
  }
  return xlsxLoading;
}

// Đọc 1 trang tính thành mảng các dòng (chuỗi). Ô ngày → yyyy-mm-dd, ô số giữ nguyên giá trị.
function sheetRows(X, ws) {
  if (!ws || !ws['!ref']) return [];
  const r = X.utils.decode_range(ws['!ref']);
  const rows = [];
  for (let R = r.s.r; R <= r.e.r; R++) {
    const row = [];
    for (let C = r.s.c; C <= r.e.c; C++) {
      const c = ws[X.utils.encode_cell({ r: R, c: C })];
      let v = '';
      if (c && c.v != null) {
        if (c.t === 'd' && c.v instanceof Date) v = isoDate(c.v);
        else if (c.t === 'n' && c.z && X.SSF.is_date(c.z)) {
          const d = X.SSF.parse_date_code(c.v);
          v = d ? `${d.y}-${pad(d.m)}-${pad(d.d)}` : String(c.v);
        } else if (c.t === 'n') v = String(Math.round(c.v * 1e6) / 1e6);
        else if (c.t === 'b') v = c.v ? '1' : '0';
        else v = String(c.w ?? c.v);
      }
      row.push(v.trim());
    }
    rows.push(row);
  }
  return rows.filter((row) => row.some(Boolean));
}

// File mẫu: .xlsx (nếu tải được thư viện), không thì .csv
async function downloadTemplate(name, rows) {
  try {
    const X = await loadXlsx();
    const ws = X.utils.aoa_to_sheet(rows);
    ws['!cols'] = rows[0].map((h, i) => ({ wch: Math.max(10, ...rows.map((r) => String(r[i] ?? '').length + 2)) }));
    const wb = X.utils.book_new();
    X.utils.book_append_sheet(wb, ws, 'Sheet1');
    X.writeFile(wb, name + '.xlsx');
  } catch (e) { downloadCsv(name + '.csv', rows); }
}
// Xuất danh sách / bảng điểm ra Excel (không tải được thư viện thì ra .csv, Excel vẫn mở được)
const exportSheet = (name, rows) => downloadTemplate(name, rows);

// Đọc CSV / TSV (dán từ Excel là phân cách bằng tab), hỗ trợ ô có dấu ngoặc kép
function parseDelimited(text) {
  text = String(text || '').replace(/^﻿/, '');
  const first = text.split(/\r?\n/)[0] || '';
  const cnt = (c) => first.split(c).length - 1;
  const d = cnt('\t') ? '\t' : cnt(';') > cnt(',') ? ';' : ',';
  const rows = [];
  let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch;
    } else if (ch === '"' && cur.trim() === '') { q = true; cur = ''; }
    else if (ch === d) { row.push(cur); cur = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cur); rows.push(row); row = []; cur = '';
    } else cur += ch;
  }
  row.push(cur); rows.push(row);
  return rows.map((r) => r.map((c) => c.trim())).filter((r) => r.some((c) => c));
}

// Nhận diện tiêu đề cột: khớp chính xác trước, sau đó "có chứa" theo thứ tự ưu tiên
const headKey = (h) => norm(h).replace(/[^a-z0-9຀-໿]/g, '');
const makeDetector = (exact, contains) => (h) => {
  const k = headKey(h);
  if (!k) return null;
  const ex = Object.keys(exact).find((f) => exact[f].includes(k));
  if (ex) return ex;
  const c = contains.find(([, keys]) => keys.some((x) => k.includes(x)));
  return c ? c[0] : null;
};
// Tìm dòng tiêu đề trong 6 dòng đầu (dòng nhận ra nhiều cột nhất)
function findHeader(rows, detect, min = 2) {
  let best = { idx: -1, cols: null, n: 0 };
  rows.slice(0, 6).forEach((r, i) => {
    const cols = r.map(detect);
    const n = new Set(cols.filter(Boolean)).size;
    if (n > best.n) best = { idx: i, cols, n };
  });
  return best.n >= min ? best : { idx: -1, cols: null, n: 0 };
}
const rowObj = (r, cols) => { const v = {}; cols.forEach((f, i) => { if (f && r[i] != null && r[i] !== '' && v[f] == null) v[f] = r[i]; }); return v; };

// Ngày sinh: dd/mm/yyyy, d-m-yy, yyyy-mm-dd → yyyy-mm-dd ('' nếu trống, null nếu sai)
function parseDob(v) {
  if (!v) return '';
  const mk = (y, m, d) => {
    const dt = new Date(Number(y), Number(m) - 1, Number(d));
    return dt.getFullYear() === Number(y) && dt.getMonth() === Number(m) - 1 && dt.getDate() === Number(d) ? `${y}-${pad(m)}-${pad(d)}` : null;
  };
  let m = v.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return mk(m[1], m[2], m[3]);
  m = v.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/);
  if (m) return mk(m[3].length === 2 ? (Number(m[3]) > 50 ? '19' : '20') + m[3] : m[3], m[2], m[1]);
  return null;
}
const parseGender = (v) => (/^(nu|f|female|girl|g|ຍິງ|ນາງ)$/.test(norm(v).replace(/[^a-z຀-໿]/g, '')) ? 'F' : 'M');
// Excel hay làm mất số 0 đầu: 2055551234 → 02055551234
const cleanPhone = (v) => { const p = String(v || '').trim(); return /^(20|30)\d{7,8}$/.test(p) ? '0' + p : p; };
const classKey = (v) => { let k = norm(v).replace(/ມ\.?/g, 'm').replace(/\s+/g, '').replace(/[-\\_.]/g, '/'); if (/^\d/.test(k)) k = 'm' + k; return k; };
const findClass = (v) => db.classes.find((c) => classKey(c.name) === classKey(v));
// Tên môn trong file: khớp mã / tên VI / tên LO, thêm vài tên gọi khác thường gặp
const SUBJECT_ALIAS = {
  lao: ['nguvan', 'nguvanlao', 'vanlao', 'tienglao', 'ngonnguvanhoclao', 'ngonnguvanhoc', 'van', 'ພາສາລາວ'],
  math: ['toan', 'ຄະນິດ'],
  sci: ['khtn', 'khoahoc', 'ວິທະຍາສາດ'],
  phys: ['ly', 'vatli'],
  chem: ['hoa'],
  bio: ['sinh'],
  civ: ['gdcd', 'congdan'],
  geo: ['dia', 'diali'],
  hist: ['su'],
  it: ['tinhoc', 'ict', 'ໄອທີ'],
  eng: ['anh', 'anhvan', 'english'],
  art: ['amnhac', 'mythuat', 'art'],
  pe: ['theduc', 'klht', 'khoiluong', 'ພະລະ'],
  conduct: ['phamchat', 'hanhkiem', 'chuyencan', 'ຄຸນສົມບັດ'],
};
const findSubject = (v, withConduct = false) => {
  const k = headKey(v);
  if (!k) return null;
  const list = withConduct ? [...SUBJECTS, CONDUCT] : SUBJECTS;
  return list.find((s) => [s.id, s.vi, s.lo].some((x) => headKey(x) === k)) ||
    list.find((s) => (SUBJECT_ALIAS[s.id] || []).includes(k)) || null;
};
const isActive = (r) => r.status === 'new' || r.status === 'upd' || r.status === 'ok';

const IMPORT_BADGE = { new: ['good', 'im.st.new'], upd: ['info', 'im.st.upd'], ok: ['good', 'im.st.ok'], skip: ['warn', 'im.st.skip'], err: ['bad', 'im.st.err'] };
function importPreview(recs, columns) {
  if (!recs.length) return `<p class="note"><i class="fa-solid fa-circle-info"></i> ${t('im.empty')}</p>`;
  const c = {};
  recs.forEach((r) => { c[r.status] = (c[r.status] || 0) + 1; });
  const MAX = 300;
  return `<div class="chips-row">${Object.keys(IMPORT_BADGE).filter((k) => c[k]).map((k) => `<span class="badge ${IMPORT_BADGE[k][0]}">${t(IMPORT_BADGE[k][1])}: ${c[k]}</span>`).join('')}</div>
  <div class="table-wrap" style="max-height:320px;overflow:auto"><table class="table compact">
    <thead><tr><th>#</th><th>${t('im.status')}</th>${columns.map((col) => `<th>${col.h}</th>`).join('')}<th>${t('im.note')}</th></tr></thead>
    <tbody>${recs.slice(0, MAX).map((r, i) => `<tr>
      <td class="muted">${r.line || i + 1}</td><td><span class="badge ${IMPORT_BADGE[r.status][0]}">${t(IMPORT_BADGE[r.status][1])}</span></td>
      ${columns.map((col) => `<td>${col.v(r)}</td>`).join('')}
      <td class="muted">${esc(r.notes.join(' · '))}</td></tr>`).join('')}</tbody>
  </table></div>
  ${recs.length > MAX ? `<p class="note">${t('im.more', { n: recs.length - MAX })}</p>` : ''}`;
}

// Hộp thoại nhập dùng chung
// cfg: { title, help, cols (tên cột hiển thị), placeholder, controls, template: () => {name, rows}, build(rows, m) → recs | {error}, columns, doLabel, commit(recs) → thông báo }
function importDialog(cfg) {
  const m = openModal({
    title: cfg.title,
    wide: true,
    body: `
      <p class="alert info"><i class="fa-solid fa-circle-info"></i> <span>${cfg.help}${cfg.cols ? `<br><b>${cfg.cols.map(esc).join(' · ')}</b>` : ''}</span></p>
      <div class="toolbar">
        <button class="btn ghost" data-imp-template><i class="fa-solid fa-file-arrow-down"></i> ${t('im.template')}</button>
        <label class="btn ghost file-btn"><i class="fa-solid fa-file-excel"></i> ${t('im.file')}<input type="file" accept=".xlsx,.xls,.xlsm,.ods,.csv,.txt,.tsv" data-imp-file hidden></label>
        <select data-imp-sheet hidden aria-label="${t('im.sheet')}"></select>
        ${cfg.controls || ''}
      </div>
      <p class="chips-row" data-imp-fname hidden></p>
      <label class="field full"><span>${t('im.paste')}</span><textarea rows="5" data-imp-text placeholder="${esc(cfg.placeholder || '')}"></textarea></label>
      <div data-imp-preview style="margin-top:12px"></div>`,
    foot: `<button class="btn ghost" data-close>${t('c.cancel')}</button><button class="btn primary" data-imp-go disabled><i class="fa-solid fa-file-import"></i> <span>${t(cfg.doLabel || 'im.doRows', { n: 0 })}</span></button>`,
  });
  const ta = $('[data-imp-text]', m), prev = $('[data-imp-preview]', m), go = $('[data-imp-go]', m);
  const sheetSel = $('[data-imp-sheet]', m), fname = $('[data-imp-fname]', m);
  let recs = [], timer = 0, fileRows = null, wb = null, X = null;
  const refresh = () => {
    const src = fileRows || parseDelimited(ta.value);
    if (!fileRows && !ta.value.trim()) { recs = []; prev.innerHTML = ''; }
    else {
      const res = cfg.build(src, m);
      if (res && res.error) { recs = []; prev.innerHTML = `<p class="alert warn"><i class="fa-solid fa-triangle-exclamation"></i> ${esc(res.error)}</p>`; }
      else { recs = res; prev.innerHTML = importPreview(recs, cfg.columns); }
    }
    const n = recs.filter(isActive).length;
    go.disabled = !n;
    $('span', go).textContent = t(cfg.doLabel || 'im.doRows', { n });
  };
  const clearFile = () => { fileRows = null; wb = null; sheetSel.hidden = true; fname.hidden = true; };
  ta.addEventListener('input', () => { if (fileRows) clearFile(); clearTimeout(timer); timer = setTimeout(refresh, 250); });
  m.addEventListener('change', (e) => { if (e.target.matches('[data-imp-opt]')) refresh(); });
  sheetSel.addEventListener('change', () => { if (wb) { fileRows = sheetRows(X, wb.Sheets[sheetSel.value]); refresh(); } });
  $('[data-imp-file]', m).addEventListener('change', (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    const showName = () => { fname.hidden = false; fname.innerHTML = `<span class="chip"><i class="fa-solid fa-file-excel"></i> ${esc(file.name)}</span>`; };
    const r = new FileReader();
    if (/\.(xlsx|xlsm|xls|ods)$/i.test(file.name)) {
      r.onload = () => {
        loadXlsx().then((lib) => {
          X = lib;
          try { wb = X.read(new Uint8Array(r.result), { type: 'array', cellNF: true }); } catch (err) { toast(t('im.badFile'), 'error'); return; }
          sheetSel.innerHTML = opts(wb.SheetNames.map((n) => ({ v: n, l: `${t('im.sheet')}: ${n}` })), wb.SheetNames[0]);
          sheetSel.hidden = wb.SheetNames.length < 2;
          fileRows = sheetRows(X, wb.Sheets[wb.SheetNames[0]]);
          ta.value = '';
          showName();
          refresh();
        }).catch(() => toast(t('im.xlsxFail'), 'error'));
      };
      r.readAsArrayBuffer(file);
    } else {
      r.onload = () => { clearFile(); ta.value = r.result; showName(); refresh(); };
      r.readAsText(file, 'utf-8');
    }
  });
  $('[data-imp-template]', m).addEventListener('click', () => { const tp = cfg.template(); downloadTemplate(tp.name, tp.rows); });
  go.addEventListener('click', () => {
    const msg = cfg.commit(recs.filter(isActive));
    closeModal();
    toast(msg);
    renderView();
  });
  setTimeout(() => ta.focus(), 60);
  return m;
}

// ===== 1. Học sinh =====
const IMPORT_ORDER = ['code', 'name', 'gender', 'dob', 'class', 'phone', 'birthplace', 'address', 'parent', 'parentPhone'];
const detectStudentCol = makeDetector({
  code: ['ma', 'mahs', 'mahocsinh', 'code', 'id', 'ລະຫັດ'],
  name: ['ten', 'hoten', 'hovaten', 'name', 'fullname', 'ຊື່', 'ຊື່ແລະນາມສະກຸນ'],
  gender: ['gioitinh', 'gender', 'sex', 'phai', 'ເພດ'],
  dob: ['ngaysinh', 'ngaythangnamsinh', 'dob', 'birthday', 'ວັນເດືອນປີເກີດ'],
  class: ['lop', 'class', 'ຫ້ອງ'],
  phone: ['sdths', 'sdthocsinh', 'dienthoaihocsinh', 'studentphone', 'ເບີໂທນັກຮຽນ'],
  birthplace: ['noisinh', 'quequan', 'birthplace', 'placeofbirth', 'ບ່ອນເກີດ'],
  address: ['diachi', 'diachihientai', 'address', 'ທີ່ຢູ່', 'ທີ່ຢູ່ປັດຈຸບັນ'],
  parent: ['phuhuynh', 'tenphuhuynh', 'parent', 'ຜູ້ປົກຄອງ'],
  parentPhone: ['sdt', 'sdtph', 'sdtphuhuynh', 'phone', 'tel', 'ເບີໂທ', 'ເບີໂທຜູ້ປົກຄອງ'],
}, [
  // Thứ tự quan trọng: "SĐT phụ huynh" phải nhận trước "phụ huynh", "Nơi sinh" trước "Ngày sinh"
  ['parentPhone', ['sdtph', 'sdtphuhuynh', 'dienthoaiphuhuynh', 'parentphone', 'phoneparent', 'ເບີໂທຜູ້ປົກຄອງ']],
  ['phone', ['sdths', 'sdthocsinh', 'dienthoaihocsinh', 'studentphone', 'ເບີໂທນັກຮຽນ']],
  ['parentPhone', ['sdt', 'sodienthoai', 'dienthoai', 'phone', 'tel', 'ເບີ']],
  ['parent', ['phuhuynh', 'parent', 'chame', 'ຜູ້ປົກຄອງ']],
  ['code', ['mahs', 'mahocsinh', 'code', 'ລະຫັດ']],
  ['birthplace', ['noisinh', 'quequan', 'birthplace', 'ບ່ອນເກີດ']],
  ['dob', ['ngaysinh', 'birth', 'ວັນເດືອນ']],
  ['gender', ['gioitinh', 'gender', 'ເພດ']],
  ['class', ['lop', 'class', 'ຫ້ອງ']],
  ['address', ['diachi', 'address', 'ທີ່ຢູ່']],
  ['name', ['hoten', 'ten', 'name', 'ຊື່']],
]);

// lockClass: giáo viên chủ nhiệm nhập → chỉ cập nhật học sinh đã có trong lớp của mình
function buildImport(rows, defClass, allowUpdate, lockClass = '') {
  if (!rows.length) return [];
  let { idx, cols } = findHeader(rows, detectStudentCol);
  if (idx < 0 && rows[0].length === 1 && detectStudentCol(rows[0][0])) { idx = 0; cols = [detectStudentCol(rows[0][0])]; }
  if (idx < 0) {
    // Không có tiêu đề: 2 cột = tên + SĐT, 3 cột = tên + phụ huynh + SĐT, còn lại theo thứ tự file mẫu
    const w = Math.max(...rows.map((r) => r.length));
    cols = w === 1 ? ['name'] : w === 2 ? ['name', 'parentPhone'] : w === 3 ? ['name', 'parent', 'parentPhone'] : IMPORT_ORDER;
  }
  const seenCodes = new Set();
  return rows.slice(idx + 1).map((r, i) => {
    const v = rowObj(r, cols);
    const rec = { raw: v, notes: [], status: 'new', line: idx + i + 2 };
    const cls = lockClass ? classById(lockClass) : v.class ? findClass(v.class) : classById(defClass);
    rec.val = {
      code: (v.code || '').trim(), name: (v.name || '').replace(/\s+/g, ' ').trim(),
      gender: v.gender ? parseGender(v.gender) : null, classId: cls ? cls.id : '',
      phone: cleanPhone(v.phone), birthplace: v.birthplace || '',
      address: v.address || '', parent: v.parent || '', parentPhone: cleanPhone(v.parentPhone),
    };
    if (lockClass && v.class && findClass(v.class) !== cls) { rec.status = 'err'; rec.notes.push(t('im.hr.otherClass', { c: className(cls) })); }
    const dob = parseDob(v.dob);
    if (dob === null) rec.notes.push(t('im.badDate', { v: v.dob }));
    rec.val.dob = dob || '';
    if (!rec.val.name) { rec.status = 'err'; rec.notes.push(t('im.noName')); }
    if (!cls) { rec.status = 'err'; rec.notes.push(v.class ? t('im.noClass', { v: v.class }) : t('im.pickClass')); }
    const code = rec.val.code.toLowerCase();
    if (code && seenCodes.has(code)) { rec.status = 'err'; rec.notes.push(t('im.dupCode')); }
    if (code) seenCodes.add(code);
    if (rec.status !== 'err') {
      // Học sinh đã có: trùng mã, hoặc (không có mã) trùng tên trong cùng lớp
      let ex = code ? db.students.find((s) => s.code.toLowerCase() === code) : null;
      if (!ex && !code) {
        const same = db.students.filter((s) => s.classId === rec.val.classId && norm(s.name) === norm(rec.val.name));
        if (same.length === 1) ex = same[0];
      }
      if (ex && lockClass && ex.classId !== lockClass) { rec.status = 'err'; rec.notes.push(t('im.hr.otherClass', { c: className(cls) })); }
      else if (ex) { rec.target = ex; rec.status = allowUpdate ? 'upd' : 'skip'; }
      else if (lockClass) { rec.status = 'skip'; rec.notes.push(t('im.hr.onlyUpdate')); }
    }
    return rec;
  });
}

function commitImport(recs) {
  let added = 0, updated = 0, n = db.seq.s;
  const fileCodes = new Set(recs.map((r) => r.val.code.toLowerCase()).filter(Boolean));
  const codeTaken = (c) => fileCodes.has(c.toLowerCase()) || db.students.some((s) => s.code.toLowerCase() === c.toLowerCase());
  recs.forEach((r) => {
    const v = r.val;
    if (r.status === 'upd') {
      // Chỉ ghi đè những ô có dữ liệu trong file
      ['name', 'dob', 'phone', 'birthplace', 'address', 'parent', 'parentPhone'].forEach((k) => { if (v[k]) r.target[k] = v[k]; });
      if (v.gender) r.target.gender = v.gender;
      if (r.raw.class) r.target.classId = v.classId;
      updated++;
    } else if (r.status === 'new') {
      let code = v.code;
      if (!code) { do { code = 'HS' + pad(++n, 4); } while (codeTaken(code)); }
      db.students.push({ id: nextId('s'), code, name: v.name, gender: v.gender || 'M', dob: v.dob, classId: v.classId, ethnic: 0, province: 0, phone: v.phone, birthplace: v.birthplace, address: v.address, parent: v.parent, parentPhone: v.parentPhone });
      added++;
    }
  });
  save();
  return { added, updated };
}

const studentCols = () => [t('c.code'), t('c.name'), t('c.gender'), t('st.dob'), t('c.class'), t('st.phone'), t('st.birthplace'), t('st.address'), t('st.parent'), t('st.parentPhone')];
const studentRow = (s) => [s.code, s.name, genderLabel(s.gender), fmtDate(s.dob), className(classById(s.classId)), s.phone || '', s.birthplace || '', s.address || '', s.parent || '', s.parentPhone || ''];

// lockClass: giáo viên chủ nhiệm cập nhật thông tin học sinh lớp mình
function importStudents(lockClass = '') {
  if (lockClass ? !isHomeroomOf(lockClass) : !can('students')) return toast(t('c.noPerm'), 'error');
  const cols = studentCols();
  const lc = classById(lockClass);
  const m = importDialog({
    title: lc ? `${t('im.title')} · ${className(lc)}` : t('im.title'),
    help: lc ? t('im.hr.help') : t('im.help'),
    cols,
    placeholder: t('im.placeholder'),
    controls: lc ? `<label class="check"><input type="checkbox" data-imp-opt data-imp-update checked> ${t('im.update')}</label>`
      : `<select data-imp-opt data-imp-class aria-label="${t('im.defClass')}"><option value="">${t('im.defClass')}: —</option>${classOptions(ui.st.cls || '', false)}</select>
      <label class="check"><input type="checkbox" data-imp-opt data-imp-update checked> ${t('im.update')}</label>`,
    // Chủ nhiệm: file mẫu là danh sách lớp hiện có; quản lý: 2 dòng ví dụ
    template: () => (lc
      ? { name: `thong-tin-hs-${lc.name.replace('/', '-')}`, rows: [cols, ...studentsOf(lc.id).map(studentRow)] }
      : { name: 'mau-nhap-hoc-sinh', rows: [
        cols,
        ['HS0001', 'Souksavanh Phommachan', t('c.male'), '15/03/2014', 'M1/1', '020 7777 1234', 'Thủ đô Viêng Chăn', 'Bản Phôn Xay, Xaysettha', 'Bounmy Phommachan', '020 5555 1234'],
        ['', 'Noy Keomany', t('c.female'), '02/09/2014', 'M1/1', '', 'Luông Pha Băng', 'Bản Sikhay, Sikhottabong', 'Khamla Keomany', '020 9999 8888'],
      ] }),
    build: (rows, el) => buildImport(rows, lc ? lc.id : $('[data-imp-class]', el).value, $('[data-imp-update]', el).checked, lockClass),
    columns: [
      { h: t('c.code'), v: (r) => `<span class="mono">${esc(r.val.code || (r.target ? r.target.code : '')) || `<span class="muted">${t('im.auto')}</span>`}</span>` },
      { h: t('c.name'), v: (r) => `<b>${esc(r.val.name)}</b>` },
      { h: t('c.gender'), v: (r) => (r.val.gender ? genderLabel(r.val.gender) : '') },
      { h: t('st.dob'), v: (r) => fmtDate(r.val.dob) },
      { h: t('c.class'), v: (r) => esc(className(classById(r.val.classId))) },
      { h: t('st.phone'), v: (r) => esc(r.val.phone) },
      { h: t('st.birthplace'), v: (r) => esc(r.val.birthplace) },
      { h: t('st.address'), v: (r) => esc(r.val.address) },
      { h: t('st.parent'), v: (r) => esc(r.val.parent) },
      { h: t('st.parentPhone'), v: (r) => esc(r.val.parentPhone) },
    ],
    doLabel: 'im.do',
    commit: (recs) => { const { added, updated } = commitImport(recs); return t('im.done', { a: added, b: updated }); },
  });
  if (!lc && !ui.st.cls) $('[data-imp-class]', m).value = '';
}

// In danh sách học sinh (đầy đủ thông tin cá nhân — chỉ người có quyền xem)
function printStudentList(list, title, sub, signers) {
  printDoc(title, sub, `<table class="table compact">
    <thead><tr><th>#</th>${studentCols().map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead>
    <tbody>${list.map((s, i) => `<tr><td>${i + 1}</td>${studentRow(s).map((v) => `<td>${esc(v)}</td>`).join('')}</tr>`).join('')}</tbody>
  </table>`, signers);
}

// ===== 2. Giáo viên =====
const TEACHER_ORDER = ['code', 'name', 'gender', 'dob', 'phone', 'address', 'birthplace', 'subject', 'degree', 'gradSchool', 'startYear', 'email'];
const detectTeacherCol = makeDetector({
  code: ['ma', 'magv', 'magiaovien', 'code', 'id', 'ລະຫັດ'],
  name: ['ten', 'hoten', 'hovaten', 'name', 'fullname', 'ຊື່', 'ຊື່ແລະນາມສະກຸນ'],
  gender: ['gioitinh', 'gender', 'sex', 'phai', 'ເພດ'],
  dob: ['ngaysinh', 'ngaythangnamsinh', 'dob', 'birthday', 'ວັນເດືອນປີເກີດ'],
  birthplace: ['noisinh', 'quequan', 'birthplace', 'placeofbirth', 'ບ່ອນເກີດ'],
  address: ['diachi', 'diachihientai', 'address', 'ທີ່ຢູ່', 'ທີ່ຢູ່ປັດຈຸບັນ'],
  subject: ['mon', 'monday', 'monhoc', 'dangdaymon', 'subject', 'ວິຊາ', 'ສອນວິຊາ'],
  degree: ['trinhdo', 'bangcap', 'hocvi', 'degree', 'ວຸດທິ', 'ລະດັບການສຶກສາ'],
  gradSchool: ['totnghiep', 'truongtotnghiep', 'graduated', 'graduation', 'ຈົບຈາກ'],
  startYear: ['namvaonghe', 'namcongtac', 'nambatdau', 'namvaotruong', 'startyear', 'nam'],
  phone: ['sdt', 'phone', 'tel', 'dienthoai', 'ເບີໂທ'],
  email: ['email', 'mail', 'ອີເມວ'],
}, [
  ['phone', ['sdt', 'sodienthoai', 'dienthoai', 'phone', 'tel', 'ເບີ']],
  ['email', ['email', 'mail', 'ອີເມວ']],
  ['code', ['magv', 'magiaovien', 'code', 'ລະຫັດ']],
  ['gradSchool', ['totnghiep', 'graduat', 'ຈົບ']],
  ['degree', ['trinhdo', 'bangcap', 'hocvi', 'degree', 'ວຸດທິ']],
  ['startYear', ['namvao', 'namcongtac', 'nambatdau', 'start', 'ປີເລີ່ມ', 'ປີເຂົ້າ']],
  ['birthplace', ['noisinh', 'quequan', 'birthplace', 'ບ່ອນເກີດ']],
  ['dob', ['ngaysinh', 'birth', 'ວັນເດືອນ']],
  ['address', ['diachi', 'address', 'ທີ່ຢູ່']],
  ['subject', ['monday', 'monhoc', 'subject', 'ວິຊາ']],
  ['gender', ['gioitinh', 'gender', 'ເພດ']],
  ['name', ['hoten', 'ten', 'name', 'ຊື່']],
]);
function parseDegree(v) {
  if (!v) return null;
  const k = headKey(v);
  const i = DEGREES.findIndex((d) => headKey(d.vi) === k || headKey(d.lo) === k);
  if (i >= 0) return i;
  if (/tiensi|phd|ປະລິນຍາເອກ|^ts$/.test(k)) return 3;
  if (/thacsi|master|ປະລິນຍາໂທ|^ths$/.test(k)) return 2;
  if (/cunhan|daihoc|bachelor|ປະລິນຍາຕີ|^cn$/.test(k)) return 1;
  if (/caodang|trungcap|ຊັ້ນສູງ|ຊັ້ນກາງ/.test(k)) return 0;
  return null;
}

function buildTeacherImport(rows, defSub, allowUpdate) {
  if (!rows.length) return [];
  let { idx, cols } = findHeader(rows, detectTeacherCol);
  if (idx < 0) {
    const w = Math.max(...rows.map((r) => r.length));
    cols = w === 1 ? ['name'] : w === 2 ? ['name', 'phone'] : w === 3 ? ['name', 'subject', 'phone'] : TEACHER_ORDER;
  }
  const seen = new Set();
  return rows.slice(idx + 1).map((r, i) => {
    const v = rowObj(r, cols);
    const rec = { raw: v, notes: [], status: 'new', line: idx + i + 2 };
    const sub = v.subject ? findSubject(v.subject) : subjectById(defSub);
    const deg = parseDegree(v.degree);
    const yr = Number(String(v.startYear || '').replace(/\D/g, ''));
    rec.val = {
      code: (v.code || '').trim(), name: (v.name || '').replace(/\s+/g, ' ').trim(),
      gender: v.gender ? parseGender(v.gender) : null, subject: sub ? sub.id : '',
      degree: deg, startYear: yr >= 1950 && yr <= 2100 ? yr : null,
      phone: cleanPhone(v.phone), email: (v.email || '').trim(),
      address: v.address || '', birthplace: v.birthplace || '', gradSchool: v.gradSchool || '',
    };
    const dob = parseDob(v.dob);
    if (dob === null) rec.notes.push(t('im.badDate', { v: v.dob }));
    rec.val.dob = dob || '';
    if (v.degree && deg == null) rec.notes.push(t('im.badDegree', { v: v.degree }));
    if (v.startYear && rec.val.startYear == null) rec.notes.push(t('im.badYear', { v: v.startYear }));
    if (!rec.val.name) { rec.status = 'err'; rec.notes.push(t('im.noName')); }
    if (!sub) { rec.status = 'err'; rec.notes.push(t('im.noSubject', { v: v.subject })); }
    const code = rec.val.code.toLowerCase();
    if (code && seen.has(code)) { rec.status = 'err'; rec.notes.push(t('im.dupCode')); }
    if (code) seen.add(code);
    if (rec.status !== 'err') {
      let ex = code ? db.teachers.find((x) => x.code.toLowerCase() === code) : null;
      if (!ex && !code) {
        const same = db.teachers.filter((x) => norm(x.name) === norm(rec.val.name));
        if (same.length === 1) ex = same[0];
      }
      if (ex) { rec.target = ex; rec.status = allowUpdate ? 'upd' : 'skip'; }
    }
    return rec;
  });
}

function commitTeacherImport(recs) {
  let added = 0, updated = 0, n = db.seq.t;
  const fileCodes = new Set(recs.map((r) => r.val.code.toLowerCase()).filter(Boolean));
  const codeTaken = (c) => fileCodes.has(c.toLowerCase()) || db.teachers.some((x) => x.code.toLowerCase() === c.toLowerCase());
  recs.forEach((r) => {
    const v = r.val;
    if (r.status === 'upd') {
      ['name', 'phone', 'email', 'dob', 'address', 'birthplace', 'gradSchool'].forEach((k) => { if (v[k]) r.target[k] = v[k]; });
      if (v.gender) r.target.gender = v.gender;
      if (r.raw.subject) r.target.subject = v.subject;
      if (v.degree != null) r.target.degree = v.degree;
      if (v.startYear != null) r.target.startYear = v.startYear;
      updated++;
    } else {
      let code = v.code;
      if (!code) { do { code = 'GV' + pad(++n, 3); } while (codeTaken(code)); }
      db.teachers.push({ id: nextId('t'), code, name: v.name, gender: v.gender || 'F', dob: v.dob, subject: v.subject, degree: v.degree ?? 1, gradSchool: v.gradSchool, startYear: v.startYear, phone: v.phone, email: v.email, address: v.address, birthplace: v.birthplace });
      added++;
    }
  });
  save();
  return t('im.tc.done', { a: added, b: updated });
}

const teacherCols = () => [t('c.code'), t('c.name'), t('c.gender'), t('st.dob'), t('c.phone'), t('st.address'), t('st.birthplace'), t('tc.teaching'), t('tc.degree'), t('tc.gradSchool'), t('tc.startYear'), t('c.email')];
const teacherRow = (x) => [x.code, x.name, genderLabel(x.gender), fmtDate(x.dob), x.phone || '', x.address || '', x.birthplace || '', loc(subjectById(x.subject)), loc(DEGREES[x.degree]), x.gradSchool || '', x.startYear || '', x.email || ''];

function importTeachers() {
  if (!can('teachers')) return toast(t('c.noPerm'), 'error');
  const cols = teacherCols();
  importDialog({
    title: t('im.tc.title'),
    help: t('im.tc.help'),
    cols,
    placeholder: t('im.tc.placeholder'),
    controls: `<select data-imp-opt data-imp-sub aria-label="${t('im.defSubject')}">${opts(SUBJECTS.map((s) => ({ v: s.id, l: `${t('im.defSubject')}: ${loc(s)}` })), ui.tc.sub || 'math')}</select>
      <label class="check"><input type="checkbox" data-imp-opt data-imp-update checked> ${t('im.tc.update')}</label>`,
    template: () => ({ name: 'mau-nhap-giao-vien', rows: [
      cols,
      ['GV001', 'Vilayvanh Sengdara', t('c.female'), '12/04/1990', '020 2222 3333', 'Bản Nongbone, Xaysettha', 'Chămpasắc', loc(subjectById('math')), loc(DEGREES[1]), 'Đại học Quốc gia Lào – Toán', 2015, 'vilayvanh@gmail.com'],
      ['', 'Somphone Inthavong', t('c.male'), '03/11/1985', '020 4444 5555', 'Bản Dongdok, Xaythany', 'Luông Pha Băng', loc(subjectById('lao')), loc(DEGREES[2]), 'Cao đẳng Sư phạm Dongkhamxang', 2010, ''],
    ] }),
    build: (rows, el) => buildTeacherImport(rows, $('[data-imp-sub]', el).value, $('[data-imp-update]', el).checked),
    columns: [
      { h: t('c.code'), v: (r) => `<span class="mono">${esc(r.val.code || (r.target ? r.target.code : '')) || `<span class="muted">${t('im.auto')}</span>`}</span>` },
      { h: t('c.name'), v: (r) => `<b>${esc(r.val.name)}</b>` },
      { h: t('c.gender'), v: (r) => (r.val.gender ? genderLabel(r.val.gender) : '') },
      { h: t('st.dob'), v: (r) => fmtDate(r.val.dob) },
      { h: t('c.phone'), v: (r) => esc(r.val.phone) },
      { h: t('st.address'), v: (r) => esc(r.val.address) },
      { h: t('st.birthplace'), v: (r) => esc(r.val.birthplace) },
      { h: t('tc.teaching'), v: (r) => esc(loc(subjectById(r.val.subject))) },
      { h: t('tc.degree'), v: (r) => (r.val.degree != null ? esc(loc(DEGREES[r.val.degree])) : '') },
      { h: t('tc.gradSchool'), v: (r) => esc(r.val.gradSchool) },
      { h: t('tc.startYear'), v: (r) => r.val.startYear || '' },
      { h: t('c.email'), v: (r) => esc(r.val.email) },
    ],
    doLabel: 'im.tc.do',
    commit: commitTeacherImport,
  });
}

// ===== 3. Điểm số (theo lớp + học kỳ đang chọn ở trang Điểm số) =====
// Cột tháng: "T9", "Tháng 9", "Thi T9", "ດ.9", "ເດືອນ 9" → bài thi tháng tương ứng của học kỳ; "Lần 1".."Lần 4" → bài 1..4
function gradeColOf(h, sem, cid) {
  const k = headKey(h);
  if (!k) return null;
  if (['ma', 'mahs', 'mahocsinh', 'code', 'id', 'ລະຫັດ'].includes(k) || k.includes('mahs')) return 'code';
  if (['mon', 'monhoc', 'subject', 'ວິຊາ'].includes(k) || /monhoc|subject|ວິຊາ/.test(k)) return 'subject';
  if (/^(stt|tt|no)$|trungbinh|^tb|diemhk|diemhocky|xeploai|rank|avg|average|ສະເລ່ຍ|ລະດັບ|^hang$|position|ອັນດັບ|canam|ທັງປີ/.test(k)) return null;
  if (/thihk|thihocky|giuaky|giuaki|cuoiky|cuoiki|midterm|exam|final|ເສັງພາກ|ສອບເສັງພາກຮຽນ|ເສັງກາງ|ເສັງທ້າຍ/.test(k) || ['hk', 'hocky', 'ພາກຮຽນ'].includes(k)) return 'exam';
  const mm = k.match(/^(?:diem)?(?:thi|kiemtra|ສອບເສັງ)?(t|thang|lan|bai|m|ດ|ເດືອນ)(\d{1,2})$/);
  if (mm) {
    const n = Number(mm[2]);
    const months = planOf(cid, sem).months;
    if (!['lan', 'bai', 'm'].includes(mm[1]) && months.includes(n)) return MONTH_PARTS[months.indexOf(n)];
    if (['lan', 'bai', 'm'].includes(mm[1]) && n >= 1 && n <= months.length) return MONTH_PARTS[n - 1];
    return { bad: h };
  }
  if (['ten', 'hoten', 'hovaten', 'name', 'fullname', 'ຊື່', 'ຊື່ແລະນາມສະກຸນ'].includes(k) || /hoten|hovaten|^ten|name|ຊື່/.test(k)) return 'name';
  return null;
}

function buildGradeImport(rows, ctx) {
  if (!rows.length) return [];
  const parts = partsOf(ctx.cls, ctx.sem);
  const detect = (h) => { const c = gradeColOf(h, ctx.sem, ctx.cls); return typeof c === 'string' ? c : null; };
  let { idx, cols } = findHeader(rows, detect);
  const notesHead = [];
  if (idx >= 0) rows[idx].forEach((h) => { const c = gradeColOf(h, ctx.sem, ctx.cls); if (c && c.bad) notesHead.push(t('im.badMonth', { v: c.bad })); });
  else {
    const w = Math.max(...rows.map((r) => r.length));
    if (w === parts.length + 2) cols = ['code', 'name', ...parts];
    else if (w === parts.length + 1) cols = ['name', ...parts];
    else return { error: t('im.gr.noCols') };
  }
  if (!cols.some((c) => parts.includes(c))) return { error: t('im.gr.noCols') };
  if (!cols.includes('code') && !cols.includes('name')) return { error: t('im.gr.noStudentCol') };
  const list = studentsOf(ctx.cls);
  const allowed = new Set(ctx.subs.map((s) => s.id));
  const recs = rows.slice(idx + 1).map((r, i) => {
    const v = rowObj(r, cols);
    const rec = { notes: [], status: 'ok', line: idx + i + 2, vals: {}, name: v.name || '', code: v.code || '' };
    // Học sinh: theo mã, không có mã thì theo tên (trong lớp đang chọn)
    let st = null;
    if (v.code) {
      st = list.find((s) => s.code.toLowerCase() === String(v.code).toLowerCase());
      if (!st) rec.notes.push(db.students.some((s) => s.code.toLowerCase() === String(v.code).toLowerCase()) ? t('im.notInClass') : t('im.noStudent'));
    } else if (v.name) {
      const same = list.filter((s) => norm(s.name) === norm(v.name));
      if (same.length === 1) st = same[0];
      else rec.notes.push(same.length ? t('im.ambiguous') : t('im.noStudent'));
    } else rec.notes.push(t('im.noName'));
    rec.student = st;
    // Môn: cột "Môn" nếu có, không thì môn đang chọn
    const sub = v.subject ? findSubject(v.subject, true) : subjectById(ctx.sub);
    rec.sub = sub;
    if (!sub) rec.notes.push(t('im.noSubject', { v: v.subject }));
    else if (!allowed.has(sub.id)) { rec.notes.push(t('im.noPermSub', { v: loc(sub) })); rec.sub = null; }
    parts.forEach((p) => {
      if (v[p] == null) return;
      // Môn không có bài này theo chương trình của khối (VD: Lịch sử không thi giữa kỳ)
      if (rec.sub && (p === 'exam' ? !hasExam(ctx.cls, rec.sub.id) : !hasMonth(ctx.cls, rec.sub.id))) {
        rec.notes.push(t('im.gr.partNA', { s: loc(rec.sub), p: partLabel(p, ctx.sem, ctx.cls) }));
        return;
      }
      const n = Number(String(v[p]).replace(',', '.'));
      if (!isFinite(n) || n < 0 || n > 10) rec.notes.push(t('im.badScore', { v: v[p] }));
      else rec.vals[p] = Math.round(n * 100) / 100;
    });
    if (!st || !rec.sub) rec.status = 'err';
    else if (!Object.keys(rec.vals).length) { rec.status = 'skip'; rec.notes.push(t('im.noScore')); }
    return rec;
  });
  if (notesHead.length && recs.length) recs[0].notes.unshift(...notesHead);
  return recs;
}

function commitGradeImport(recs, sem) {
  let cells = 0;
  const who = new Set();
  recs.forEach((r) => {
    const key = `${r.student.id}|${r.sub.id}|${sem}`;
    const g = db.grades[key] || { m1: null, m2: null, m3: null, m4: null, exam: null };
    Object.assign(g, r.vals);
    db.grades[key] = g;
    cells += Object.keys(r.vals).length;
    who.add(r.student.id);
  });
  save();
  return t('im.gr.done', { n: cells, r: who.size });
}

function importGrades() {
  const cls = ui.gr.cls, sem = ui.gr.sem === 'y' ? '1' : ui.gr.sem;
  const subs = mySubjects(cls);
  if (!can('grades') || !subs.length) return toast(t('c.noPerm'), 'error');
  const c = classById(cls);
  const parts = partsOf(cls, sem);
  const heads = () => [t('c.code'), t('c.name'), ...parts.map((p) => partLabel(p, sem, cls))];
  importDialog({
    title: `${t('im.gr.title')} · ${className(c)} · ${t('c.sem' + sem)}`,
    help: t('im.gr.help', { months: planOf(cls, sem).months.map((mo) => 'T' + mo).join(', ') }),
    cols: [t('c.code'), t('c.name'), `(${t('c.subject')})`, ...parts.map((p) => partLabel(p, sem, cls))],
    placeholder: heads().join('\t'),
    controls: `<select data-imp-opt data-imp-sub aria-label="${t('im.defSubject')}">${opts(subs.map((s) => ({ v: s.id, l: `${t('im.defSubject')}: ${loc(s)}` })), ui.gr.sub)}</select>`,
    // File mẫu: danh sách học sinh của lớp + điểm hiện có của môn đang chọn
    template: () => {
      const subId = $('[data-imp-sub]').value || ui.gr.sub;
      const sub = subjectById(subId);
      // Chỉ các cột môn này có theo chương trình (VD: Lịch sử không có cột thi giữa / cuối kỳ)
      const ps = parts.filter((p) => (p === 'exam' ? hasExam(cls, subId) : hasMonth(cls, subId)));
      return {
        name: `diem-${c ? c.name.replace('/', '-') : ''}-hk${sem}-${subId}`,
        rows: [[t('c.code'), t('c.name'), ...ps.map((p) => partLabel(p, sem, cls))], ...studentsOf(cls).map((s) => { const g = gradeRec(s.id, subId, sem) || {}; return [s.code, s.name, ...ps.map((p) => g[p] ?? '')]; })],
        sub,
      };
    },
    build: (rows, el) => buildGradeImport(rows, { cls, sem, sub: $('[data-imp-sub]', el).value, subs }),
    columns: [
      { h: t('c.name'), v: (r) => (r.student ? `<b>${esc(r.student.name)}</b><small class="block muted">${esc(r.student.code)}</small>` : `<span class="muted">${esc(r.name || r.code)}</span>`) },
      { h: t('c.subject'), v: (r) => (r.sub ? esc(loc(r.sub)) : '') },
      ...parts.map((p) => ({ h: partLabel(p, sem, cls), v: (r) => (r.vals[p] != null ? `<b>${r.vals[p]}</b>` : '<span class="muted">—</span>') })),
    ],
    doLabel: 'im.gr.do',
    commit: (recs) => commitGradeImport(recs, sem),
  });
}

// ===== 4. Bảng điểm cả lớp (giáo viên chủ nhiệm): mỗi dòng 1 học sinh, mỗi cột 1 môn của một bài thi =====
// Bài thi tháng: mọi môn học của khối + Phẩm chất · Thi giữa / cuối kỳ: các môn thi của khối
const partSubjects = (cid, part) => (part === 'exam' ? examSubjects(cid) : [...classSubjects(cid), CONDUCT]);

function matchStudent(v, list, rec) {
  if (v.code) {
    const st = list.find((s) => s.code.toLowerCase() === String(v.code).toLowerCase());
    if (!st) rec.notes.push(db.students.some((s) => s.code.toLowerCase() === String(v.code).toLowerCase()) ? t('im.notInClass') : t('im.noStudent'));
    return st || null;
  }
  if (v.name) {
    const same = list.filter((s) => norm(s.name) === norm(v.name));
    if (same.length === 1) return same[0];
    rec.notes.push(same.length ? t('im.ambiguous') : t('im.noStudent'));
    return null;
  }
  rec.notes.push(t('im.noName'));
  return null;
}

function buildSheetImport(rows, ctx) {
  if (!rows.length) return [];
  const detect = (h) => {
    const s = findSubject(h, true);
    if (s) return 'sub:' + s.id;
    const c = gradeColOf(h, ctx.sem, ctx.cls);
    return c === 'code' || c === 'name' ? c : null;
  };
  const { idx, cols } = findHeader(rows, detect);
  if (idx < 0) return { error: t('im.ms.noSubCols') };
  const subCols = [...new Set(cols.filter((c) => c && c.startsWith('sub:')))];
  if (!subCols.length) return { error: t('im.ms.noSubCols') };
  if (!cols.includes('code') && !cols.includes('name')) return { error: t('im.gr.noStudentCol') };
  const okIds = new Set(partSubjects(ctx.cls, ctx.part).map((s) => s.id));
  const allowed = new Set(ctx.subs.map((s) => s.id));
  const headNotes = [];
  const usable = subCols.filter((c) => {
    const s = subjectById(c.slice(4));
    if (!okIds.has(s.id)) { headNotes.push(t('im.ms.badSub', { v: loc(s), p: partLabel(ctx.part, ctx.sem, ctx.cls) })); return false; }
    if (!allowed.has(s.id)) { headNotes.push(t('im.noPermSub', { v: loc(s) })); return false; }
    return true;
  });
  const list = studentsOf(ctx.cls);
  const recs = rows.slice(idx + 1).map((r, i) => {
    const v = rowObj(r, cols);
    const rec = { notes: [], status: 'ok', line: idx + i + 2, vals: {}, name: v.name || '', code: v.code || '' };
    rec.student = matchStudent(v, list, rec);
    usable.forEach((c) => {
      if (v[c] == null) return;
      const n = Number(String(v[c]).replace(',', '.'));
      if (!isFinite(n) || n < 0 || n > 10) rec.notes.push(t('im.badScore', { v: v[c] }));
      else rec.vals[c.slice(4)] = Math.round(n * 100) / 100;
    });
    if (!rec.student) rec.status = 'err';
    else if (!Object.keys(rec.vals).length) { rec.status = 'skip'; rec.notes.push(t('im.noScore')); }
    return rec;
  });
  if (headNotes.length && recs.length) recs[0].notes.unshift(...headNotes);
  return recs;
}

function commitSheetImport(recs, sem, part) {
  let cells = 0;
  const who = new Set();
  recs.forEach((r) => {
    Object.entries(r.vals).forEach(([sub, val]) => {
      const key = `${r.student.id}|${sub}|${sem}`;
      const g = db.grades[key] || { m1: null, m2: null, m3: null, m4: null, exam: null };
      g[part] = val;
      db.grades[key] = g;
      cells++;
    });
    who.add(r.student.id);
  });
  save();
  return t('im.gr.done', { n: cells, r: who.size });
}

const partFileTag = (p, sem, cid) => (p === 'exam' ? (String(sem) === '2' ? 'cuoi-ky' : 'giua-ky') : 'T' + planOf(cid, sem).months[MONTH_PARTS.indexOf(p)]);

function importSheet() {
  const cls = ui.gr.cls, sem = ui.gr.sem === 'y' ? '1' : ui.gr.sem;
  if (!can('grades') || !canWholeClass(cls)) return toast(t('c.noPerm'), 'error');
  const c = classById(cls);
  const subs = mySubjects(cls);
  const parts = partsOf(cls, sem);
  const defPart = parts.includes(ui.gr.view) ? ui.gr.view : parts[0];
  const curPart = () => ($('[data-imp-part]') || {}).value || defPart;
  importDialog({
    title: `${t('im.ms.title')} · ${className(c)} · ${t('c.sem' + sem)}`,
    help: t('im.ms.help'),
    cols: [t('c.code'), t('c.name'), ...partSubjects(cls, defPart).map(loc)],
    placeholder: [t('c.code'), t('c.name'), ...partSubjects(cls, defPart).map(loc)].join('\t'),
    controls: `<select data-imp-opt data-imp-part aria-label="${t('im.ms.part')}">${opts(parts.map((p) => ({ v: p, l: `${t('im.ms.part')}: ${partLabel(p, sem, cls)}` })), defPart)}</select>`,
    // File mẫu: danh sách lớp + điểm hiện có của bài thi đang chọn
    template: () => {
      const p = curPart();
      const ss = partSubjects(cls, p).filter((s) => subs.some((x) => x.id === s.id));
      return {
        name: `bang-diem-${c.name.replace('/', '-')}-hk${sem}-${partFileTag(p, sem, cls)}`,
        rows: [[t('c.code'), t('c.name'), ...ss.map(loc)], ...studentsOf(cls).map((s) => [s.code, s.name, ...ss.map((sub) => (gradeRec(s.id, sub.id, sem) || {})[p] ?? '')])],
      };
    },
    build: (rows) => buildSheetImport(rows, { cls, sem, part: curPart(), subs }),
    columns: [
      { h: t('c.name'), v: (r) => (r.student ? `<b>${esc(r.student.name)}</b><small class="block muted">${esc(r.student.code)}</small>` : `<span class="muted">${esc(r.name || r.code)}</span>`) },
      { h: t('im.ms.scores'), v: (r) => `<div class="chip-wrap">${Object.entries(r.vals).map(([id, v]) => `<span class="chip">${esc(loc(subjectById(id)))}: <b>${v}</b></span>`).join('') || '<span class="muted">—</span>'}</div>` },
    ],
    doLabel: 'im.gr.do',
    commit: (recs) => commitSheetImport(recs, sem, curPart()),
  });
}

// Thông tin cá nhân học sinh (ẩn với người không có quyền xem)
function studentInfo(s) {
  const c = classById(s.classId);
  const base = [[t('c.code'), s.code], [t('c.gender'), genderLabel(s.gender)], [t('c.class'), className(c)]];
  if (!canSeeStudentInfo(s)) return base;
  return [
    ...base, [t('st.dob'), fmtDate(s.dob)], [t('st.birthplace'), s.birthplace], [t('st.ethnic'), loc(ETHNICS[s.ethnic])],
    [t('st.phone'), s.phone], [t('st.address'), s.address], [t('st.province'), loc(PROVINCES[s.province])],
    [t('st.parent'), s.parent], [t('st.parentPhone'), s.parentPhone],
  ];
}
function teacherInfo(x) {
  const base = [[t('c.code'), x.code], [t('c.gender'), genderLabel(x.gender)], [t('tc.teaching'), loc(subjectById(x.subject))]];
  if (!canSeeTeacherInfo(x)) return base;
  return [
    ...base, [t('st.dob'), fmtDate(x.dob)], [t('c.phone'), x.phone], [t('c.email'), x.email],
    [t('st.address'), x.address], [t('st.birthplace'), x.birthplace],
    [t('tc.degree'), loc(DEGREES[x.degree])], [t('tc.gradSchool'), x.gradSchool], [t('tc.startYear'), x.startYear],
  ];
}
const infoGrid = (info) => `<dl class="info-grid">${info.map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v || '—')}</dd></div>`).join('')}</dl>`;

function printStudentProfile(s) {
  const c = classById(s.classId);
  printDoc(t('st.detail'), `${esc(s.name)} · ${esc(className(c))} · ${esc(db.settings.year)}`, infoGrid(studentInfo(s)),
    [[t('cl.homeroom'), (teacherById(c && c.homeroomId) || {}).name]]);
}

function studentDetail(s) {
  const c = classById(s.classId);
  const at = attStats(s.id);
  const info = studentInfo(s);
  openModal({
    title: t('st.detail'),
    wide: true,
    body: `
      <div class="profile">
        <span class="avatar lg ${s.gender}">${esc(initials(s.name))}</span>
        <div><h3>${esc(s.name)}</h3><p class="muted">${esc(s.code)} · ${esc(className(c))} · ${t('cl.homeroom')}: ${esc((teacherById(c && c.homeroomId) || {}).name || '—')}</p></div>
      </div>
      ${infoGrid(info)}
      <div class="detail-cols">
        <div>
          <h4><i class="fa-solid fa-star-half-stroke"></i> ${t('st.gradesSummary')}</h4>
          <div class="table-wrap"><table class="table compact">
            <thead><tr><th>${t('c.subject')}</th><th class="right">${t('c.sem1')}</th><th class="right">${t('c.sem2')}</th><th class="right">${t('gr.year')}</th></tr></thead>
            <tbody>
              ${classSubjects(s.classId).map((sub) => `<tr><td><span class="dot" style="--c:${sub.color}"></span>${esc(loc(sub))}</td>${['1', '2', 'y'].map((sm) => `<td class="right">${fmtScore(subAvg(s.id, sub.id, sm)) || '—'}</td>`).join('')}</tr>`).join('')}
              <tr class="total-row"><td>${t('gr.overall')}</td><td class="right">${fmtScore(overallAvg(s.id, 1)) || '—'}</td><td class="right">${fmtScore(overallAvg(s.id, 2)) || '—'}</td><td class="right">${fmtScore(overallAvg(s.id, 'y')) || '—'} ${rankBadge(overallAvg(s.id, 'y'))}</td></tr>
              <tr><td><span class="dot" style="--c:${CONDUCT.color}"></span>${esc(loc(CONDUCT))}</td>${['1', '2', 'y'].map((sm) => `<td class="right">${fmtScore(subAvg(s.id, CONDUCT.id, sm)) || '—'}</td>`).join('')}</tr>
            </tbody>
          </table></div>
        </div>
        <div>
          <h4><i class="fa-solid fa-clipboard-check"></i> ${t('st.attSummary')}</h4>
          <div class="mini-stats">
            <div><b>${pct(at.rate)}</b><span>${t('at.rate')}</span></div>
            <div><b>${at.total}</b><span>${t('at.days')}</span></div>
          </div>
          <ul class="att-counts">${ATT.map((a) => `<li><span class="badge ${a.c}"><i class="fa-solid ${a.i}"></i> ${t(a.l)}</span><b>${at[a.k]}</b></li>`).join('')}</ul>
        </div>
      </div>`,
    foot: `<button class="btn ghost" data-close>${t('c.close')}</button>
      ${canSeeStudentInfo(s) ? `<button class="btn ghost" data-act="printStudent" data-id="${s.id}"><i class="fa-solid fa-print"></i> ${t('st.printProfile')}</button>` : ''}
      ${can('students') ? `<button class="btn primary" data-act="editStudent" data-id="${s.id}"><i class="fa-regular fa-pen-to-square"></i> ${t('c.edit')}</button>` : ''}`,
  });
}

function deleteStudent(s) {
  confirmBox(t('c.confirmDelete', { name: s.name }), () => {
    db.students = db.students.filter((x) => x.id !== s.id);
    db.accounts = db.accounts.filter((a) => !(a.role === 'student' && a.refId === s.id));
    Object.keys(db.grades).forEach((k) => { if (k.startsWith(s.id + '|')) delete db.grades[k]; });
    Object.values(db.attendance).forEach((r) => { delete r[s.id]; });
    save();
    toast(t('c.deleted'));
    renderView();
  });
}

// ---------- Giáo viên ----------
const teachersOf = (sub) => db.teachers.filter((x) => x.subject === sub).sort(byName);

function teacherRows() {
  const q = norm(ui.tc.q);
  const list = db.teachers
    .filter((x) => (!ui.tc.sub || x.subject === ui.tc.sub) && (!q || norm(`${x.name} ${x.code} ${x.phone} ${x.email}`).includes(q)))
    .sort((a, b) => a.code.localeCompare(b.code));
  return list.map((x) => {
    const sub = subjectById(x.subject);
    const taught = sortedClasses().filter((c) => c.homeroomId === x.id || Object.values(c.teachers || {}).includes(x.id));
    return `<tr>
      <td class="mono">${esc(x.code)}</td>
      <td>${personCell(x, `${genderLabel(x.gender)} · ${fmtDate(x.dob) || '—'} · ${esc(loc(DEGREES[x.degree]))}`)}</td>
      <td><span class="dot" style="--c:${sub ? sub.color : '#999'}"></span>${esc(loc(sub))}</td>
      <td><div class="chip-wrap">${taught.map((c) => `<span class="chip${c.homeroomId === x.id ? ' home' : ''}" ${c.homeroomId === x.id ? `title="${t('tc.homeroom')}"` : ''}>${c.homeroomId === x.id ? '<i class="fa-solid fa-star"></i> ' : ''}${esc(className(c))}</span>`).join('') || '<span class="muted">—</span>'}</div></td>
      <td>${esc(x.phone)}<small class="block muted">${esc(x.email)}</small></td>
      <td>${accountCell('teacher', x.id)}</td>
      <td class="right">${rowActions('Teacher', x.id)}</td>
    </tr>`;
  }).join('') || emptyRow(8);
}

PAGES.teachers = () => `
  ${pageHead(t('tc.title'), `${db.teachers.length} ${t('c.people')}`, `
    <button class="btn ghost" data-act="printTeachers"><i class="fa-solid fa-print"></i> ${t('st.printList')}</button>
    <button class="btn ghost" data-act="exportTeachers"><i class="fa-solid fa-file-export"></i> ${t('c.exportXlsx')}</button>
    <button class="btn ghost" data-act="importTeachers"><i class="fa-solid fa-file-excel"></i> ${t('im.tc.btn')}</button>
    <button class="btn primary" data-act="addTeacher"><i class="fa-solid fa-plus"></i> ${t('tc.add')}</button>`)}
  <div class="card">
    <div class="toolbar">
      <div class="search"><i class="fa-solid fa-magnifying-glass"></i><input type="search" placeholder="${t('c.search')}" value="${esc(ui.tc.q)}" data-input="tcSearch" aria-label="${t('c.search')}"></div>
      <select data-change="tcSub" aria-label="${t('c.subject')}">${opts([{ v: '', l: `${t('c.subject')}: ${t('c.all')}` }, ...SUBJECTS.map((s) => ({ v: s.id, l: loc(s) }))], ui.tc.sub)}</select>
    </div>
    <div class="table-wrap"><table class="table">
      <thead><tr><th>${t('c.code')}</th><th>${t('c.name')}</th><th>${t('c.subject')}</th><th>${t('th.classes')}</th><th>${t('c.phone')} / ${t('c.email')}</th><th>${t('acc.email')}</th><th class="right">${t('c.actions')}</th></tr></thead>
      <tbody id="tcBody">${teacherRows()}</tbody>
    </table></div>
  </div>`;

function teacherForm(x) {
  const isNew = !x;
  formModal({
    title: isNew ? t('tc.add') : t('tc.editTitle'),
    values: x || { code: 'GV' + pad(db.seq.t + 1, 3), gender: 'F', subject: 'math', degree: 1, startYear: new Date().getFullYear() },
    fields: [
      { name: 'code', label: t('c.code'), required: true },
      { name: 'name', label: t('c.name'), required: true },
      { name: 'gender', label: t('c.gender'), type: 'select', options: [{ v: 'M', l: t('c.male') }, { v: 'F', l: t('c.female') }] },
      { name: 'dob', label: t('st.dob'), type: 'date' },
      { name: 'phone', label: t('c.phone'), type: 'tel' },
      { name: 'email', label: t('c.email'), type: 'email' },
      { name: 'address', label: t('st.address') },
      { name: 'birthplace', label: t('st.birthplace') },
      { name: 'subject', label: t('tc.teaching'), type: 'select', options: SUBJECTS.map((s) => ({ v: s.id, l: loc(s) })) },
      { name: 'degree', label: t('tc.degree'), type: 'select', options: DEGREES.map((d, i) => ({ v: i, l: loc(d) })) },
      { name: 'gradSchool', label: t('tc.gradSchool') },
      { name: 'startYear', label: t('tc.startYear'), type: 'number', attrs: ' min="1975" max="2100"' },
    ],
    onSubmit: (v) => {
      if (db.teachers.some((o) => o.code.toLowerCase() === v.code.toLowerCase() && o !== x)) return `${t('c.code')} "${v.code}" đã tồn tại / ມີແລ້ວ`;
      v.degree = Number(v.degree);
      const id = isNew ? nextId('t') : x.id;
      if (isNew) db.teachers.push({ id, ...v });
      else Object.assign(x, v);
      save();
      toast(t('c.saved'));
      renderView();
      if (isNew && can('accounts')) setTimeout(() => accountForm(null, { role: 'teacher', refId: id }), 0);
    },
  });
}

function teacherDetail(x) {
  const taught = sortedClasses().filter((c) => c.homeroomId === x.id || Object.values(c.teachers || {}).includes(x.id));
  openModal({
    title: t('tc.detail'),
    wide: true,
    body: `
      <div class="profile">
        <span class="avatar lg ${x.gender}">${esc(initials(x.name))}</span>
        <div><h3>${esc(x.name)}</h3><p class="muted">${esc(x.code)} · ${esc(loc(subjectById(x.subject)))}</p></div>
      </div>
      ${infoGrid(teacherInfo(x))}
      <h4 class="sub-title">${t('th.classes')}</h4>
      <div class="chip-wrap">${taught.map((c) => `<span class="chip${c.homeroomId === x.id ? ' home' : ''}">${c.homeroomId === x.id ? `<i class="fa-solid fa-star"></i> ${t('tc.homeroom')} ` : ''}${esc(className(c))}</span>`).join('') || '<span class="muted">—</span>'}</div>`,
    foot: `<button class="btn ghost" data-close>${t('c.close')}</button>
      <button class="btn ghost" data-act="printTeacher" data-id="${x.id}"><i class="fa-solid fa-print"></i> ${t('st.printProfile')}</button>
      <button class="btn primary" data-act="editTeacher" data-id="${x.id}"><i class="fa-regular fa-pen-to-square"></i> ${t('c.edit')}</button>`,
  });
}

// ---------- Lớp học ----------
function classCard(c) {
  const list = studentsOf(c.id);
  const male = list.filter((s) => s.gender === 'M').length;
  const hr = teacherById(c.homeroomId);
  return `<div class="class-card">
    <div class="cc-top">
      <span class="cc-name">${esc(className(c))}</span>
      <span class="chip">${t('cl.grade')} ${gradeLabel(c.grade)}</span>
    </div>
    <ul class="cc-info">
      <li><i class="fa-solid fa-chalkboard-user"></i> ${hr ? esc(hr.name) : `<span class="muted">${t('c.none')}</span>`}</li>
      <li><i class="fa-solid fa-door-open"></i> ${t('cl.room')}: ${esc(c.room || '—')}</li>
      <li><i class="fa-solid fa-users"></i> ${t('cl.size')}: <b>${list.length}</b> <span class="muted">(${t('c.male')} ${male} · ${t('c.female')} ${list.length - male})</span></li>
      <li><i class="fa-solid fa-user-tie"></i> ${t('cl.teachers')}: <b>${classSubjects(c.id).filter((s) => teacherById((c.teachers || {})[s.id])).length}</b>/${classSubjects(c.id).length} ${t('c.subject').toLowerCase()}</li>
    </ul>
    <div class="cc-actions">
      <button class="btn sm ghost" data-act="assignTeachers" data-id="${c.id}" title="${t('cl.assign')}"><i class="fa-solid fa-user-tie"></i> ${t('cl.assign')}</button>
      <button class="btn sm ghost" data-act="classStudents" data-id="${c.id}" title="${t('nav.students')}" aria-label="${t('nav.students')}"><i class="fa-solid fa-list"></i></button>
      <button class="btn sm ghost" data-act="classTimetable" data-id="${c.id}"><i class="fa-solid fa-calendar-days"></i></button>
      ${rowActions('Class', c.id)}
    </div>
  </div>`;
}

PAGES.classes = () => {
  const groups = [[t('cl.lower'), (c) => c.grade <= 4], [t('cl.upper'), (c) => c.grade > 4]];
  return `
  ${pageHead(t('cl.title'), `${db.classes.length} ${t('c.class').toLowerCase()} · ${db.students.length} ${t('c.students')}`,
    `<button class="btn primary" data-act="addClass"><i class="fa-solid fa-plus"></i> ${t('cl.add')}</button>`)}
  ${groups.map(([title, fn]) => {
    const list = sortedClasses().filter(fn);
    return `<h3 class="group-title">${title}</h3><div class="class-grid">${list.map(classCard).join('') || `<p class="muted">${t('c.noData')}</p>`}</div>`;
  }).join('')}`;
};

function classForm(c) {
  const isNew = !c;
  formModal({
    title: isNew ? t('cl.add') : t('cl.editTitle'),
    values: c || { grade: 1, homeroomId: '' },
    fields: [
      { name: 'name', label: `${t('cl.name')} (VD: M1/3)`, required: true },
      { name: 'grade', label: t('cl.grade'), type: 'select', options: GRADES.map((g) => ({ v: g, l: gradeLabel(g) })) },
      { name: 'homeroomId', label: t('cl.homeroom'), type: 'select', options: [{ v: '', l: t('c.none') }, ...db.teachers.slice().sort(byName).map((x) => ({ v: x.id, l: `${x.name} (${loc(subjectById(x.subject))})` }))] },
      { name: 'room', label: t('cl.room') },
    ],
    onSubmit: (v) => {
      v.name = v.name.toUpperCase().replace(/^ມ\.?/, 'M');
      if (db.classes.some((o) => o.name === v.name && o !== c)) return `${t('cl.name')} "${v.name}" đã tồn tại / ມີແລ້ວ`;
      v.grade = Number(v.grade);
      if (isNew) {
        const id = nextId('c');
        db.classes.push({ id, ...v, teachers: {} });
        db.timetable[id] = {};
      } else Object.assign(c, v);
      save();
      toast(t('c.saved'));
      renderView();
    },
  });
}

// Phân công giảng dạy: chọn giáo viên cho từng môn của lớp
function assignTeachers(c) {
  const sorted = db.teachers.slice().sort(byName);
  const rows = classSubjects(c.id).map((sub) => {
    const own = sorted.filter((x) => x.subject === sub.id);
    const other = sorted.filter((x) => x.subject !== sub.id);
    const cur = (c.teachers || {})[sub.id] || '';
    const o = (x) => `<option value="${x.id}"${x.id === cur ? ' selected' : ''}>${esc(x.name)} · ${esc(x.code)}</option>`;
    return `<label class="assign-row"><span><span class="dot" style="--c:${sub.color}"></span>${esc(loc(sub))}</span>
      <select name="${sub.id}"><option value="">${t('cl.notAssigned')}</option>
        ${own.length ? `<optgroup label="${esc(loc(sub))}">${own.map(o).join('')}</optgroup>` : ''}
        <optgroup label="${t('c.all')}">${other.map(o).join('')}</optgroup>
      </select></label>`;
  }).join('');
  const m = openModal({
    title: `${t('cl.assign')} · ${className(c)}`,
    body: `<p class="muted" style="margin-bottom:12px">${t('cl.homeroom')}: <b>${esc((teacherById(c.homeroomId) || {}).name || '—')}</b> · ${t('cl.curriculum', { g: groupOfGrade(c.grade) === 'g13' ? `${gradeLabel(1)}–${gradeLabel(3)}` : `${gradeLabel(4)}–${gradeLabel(7)}` })}</p><form class="assign-list">${rows}</form>`,
    foot: `<button class="btn ghost" data-close>${t('c.cancel')}</button><button class="btn primary" data-save><i class="fa-solid fa-check"></i> ${t('c.save')}</button>`,
  });
  $('[data-save]', m).addEventListener('click', () => {
    c.teachers = {};
    $$('select', m).forEach((s) => { if (s.value) c.teachers[s.name] = s.value; });
    save(); closeModal(); toast(t('c.saved')); renderView();
  });
}

// ---------- Điểm số ----------
function gradeStats() {
  const list = studentsOf(ui.gr.cls);
  const count = { exc: 0, good: 0, info: 0, warn: 0, bad: 0 };
  let sum = 0, n = 0;
  list.forEach((s) => {
    const a = semScore(s.id, ui.gr.sub, ui.gr.sem);
    if (a != null) { sum += a; n++; count[rankOf(a).c]++; }
  });
  const keys = [['exc', 'r.excellent'], ['good', 'r.good'], ['info', 'r.fair'], ['warn', 'r.average'], ['bad', 'r.weak']];
  return `<div class="chips-row"><span class="stat-chip"><b>${n ? (sum / n).toFixed(2) : '—'}</b> ${t('gr.avg')}</span>${keys.map(([c, k]) => `<span class="badge ${c}">${t(k)}: ${count[c]}</span>`).join('')}</div>`;
}

const scoreInput = (s, g, p, sem, hint = '') => `<td class="center"><input class="score" type="number" inputmode="decimal" min="0" max="10" step="0.5" value="${g[p] ?? ''}" data-change="score" data-part="${p}" aria-label="${esc(s.name)} ${partLabel(p, sem, s.classId)}">${hint}</td>`;

// Bảng nhập điểm 1 môn: cột thi tháng (nếu môn có học hàng tháng) + cột thi giữa / cuối kỳ (nếu môn có thi)
function gradeEntry() {
  const list = studentsOf(ui.gr.cls);
  const sem = ui.gr.sem, cid = ui.gr.cls, sub = ui.gr.sub;
  const isConduct = sub === CONDUCT.id;
  const mp = hasMonth(cid, sub) ? monthParts(cid, sem) : [];
  const ex = !isConduct && hasExam(cid, sub);
  const src = examSrc(cid, sub);
  const shared = !ex && !!src; // Lý / Hóa / Sinh M4–M7: dùng điểm thi KHTN (nhập ở môn KHTN)
  const months = planOf(cid, sem).months;
  const rs = mp.length ? ' rowspan="2"' : '';
  const cols = 3 + (mp.length ? mp.length + 3 : 0) + (ex || shared ? 1 : 0);
  return `${isConduct ? `<p class="alert info"><i class="fa-solid fa-user-check"></i> <span>${t('gr.conductNote')}</span></p>` : `<div id="grStats">${gradeStats()}</div>`}
  ${!mp.length && ex ? `<p class="alert info"><i class="fa-solid fa-circle-info"></i> <span>${t('gr.examOnly', { s: esc(loc(subjectById(sub))) })}</span></p>` : ''}
  ${mp.length && !ex && !shared && !isConduct ? `<p class="alert info"><i class="fa-solid fa-circle-info"></i> <span>${t('gr.noExamNote', { s: esc(loc(subjectById(sub))) })}</span></p>` : ''}
  <div class="table-wrap"><table class="table grade-table">
    <thead>
      <tr><th${rs}>#</th><th${rs}>${t('c.code')}</th><th${rs}>${t('c.name')}</th>
        ${mp.length ? `<th class="center" colspan="${mp.length + 1}">${isConduct ? esc(loc(CONDUCT)) : t('gr.monthly')}</th>` : ''}
        ${ex ? `<th class="center"${rs}>${examLabel(sem)}<small class="block muted">${examMonthNote(sem, cid)}</small></th>` : ''}
        ${shared ? `<th class="center"${rs}>${examLabel(sem)}<small class="block muted">${esc(loc(subjectById(src)))}</small></th>` : ''}
        ${mp.length ? `<th class="center"${rs}>${isConduct ? t('gr.conductAvg') : t('gr.avg')}</th><th${rs}>${isConduct ? t('at.rate') : t('gr.rank')}</th>` : ''}</tr>
      ${mp.length ? `<tr>${mp.map((p) => `<th class="center">${partLabel(p, sem, cid)}</th>`).join('')}<th class="center">${t('gr.monthAvg')}</th></tr>` : ''}
    </thead>
    <tbody>${list.map((s, i) => {
      const g = gradeRec(s.id, sub, sem) || {};
      const a = semScore(s.id, sub, sem);
      // Phẩm chất: hiện tỷ lệ chuyên cần của tháng ngay dưới ô điểm
      const hint = (p) => { if (!isConduct) return ''; const r = attMonthRate(s.id, months[MONTH_PARTS.indexOf(p)]); return `<small class="block muted att-hint">${t('gr.attHint')} ${pct(r)}</small>`; };
      return `<tr data-sid="${s.id}">
        <td class="muted">${i + 1}</td><td class="mono">${esc(s.code)}</td><td><b>${esc(s.name)}</b></td>
        ${mp.map((p) => scoreInput(s, g, p, sem, hint(p))).join('')}
        ${mp.length ? `<td class="center mavg">${fmtScore(monthAvgOf(g, mp)) || '<span class="muted">—</span>'}</td>` : ''}
        ${ex ? scoreInput(s, g, 'exam', sem) : ''}
        ${shared ? `<td class="center muted">${fmtScore(examOf(s.id, src, sem)) || '—'}</td>` : ''}
        ${mp.length ? `<td class="center avg"><b>${fmtScore(a)}</b></td><td class="rank">${isConduct ? `<b>${pct(attStats(s.id).rate)}</b>` : rankBadge(a)}</td>` : ''}
      </tr>`;
    }).join('') || emptyRow(cols)}</tbody>
  </table></div>
  <p class="note"><i class="fa-solid fa-circle-info"></i> ${t('gr.formula')}</p>`;
}

// Tổng kết có thể xem theo: điểm học kỳ, từng bài thi tháng (bảng điểm tháng), TB tháng hoặc thi giữa / cuối kỳ
const sumViews = () => ['avg', ...monthParts(ui.gr.cls, ui.gr.sem), 'mavg', 'exam'];
const sumView = () => (ui.gr.sem === 'y' || !sumViews().includes(ui.gr.view) ? 'avg' : ui.gr.view);
const viewLabel = (v, sem) => (v === 'avg' ? (sem === 'y' ? t('gr.year') : t('gr.avg')) : v === 'mavg' ? t('gr.monthAvg') : partLabel(v, sem, ui.gr.cls));
function viewVal(sid, sub, sem, view) {
  if (view === 'avg') return subAvg(sid, sub, sem);
  if (view === 'exam') return examOf(sid, sub, sem);
  const g = gradeRec(sid, sub, sem);
  if (!g) return null;
  return view === 'mavg' ? monthAvgOf(g, monthParts(studentClass(sid), sem)) : g[view] ?? null;
}
// Cột môn của bảng tổng kết: thi giữa / cuối kỳ → các môn thi, còn lại → các môn học của khối
const summarySubjects = (view) => (view === 'exam' ? examSubjects(ui.gr.cls) : classSubjects(ui.gr.cls));

function summaryData() {
  const sem = ui.gr.sem, view = sumView();
  const subsList = summarySubjects(view);
  const rows = studentsOf(ui.gr.cls).map((s) => {
    const subs = subsList.map((sub) => viewVal(s.id, sub.id, sem, view));
    const have = subs.filter((v) => v != null);
    const m = mean(subs);
    return {
      s, subs,
      total: have.length ? round1(have.reduce((a, b) => a + b, 0)) : null,
      all: m == null ? null : round1(m),
      conduct: view === 'exam' ? null : viewVal(s.id, CONDUCT.id, sem, view),
    };
  });
  const sorted = rows.filter((r) => r.all != null).map((r) => r.all).sort((a, b) => b - a);
  rows.forEach((r) => { r.pos = r.all == null ? null : sorted.indexOf(r.all) + 1; });
  return rows;
}

function summaryTable(rows, view, forPrint = false) {
  const subs = summarySubjects(view);
  const withConduct = view !== 'exam';
  const cols = subs.length + 6 + (withConduct ? 1 : 0);
  const cell = (v) => `<td class="center ${v != null && v < 5 ? 'low' : ''}">${fmtScore(v) || (forPrint ? '' : '<span class="muted">—</span>')}</td>`;
  return `<table class="table summary-table${forPrint ? ' compact' : ''}">
    <thead><tr><th>#</th><th>${t('c.name')}</th>${subs.map((s) => `<th class="center sub-h" title="${esc(loc(s))}">${forPrint ? '' : `<span class="dot" style="--c:${s.color}"></span>`}${esc(loc(s))}</th>`).join('')}<th class="center">${t('gr.total')}</th><th class="center">${t('gr.overall')}</th><th>${t('gr.rank')}</th><th class="center">${t('gr.position')}</th>${withConduct ? `<th class="center">${esc(loc(CONDUCT))}</th>` : ''}</tr></thead>
    <tbody>${rows.map((r, i) => `<tr>
      <td class="muted">${i + 1}</td><td><b>${esc(r.s.name)}</b><small class="block muted">${esc(r.s.code)}</small></td>
      ${r.subs.map(cell).join('')}
      <td class="center">${fmtScore(r.total) || '—'}</td>
      <td class="center"><b>${fmtScore(r.all) || '—'}</b></td>
      <td>${forPrint ? (r.all == null ? '' : t(rankOf(r.all).k)) : rankBadge(r.all)}</td>
      <td class="center">${r.pos ? (forPrint ? r.pos : `<span class="pos p${Math.min(r.pos, 4)}">${r.pos}</span>`) : '—'}</td>
      ${withConduct ? cell(r.conduct) : ''}
    </tr>`).join('') || emptyRow(cols)}</tbody>
  </table>`;
}

function gradeSummary() {
  const rows = summaryData();
  const view = sumView();
  const done = rows.filter((r) => r.all != null).length;
  return `<div class="chips-row"><span class="stat-chip"><i class="fa-solid fa-eye"></i> <b>${viewLabel(view, ui.gr.sem)}</b> · ${ui.gr.sem === 'y' ? t('gr.year') : t('c.sem' + ui.gr.sem)}</span><span class="badge info">${done}/${rows.length} ${t('c.students')}</span></div>
  <div class="table-wrap">${summaryTable(rows, view)}</div>
  <p class="note"><i class="fa-solid fa-circle-info"></i> ${t('gr.summaryNote')}</p>`;
}

const noClassCard = () => `<div class="card empty-state"><i class="fa-solid fa-people-roof"></i><p>${t('th.noClass')}</p></div>`;

PAGES.grades = () => {
  const classes = myClasses();
  if (!classes.length) return pageHead(t('gr.title'), '') + noClassCard();
  ensureClass(ui.gr, classes);
  const subs = mySubjects(ui.gr.cls);
  if (!subs.some((s) => s.id === ui.gr.sub)) ui.gr.sub = (subs[0] || {}).id || '';
  const entry = ui.gr.mode === 'entry';
  if (entry && ui.gr.sem === 'y') ui.gr.sem = '1'; // nhập điểm chỉ theo từng học kỳ
  const whole = canWholeClass(ui.gr.cls) && can('grades');
  const semOpts = [{ v: '1', l: t('c.sem1') }, { v: '2', l: t('c.sem2') }, ...(entry ? [] : [{ v: 'y', l: t('gr.year') }])];
  const body = !entry ? gradeSummary() : subs.length ? gradeEntry() : `<p class="alert warn"><i class="fa-solid fa-circle-info"></i> ${t('th.onlyAssigned')}</p>`;
  const sheetBtn = whole && ui.gr.sem !== 'y' ? `<button class="btn ghost" data-act="importSheet"><i class="fa-solid fa-table-cells"></i> ${t('im.ms.btn')}</button>` : '';
  const actions = entry
    ? `${ui.gr.sub === CONDUCT.id && subs.length ? `<button class="btn ghost" data-act="fillConduct"><i class="fa-solid fa-wand-magic-sparkles"></i> ${t('gr.fillConduct')}</button>` : ''}
       ${subs.length ? `<button class="btn ghost" data-act="importGrades"><i class="fa-solid fa-file-excel"></i> ${t('im.gr.btn')}</button>` : ''}${sheetBtn}`
    : `<button class="btn ghost" data-act="printSummary"><i class="fa-solid fa-print"></i> ${t('gr.print')}</button>
       <button class="btn ghost" data-act="exportSummary"><i class="fa-solid fa-file-export"></i> ${t('c.exportXlsx')}</button>${sheetBtn}`;
  const c = classById(ui.gr.cls);
  return `
  ${pageHead(t('gr.title'), `${esc(db.settings.year)} · ${t('cl.homeroom')}: ${esc((teacherById(c && c.homeroomId) || {}).name || '—')}`, actions)}
  <div class="card">
    <div class="toolbar">
      <div class="seg" role="group">
        <button data-act="grMode" data-v="entry" class="${entry ? 'on' : ''}"><i class="fa-solid fa-pen"></i> ${t('gr.entry')}</button>
        <button data-act="grMode" data-v="summary" class="${entry ? '' : 'on'}"><i class="fa-solid fa-table"></i> ${t('gr.summary')}</button>
      </div>
      <select data-change="grClass" aria-label="${t('c.class')}">${classOptions(ui.gr.cls, false, classes)}</select>
      ${entry && subs.length ? `<select data-change="grSub" aria-label="${t('c.subject')}">${opts(subs.map((s) => ({ v: s.id, l: loc(s) })), ui.gr.sub)}</select>` : ''}
      <select data-change="grSem" aria-label="${t('c.semester')}">${opts(semOpts, ui.gr.sem)}</select>
      ${!entry && ui.gr.sem !== 'y' ? `<select data-change="grView" aria-label="${t('gr.view')}">${opts(sumViews().map((v) => ({ v, l: `${t('gr.view')}: ${viewLabel(v, ui.gr.sem)}` })), sumView())}</select>` : ''}
    </div>
    ${body}
  </div>`;
};

// ---------- Điểm danh ----------
function attBody() {
  const cid = ui.at.cls;
  const rec = db.attendance[`${cid}|${ui.at.date}`] || {};
  const list = studentsOf(cid);
  const c = { P: 0, L: 0, E: 0, A: 0 };
  list.forEach((s) => { if (rec[s.id]) c[rec[s.id]]++; });
  const unmarked = list.length - c.P - c.L - c.E - c.A;
  const wd = new Date(ui.at.date + 'T00:00:00').getDay();
  return `
  ${wd === 0 || wd === 6 ? `<p class="alert warn"><i class="fa-solid fa-triangle-exclamation"></i> ${t('at.weekend')}</p>` : ''}
  <div class="chips-row">
    ${ATT.map((a) => `<span class="badge ${a.c}"><i class="fa-solid ${a.i}"></i> ${t(a.l)}: ${c[a.k]}</span>`).join('')}
    <span class="badge neutral"><i class="fa-regular fa-circle"></i> ${t('dash.notTaken')}: ${unmarked}</span>
  </div>
  <div class="table-wrap"><table class="table">
    <thead><tr><th>#</th><th>${t('c.code')}</th><th>${t('c.name')}</th><th>${t('c.status')}</th><th class="right">${t('at.rate')}</th></tr></thead>
    <tbody>${list.map((s, i) => {
      const st = attStats(s.id);
      return `<tr>
        <td class="muted">${i + 1}</td><td class="mono">${esc(s.code)}</td><td>${personCell(s, genderLabel(s.gender))}</td>
        <td><div class="att-seg" role="group" aria-label="${esc(s.name)}">${ATT.map((a) => `<button class="${a.c} ${rec[s.id] === a.k ? 'on' : ''}" aria-pressed="${rec[s.id] === a.k}" data-act="mark" data-sid="${s.id}" data-v="${a.k}"><i class="fa-solid ${a.i}"></i><span>${t(a.l)}</span></button>`).join('')}</div></td>
        <td class="right"><b>${pct(st.rate)}</b><small class="block muted">${st.total} ${t('at.days').toLowerCase()}</small></td>
      </tr>`;
    }).join('') || emptyRow(5)}</tbody>
  </table></div>`;
}

PAGES.attendance = () => {
  const classes = myClasses();
  if (!classes.length) return pageHead(t('at.title'), '') + noClassCard();
  ensureClass(ui.at, classes);
  return `
  ${pageHead(t('at.title'), fmtDate(ui.at.date))}
  <div class="card">
    <div class="toolbar">
      <select data-change="atClass" aria-label="${t('c.class')}">${classOptions(ui.at.cls, false, classes)}</select>
      <input type="date" value="${ui.at.date}" max="${todayIso()}" data-change="atDate" aria-label="${t('c.date')}">
      <button class="btn ghost" data-act="allPresent"><i class="fa-solid fa-check-double"></i> ${t('at.allPresent')}</button>
    </div>
    <div id="atBody">${attBody()}</div>
  </div>`;
};

// ---------- Thông báo ----------
// db.notices: { id, title, body, audience: 'all' | 'teachers' | 'students' | 'class', classId, important, pinned, created, updated, authorId, authorName }
// Quản lý (quyền "notices"): đăng cho toàn trường / giáo viên / học sinh / một lớp.
// Giáo viên (quyền "notices"): đăng cho lớp mình dạy. Học sinh (quyền "snotices"): chỉ xem.
const notices = () => db.notices || (db.notices = []);
function noticeVisible(n, u = me()) {
  if (!u) return false;
  if (u.role === 'admin' || n.authorId === u.id || n.audience === 'all') return true;
  if (u.role === 'teacher') return n.audience === 'teachers' || (n.audience === 'class' && myClasses().some((c) => c.id === n.classId));
  if (u.role === 'student') { const s = myPerson(); return n.audience === 'students' || (n.audience === 'class' && !!s && s.classId === n.classId); }
  return false;
}
const sortNotices = (list) => list.slice().sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || b.created.localeCompare(a.created));
const myNotices = () => sortNotices(notices().filter((n) => noticeVisible(n)));
const isUnread = (n, u = me()) => !!u && n.authorId !== u.id && n.created > (u.noticeSeen || '');
const unreadCount = () => myNotices().filter((n) => isUnread(n)).length;
const canPostNotice = () => { const u = me(); return !!u && can('notices') && (u.role === 'admin' || (u.role === 'teacher' && myClasses().length > 0)); };
const canEditNotice = (n) => { const u = me(); return !!u && can('notices') && (u.role === 'admin' || n.authorId === u.id); };
const noticePage = () => (me() && me().role === 'student' ? 'snotices' : 'notices');
function audienceLabel(n) {
  if (n.audience === 'class') return `${t('c.class')} ${className(classById(n.classId))}`;
  return t('no.to.' + n.audience);
}
const AUD_ICON = { all: 'fa-school', teachers: 'fa-chalkboard-user', students: 'fa-user-graduate', class: 'fa-people-roof' };
const noticeBody = (s) => esc(s).replace(/\r?\n/g, '<br>');

function noticeCard(n, seen) {
  const unread = n.authorId !== (me() || {}).id && n.created > seen;
  return `<article class="notice${n.pinned ? ' pinned' : ''}${n.important ? ' important' : ''}">
    <div class="notice-head">
      <div class="notice-title">
        ${n.pinned ? `<i class="fa-solid fa-thumbtack" title="${t('no.pinned')}"></i>` : ''}
        <h3>${esc(n.title)}</h3>
        ${n.important ? `<span class="badge bad"><i class="fa-solid fa-circle-exclamation"></i> ${t('no.important')}</span>` : ''}
        ${unread ? `<span class="badge info">${t('no.new')}</span>` : ''}
      </div>
      ${canEditNotice(n) ? `<div class="row-actions">
        <button class="icon-btn sm" data-act="pinNotice" data-id="${n.id}" title="${t(n.pinned ? 'no.unpin' : 'no.pin')}" aria-label="${t(n.pinned ? 'no.unpin' : 'no.pin')}"><i class="fa-solid fa-thumbtack"></i></button>
        <button class="icon-btn sm" data-act="editNotice" data-id="${n.id}" title="${t('c.edit')}" aria-label="${t('c.edit')}"><i class="fa-regular fa-pen-to-square"></i></button>
        <button class="icon-btn sm danger" data-act="delNotice" data-id="${n.id}" title="${t('c.delete')}" aria-label="${t('c.delete')}"><i class="fa-regular fa-trash-can"></i></button>
      </div>` : ''}
    </div>
    <div class="notice-meta">
      <span class="chip"><i class="fa-solid ${AUD_ICON[n.audience] || 'fa-school'}"></i> ${esc(audienceLabel(n))}</span>
      <span><i class="fa-regular fa-user"></i> ${esc(n.authorName || '')}</span>
      <span><i class="fa-regular fa-clock"></i> ${fmtDateTime(n.created)}${n.updated ? ` · ${t('no.edited')}` : ''}</span>
    </div>
    <div class="notice-body">${noticeBody(n.body)}</div>
  </article>`;
}

function noticeList(seen) {
  const q = norm(ui.no.q);
  const list = myNotices().filter((n) => (!ui.no.aud || (ui.no.aud.startsWith('class:') ? n.audience === 'class' && n.classId === ui.no.aud.slice(6) : n.audience === ui.no.aud))
    && (!q || norm(`${n.title} ${n.body} ${n.authorName}`).includes(q)));
  return list.map((n) => noticeCard(n, seen)).join('') || `<div class="card empty-state"><i class="fa-regular fa-bell-slash"></i><p>${t('no.empty')}</p></div>`;
}

// Đích gửi: quản lý được chọn tất cả; giáo viên chỉ chọn lớp mình dạy
function audienceOptions() {
  const u = me();
  const classes = (u.role === 'admin' ? sortedClasses() : myClasses()).map((c) => ({ v: 'class:' + c.id, l: `${t('c.class')} ${className(c)}` }));
  return u.role === 'admin' ? [{ v: 'all', l: t('no.to.all') }, { v: 'teachers', l: t('no.to.teachers') }, { v: 'students', l: t('no.to.students') }, ...classes] : classes;
}

PAGES.notices = () => {
  const u = me();
  const seen = u.noticeSeen || '';
  const n = myNotices().length;
  const filterOpts = u.role === 'student' ? [] : [{ v: '', l: `${t('no.to')}: ${t('c.all')}` }, ...(u.role === 'admin' ? audienceOptions() : [{ v: 'all', l: t('no.to.all') }, { v: 'teachers', l: t('no.to.teachers') }, ...audienceOptions()])];
  const html = `
  ${pageHead(t('no.title'), `${n} ${t('no.count')}`, canPostNotice() ? `<button class="btn primary" data-act="addNotice"><i class="fa-solid fa-bullhorn"></i> ${t('no.add')}</button>` : '')}
  <div class="card notice-tools">
    <div class="toolbar">
      <div class="search"><i class="fa-solid fa-magnifying-glass"></i><input type="search" placeholder="${t('c.search')}" value="${esc(ui.no.q)}" data-input="noSearch" aria-label="${t('c.search')}"></div>
      ${filterOpts.length ? `<select data-change="noAud" aria-label="${t('no.to')}">${opts(filterOpts, ui.no.aud)}</select>` : ''}
    </div>
  </div>
  <div class="notice-list" id="noList">${noticeList(seen)}</div>`;
  // Mở trang = đã đọc
  if (myNotices().some((x) => isUnread(x, u))) { u.noticeSeen = new Date().toISOString(); save(); setTimeout(updateBell, 0); }
  ui.no.seen = seen;
  return html;
};
PAGES.snotices = PAGES.notices;

// Thẻ "Thông báo mới" ở trang chủ các vai trò
function latestNoticesCard(max = 3) {
  if (!allowedPages().includes(noticePage())) return '';
  const list = myNotices().slice(0, max);
  const seen = (me() || {}).noticeSeen || '';
  if (!list.length && !canPostNotice()) return '';
  return `<div class="card home-notices">
    <div class="card-head"><h3><i class="fa-solid fa-bullhorn"></i> ${t('no.latest')}${unreadCount() ? ` <span class="badge info">${unreadCount()} ${t('no.new').toLowerCase()}</span>` : ''}</h3>
      <div class="head-actions">${canPostNotice() ? `<button class="btn sm ghost" data-act="addNotice"><i class="fa-solid fa-plus"></i> ${t('no.add')}</button>` : ''}<a class="link" href="#${noticePage()}">${t('no.all')} <i class="fa-solid fa-arrow-right"></i></a></div>
    </div>
    <ul class="notice-mini">${list.map((n) => `<li class="${n.important ? 'important' : ''}">
      <a href="#${noticePage()}"><b>${n.pinned ? '<i class="fa-solid fa-thumbtack"></i> ' : ''}${esc(n.title)}</b>${isUnread(n) && n.created > seen ? ` <span class="badge info">${t('no.new')}</span>` : ''}
      <small>${esc(audienceLabel(n))} · ${esc(n.authorName || '')} · ${fmtDate(n.created.slice(0, 10))}</small></a></li>`).join('') || `<li class="muted empty-line">${t('no.empty')}</li>`}</ul>
  </div>`;
}

function updateBell() {
  const b = $('#bellCount');
  if (!b) return;
  const n = unreadCount();
  b.textContent = n > 99 ? '99+' : n;
  b.hidden = !n;
}

function noticeForm(n) {
  if (n ? !canEditNotice(n) : !canPostNotice()) return toast(t('c.noPerm'), 'error');
  const aud = audienceOptions();
  const cur = n ? (n.audience === 'class' ? 'class:' + n.classId : n.audience) : (aud[0] || {}).v;
  if (n && !aud.some((o) => o.v === cur)) aud.push({ v: cur, l: audienceLabel(n) });
  formModal({
    title: n ? t('no.editTitle') : t('no.add'),
    values: n ? { title: n.title, body: n.body, to: cur, important: n.important ? '1' : '', pinned: n.pinned ? '1' : '' } : { to: cur, important: '', pinned: '' },
    fields: [
      { name: 'title', label: t('no.fTitle'), required: true, full: true },
      { name: 'body', label: t('no.fBody'), type: 'textarea', required: true, full: true },
      { name: 'to', label: t('no.to'), type: 'select', options: aud, required: true },
      { name: 'important', label: t('no.level'), type: 'select', options: [{ v: '', l: t('no.normal') }, { v: '1', l: t('no.important') }] },
      ...(me().role === 'admin' ? [{ name: 'pinned', label: t('no.pin'), type: 'select', options: [{ v: '', l: t('no.no') }, { v: '1', l: t('no.yes') }] }] : []),
    ],
    submitLabel: n ? t('c.save') : t('no.publish'),
    onSubmit: (v) => {
      if (!aud.some((o) => o.v === v.to)) return t('c.noPerm');
      const [audience, classId] = v.to.startsWith('class:') ? ['class', v.to.slice(6)] : [v.to, ''];
      const data = { title: v.title, body: v.body, audience, classId, important: !!v.important, pinned: me().role === 'admin' ? !!v.pinned : !!(n && n.pinned) };
      if (n) Object.assign(n, data, { updated: new Date().toISOString() });
      else {
        const u = me();
        db.seq.n = (db.seq.n || 0) + 1;
        notices().push({ id: 'n' + db.seq.n, ...data, created: new Date().toISOString(), updated: '', authorId: u.id, authorName: displayName(u) });
      }
      save();
      toast(n ? t('c.saved') : t('no.published'));
      renderView();
      updateBell();
    },
  });
  const ta = $('.modal textarea[name="body"]');
  if (ta) ta.rows = 6;
}

// ---------- Thời khóa biểu ----------
function timetableTable(cid, edit) {
  const grid = db.timetable[cid] || {};
  const cell = (d, p) => {
    const sub = subjectById(grid[`${d}-${p}`]);
    if (edit) {
      const list = classSubjects(cid);
      if (sub && !list.includes(sub)) list.push(sub); // giữ môn cũ đang xếp (nếu có)
      return `<td><select class="tt-select" data-change="ttCell" data-slot="${d}-${p}" aria-label="${t('d.' + d)} ${t('tt.period')} ${p}">${opts([{ v: '', l: '—' }, ...list.map((s) => ({ v: s.id, l: loc(s) }))], sub ? sub.id : '')}</select></td>`;
    }
    if (!sub) return '<td><span class="muted">—</span></td>';
    const tc = teacherFor(sub.id, cid);
    return `<td><div class="tt-cell" style="--c:${sub.color}"><b>${esc(loc(sub))}</b><small>${esc(tc ? tc.name : '')}</small></div></td>`;
  };
  return `<table class="table tt">
    <thead><tr><th>${t('tt.period')}</th>${DAYS.map((d) => `<th>${t('d.' + d)}</th>`).join('')}</tr></thead>
    <tbody>${PERIODS.map((p) => `${p === 5 ? `<tr class="tt-break"><td colspan="${DAYS.length + 1}"><i class="fa-solid fa-bowl-rice"></i> 11:30 – 13:30</td></tr>` : ''}
      <tr><th class="tt-p">${p}<small>${PERIOD_TIME[p - 1]}</small></th>${DAYS.map((d) => cell(d, p)).join('')}</tr>`).join('')}</tbody>
  </table>`;
}

PAGES.timetable = () => {
  const cid = ensureClass(ui.tt);
  const grid = db.timetable[cid] || {};
  const load = {};
  Object.values(grid).forEach((s) => { if (s) load[s] = (load[s] || 0) + 1; });
  const c = classById(cid);
  return `
  ${pageHead(t('tt.title'), `${esc(className(c))} · ${t('cl.homeroom')}: ${esc((teacherById(c && c.homeroomId) || {}).name || '—')}`, `
    <button class="btn ghost" data-act="printTimetable"><i class="fa-solid fa-print"></i></button>
    <button class="btn ${ui.tt.edit ? 'primary' : 'ghost'}" data-act="ttEdit"><i class="fa-solid ${ui.tt.edit ? 'fa-check' : 'fa-pen'}"></i> ${t(ui.tt.edit ? 'tt.done' : 'tt.edit')}</button>`)}
  <div class="card">
    <div class="toolbar">
      <select data-change="ttClass" aria-label="${t('c.class')}">${classOptions(cid)}</select>
      <span class="muted"><i class="fa-regular fa-clock"></i> ${t('tt.hint')}</span>
    </div>
    <div class="table-wrap">${timetableTable(cid, ui.tt.edit)}</div>
    <div class="chips-row load">${SUBJECTS.filter((s) => load[s.id]).map((s) => `<span class="load-chip"><span class="dot" style="--c:${s.color}"></span>${esc(loc(s))}: <b>${load[s.id]}</b></span>`).join('')}</div>
  </div>`;
};

// ---------- Cài đặt ----------
PAGES.settings = () => {
  const s = db.settings;
  const inp = (name, label, val, type = 'text', extra = '') => `<label class="field"><span>${label}</span><input name="${name}" type="${type}" value="${esc(val)}"${extra}></label>`;
  return `
  ${pageHead(t('se.title'), '')}
  <div class="settings-grid">
    <form class="card" id="fSchool">
      <div class="card-head"><h3><i class="fa-solid fa-school"></i> ${t('se.school')}</h3></div>
      <div class="form-grid">
        ${inp('nameVi', t('se.nameVi'), s.nameVi)}
        ${inp('nameLo', t('se.nameLo'), s.nameLo)}
        ${inp('address', t('se.address'), s.address)}
        ${inp('principal', t('se.principal'), s.principal)}
        ${inp('phone', t('c.phone'), s.phone, 'tel')}
        ${inp('year', t('se.year'), s.year)}
      </div>
      <div class="card-foot"><button class="btn primary" data-act="saveSchool"><i class="fa-solid fa-check"></i> ${t('c.save')}</button></div>
    </form>

    <div class="stack">
      <form class="card" id="fExam">
        <div class="card-head"><h3><i class="fa-solid fa-calendar-check"></i> ${t('se.examPlan')}</h3></div>
        <p class="muted">${t('se.examPlanHelp')}</p>
        ${[['lower', `${gradeLabel(1)}–${gradeLabel(4)}`], ['upper', `${gradeLabel(5)}–${gradeLabel(7)}`]].map(([lv, label]) => `
          <div class="exam-plan">
            <h4>${label}</h4>
            ${['1', '2'].map((sm) => {
              const pl = examPlan()[lv][sm];
              const monthOpt = (sel, none) => opts([...(none ? [{ v: '', l: '—' }] : []), ...Array.from({ length: 12 }, (_, i) => ({ v: i + 1, l: 'T' + (i + 1) }))], sel ?? '');
              return `<div class="ep-row"><span class="ep-sem">${t('c.sem' + sm)}</span>
                <span class="ep-group">${MONTH_PARTS.map((p, i) => `<select name="${lv}-${sm}-m${i}" aria-label="${label} ${t('c.sem' + sm)} ${t('gr.monthly')} ${i + 1}">${monthOpt(pl.months[i], i > 0)}</select>`).join('')}</span>
                <span class="ep-exam">${t('gr.exam')} <select name="${lv}-${sm}-exam" aria-label="${label} ${t('c.sem' + sm)} ${t('gr.exam')}">${monthOpt(pl.exam, false)}</select></span></div>`;
            }).join('')}
          </div>`).join('')}
        <div class="card-foot"><button class="btn ghost" data-act="resetExamPlan"><i class="fa-solid fa-rotate-left"></i> ${t('se.examPlanReset')}</button><button class="btn primary" data-act="saveExamPlan"><i class="fa-solid fa-check"></i> ${t('c.save')}</button></div>
      </form>

      <div class="card">
        <div class="card-head"><h3><i class="fa-solid fa-palette"></i> ${t('se.display')}</h3></div>
        <div class="setting-row"><span>${t('se.lang')}</span>${langSwitch()}</div>
        <div class="setting-row"><span>${t('se.theme')}</span>
          <div class="seg"><button data-act="setTheme" data-v="light" class="${!isDark() ? 'on' : ''}"><i class="fa-solid fa-sun"></i> ${t('se.light')}</button><button data-act="setTheme" data-v="dark" class="${isDark() ? 'on' : ''}"><i class="fa-solid fa-moon"></i> ${t('se.dark')}</button></div>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-head"><h3><i class="fa-solid fa-database"></i> ${t('se.data')}</h3></div>
      <p class="muted">${t('se.storage')}</p>
      <div class="btn-col">
        <button class="btn ghost" data-act="backup"><i class="fa-solid fa-download"></i> ${t('se.backup')}</button>
        <label class="btn ghost file-btn"><i class="fa-solid fa-upload"></i> ${t('se.restore')}<input type="file" accept="application/json,.json" data-change="restore" hidden></label>
        ${hasDemo(db)
          ? `<button class="btn ghost" data-act="removeDemo"><i class="fa-solid fa-user-minus"></i> ${t('se.demoRemove')}</button>`
          : `<button class="btn ghost" data-act="addDemo"><i class="fa-solid fa-users"></i> ${t('se.demoAdd')}</button>`}
        <button class="btn danger-ghost" data-act="resetData"><i class="fa-solid fa-rotate-left"></i> ${t('se.reset')}</button>
      </div>
    </div>
  </div>`;
};

// ===== Xử lý sự kiện =====
// ---------- Tài khoản & phân quyền (quản lý) ----------
const ROLE_BADGE = { admin: 'exc', teacher: 'info', student: 'neutral' };
const roleBadge = (r) => `<span class="badge ${ROLE_BADGE[r]}"><i class="fa-solid ${r === 'admin' ? 'fa-user-shield' : r === 'teacher' ? 'fa-chalkboard-user' : 'fa-user-graduate'}"></i> ${t('role.' + r)}</span>`;
const suggestEmail = (role, refId) => {
  const p = role === 'teacher' ? teacherById(refId) : role === 'student' ? studentById(refId) : null;
  return p ? `${p.code.toLowerCase()}@${EMAIL_DOMAIN}` : '';
};

function filteredAccounts() {
  const q = norm(ui.acc.q);
  const order = { admin: 0, teacher: 1, student: 2 };
  return db.accounts
    .filter((a) => (!ui.acc.role || a.role === ui.acc.role) && (!q || norm(`${a.email} ${displayName(a)}`).includes(q)))
    .sort((a, b) => order[a.role] - order[b.role] || a.email.localeCompare(b.email));
}

function accountList() {
  const list = filteredAccounts();
  const pages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
  ui.acc.page = Math.min(Math.max(1, ui.acc.page), pages);
  const rows = list.slice((ui.acc.page - 1) * PAGE_SIZE, ui.acc.page * PAGE_SIZE);
  const self = me().id;
  return `<div class="table-wrap"><table class="table">
    <thead><tr><th>${t('acc.email')}</th><th>${t('acc.role')}</th><th>${t('acc.person')}</th><th>${t('acc.perms')}</th><th>${t('c.status')}</th><th>${t('acc.lastLogin')}</th><th class="right">${t('c.actions')}</th></tr></thead>
    <tbody>${rows.map((a) => {
      const p = a.role === 'teacher' ? teacherById(a.refId) : a.role === 'student' ? studentById(a.refId) : null;
      const sub = p ? (a.role === 'student' ? `${esc(p.code)} · ${esc(className(classById(p.classId)))}` : `${esc(p.code)} · ${esc(loc(subjectById(p.subject)))}`) : '';
      const all = ROLE_PERMS[a.role];
      return `<tr>
        <td><b class="email">${esc(a.email)}</b>${a.id === self ? ` <span class="chip">★</span>` : ''}</td>
        <td>${roleBadge(a.role)}</td>
        <td>${esc(displayName(a))}<small class="block muted">${sub}</small></td>
        <td><span class="perm-count" tabindex="0" data-tip="${esc(all.filter((k) => a.perms.includes(k)).map((k) => t('nav.' + k)).join(', ') || '—')}">${t('acc.permCount', { n: all.filter((k) => a.perms.includes(k)).length, t: all.length })}</span></td>
        <td>${a.active ? `<span class="badge good"><i class="fa-solid fa-circle-check"></i> ${t('acc.active')}</span>` : `<span class="badge bad"><i class="fa-solid fa-lock"></i> ${t('acc.locked')}</span>`}</td>
        <td>${a.lastLogin ? fmtDateTime(a.lastLogin) : `<span class="muted">${t('acc.never')}</span>`}</td>
        <td class="right"><div class="row-actions">
          <button class="icon-btn sm" data-act="editAccount" data-id="${a.id}" title="${t('c.edit')}" aria-label="${t('c.edit')}"><i class="fa-regular fa-pen-to-square"></i></button>
          <button class="icon-btn sm" data-act="resetPass" data-id="${a.id}" title="${t('acc.resetPass')}" aria-label="${t('acc.resetPass')}"><i class="fa-solid fa-key"></i></button>
          <button class="icon-btn sm" data-act="toggleLock" data-id="${a.id}" title="${t(a.active ? 'acc.lock' : 'acc.unlock')}" aria-label="${t(a.active ? 'acc.lock' : 'acc.unlock')}" ${a.id === self ? 'disabled' : ''}><i class="fa-solid ${a.active ? 'fa-lock' : 'fa-lock-open'}"></i></button>
          <button class="icon-btn sm danger" data-act="delAccount" data-id="${a.id}" title="${t('c.delete')}" aria-label="${t('c.delete')}" ${a.id === self ? 'disabled' : ''}><i class="fa-regular fa-trash-can"></i></button>
        </div></td>
      </tr>`;
    }).join('') || emptyRow(7)}</tbody>
  </table></div>
  <div class="list-foot"><span class="muted">${t('c.total')}: ${list.length}</span>${pager(list.length, ui.acc.page, 'accPage')}</div>`;
}

PAGES.accounts = () => {
  const noT = db.teachers.filter((x) => !accountOf('teacher', x.id)).length;
  const noS = db.students.filter((s) => !accountOf('student', s.id)).length;
  const count = (r) => db.accounts.filter((a) => a.role === r).length;
  return `
  ${pageHead(t('acc.title'), t('acc.sub'), `
    <button class="btn ghost" data-act="bulkAccounts"><i class="fa-solid fa-users-gear"></i> ${t('acc.bulk')}</button>
    <button class="btn primary" data-act="newAccount"><i class="fa-solid fa-user-plus"></i> ${t('acc.add')}</button>`)}
  <div class="stats">
    ${['admin', 'teacher', 'student'].map((r, i) => `<div class="stat t${[2, 1, 3][i]}"><div class="stat-icon"><i class="fa-solid ${r === 'admin' ? 'fa-user-shield' : r === 'teacher' ? 'fa-chalkboard-user' : 'fa-user-graduate'}"></i></div><div><span class="stat-label">${t('role.' + r)}</span><b class="stat-value">${count(r)}</b>${r === 'teacher' ? `<small>${t('acc.without', { role: t('role.teacher'), n: noT })}</small>` : r === 'student' ? `<small>${t('acc.without', { role: t('role.student'), n: noS })}</small>` : ''}</div></div>`).join('')}
    <div class="stat t4"><div class="stat-icon"><i class="fa-solid fa-lock"></i></div><div><span class="stat-label">${t('acc.locked')}</span><b class="stat-value">${db.accounts.filter((a) => !a.active).length}</b></div></div>
  </div>
  <div class="card">
    <div class="toolbar">
      <div class="search"><i class="fa-solid fa-magnifying-glass"></i><input type="search" placeholder="${t('c.search')}" value="${esc(ui.acc.q)}" data-input="accSearch" aria-label="${t('c.search')}"></div>
      <select data-change="accRole" aria-label="${t('acc.role')}">${opts([{ v: '', l: `${t('acc.role')}: ${t('c.all')}` }, ...['admin', 'teacher', 'student'].map((r) => ({ v: r, l: t('role.' + r) }))], ui.acc.role)}</select>
    </div>
    <div id="accList">${accountList()}</div>
  </div>
  <p class="note"><i class="fa-solid fa-shield-halved"></i> ${t('acc.demoNote')}</p>`;
};

// Form tạo / sửa tài khoản: chọn vai trò → người dùng → email, mật khẩu → tích chọn chức năng được dùng
function accountForm(a, preset = {}) {
  const isNew = !a;
  const self = !!a && a.id === me().id;
  let role = a ? a.role : preset.role || 'teacher';
  let autoEmail = isNew;

  const personField = (r, sel) => {
    if (r === 'admin') return `<label class="field"><span>${t('acc.displayName')} <span class="req">*</span></span><input name="name" value="${esc(a ? a.name : '')}"></label>`;
    const list = r === 'teacher' ? db.teachers.slice().sort(byName) : db.students.slice().sort((x, y) => classOrder(x) - classOrder(y) || byName(x, y));
    return `<label class="field"><span>${t('acc.person')} <span class="req">*</span></span><select name="refId"><option value="">—</option>${list.map((p) => {
      const taken = accountOf(r, p.id);
      const dis = taken && (!a || taken.id !== a.id);
      const extra = r === 'student' ? ` · ${className(classById(p.classId))}` : ` · ${loc(subjectById(p.subject))}`;
      return `<option value="${p.id}"${p.id === sel ? ' selected' : ''}${dis ? ' disabled' : ''}>${esc(p.code)} · ${esc(p.name)}${esc(extra)}${dis ? ` (${t('acc.hasAccount')})` : ''}</option>`;
    }).join('')}</select></label>`;
  };
  const permsHtml = (r, checked) => ROLE_PERMS[r].map((k) => `<label class="perm">
      <input type="checkbox" value="${k}"${checked.includes(k) ? ' checked' : ''}${self && k === 'accounts' ? ' disabled' : ''}>
      <i class="fa-solid ${PERM_ICON[k] || 'fa-circle'}"></i>
      <span><b>${t('nav.' + k)}</b><small>${t('perm.' + k)}</small></span>
    </label>`).join('');

  const m = openModal({
    title: isNew ? t('acc.add') : t('acc.editTitle'),
    wide: true,
    body: `<form class="form-grid" id="accForm" novalidate>
      <label class="field"><span>${t('acc.role')}</span><select name="role"${isNew ? '' : ' disabled'}>${opts(['admin', 'teacher', 'student'].map((r) => ({ v: r, l: t('role.' + r) })), role)}</select></label>
      <div id="accPerson">${personField(role, a ? a.refId : preset.refId || '')}</div>
      <label class="field"><span>${t('acc.email')} <span class="req">*</span></span><input name="email" type="email" autocomplete="off" value="${esc(a ? a.email : suggestEmail(role, preset.refId))}" placeholder="name@icloud.com"></label>
      <label class="field"><span>${isNew ? `${t('acc.pass')} <span class="req">*</span>` : t('acc.passKeep')}</span><input name="pass" type="text" autocomplete="new-password" value="${isNew ? '123456' : ''}"></label>
      <div class="full">
        <div class="perm-head"><span>${t('acc.perms')}</span><button type="button" class="link" data-perm-all><i class="fa-solid fa-check-double"></i> ${t('acc.selectAll')}</button></div>
        <div class="perm-grid" id="accPerms">${permsHtml(role, a ? a.perms : ROLE_PERMS[role])}</div>
      </div>
      <label class="check full"><input type="checkbox" name="active"${!a || a.active ? ' checked' : ''}${self ? ' disabled' : ''}> ${t('acc.active')}</label>
      <p class="form-error full" hidden></p>
    </form>`,
    foot: `<button class="btn ghost" data-close>${t('c.cancel')}</button><button class="btn primary" data-save><i class="fa-solid fa-check"></i> ${t('c.save')}</button>`,
  });
  const f = $('#accForm', m);
  const err = $('.form-error', f);
  f.elements.role.addEventListener('change', () => {
    role = f.elements.role.value;
    $('#accPerson', m).innerHTML = personField(role, '');
    $('#accPerms', m).innerHTML = permsHtml(role, ROLE_PERMS[role]);
    if (autoEmail) f.elements.email.value = '';
  });
  f.addEventListener('change', (e) => {
    if (e.target.name === 'refId' && autoEmail) f.elements.email.value = suggestEmail(role, e.target.value);
  });
  f.elements.email.addEventListener('input', () => { autoEmail = false; });
  $('[data-perm-all]', m).addEventListener('click', () => {
    const boxes = $$('#accPerms input:not(:disabled)', m);
    const on = !boxes.every((b) => b.checked);
    boxes.forEach((b) => { b.checked = on; });
  });

  $('[data-save]', m).addEventListener('click', () => {
    const fail = (msg) => { err.textContent = msg; err.hidden = false; };
    const email = f.elements.email.value.trim();
    const pass = f.elements.pass.value;
    const refId = role === 'admin' ? '' : f.elements.refId.value;
    const name = role === 'admin' ? f.elements.name.value.trim() : '';
    if (role === 'admin' ? !name : !refId) return fail(role === 'admin' ? t('c.required') : t('acc.personRequired'));
    if (!EMAIL_RE.test(email)) return fail(t('acc.emailInvalid'));
    if (db.accounts.some((o) => o !== a && o.email.toLowerCase() === email.toLowerCase())) return fail(t('acc.emailTaken'));
    if (role !== 'admin') { const taken = accountOf(role, refId); if (taken && taken !== a) return fail(t('acc.personTaken')); }
    if ((isNew || pass) && pass.length < 6) return fail(t('se.passShort'));
    const perms = $$('#accPerms input', m).filter((b) => b.checked).map((b) => b.value);
    const data = { email, role, refId, name, perms, active: self ? true : f.elements.active.checked };
    if (isNew) db.accounts.push({ id: nextId('a'), pass, lastLogin: '', ...data });
    else { Object.assign(a, data); if (pass) a.pass = pass; }
    save();
    closeModal();
    toast(t('c.saved'));
    self ? renderApp() : renderView();
  });
  setTimeout(() => { const first = f.querySelector('select:not(:disabled), input'); if (first) first.focus(); }, 60);
}

function bulkAccounts() {
  formModal({
    title: t('acc.bulkTitle'),
    submitLabel: t('acc.add'),
    intro: `<p class="alert info"><i class="fa-solid fa-circle-info"></i> ${t('acc.bulkHint', { domain: EMAIL_DOMAIN })}</p>`,
    values: { role: 'student', cls: '', pass: '123456' },
    fields: [
      { name: 'role', label: t('acc.role'), type: 'select', options: [{ v: 'student', l: t('role.student') }, { v: 'teacher', l: t('role.teacher') }] },
      { name: 'cls', label: `${t('c.class')} (${t('role.student')})`, type: 'select', options: [{ v: '', l: t('c.all') }, ...sortedClasses().map((c) => ({ v: c.id, l: className(c) }))] },
      { name: 'pass', label: t('acc.pass'), required: true, full: true },
    ],
    onSubmit: (v) => {
      if (v.pass.length < 6) return t('se.passShort');
      const people = v.role === 'teacher' ? db.teachers : db.students.filter((s) => !v.cls || s.classId === v.cls);
      let n = 0;
      people.forEach((p) => {
        if (accountOf(v.role, p.id)) return;
        const email = `${p.code.toLowerCase()}@${EMAIL_DOMAIN}`;
        if (db.accounts.some((a) => a.email.toLowerCase() === email)) return;
        db.accounts.push({ id: nextId('a'), email, pass: v.pass, role: v.role, refId: p.id, name: '', perms: ROLE_PERMS[v.role].slice(), active: true, lastLogin: '' });
        n++;
      });
      save();
      toast(n ? t('acc.bulkDone', { n }) : t('acc.bulkNone'), n ? 'ok' : 'error');
      renderView();
    },
  });
}

// ---------- Tài khoản của tôi (mọi vai trò) ----------
PAGES.profile = () => {
  const u = me();
  const p = myPerson();
  const all = ROLE_PERMS[u.role];
  return `
  ${pageHead(t('pf.title'), '')}
  <div class="settings-grid">
    <div class="card">
      <div class="profile">
        <span class="avatar lg ${p ? p.gender : 'M'}">${esc(initials(displayName(u)))}</span>
        <div><h3>${esc(displayName(u))}</h3><p class="muted">${esc(u.email)}</p><p style="margin-top:6px">${roleBadge(u.role)}</p></div>
      </div>
      <ul class="kv">
        ${p ? `<li><span>${t('c.code')}</span><b>${esc(p.code)}</b></li>` : ''}
        ${u.role === 'student' && p ? `<li><span>${t('c.class')}</span><b>${esc(className(classById(p.classId)))}</b></li>` : ''}
        ${u.role === 'teacher' && p ? `<li><span>${t('c.subject')}</span><b>${esc(loc(subjectById(p.subject)))}</b></li>` : ''}
        <li><span>${t('acc.lastLogin')}</span><b>${fmtDateTime(u.lastLogin) || '—'}</b></li>
      </ul>
      ${p ? `<h4 class="sub-title"><i class="fa-solid fa-user-lock"></i> ${t('pf.personal')}</h4>
      ${infoGrid(u.role === 'student' ? studentInfo(p) : teacherInfo(p))}
      <p class="note"><i class="fa-solid fa-shield-halved"></i> ${t('pv.note')}</p>` : ''}
      <h4 class="sub-title">${t('acc.perms')}</h4>
      <ul class="perm-view">${all.map((k) => `<li class="${u.perms.includes(k) ? 'on' : ''}"><i class="fa-solid ${u.perms.includes(k) ? 'fa-circle-check' : 'fa-circle-xmark'}"></i> ${t('perm.' + k)}</li>`).join('')}</ul>
    </div>
    <form class="card" id="fPass">
      <div class="card-head"><h3><i class="fa-solid fa-key"></i> ${t('se.password')}</h3></div>
      <div class="form-grid">
        <label class="field full"><span>${t('pf.oldPass')}</span><input name="old" type="password" autocomplete="current-password"></label>
        <label class="field full"><span>${t('se.newPass')}</span><input name="pass" type="password" autocomplete="new-password"></label>
      </div>
      <div class="card-foot"><button class="btn primary" data-act="savePass"><i class="fa-solid fa-check"></i> ${t('c.save')}</button></div>
    </form>
  </div>`;
};

// ---------- Giáo viên: trang chủ, lịch dạy, lớp phụ trách ----------
const lessonRow = (l, withAct) => `<li class="lesson">
  <div class="ls-time"><b>${PERIOD_TIME[l.p - 1]}</b><small>${t('tt.period')} ${l.p}</small></div>
  <div class="ls-main" style="--c:${l.sub ? l.sub.color : '#999'}"><b>${esc(loc(l.sub))}</b><small>${esc(l.label)}</small></div>
  ${withAct || ''}
</li>`;

PAGES.thome = () => {
  const x = myPerson();
  if (!x) return `<div class="card empty-state"><i class="fa-solid fa-link-slash"></i><p>${t('sh.notLinked')}</p></div>`;
  const classes = myClasses();
  const lessons = lessonsOfTeacher(x.id);
  const today = lessons.filter((l) => l.d === todayDow());
  const nStudents = classes.reduce((a, c) => a + studentsOf(c.id).length, 0);
  const tile = (icon, tone, label, value, href) => `<a class="stat ${tone}" href="#${href}"><div class="stat-icon"><i class="fa-solid ${icon}"></i></div><div><span class="stat-label">${label}</span><b class="stat-value">${value}</b></div></a>`;
  return `
  <div class="hero">
    <div><h2>${t('th.hello', { name: esc(x.name) })}</h2><p>${esc(schoolName())} · ${esc(loc(subjectById(x.subject)))} · ${t('d.' + todayDow()) === 'd.' + todayDow() ? '' : t('d.' + todayDow()) + ' · '}${fmtDate(todayIso())}</p></div>
    <div class="hero-flag" aria-hidden="true"><span></span><span></span><span></span></div>
  </div>
  <div class="stats three">
    ${tile('fa-people-roof', 't1', t('th.classes'), classes.length, can('tclasses') ? 'tclasses' : 'thome')}
    ${tile('fa-calendar-week', 't2', t('th.periods'), lessons.length, can('tschedule') ? 'tschedule' : 'thome')}
    ${tile('fa-user-graduate', 't3', t('th.students'), nStudents, can('tclasses') ? 'tclasses' : 'thome')}
  </div>
  ${latestNoticesCard()}
  <div class="grid-2">
    <div class="card">
      <div class="card-head"><h3><i class="fa-solid fa-clock"></i> ${t('th.today')}</h3>${can('tschedule') ? `<a class="link" href="#tschedule">${t('nav.tschedule')} <i class="fa-solid fa-arrow-right"></i></a>` : ''}</div>
      <ul class="lessons">${today.map((l) => lessonRow({ ...l, label: className(l.c) }, can('attendance') ? `<button class="btn sm primary" data-act="goAttendance" data-id="${l.c.id}"><i class="fa-solid fa-clipboard-check"></i> ${t('nav.attendance')}</button>` : '')).join('') || `<li class="muted empty-line">${t('th.noLesson')}</li>`}</ul>
    </div>
    <div class="card">
      <div class="card-head"><h3><i class="fa-solid fa-people-roof"></i> ${t('th.classes')}</h3></div>
      <ul class="events">${classes.map((c) => `<li><div class="ev-date"><b>${esc(className(c))}</b></div><span class="ev-name">${taughtSubjects(c.id).map((s) => esc(loc(s))).join(', ') || '—'}${c.homeroomId === x.id ? ` <span class="chip home"><i class="fa-solid fa-star"></i> ${t('th.homeroom')}</span>` : ''}</span><span class="muted">${studentsOf(c.id).length} ${t('c.students')}</span></li>`).join('') || `<li class="muted">${t('th.noClass')}</li>`}</ul>
    </div>
  </div>`;
};

PAGES.tschedule = () => {
  const x = myPerson();
  if (!x) return `<div class="card empty-state"><p>${t('sh.notLinked')}</p></div>`;
  const lessons = lessonsOfTeacher(x.id);
  const at = (d, p) => lessons.filter((l) => l.d === d && l.p === p);
  return `
  ${pageHead(t('nav.tschedule'), `${esc(x.name)} · ${t('th.weekTotal', { n: lessons.length })}`)}
  <div class="card">
    <p class="muted" style="margin-bottom:12px"><i class="fa-regular fa-clock"></i> ${t('tt.hint')}</p>
    <div class="table-wrap"><table class="table tt">
      <thead><tr><th>${t('tt.period')}</th>${DAYS.map((d) => `<th class="${d === todayDow() ? 'today' : ''}">${t('d.' + d)}</th>`).join('')}</tr></thead>
      <tbody>${PERIODS.map((p) => `${p === 5 ? `<tr class="tt-break"><td colspan="${DAYS.length + 1}"><i class="fa-solid fa-bowl-rice"></i> 11:30 – 13:30</td></tr>` : ''}
        <tr><th class="tt-p">${p}<small>${PERIOD_TIME[p - 1]}</small></th>${DAYS.map((d) => `<td class="${d === todayDow() ? 'today' : ''}">${at(d, p).map((l) => `<div class="tt-cell" style="--c:${l.sub.color}"><b>${esc(className(l.c))}</b><small>${esc(loc(l.sub))} · ${t('cl.room')} ${esc(l.c.room || '—')}</small></div>`).join('') || '<span class="muted">—</span>'}</td>`).join('')}</tr>`).join('')}</tbody>
    </table></div>
  </div>`;
};

PAGES.tclasses = () => {
  const x = myPerson();
  const classes = myClasses();
  if (!x || !classes.length) return pageHead(t('nav.tclasses'), '') + noClassCard();
  return `
  ${pageHead(t('nav.tclasses'), `${classes.length} ${t('c.class').toLowerCase()}`)}
  <div class="class-grid">${classes.map((c) => {
    const list = studentsOf(c.id);
    const subs = taughtSubjects(c.id);
    const n = lessonsOfTeacher(x.id).filter((l) => l.c.id === c.id).length;
    return `<div class="class-card">
      <div class="cc-top"><span class="cc-name">${esc(className(c))}</span>${c.homeroomId === x.id ? `<span class="chip home"><i class="fa-solid fa-star"></i> ${t('th.homeroom')}</span>` : `<span class="chip">${gradeLabel(c.grade)}</span>`}</div>
      <ul class="cc-info">
        <li><i class="fa-solid fa-book"></i> ${t('th.mySubjects')}: <b>${subs.map((s) => esc(loc(s))).join(', ') || '—'}</b></li>
        <li><i class="fa-solid fa-calendar-week"></i> ${t('th.periods')}: <b>${n}</b></li>
        <li><i class="fa-solid fa-door-open"></i> ${t('cl.room')}: ${esc(c.room || '—')}</li>
        <li><i class="fa-solid fa-users"></i> ${t('cl.size')}: <b>${list.length}</b></li>
      </ul>
      <div class="cc-actions">
        <button class="btn sm ghost" data-act="teacherStudentList" data-id="${c.id}"><i class="fa-solid fa-list"></i> ${t('th.studentList')}</button>
        ${can('attendance') ? `<button class="btn sm ghost" data-act="goAttendance" data-id="${c.id}" title="${t('nav.attendance')}" aria-label="${t('nav.attendance')}"><i class="fa-solid fa-clipboard-check"></i></button>` : ''}
        ${can('grades') ? `<button class="btn sm ghost" data-act="goGrades" data-id="${c.id}" title="${t('nav.grades')}" aria-label="${t('nav.grades')}"><i class="fa-solid fa-star-half-stroke"></i></button>` : ''}
      </div>
    </div>`;
  }).join('')}</div>`;
};

// Danh sách học sinh của lớp: chủ nhiệm xem đủ thông tin cá nhân, in / xuất / nhập Excel; giáo viên bộ môn chỉ thấy tên
function teacherStudentList(c) {
  const list = studentsOf(c.id);
  const hr = isHomeroomOf(c.id);
  openModal({
    title: `${t('th.studentList')} · ${className(c)}`,
    wide: true,
    body: `${hr ? '' : `<p class="alert info"><i class="fa-solid fa-user-lock"></i> <span>${t('pv.note')}</span></p>`}
      <div class="table-wrap"><table class="table compact">
      <thead><tr><th>#</th><th>${t('c.code')}</th><th>${t('c.name')}</th>${hr ? `<th>${t('st.dob')}</th><th>${t('st.birthplace')}</th><th>${t('st.phone')}</th><th>${t('st.address')}</th><th>${t('st.parent')}</th>` : ''}<th class="right">${t('at.rate')}</th><th class="right">${t('c.sem1')}</th>${hr ? '<th></th>' : ''}</tr></thead>
      <tbody>${list.map((s, i) => `<tr><td class="muted">${i + 1}</td><td class="mono">${esc(s.code)}</td><td>${personCell(s, genderLabel(s.gender))}</td>
        ${hr ? `<td>${fmtDate(s.dob)}</td><td>${esc(s.birthplace || '')}</td><td>${esc(s.phone || '')}</td><td>${esc(s.address || '')}</td><td>${esc(s.parent || '')}<small class="block muted">${esc(s.parentPhone || '')}</small></td>` : ''}
        <td class="right">${pct(attStats(s.id).rate)}</td><td class="right"><b>${fmtScore(overallAvg(s.id, 1)) || '—'}</b></td>
        ${hr ? `<td class="right"><button class="icon-btn sm" data-act="viewStudent" data-id="${s.id}" title="${t('c.view')}" aria-label="${t('c.view')}"><i class="fa-regular fa-eye"></i></button></td>` : ''}</tr>`).join('') || emptyRow(hr ? 11 : 5)}</tbody>
    </table></div>`,
    foot: `<button class="btn ghost" data-close>${t('c.close')}</button>
      ${hr ? `<button class="btn ghost" data-act="hrImportStudents" data-id="${c.id}"><i class="fa-solid fa-file-excel"></i> ${t('im.btn')}</button>
      <button class="btn ghost" data-act="hrExportStudents" data-id="${c.id}"><i class="fa-solid fa-file-export"></i> ${t('c.exportXlsx')}</button>
      <button class="btn primary" data-act="hrPrintStudents" data-id="${c.id}"><i class="fa-solid fa-print"></i> ${t('st.printList')}</button>` : ''}`,
  });
}

// ---------- Học sinh: trang chủ, lớp, lịch học, điểm danh, điểm ----------
const notLinked = () => `<div class="card empty-state"><i class="fa-solid fa-link-slash"></i><p>${t('sh.notLinked')}</p></div>`;

PAGES.shome = () => {
  const s = myPerson();
  if (!s) return notLinked();
  const c = classById(s.classId);
  const grid = db.timetable[s.classId] || {};
  const today = PERIODS.map((p) => ({ p, sub: subjectById(grid[`${todayDow()}-${p}`]) })).filter((l) => l.sub);
  const avg = overallAvg(s.id, 1);
  const at = attStats(s.id);
  const tile = (icon, tone, label, value, sub, href) => `<a class="stat ${tone}" href="#${href}"><div class="stat-icon"><i class="fa-solid ${icon}"></i></div><div><span class="stat-label">${label}</span><b class="stat-value">${value}</b>${sub ? `<small>${sub}</small>` : ''}</div></a>`;
  return `
  <div class="hero">
    <div><h2>${t('sh.hello', { name: esc(s.name) })}</h2><p>${esc(schoolName())} · ${esc(className(c))} · ${fmtDate(todayIso())}</p></div>
    <div class="hero-flag" aria-hidden="true"><span></span><span></span><span></span></div>
  </div>
  <div class="stats">
    ${tile('fa-people-roof', 't1', t('c.class'), esc(className(c)), `${t('cl.homeroom')}: ${esc((teacherById(c && c.homeroomId) || {}).name || '—')}`, can('sclass') ? 'sclass' : 'shome')}
    ${can('sgrades') ? tile('fa-star-half-stroke', 't2', `${t('gr.overall')} · ${t('c.sem1')}`, fmtScore(avg) || '—', avg != null ? t(rankOf(avg).k) : '', 'sgrades') : ''}
    ${can('sattendance') ? tile('fa-clipboard-check', 't3', t('at.rate'), pct(at.rate), `${at.total} ${t('at.days').toLowerCase()}`, 'sattendance') : ''}
  </div>
  ${latestNoticesCard()}
  <div class="card">
    <div class="card-head"><h3><i class="fa-solid fa-clock"></i> ${t('sh.today')}</h3>${can('sschedule') ? `<a class="link" href="#sschedule">${t('nav.sschedule')} <i class="fa-solid fa-arrow-right"></i></a>` : ''}</div>
    <ul class="lessons">${today.map((l) => lessonRow({ ...l, label: (teacherFor(l.sub.id, s.classId) || {}).name || '—' })).join('') || `<li class="muted empty-line">${t('sh.noLesson')}</li>`}</ul>
  </div>`;
};

PAGES.sclass = () => {
  const s = myPerson();
  if (!s) return notLinked();
  const c = classById(s.classId);
  if (!c) return noClassCard();
  const hr = teacherById(c.homeroomId);
  const mates = studentsOf(c.id);
  return `
  ${pageHead(`${t('nav.sclass')}: ${esc(className(c))}`, `${t('cl.grade')} ${gradeLabel(c.grade)} · ${t('cl.room')} ${esc(c.room || '—')} · ${esc(db.settings.year)}`)}
  <div class="grid-2">
    <div class="card">
      <div class="card-head"><h3><i class="fa-solid fa-star"></i> ${t('cl.homeroom')}</h3></div>
      ${hr ? `<div class="person big">${personCell(hr, `${esc(loc(subjectById(hr.subject)))} · ${esc(hr.email || '')}`)}</div>` : `<p class="muted">${t('c.none')}</p>`}
      <h4 class="sub-title">${t('cl.teachers')}</h4>
      <div class="table-wrap"><table class="table compact">
        <thead><tr><th>${t('c.subject')}</th><th>${t('role.teacher')}</th><th>${t('c.email')}</th></tr></thead>
        <tbody>${classSubjects(c.id).map((sub) => { const x = teacherFor(sub.id, c.id); return `<tr><td><span class="dot" style="--c:${sub.color}"></span>${esc(loc(sub))}</td><td>${x ? esc(x.name) : '<span class="muted">—</span>'}</td><td class="muted">${x ? esc(x.email) : ''}</td></tr>`; }).join('')}</tbody>
      </table></div>
    </div>
    <div class="card">
      <div class="card-head"><h3><i class="fa-solid fa-users"></i> ${t('sh.classmates')}</h3><span class="muted">${mates.length} ${t('c.students')}</span></div>
      <ul class="mates">${mates.map((m) => `<li class="${m.id === s.id ? 'me' : ''}">${personCell(m, esc(m.code))}</li>`).join('')}</ul>
    </div>
  </div>`;
};

PAGES.sschedule = () => {
  const s = myPerson();
  if (!s) return notLinked();
  const c = classById(s.classId);
  return `
  ${pageHead(t('nav.sschedule'), `${esc(className(c))} · ${esc(db.settings.year)}`)}
  <div class="card">
    <p class="muted" style="margin-bottom:12px"><i class="fa-regular fa-clock"></i> ${t('tt.hint')}</p>
    <div class="table-wrap">${timetableTable(s.classId, false)}</div>
  </div>`;
};

PAGES.sattendance = () => {
  const s = myPerson();
  if (!s) return notLinked();
  const st = attStats(s.id);
  const rows = Object.keys(db.attendance)
    .filter((k) => db.attendance[k][s.id])
    .map((k) => ({ date: k.split('|')[1], v: db.attendance[k][s.id] }))
    .sort((a, b) => b.date.localeCompare(a.date));
  const byK = Object.fromEntries(ATT.map((a) => [a.k, a]));
  return `
  ${pageHead(t('nav.sattendance'), `${esc(s.name)} · ${esc(className(classById(s.classId)))}`)}
  <div class="stats">
    <div class="stat t1"><div class="stat-icon"><i class="fa-solid fa-percent"></i></div><div><span class="stat-label">${t('at.rate')}</span><b class="stat-value">${pct(st.rate)}</b><small>${st.total} ${t('at.days').toLowerCase()}</small></div></div>
    ${ATT.slice(1).map((a, i) => `<div class="stat t${[2, 3, 4][i]}"><div class="stat-icon"><i class="fa-solid ${a.i}"></i></div><div><span class="stat-label">${t(a.l)}</span><b class="stat-value">${st[a.k]}</b></div></div>`).join('')}
  </div>
  <div class="card">
    <div class="table-wrap"><table class="table">
      <thead><tr><th>${t('c.date')}</th><th>${t('c.status')}</th></tr></thead>
      <tbody>${rows.map((r) => { const a = byK[r.v]; const wd = new Date(r.date + 'T00:00:00').getDay(); return `<tr><td>${I18N[LANG]['d.' + wd] ? t('d.' + wd) + ', ' : ''}${fmtDate(r.date)}</td><td><span class="badge ${a.c}"><i class="fa-solid ${a.i}"></i> ${t(a.l)}</span></td></tr>`; }).join('') || `<tr><td colspan="2" class="empty">${t('sh.noRecords')}</td></tr>`}</tbody>
    </table></div>
  </div>`;
};

// ----- Điểm của 1 bài thi (1 tháng, hoặc giữa / cuối kỳ): tất cả các môn + tổng, TB, hạng trong lớp -----
function partResult(sid, sem, part) {
  const cid = studentClass(sid);
  const subs = part === 'exam' ? examSubjects(cid) : classSubjects(cid);
  const vals = subs.map((sub) => viewVal(sid, sub.id, sem, part));
  const have = vals.filter((v) => v != null);
  const m = mean(vals);
  return { subs, vals, total: have.length ? round1(have.reduce((a, b) => a + b, 0)) : null, avg: m == null ? null : round1(m) };
}
function partPosition(sid, sem, part) {
  const mine = partResult(sid, sem, part).avg;
  if (mine == null) return null;
  const list = studentsOf(studentClass(sid));
  const avgs = list.map((x) => partResult(x.id, sem, part).avg).filter((v) => v != null).sort((a, b) => b - a);
  return { pos: avgs.indexOf(mine) + 1, n: list.length };
}
// Tháng mới nhất đã có điểm trong học kỳ (mặc định khi mở trang)
function latestPart(sid, sem) {
  const ps = monthParts(studentClass(sid), sem);
  for (let i = ps.length - 1; i >= 0; i--) if (partResult(sid, sem, ps[i]).avg != null) return ps[i];
  return ps[0];
}

function studentPartView(s, sem, part) {
  const cid = s.classId;
  const r = partResult(s.id, sem, part);
  const pos = partPosition(s.id, sem, part);
  const conduct = part === 'exam' ? null : viewVal(s.id, CONDUCT.id, sem, part);
  const isMonth = part !== 'exam';
  const mo = isMonth ? planOf(cid, sem).months[MONTH_PARTS.indexOf(part)] : null;
  const att = isMonth ? attMonthRate(s.id, mo) : null;
  const tile = (icon, tone, label, value, sub = '') => `<div class="stat ${tone}"><div class="stat-icon"><i class="fa-solid ${icon}"></i></div><div><span class="stat-label">${label}</span><b class="stat-value">${value}</b>${sub ? `<small>${sub}</small>` : ''}</div></div>`;
  return `
    <div class="stats">
      ${tile('fa-calculator', 't1', t('gr.total'), fmtScore(r.total) || '—', `${r.vals.filter((v) => v != null).length}/${r.subs.length} ${t('c.subject').toLowerCase()}`)}
      ${tile('fa-star-half-stroke', 't2', t('gr.overall'), fmtScore(r.avg) || '—', r.avg != null ? t(rankOf(r.avg).k) : '')}
      ${tile('fa-ranking-star', 't3', t('gr.position'), pos ? `${pos.pos}<small class="muted">/${pos.n}</small>` : '—', esc(className(classById(cid))))}
      ${isMonth ? tile('fa-user-check', 't4', loc(CONDUCT), fmtScore(conduct) || '—', `${t('at.rate')}: ${pct(att)}`) : ''}
    </div>
    <div class="table-wrap"><table class="table">
      <thead><tr><th>#</th><th>${t('c.subject')}</th><th>${t('role.teacher')}</th><th class="center">${esc(partLabel(part, sem, cid))}</th><th>${t('gr.rank')}</th></tr></thead>
      <tbody>${r.subs.map((sub, i) => {
        const v = r.vals[i];
        return `<tr><td class="muted">${i + 1}</td><td><span class="dot" style="--c:${sub.color}"></span><b>${esc(loc(sub))}</b></td>
          <td class="muted">${esc((teacherFor(sub.id, cid) || {}).name || '')}</td>
          <td class="center ${v != null && v < 5 ? 'low' : ''}"><b class="score-pill">${v != null ? fmtScore(v) : '—'}</b></td>
          <td>${v != null ? rankBadge(v) : `<span class="muted">${t('sg.noScore')}</span>`}</td></tr>`;
      }).join('')}
      <tr class="total-row"><td></td><td>${t('gr.total')} / ${t('gr.overall')}</td><td></td><td class="center"><b>${fmtScore(r.total) || '—'}</b> / <b>${fmtScore(r.avg) || '—'}</b></td><td>${rankBadge(r.avg)}</td></tr>
      ${isMonth ? `<tr class="conduct-row"><td></td><td><span class="dot" style="--c:${CONDUCT.color}"></span><b>${esc(loc(CONDUCT))}</b><small class="block muted">${t('gr.conductSub')}</small></td><td class="muted">${t('at.rate')}: ${pct(att)}</td><td class="center"><b>${fmtScore(conduct) || '—'}</b></td><td></td></tr>` : ''}
      </tbody>
    </table></div>
    ${part === 'exam' ? `<p class="note"><i class="fa-solid fa-circle-info"></i> ${t('sg.examNote')}</p>` : ''}`;
}

PAGES.sgrades = () => {
  const s = myPerson();
  if (!s) return notLinked();
  const sem = ui.sg.sem;
  const cid = s.classId, mp = sem === 'y' ? MONTH_PARTS : monthParts(cid, sem);
  const all = overallAvg(s.id, sem);
  const subjects = classSubjects(cid);
  // Theo từng tháng / bài thi (mặc định: tháng mới nhất có điểm) hoặc tổng kết học kỳ
  const parts = sem === 'y' ? [] : partsOf(cid, sem);
  if (sem !== 'y' && ui.sg.view !== 'sum' && !parts.includes(ui.sg.view)) ui.sg.view = latestPart(s.id, sem);
  const view = sem === 'y' ? 'sum' : ui.sg.view;
  const head = `
  ${pageHead(t('nav.sgrades'), `${esc(s.name)} · ${esc(className(classById(s.classId)))}`)}
  <div class="card">
    <div class="toolbar">
      <div class="seg" role="group">${['1', '2', 'y'].map((v) => `<button data-act="sgSem" data-v="${v}" class="${sem === v ? 'on' : ''}">${v === 'y' ? t('gr.year') : t('c.sem' + v)}</button>`).join('')}</div>
      ${sem !== 'y' ? `<div class="seg" role="group" aria-label="${t('im.ms.part')}">${[...parts, 'sum'].map((p) => `<button data-act="sgView" data-v="${p}" class="${view === p ? 'on' : ''}">${p === 'sum' ? t('sg.semDetail') : esc(partLabel(p, sem, cid))}</button>`).join('')}</div>` : ''}
      ${view === 'sum' ? `<span class="stat-chip"><b>${fmtScore(all) || '—'}</b> ${t('gr.overall')}</span> ${rankBadge(all)}` : ''}
    </div>`;
  if (view !== 'sum') return `${head}${studentPartView(s, sem, view)}</div>`;
  return `${head}
    <div class="table-wrap"><table class="table">
    ${sem === 'y' ? `
      <thead><tr><th>${t('c.subject')}</th><th class="center">${t('c.sem1')}</th><th class="center">${t('c.sem2')}</th><th class="center">${t('gr.year')}</th><th>${t('gr.rank')}</th></tr></thead>
      <tbody>${[...subjects, CONDUCT].map((sub) => {
        const v = ['1', '2', 'y'].map((sm) => subAvg(s.id, sub.id, sm));
        return `<tr${sub === CONDUCT ? ' class="conduct-row"' : ''}><td><span class="dot" style="--c:${sub.color}"></span><b>${esc(loc(sub))}</b></td>
          ${v.map((x, i) => `<td class="center ${x != null && x < 5 ? 'low' : ''}">${i === 2 ? `<b>${fmtScore(x) || '—'}</b>` : fmtScore(x) || '<span class="muted">—</span>'}</td>`).join('')}
          <td>${sub === CONDUCT ? '' : rankBadge(v[2])}</td></tr>`;
      }).join('')}
      <tr class="total-row"><td>${t('gr.overall')}</td><td class="center">${fmtScore(overallAvg(s.id, 1)) || '—'}</td><td class="center">${fmtScore(overallAvg(s.id, 2)) || '—'}</td><td class="center">${fmtScore(all) || '—'}</td><td>${rankBadge(all)}</td></tr></tbody>` : `
      <thead>
        <tr><th rowspan="2">${t('c.subject')}</th><th class="center" colspan="${mp.length + 1}">${t('gr.monthly')}</th><th class="center" rowspan="2">${examLabel(sem)}<small class="block muted">${examMonthNote(sem, cid)}</small></th><th class="center" rowspan="2">${t('gr.avg')}</th><th rowspan="2">${t('gr.rank')}</th></tr>
        <tr>${mp.map((p) => `<th class="center">${partLabel(p, sem, cid)}</th>`).join('')}<th class="center">${t('gr.monthAvg')}</th></tr>
      </thead>
      <tbody>${[...subjects, CONDUCT].map((sub) => {
        const g = gradeRec(s.id, sub.id, sem) || {};
        const a = semScore(s.id, sub.id, sem), m = monthAvgOf(g, mp);
        const src = examSrc(cid, sub.id);
        const e = src ? examOf(s.id, src, sem) : null;
        const cell = (v) => `<td class="center ${v != null && v < 5 ? 'low' : ''}">${v ?? '<span class="muted">—</span>'}</td>`;
        const examCell = src ? `<td class="center ${e != null && e < 5 ? 'low' : ''}">${e ?? '<span class="muted">—</span>'}${src !== sub.id ? `<small class="block muted">${esc(loc(subjectById(src)))}</small>` : ''}</td>`
          : `<td class="center"><span class="muted">${sub === CONDUCT ? '' : t('gr.noExam')}</span></td>`;
        return `<tr${sub === CONDUCT ? ' class="conduct-row"' : ''}><td><span class="dot" style="--c:${sub.color}"></span><b>${esc(loc(sub))}</b><small class="block muted">${esc(sub === CONDUCT ? t('gr.conductSub') : (teacherFor(sub.id, s.classId) || {}).name || '')}</small></td>
          ${mp.map((p) => cell(g[p])).join('')}
          ${cell(m == null ? null : fmtScore(m))}
          ${examCell}
          <td class="center"><b>${fmtScore(a) || '—'}</b></td><td>${sub === CONDUCT ? '' : rankBadge(a)}</td></tr>`;
      }).join('')}
      <tr class="total-row"><td>${t('gr.overall')}</td><td colspan="${mp.length + 2}"></td><td class="center">${fmtScore(all) || '—'}</td><td>${rankBadge(all)}</td></tr></tbody>`}
    </table></div>
    <p class="note"><i class="fa-solid fa-circle-info"></i> ${t('gr.formula')}</p>
  </div>`;
};

const ACT = {
  openSide: () => document.body.classList.add('side-open'),
  closeSide: () => document.body.classList.remove('side-open'),
  setLang: (el) => {
    LANG = prefs.lang = el.dataset.v;
    savePrefs();
    applyTheme();
    isLoggedIn() ? renderApp() : renderLogin();
  },
  toggleTheme: () => { prefs.theme = isDark() ? 'light' : 'dark'; savePrefs(); applyTheme(); renderApp(); },
  setTheme: (el) => { prefs.theme = el.dataset.v; savePrefs(); applyTheme(); renderApp(); },
  logout: () => { setAuth(''); closeModal(); history.replaceState(null, '', location.pathname); renderLogin(); },
  fillDemo: (el) => {
    const f = $('#loginForm');
    f.elements.user.value = el.dataset.e;
    f.elements.pass.value = el.dataset.p;
    f.requestSubmit ? f.requestSubmit() : f.dispatchEvent(new Event('submit', { cancelable: true }));
  },

  // Sự kiện
  addEvent: () => formModal({
    title: t('dash.addEvent'),
    values: { date: todayIso() },
    fields: [{ name: 'date', label: t('c.date'), type: 'date', required: true }, { name: 'name', label: t('dash.eventName'), required: true, full: true }],
    onSubmit: (v) => { db.events.push({ id: nextId('e'), ...v }); save(); toast(t('c.saved')); renderView(); },
  }),
  delEvent: (el) => {
    const e = db.events.find((x) => x.id === el.dataset.id);
    if (e) confirmBox(t('c.confirmDelete', { name: e.name }), () => { db.events = db.events.filter((x) => x !== e); save(); renderView(); });
  },

  // Học sinh
  addStudent: () => studentForm(null),
  importStudents: () => importStudents(),
  editStudent: (el) => { const s = studentById(el.dataset.id); if (s) studentForm(s); },
  viewStudent: (el) => { const s = studentById(el.dataset.id); if (s) studentDetail(s); },
  delStudent: (el) => { const s = studentById(el.dataset.id); if (s) deleteStudent(s); },
  stPage: (el) => { ui.st.page = Number(el.dataset.p); refreshStudents(); },
  exportStudents: () => exportSheet('danh-sach-hoc-sinh', [
    [...studentCols(), t('st.ethnic'), t('st.province')],
    ...filteredStudents().map((s) => [...studentRow(s), loc(ETHNICS[s.ethnic]), loc(PROVINCES[s.province])]),
  ]),
  printStudents: () => {
    const c = classById(ui.st.cls);
    printStudentList(filteredStudents(), t('st.listTitle'), `${c ? esc(className(c)) + ' · ' : ''}${esc(db.settings.year)}`, c ? [[t('cl.homeroom'), (teacherById(c.homeroomId) || {}).name]] : []);
  },
  printStudent: (el) => { const s = studentById(el.dataset.id); if (s && canSeeStudentInfo(s)) printStudentProfile(s); },
  // Giáo viên chủ nhiệm: danh sách lớp mình
  hrImportStudents: (el) => importStudents(el.dataset.id),
  hrExportStudents: (el) => {
    const c = classById(el.dataset.id);
    if (!c || !isHomeroomOf(c.id)) return toast(t('c.noPerm'), 'error');
    exportSheet(`danh-sach-${c.name.replace('/', '-')}`, [studentCols(), ...studentsOf(c.id).map(studentRow)]);
  },
  hrPrintStudents: (el) => {
    const c = classById(el.dataset.id);
    if (!c || !isHomeroomOf(c.id)) return toast(t('c.noPerm'), 'error');
    printStudentList(studentsOf(c.id), t('st.listTitle'), `${esc(className(c))} · ${esc(db.settings.year)}`, [[t('cl.homeroom'), (teacherById(c.homeroomId) || {}).name]]);
  },

  // Giáo viên
  addTeacher: () => teacherForm(null),
  importTeachers: () => importTeachers(),
  importGrades: () => importGrades(),
  editTeacher: (el) => { const x = teacherById(el.dataset.id); if (x) teacherForm(x); },
  viewTeacher: (el) => { const x = teacherById(el.dataset.id); if (x) teacherDetail(x); },
  printTeacher: (el) => {
    const x = teacherById(el.dataset.id);
    if (x && canSeeTeacherInfo(x)) printDoc(t('tc.detail'), `${esc(x.name)} · ${esc(x.code)}`, infoGrid(teacherInfo(x)));
  },
  printTeachers: () => printDoc(t('tc.listTitle'), esc(db.settings.year), `<table class="table compact">
    <thead><tr><th>#</th>${teacherCols().map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead>
    <tbody>${db.teachers.slice().sort((a, b) => a.code.localeCompare(b.code)).map((x, i) => `<tr><td>${i + 1}</td>${teacherRow(x).map((v) => `<td>${esc(v)}</td>`).join('')}</tr>`).join('')}</tbody>
  </table>`, [[t('gr.principalSign'), db.settings.principal]]),
  importSheet: () => importSheet(),
  delTeacher: (el) => {
    const x = teacherById(el.dataset.id);
    if (!x) return;
    confirmBox(t('c.confirmDelete', { name: x.name }), () => {
      db.teachers = db.teachers.filter((o) => o !== x);
      db.accounts = db.accounts.filter((a) => !(a.role === 'teacher' && a.refId === x.id));
      db.classes.forEach((c) => {
        if (c.homeroomId === x.id) c.homeroomId = '';
        Object.keys(c.teachers || {}).forEach((k) => { if (c.teachers[k] === x.id) delete c.teachers[k]; });
      });
      save(); toast(t('c.deleted')); renderView();
    });
  },
  exportTeachers: () => exportSheet('danh-sach-giao-vien', [teacherCols(), ...db.teachers.map(teacherRow)]),

  // Lớp học
  addClass: () => classForm(null),
  editClass: (el) => { const c = classById(el.dataset.id); if (c) classForm(c); },
  delClass: (el) => {
    const c = classById(el.dataset.id);
    if (!c) return;
    if (studentsOf(c.id).length) return toast(t('cl.hasStudents'), 'error');
    confirmBox(t('c.confirmDelete', { name: className(c) }), () => {
      db.classes = db.classes.filter((o) => o !== c);
      delete db.timetable[c.id];
      Object.keys(db.attendance).forEach((k) => { if (k.startsWith(c.id + '|')) delete db.attendance[k]; });
      save(); toast(t('c.deleted')); renderView();
    });
  },
  classStudents: (el) => { ui.st.cls = el.dataset.id; ui.st.page = 1; location.hash = '#students'; },
  classTimetable: (el) => { ui.tt.cls = el.dataset.id; location.hash = '#timetable'; },

  // Điểm
  grMode: (el) => { ui.gr.mode = el.dataset.v; renderView(); },
  exportSummary: () => {
    const c = classById(ui.gr.cls);
    const view = sumView();
    const tag = ui.gr.sem === 'y' ? 'ca-nam' : `hk${ui.gr.sem}${view === 'avg' ? '' : '-' + (MONTH_PARTS.includes(view) || view === 'exam' ? partFileTag(view, ui.gr.sem, ui.gr.cls) : view)}`;
    const withConduct = view !== 'exam';
    exportSheet(`bang-diem-${c ? c.name.replace('/', '-') : ''}-${tag}`, [
      [t('c.code'), t('c.name'), ...summarySubjects(view).map(loc), t('gr.total'), t('gr.overall'), t('gr.rank'), t('gr.position'), ...(withConduct ? [loc(CONDUCT)] : [])],
      ...summaryData().map((r) => [r.s.code, r.s.name, ...r.subs.map(fmtScore), fmtScore(r.total), fmtScore(r.all), r.all == null ? '' : t(rankOf(r.all).k), r.pos || '', ...(withConduct ? [fmtScore(r.conduct)] : [])]),
    ]);
  },
  printSummary: () => {
    const c = classById(ui.gr.cls);
    const view = sumView();
    const sub = `${esc(className(c))} · ${esc(viewLabel(view, ui.gr.sem))} · ${ui.gr.sem === 'y' ? t('gr.year') : t('c.sem' + ui.gr.sem)} · ${esc(db.settings.year)}`;
    printDoc(t('gr.sheetTitle'), sub, summaryTable(summaryData(), view, true),
      [[t('gr.homeroomSign'), (teacherById(c && c.homeroomId) || {}).name], [t('gr.principalSign'), db.settings.principal]]);
  },
  // Điền điểm phẩm chất còn trống từ tỷ lệ chuyên cần của tháng (VD: đi học 95% → 9.5)
  fillConduct: () => {
    const cid = ui.gr.cls, sem = ui.gr.sem;
    if (!can('grades') || !mySubjects(cid).some((s) => s.id === CONDUCT.id)) return toast(t('c.noPerm'), 'error');
    const months = planOf(cid, sem).months;
    let n = 0;
    studentsOf(cid).forEach((s) => {
      const key = `${s.id}|${CONDUCT.id}|${sem}`;
      const g = db.grades[key] || { m1: null, m2: null, m3: null, m4: null, exam: null };
      monthParts(cid, sem).forEach((p) => {
        if (g[p] != null) return;
        const r = attMonthRate(s.id, months[MONTH_PARTS.indexOf(p)]);
        if (r == null) return;
        g[p] = Math.round(r * 20) / 2;
        n++;
      });
      db.grades[key] = g;
    });
    save();
    toast(t('gr.fillConductDone', { n }), n ? 'ok' : 'error');
    renderView();
  },

  // Điểm danh
  mark: (el) => {
    if (!can('attendance') || !myClasses().some((c) => c.id === ui.at.cls)) return toast(t('c.noPerm'), 'error');
    const key = `${ui.at.cls}|${ui.at.date}`;
    (db.attendance[key] = db.attendance[key] || {})[el.dataset.sid] = el.dataset.v;
    save();
    $('#atBody').innerHTML = attBody();
    const again = $(`#atBody [data-sid="${el.dataset.sid}"][data-v="${el.dataset.v}"]`);
    if (again) again.focus();
  },
  allPresent: () => {
    if (!can('attendance') || !myClasses().some((c) => c.id === ui.at.cls)) return toast(t('c.noPerm'), 'error');
    const rec = {};
    studentsOf(ui.at.cls).forEach((s) => { rec[s.id] = 'P'; });
    db.attendance[`${ui.at.cls}|${ui.at.date}`] = rec;
    save(); toast(t('c.saved'));
    $('#atBody').innerHTML = attBody();
  },

  // Thông báo
  addNotice: () => noticeForm(null),
  editNotice: (el) => { const n = notices().find((x) => x.id === el.dataset.id); if (n) noticeForm(n); },
  pinNotice: (el) => {
    const n = notices().find((x) => x.id === el.dataset.id);
    if (!n || !canEditNotice(n)) return toast(t('c.noPerm'), 'error');
    n.pinned = !n.pinned; save(); renderView();
  },
  delNotice: (el) => {
    const n = notices().find((x) => x.id === el.dataset.id);
    if (!n || !canEditNotice(n)) return toast(t('c.noPerm'), 'error');
    confirmBox(t('c.confirmDelete', { name: n.title }), () => { db.notices = notices().filter((x) => x !== n); save(); toast(t('c.deleted')); renderView(); });
  },

  // Thời khóa biểu
  ttEdit: () => { ui.tt.edit = !ui.tt.edit; if (!ui.tt.edit) toast(t('c.saved')); renderView(); },
  printTimetable: () => {
    const c = classById(ui.tt.cls);
    printHtml(`<div class="print-tt"><h2>${esc(schoolName())}</h2><h3>${t('tt.title')} · ${esc(className(c))} · ${esc(db.settings.year)}</h3>${timetableTable(ui.tt.cls, false)}</div>`);
  },

  // Cài đặt
  saveSchool: () => {
    const f = $('#fSchool').elements;
    ['nameVi', 'nameLo', 'address', 'principal', 'phone', 'year'].forEach((k) => { db.settings[k] = f[k].value.trim(); });
    if (!db.settings.nameVi) db.settings.nameVi = 'School';
    save(); toast(t('c.saved')); renderApp();
  },
  savePass: () => {
    const f = $('#fPass').elements;
    const u = me();
    if (f.old.value !== u.pass) return toast(t('pf.wrongOld'), 'error');
    if (f.pass.value.length < 6) return toast(t('se.passShort'), 'error');
    u.pass = f.pass.value;
    save(); toast(t('se.passChanged')); renderView();
  },
  backup: () => download(`backup-truong-hoc-${todayIso()}.json`, JSON.stringify(db, null, 2), 'application/json'),
  saveExamPlan: () => {
    const f = $('#fExam').elements;
    const plan = { lower: {}, upper: {} };
    for (const lv of ['lower', 'upper']) {
      for (const sm of ['1', '2']) {
        const months = [];
        MONTH_PARTS.forEach((p, i) => { const v = Number(f[`${lv}-${sm}-m${i}`].value); if (v && !months.includes(v)) months.push(v); });
        if (!months.length) return toast(t('se.examPlanEmpty'), 'error');
        plan[lv][sm] = { months, exam: Number(f[`${lv}-${sm}-exam`].value) || months[months.length - 1] };
      }
    }
    db.settings.examPlan = plan;
    save(); toast(t('c.saved')); renderView();
  },
  resetExamPlan: () => { db.settings.examPlan = JSON.parse(JSON.stringify(EXAM_PLAN_DEFAULT)); save(); toast(t('c.saved')); renderView(); },
  addDemo: () => { const r = addDemo(db); save(); toast(t('se.demoAdded', { s: r.students, t: r.teachers })); renderView(); },
  removeDemo: () => confirmBox(t('se.demoRemoveConfirm'), () => {
    const r = removeDemo(db);
    if (!me()) setAuth('');
    save(); toast(t('se.demoRemoved', { s: r.students, t: r.teachers })); renderApp();
  }),
  resetData: () => confirmBox(t('se.resetConfirm'), () => { db = createSeed(); save(); toast(t('c.saved')); renderApp(); }),
};

const CHANGE = {
  noAud: (el) => { ui.no.aud = el.value; $('#noList').innerHTML = noticeList(ui.no.seen); },
  stClass: (el) => { ui.st.cls = el.value; ui.st.page = 1; refreshStudents(); },
  stGender: (el) => { ui.st.gender = el.value; ui.st.page = 1; refreshStudents(); },
  tcSub: (el) => { ui.tc.sub = el.value; $('#tcBody').innerHTML = teacherRows(); },
  grClass: (el) => { ui.gr.cls = el.value; renderView(); },
  grSub: (el) => { ui.gr.sub = el.value; renderView(); },
  grSem: (el) => { ui.gr.sem = el.value; renderView(); },
  grView: (el) => { ui.gr.view = el.value; renderView(); },
  score: (el) => {
    if (!can('grades') || !mySubjects(ui.gr.cls).some((s) => s.id === ui.gr.sub)) return toast(t('c.noPerm'), 'error');
    const part = el.dataset.part;
    if (part === 'exam' ? !hasExam(ui.gr.cls, ui.gr.sub) : !hasMonth(ui.gr.cls, ui.gr.sub)) return toast(t('c.noPerm'), 'error');
    const tr = el.closest('tr');
    const key = `${tr.dataset.sid}|${ui.gr.sub}|${ui.gr.sem}`;
    const raw = el.value.trim().replace(',', '.');
    let v = null;
    if (raw !== '') {
      v = Number(raw);
      if (!isFinite(v) || v < 0 || v > 10) { el.classList.add('invalid'); return toast(t('gr.invalid'), 'error'); }
      v = Math.round(v * 100) / 100;
    }
    el.classList.remove('invalid');
    const g = db.grades[key] || { m1: null, m2: null, m3: null, m4: null, exam: null };
    g[el.dataset.part] = v;
    db.grades[key] = g;
    save();
    const mp = monthParts(ui.gr.cls, ui.gr.sem);
    const a = semScore(tr.dataset.sid, ui.gr.sub, ui.gr.sem);
    const isConduct = ui.gr.sub === CONDUCT.id;
    if ($('.mavg', tr)) $('.mavg', tr).innerHTML = fmtScore(monthAvgOf(g, mp)) || '<span class="muted">—</span>';
    if ($('.avg', tr)) $('.avg', tr).innerHTML = `<b>${fmtScore(a)}</b>`;
    if ($('.rank', tr) && !isConduct) $('.rank', tr).innerHTML = rankBadge(a);
    if ($('#grStats')) $('#grStats').innerHTML = gradeStats();
    el.classList.add('flash');
    setTimeout(() => el.classList.remove('flash'), 600);
  },
  atClass: (el) => { ui.at.cls = el.value; renderView(); },
  atDate: (el) => { if (el.value) { ui.at.date = el.value; renderView(); } },
  ttClass: (el) => { ui.tt.cls = el.value; renderView(); },
  ttCell: (el) => {
    const grid = (db.timetable[ui.tt.cls] = db.timetable[ui.tt.cls] || {});
    grid[el.dataset.slot] = el.value;
    save();
  },
  restore: (el) => {
    const file = el.files && el.files[0];
    if (!file) return;
    const r = new FileReader();
    r.onload = () => {
      try {
        const d = JSON.parse(r.result);
        if (!validDb(d)) throw new Error('bad');
        db = migrate(d);
        // Nếu file khôi phục không có tài khoản đang đăng nhập → phải đăng nhập lại
        if (!me()) setAuth('');
        save(); toast(t('se.restored')); renderApp();
      } catch (e) { toast(t('se.badFile'), 'error'); }
    };
    r.readAsText(file);
  },
};

const INPUT = {
  noSearch: (el) => { ui.no.q = el.value; $('#noList').innerHTML = noticeList(ui.no.seen); },
  stSearch: (el) => { ui.st.q = el.value; ui.st.page = 1; refreshStudents(); },
  tcSearch: (el) => { ui.tc.q = el.value; $('#tcBody').innerHTML = teacherRows(); },
};

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (!el || el.disabled) return;
  const fn = ACT[el.dataset.act];
  if (fn) { e.preventDefault(); fn(el, e); }
});
document.addEventListener('change', (e) => {
  const el = e.target.closest('[data-change]');
  if (el && CHANGE[el.dataset.change]) CHANGE[el.dataset.change](el);
});
document.addEventListener('input', (e) => {
  const el = e.target.closest('[data-input]');
  if (el && INPUT[el.dataset.input]) INPUT[el.dataset.input](el);
});
// Tài khoản, phân công, trang giáo viên / học sinh
Object.assign(ACT, {
  newAccount: () => accountForm(null, { role: ui.acc.role || 'teacher' }),
  newAccountFor: (el) => accountForm(null, { role: el.dataset.role, refId: el.dataset.ref }),
  editAccount: (el) => { const a = db.accounts.find((x) => x.id === el.dataset.id); if (a) accountForm(a); },
  bulkAccounts: () => bulkAccounts(),
  accPage: (el) => { ui.acc.page = Number(el.dataset.p); $('#accList').innerHTML = accountList(); },
  toggleLock: (el) => {
    const a = db.accounts.find((x) => x.id === el.dataset.id);
    if (!a) return;
    if (a.id === me().id) return toast(t('acc.self'), 'error');
    a.active = !a.active;
    save(); toast(t(a.active ? 'acc.unlock' : 'acc.lock') + ': ' + a.email); renderView();
  },
  resetPass: (el) => {
    const a = db.accounts.find((x) => x.id === el.dataset.id);
    if (!a) return;
    formModal({
      title: `${t('acc.resetPass')} · ${a.email}`,
      values: { pass: String(Math.floor(100000 + Math.random() * 900000)) },
      fields: [{ name: 'pass', label: t('se.newPass'), required: true, full: true }],
      onSubmit: (v) => {
        if (v.pass.length < 6) return t('se.passShort');
        a.pass = v.pass;
        save(); toast(t('acc.resetDone', { p: v.pass }));
      },
    });
  },
  delAccount: (el) => {
    const a = db.accounts.find((x) => x.id === el.dataset.id);
    if (!a) return;
    if (a.id === me().id) return toast(t('acc.self'), 'error');
    confirmBox(t('c.confirmDelete', { name: a.email }), () => {
      db.accounts = db.accounts.filter((x) => x !== a);
      save(); toast(t('c.deleted')); renderView();
    });
  },
  assignTeachers: (el) => { const c = classById(el.dataset.id); if (c) assignTeachers(c); },
  goAttendance: (el) => { ui.at.cls = el.dataset.id; ui.at.date = todayIso(); location.hash = '#attendance'; },
  goGrades: (el) => { ui.gr.cls = el.dataset.id; ui.gr.mode = 'entry'; location.hash = '#grades'; },
  teacherStudentList: (el) => { const c = classById(el.dataset.id); if (c) teacherStudentList(c); },
  sgSem: (el) => { ui.sg.sem = el.dataset.v; ui.sg.view = ''; renderView(); },
  sgView: (el) => { ui.sg.view = el.dataset.v; renderView(); },
});
CHANGE.accRole = (el) => { ui.acc.role = el.value; ui.acc.page = 1; $('#accList').innerHTML = accountList(); };
INPUT.accSearch = (el) => { ui.acc.q = el.value; ui.acc.page = 1; $('#accList').innerHTML = accountList(); };

// Không có form nào gửi dữ liệu lên server — chặn reload trang khi nhấn Enter
document.addEventListener('submit', (e) => e.preventDefault());
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { closeModal(); document.body.classList.remove('side-open'); }
  // Nhập điểm: Enter chuyển xuống học sinh kế tiếp cùng cột
  if (e.key === 'Enter' && e.target.classList.contains('score')) {
    e.preventDefault();
    e.target.blur();
    const tr = e.target.closest('tr').nextElementSibling;
    const next = tr && tr.querySelector(`.score[data-part="${e.target.dataset.part}"]`);
    if (next) { next.focus(); next.select(); }
  }
});
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (!prefs.theme && isLoggedIn()) renderApp(); });

// ===== Khởi động =====
applyTheme();
isLoggedIn() ? renderApp() : renderLogin();
