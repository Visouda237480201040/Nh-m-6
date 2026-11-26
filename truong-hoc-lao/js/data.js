// ===== Danh mục cố định =====
// 18 tỉnh / thành của Lào (index được lưu trong hồ sơ học sinh)
const PROVINCES = [
  { vi: 'Thủ đô Viêng Chăn', lo: 'ນະຄອນຫຼວງວຽງຈັນ' },
  { vi: 'Viêng Chăn', lo: 'ແຂວງວຽງຈັນ' },
  { vi: 'Luông Pha Băng', lo: 'ຫຼວງພະບາງ' },
  { vi: 'Savannakhet', lo: 'ສະຫວັນນະເຂດ' },
  { vi: 'Chămpasắc', lo: 'ຈຳປາສັກ' },
  { vi: 'Xiêng Khoảng', lo: 'ຊຽງຂວາງ' },
  { vi: 'Khăm Muộn', lo: 'ຄຳມ່ວນ' },
  { vi: 'Bôlykhămxay', lo: 'ບໍລິຄຳໄຊ' },
  { vi: 'U Đôm Xay', lo: 'ອຸດົມໄຊ' },
  { vi: 'Salavan', lo: 'ສາລະວັນ' },
  { vi: 'Hủa Phăn', lo: 'ຫົວພັນ' },
  { vi: 'Attapư', lo: 'ອັດຕະປື' },
  { vi: 'Sê Kông', lo: 'ເຊກອງ' },
  { vi: 'Bò Kẹo', lo: 'ບໍ່ແກ້ວ' },
  { vi: 'Luông Nặm Tha', lo: 'ຫຼວງນ້ຳທາ' },
  { vi: 'Phôngsalỳ', lo: 'ຜົ້ງສາລີ' },
  { vi: 'Xaynhabuly', lo: 'ໄຊຍະບູລີ' },
  { vi: 'Xaysômbun', lo: 'ໄຊສົມບູນ' },
];

const ETHNICS = [
  { vi: 'Lào', lo: 'ລາວ' },
  { vi: 'Khơ Mú', lo: 'ຂະມຸ' },
  { vi: "H'Mông", lo: 'ມົ້ງ' },
  { vi: 'Phu Thái', lo: 'ຜູ້ໄທ' },
  { vi: 'Lự', lo: 'ລື້' },
  { vi: 'Tày', lo: 'ໄຕ' },
  { vi: 'Akha', lo: 'ອາຄ່າ' },
  { vi: 'Khác', lo: 'ອື່ນໆ' },
];

// Thứ tự môn = thứ tự cột trong bảng điểm
const SUBJECTS = [
  { id: 'lao', vi: 'Ngôn ngữ - Văn học Lào', lo: 'ພາສາລາວ-ວັນນະຄະດີ', color: '#c2410c' },
  { id: 'math', vi: 'Toán học', lo: 'ຄະນິດສາດ', color: '#1d4ed8' },
  { id: 'sci', vi: 'Khoa học tự nhiên', lo: 'ວິທະຍາສາດທຳມະຊາດ', color: '#0d9488' },
  { id: 'phys', vi: 'Vật lý', lo: 'ຟີຊິກສາດ', color: '#7c3aed' },
  { id: 'chem', vi: 'Hóa học', lo: 'ເຄມີສາດ', color: '#0f766e' },
  { id: 'bio', vi: 'Sinh học', lo: 'ຊີວະສາດ', color: '#15803d' },
  { id: 'civ', vi: 'Giáo dục công dân', lo: 'ສຶກສາພົນລະເມືອງ', color: '#4d7c0f' },
  { id: 'geo', vi: 'Địa lý', lo: 'ພູມສາດ', color: '#0369a1' },
  { id: 'hist', vi: 'Lịch sử', lo: 'ປະຫວັດສາດ', color: '#a16207' },
  { id: 'it', vi: 'ICT', lo: 'ໄອຊີທີ', color: '#334155' },
  { id: 'eng', vi: 'Tiếng Anh', lo: 'ພາສາອັງກິດ', color: '#be123c' },
  { id: 'art', vi: 'Nghệ thuật', lo: 'ສິລະປະ', color: '#db2777' },
  { id: 'pe', vi: 'Khối lượng học tập', lo: 'ພະລະສຶກສາ', color: '#b45309' },
];
// Điểm phẩm chất (có tính điểm chuyên cần): chấm hàng tháng, không tính vào điểm TB chung
const CONDUCT = { id: 'conduct', vi: 'Phẩm chất', lo: 'ຄຸນສົມບັດ', color: '#9333ea' };

// Chương trình học theo khối
//   month: các môn học và thi hàng tháng (đều có điểm học kỳ, tính vào TB chung)
//   exam : các môn thi giữa kỳ (HK1) và cuối kỳ (HK2)
// M4–M7: Vật lý, Hóa học, Sinh học thi tháng riêng, còn thi giữa / cuối kỳ là 1 bài Khoa học tự nhiên chung
const SCI_PARTS = ['phys', 'chem', 'bio'];
const CURRICULUM = {
  g13: {
    month: ['lao', 'math', 'sci', 'civ', 'geo', 'hist', 'it', 'eng', 'art', 'pe'],
    exam: ['lao', 'math', 'sci', 'civ', 'geo', 'eng'],
  },
  g47: {
    month: ['lao', 'math', 'phys', 'chem', 'bio', 'civ', 'geo', 'hist', 'it', 'eng', 'pe'],
    exam: ['lao', 'math', 'sci', 'civ', 'geo', 'eng'],
  },
};
const groupOfGrade = (g) => (g <= 3 ? 'g13' : 'g47');

const DEGREES = [
  { vi: 'Cao đẳng sư phạm', lo: 'ຊັ້ນສູງຄູ' },
  { vi: 'Cử nhân', lo: 'ປະລິນຍາຕີ' },
  { vi: 'Thạc sĩ', lo: 'ປະລິນຍາໂທ' },
  { vi: 'Tiến sĩ', lo: 'ປະລິນຍາເອກ' },
];

// Hệ phổ thông Lào: tiểu học 5 năm (P1–P5), trung học cơ sở 4 năm (M1–M4), trung học phổ thông 3 năm (M5–M7)
const GRADES = [1, 2, 3, 4, 5, 6, 7];
// Lịch thi theo khối (sửa được trong Cài đặt → Lịch thi)
//   months: các tháng có bài thi tháng (1–4 bài) · exam: tháng thi học kỳ
//   Thi cuối năm (HK2): M1–M4 vào tháng 5, M5–M7 vào tháng 6 → thi tháng trong 4 tháng liền trước
const EXAM_PLAN_DEFAULT = {
  lower: { 1: { months: [9, 10, 11, 12], exam: 1 }, 2: { months: [1, 2, 3, 4], exam: 5 } },
  upper: { 1: { months: [9, 10, 11, 12], exam: 1 }, 2: { months: [2, 3, 4, 5], exam: 6 } },
};
const DAYS = [1, 2, 3, 4, 5];
const PERIODS = [1, 2, 3, 4, 5, 6];

// Quyền theo vai trò: quản lý chọn cho từng tài khoản được dùng những chức năng nào
const ROLE_PERMS = {
  admin: ['dashboard', 'notices', 'students', 'teachers', 'classes', 'grades', 'attendance', 'timetable', 'accounts', 'settings'],
  teacher: ['notices', 'tschedule', 'tclasses', 'attendance', 'grades'],
  student: ['snotices', 'sclass', 'sschedule', 'sattendance', 'sgrades'],
};
const EMAIL_DOMAIN = 'dokchampa.edu.la';

const loc = (o) => (o ? o[LANG] || o.vi : '');
const subjectById = (id) => (id === CONDUCT.id ? CONDUCT : SUBJECTS.find((s) => s.id === id));

// ===== Dữ liệu ban đầu =====
// Không có học sinh / giáo viên mẫu: quản lý tự thêm trên web.
// Chỉ tạo sẵn khung lớp M1–M7, thời khóa biểu theo môn, lịch sự kiện và 1 tài khoản quản lý.
const pad = (n, w = 2) => String(n).padStart(w, '0');
const isoDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// Phạm vi id của học sinh / giáo viên mẫu ở phiên bản trước (để xóa khi nâng cấp dữ liệu cũ)
const OLD_SAMPLE = { students: 105, teachers: 14 };

// Số tiết / tuần của từng môn (tổng 30 tiết = 5 ngày × 6 tiết)
const WEEKLY_LOAD = {
  g13: { lao: 5, math: 5, sci: 4, civ: 2, geo: 2, hist: 2, it: 2, eng: 4, art: 2, pe: 2 },
  g47: { lao: 4, math: 5, phys: 3, chem: 3, bio: 2, civ: 2, geo: 2, hist: 2, it: 2, eng: 3, pe: 2 },
};
function defaultTimetable(ci, grade = 1) {
  // Xếp xen kẽ các môn để không bị dồn nhiều tiết một môn liền nhau
  const left = { ...WEEKLY_LOAD[groupOfGrade(grade)] };
  const weekly = [];
  while (Object.values(left).some((n) => n > 0)) {
    Object.keys(left).forEach((k) => { if (left[k] > 0) { weekly.push(k); left[k]--; } });
  }
  const grid = {};
  let idx = ci * 7;
  DAYS.forEach((d) => PERIODS.forEach((p) => { grid[`${d}-${p}`] = weekly[idx++ % weekly.length]; }));
  return grid;
}

function createSeed() {
  const classDefs = [[1, 1], [1, 2], [2, 1], [2, 2], [3, 1], [4, 1], [5, 1], [6, 1], [7, 1]];
  const classes = classDefs.map(([g, n], i) => ({
    id: 'c' + (i + 1),
    name: `M${g}/${n}`,
    grade: g,
    homeroomId: '',
    room: `${g <= 4 ? 'A' : 'B'}${100 + i + 1}`,
    teachers: {},
  }));
  const timetable = {};
  classes.forEach((c, ci) => { timetable[c.id] = defaultTimetable(ci, c.grade); });

  const settings = {
    nameVi: 'Trường Phổ thông Dok Champa',
    nameLo: 'ໂຮງຮຽນມັດທະຍົມສົມບູນ ດອກຈຳປາ',
    address: 'Bản Phôn Xay, huyện Xaysettha, Thủ đô Viêng Chăn',
    principal: '',
    phone: '',
    year: '2026 – 2027',
    examPlan: JSON.parse(JSON.stringify(EXAM_PLAN_DEFAULT)),
  };

  const events = [
    { id: 'e1', date: '2026-10-07', name: 'Ngày Nhà giáo Lào / ວັນຄູແຫ່ງຊາດ' },
    { id: 'e2', date: '2026-11-24', name: 'Lễ hội That Luang / ບຸນທາດຫຼວງ' },
    { id: 'e3', date: '2026-12-02', name: 'Quốc khánh Lào / ວັນຊາດ 2 ທັນວາ' },
    { id: 'e4', date: '2027-04-14', name: 'Tết Bunpimay / ບຸນປີໃໝ່ລາວ' },
  ];

  const accounts = [
    { id: 'a1', email: `admin@${EMAIL_DOMAIN}`, pass: 'admin123', role: 'admin', refId: '', name: 'Admin', perms: ROLE_PERMS.admin.slice(), active: true, lastLogin: '' },
  ];

  const d = {
    version: 8,
    settings,
    accounts,
    teachers: [], classes, students: [], grades: {}, attendance: {}, timetable, events, notices: [],
    seq: { s: 0, t: 0, c: classes.length, e: events.length, a: accounts.length, n: 0 },
  };
  addDemo(d);
  return d;
}

// ===== Dữ liệu mẫu (danh sách ảo) =====
// Tên, SĐT, địa chỉ đều là giả lập. Mọi bản ghi mẫu có cờ demo: true để có thể xóa riêng.
const DEMO_DATA = {
  male: ['Bounmy', 'Somphone', 'Khamphet', 'Vilasack', 'Sengphet', 'Thongchanh', 'Anousone', 'Somsack', 'Vanxay', 'Khamsing', 'Phouvong', 'Sisouk', 'Xaysana', 'Viengsay', 'Bounthanh', 'Kongkeo', 'Chanthaboun', 'Phetsamone', 'Outhay', 'Thongsavath', 'Khampheng', 'Soulivong', 'Sompong', 'Phonexay'],
  female: ['Noy', 'Manivanh', 'Vilayvanh', 'Khamla', 'Malaythong', 'Chanthala', 'Davone', 'Kesone', 'Latsamy', 'Mayouly', 'Nalinthone', 'Phetmany', 'Sengdao', 'Thipphavanh', 'Vanida', 'Bouakham', 'Chansamone', 'Keomany', 'Onkeo', 'Viengkeo', 'Amphone', 'Dalavanh', 'Inpeng', 'Manyvone'],
  last: ['Phommachanh', 'Keomany', 'Sengdara', 'Inthavong', 'Vongsa', 'Sisouphanh', 'Chanthavong', 'Phengsavanh', 'Douangmala', 'Xayavong', 'Souvannavong', 'Boupha', 'Sayavong', 'Luangrath', 'Thammavong', 'Vilaysack', 'Phimmasone', 'Sounthala', 'Bounyavong', 'Saysombath', 'Phanthavong', 'Manivong'],
  village: ['Bản Phôn Xay, Xaysettha', 'Bản Sisavath, Chanthabuly', 'Bản Nongbone, Xaysettha', 'Bản Dongdok, Xaythany', 'Bản Thatluang, Xaysettha', 'Bản Sikhay, Sikhottabong', 'Bản Hongkaykeo, Chanthabuly', 'Bản Nongtha, Xaythany', 'Bản Phonthan, Xaysettha', 'Bản Dongpalane, Sisattanak'],
  // 16 giáo viên: mỗi môn 1 người, Ngôn ngữ - Văn học Lào / Toán / Tiếng Anh có 2 người
  teacherSubjects: ['lao', 'math', 'sci', 'phys', 'chem', 'bio', 'hist', 'geo', 'eng', 'civ', 'it', 'art', 'pe', 'lao', 'math', 'eng'],
  gradSchool: ['Đại học Quốc gia Lào', 'Cao đẳng Sư phạm Dongkhamxang', 'Cao đẳng Sư phạm Luang Prabang', 'Cao đẳng Sư phạm Savannakhet', 'Đại học Souphanouvong', 'Đại học Champasak'],
  perClass: 14,
};

function addDemo(d) {
  // Bộ sinh số ngẫu nhiên cố định → lần nào tạo cũng ra cùng một danh sách
  let seed = 20262027;
  const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
  const int = (a, b) => a + Math.floor(rnd() * (b - a + 1));
  const phone = () => `020 ${pick(['5', '7', '9', '2', '5', '9'])}${int(100, 999)} ${int(1000, 9999)}`;
  const idNum = (id) => parseInt(String(id).slice(1), 10) || 0;
  d.seq.t = Math.max(d.seq.t || 0, ...d.teachers.map((x) => idNum(x.id)));
  d.seq.s = Math.max(d.seq.s || 0, ...d.students.map((x) => idNum(x.id)));
  d.seq.a = Math.max(d.seq.a || 0, ...d.accounts.map((x) => idNum(x.id)));
  const codeUsed = (list, c) => list.some((x) => x.code === c);
  const nextCode = (list, prefix, w, start) => { let n = start; let c; do { c = prefix + pad(++n, w); } while (codeUsed(list, c)); return [c, n]; };

  // Giáo viên
  const teachers = [];
  let tc = 0;
  DEMO_DATA.teacherSubjects.forEach((sub, i) => {
    const gender = i % 3 === 1 ? 'M' : 'F';
    const first = pick(gender === 'M' ? DEMO_DATA.male : DEMO_DATA.female);
    const last = pick(DEMO_DATA.last);
    const [code, n] = nextCode(d.teachers, 'GV', 3, tc); tc = n;
    const startYear = int(1998, 2022);
    const x = {
      id: 't' + ++d.seq.t, code, name: `${first} ${last}`, gender, subject: sub, degree: pick([1, 1, 1, 2, 2, 0, 3]), startYear,
      dob: `${startYear - int(22, 26)}-${pad(int(1, 12))}-${pad(int(1, 28))}`,
      phone: phone(), email: `${first.toLowerCase()}.${last.toLowerCase().slice(0, 4)}${i + 1}@${EMAIL_DOMAIN}`,
      address: pick(DEMO_DATA.village), birthplace: pick(PROVINCES).vi, gradSchool: pick(DEMO_DATA.gradSchool), demo: true,
    };
    d.teachers.push(x);
    teachers.push(x);
  });
  // Phân công: mỗi lớp 1 GV chủ nhiệm, mỗi môn 1 GV bộ môn (xoay vòng khi môn có 2 GV)
  d.classes.forEach((c, ci) => {
    c.teachers = c.teachers || {};
    CURRICULUM[groupOfGrade(c.grade)].month.forEach((sid) => {
      const list = teachers.filter((x) => x.subject === sid);
      if (list.length && !c.teachers[sid]) c.teachers[sid] = list[ci % list.length].id;
    });
    if (!c.homeroomId) c.homeroomId = teachers[ci % teachers.length].id;
  });

  // Học sinh: mỗi lớp 14 em, năm sinh theo khối (M1 ≈ 11 tuổi)
  const students = [];
  let sc = 0;
  d.classes.forEach((c) => {
    for (let k = 0; k < DEMO_DATA.perClass; k++) {
      const gender = rnd() < 0.5 ? 'M' : 'F';
      const last = pick(DEMO_DATA.last);
      const parentGender = rnd() < 0.55 ? 'M' : 'F';
      const [code, n] = nextCode(d.students, 'HS', 4, sc); sc = n;
      const s = {
        id: 's' + ++d.seq.s, code,
        name: `${pick(gender === 'M' ? DEMO_DATA.male : DEMO_DATA.female)} ${last}`, gender,
        dob: `${2026 - 11 - (c.grade - 1)}-${pad(int(1, 12))}-${pad(int(1, 28))}`,
        classId: c.id, ethnic: rnd() < 0.8 ? 0 : int(1, 6), province: rnd() < 0.75 ? 0 : int(1, 17),
        address: pick(DEMO_DATA.village),
        // Học sinh lớp lớn thường có điện thoại riêng
        phone: rnd() < 0.25 + c.grade * 0.1 ? phone() : '',
        parent: `${pick(parentGender === 'M' ? DEMO_DATA.male : DEMO_DATA.female)} ${last}`,
        parentPhone: phone(), demo: true,
      };
      s.birthplace = rnd() < 0.7 ? PROVINCES[s.province].vi : pick(PROVINCES).vi;
      d.students.push(s);
      students.push(s);
    }
  });

  // Điểm HK1 đầy đủ theo chương trình từng khối (4 bài thi tháng T9–T12 + thi giữa kỳ); HK2 để trống cho nhập thử
  const clamp = (v) => Math.max(0, Math.min(10, Math.round(v * 2) / 2));
  students.forEach((s) => {
    const ability = 4.5 + rnd() * 5;
    const cur = CURRICULUM[groupOfGrade((d.classes.find((c) => c.id === s.classId) || {}).grade || 1)];
    [...new Set([...cur.month, ...cur.exam])].forEach((sid) => {
      const base = ability + (rnd() - 0.5) * 2;
      const g = { m1: null, m2: null, m3: null, m4: null, exam: null };
      if (cur.month.includes(sid)) ['m1', 'm2', 'm3', 'm4'].forEach((p) => { g[p] = clamp(base + (rnd() - 0.5) * 2.4); });
      if (cur.exam.includes(sid)) g.exam = clamp(base + (rnd() - 0.5) * 2.4);
      d.grades[`${s.id}|${sid}|1`] = g;
    });
    // Phẩm chất hàng tháng (đã gồm chuyên cần)
    const cd = { m1: null, m2: null, m3: null, m4: null, exam: null };
    ['m1', 'm2', 'm3', 'm4'].forEach((p) => { cd[p] = clamp(8 + rnd() * 2.2); });
    d.grades[`${s.id}|${CONDUCT.id}|1`] = cd;
  });

  // Điểm danh 10 ngày học gần nhất (trước hôm nay)
  const days = [];
  const dt = new Date();
  while (days.length < 10) { dt.setDate(dt.getDate() - 1); if (dt.getDay() >= 1 && dt.getDay() <= 5) days.push(isoDate(dt)); }
  days.forEach((day) => d.classes.forEach((c) => {
    const key = `${c.id}|${day}`;
    if (d.attendance[key]) return;
    const rec = {};
    students.filter((s) => s.classId === c.id).forEach((s) => { const r = rnd(); rec[s.id] = r < 0.9 ? 'P' : r < 0.95 ? 'L' : r < 0.98 ? 'E' : 'A'; });
    d.attendance[key] = rec;
  }));

  // Tài khoản dùng thử: 1 giáo viên + 1 học sinh (mật khẩu 123456)
  const addAcc = (role, ref, email) => {
    if (d.accounts.some((a) => a.email === email)) return;
    d.accounts.push({ id: 'a' + ++d.seq.a, email, pass: '123456', role, refId: ref.id, name: ref.name, perms: ROLE_PERMS[role].slice(), active: true, lastLogin: '', demo: true });
  };
  addAcc('teacher', teachers[1], `giaovien@${EMAIL_DOMAIN}`);
  addAcc('student', students[0], `hocsinh@${EMAIL_DOMAIN}`);
  addDemoNotices(d);
  return { teachers: teachers.length, students: students.length };
}

// Xóa toàn bộ dữ liệu mẫu (bản ghi có demo: true) và những gì gắn với chúng
function removeDemo(d) {
  const sIds = new Set(d.students.filter((s) => s.demo).map((s) => s.id));
  const tIds = new Set(d.teachers.filter((x) => x.demo).map((x) => x.id));
  d.students = d.students.filter((s) => !sIds.has(s.id));
  d.teachers = d.teachers.filter((x) => !tIds.has(x.id));
  d.accounts = d.accounts.filter((a) => !a.demo && !(a.role === 'student' && sIds.has(a.refId)) && !(a.role === 'teacher' && tIds.has(a.refId)));
  Object.keys(d.grades).forEach((k) => { if (sIds.has(k.split('|')[0])) delete d.grades[k]; });
  Object.keys(d.attendance).forEach((k) => {
    const rec = d.attendance[k];
    Object.keys(rec).forEach((sid) => { if (sIds.has(sid)) delete rec[sid]; });
    if (!Object.keys(rec).length) delete d.attendance[k];
  });
  d.classes.forEach((c) => {
    if (tIds.has(c.homeroomId)) c.homeroomId = '';
    Object.keys(c.teachers || {}).forEach((k) => { if (tIds.has(c.teachers[k])) delete c.teachers[k]; });
  });
  d.notices = (d.notices || []).filter((n) => !n.demo);
  return { teachers: tIds.size, students: sIds.size };
}
// Thông báo mẫu (nội dung giả lập)
function addDemoNotices(d) {
  d.notices = d.notices || [];
  if (d.notices.some((n) => n.demo)) return;
  const admin = d.accounts.find((a) => a.role === 'admin') || { id: '', name: 'Admin' };
  const tAcc = d.accounts.find((a) => a.role === 'teacher' && a.demo);
  const tPerson = tAcc && d.teachers.find((x) => x.id === tAcc.refId);
  const tClass = tPerson && d.classes.find((c) => c.homeroomId === tPerson.id || Object.values(c.teachers || {}).includes(tPerson.id));
  const top = d.classes.slice().sort((a, b) => b.grade - a.grade)[0];
  const ago = (days, h = 8) => { const x = new Date(); x.setDate(x.getDate() - days); x.setHours(h, 0, 0, 0); return x.toISOString(); };
  const add = (by, o) => { d.seq.n = (d.seq.n || 0) + 1; d.notices.push({ id: 'n' + d.seq.n, classId: '', important: false, pinned: false, updated: '', authorId: by.id, authorName: by.name, demo: true, ...o }); };
  add(admin, { title: 'Lịch thi học kỳ 1 năm học 2026 – 2027', audience: 'all', pinned: true, important: true, created: ago(1, 9),
    body: 'Kỳ thi học kỳ 1 diễn ra trong tháng 1/2027.\nHọc sinh có mặt tại trường trước 7:15, mang theo thẻ học sinh và dụng cụ học tập.\nLịch thi chi tiết từng môn sẽ được giáo viên chủ nhiệm thông báo tại lớp.' });
  add(admin, { title: 'Nghỉ lễ Quốc khánh 2/12', audience: 'all', created: ago(3, 10),
    body: 'Toàn trường nghỉ học ngày 2/12/2026 nhân dịp Quốc khánh nước CHDCND Lào.\nCác lớp học bình thường trở lại từ ngày 3/12/2026.' });
  add(admin, { title: 'Họp hội đồng giáo viên tháng 11', audience: 'teachers', created: ago(5, 14),
    body: 'Mời toàn thể giáo viên dự họp hội đồng lúc 14:00 thứ Sáu tuần này tại phòng họp tầng 2.\nNội dung: tổng kết điểm thi tháng 10 và chuẩn bị đề thi học kỳ 1.' });
  add(admin, { title: 'Tham gia lễ hội That Luang', audience: 'students', created: ago(7, 8),
    body: 'Học sinh tập trung tại sân trường lúc 6:30 để cùng đi lễ hội That Luang.\nMặc đồng phục, nữ sinh mặc sinh (váy truyền thống).' });
  if (top) add(admin, { title: `Đăng ký thi tốt nghiệp lớp ${top.name}`, audience: 'class', classId: top.id, important: true, created: ago(2, 15),
    body: 'Học sinh lớp cuối cấp nộp hồ sơ đăng ký thi tốt nghiệp (thi vào tháng 6) cho giáo viên chủ nhiệm trước ngày 15/12.' });
  if (tAcc && tClass) add(tAcc, { title: 'Ôn tập trước bài thi tháng 11', audience: 'class', classId: tClass.id, created: ago(0, 7),
    body: 'Các em ôn lại các bài đã học trong tháng để chuẩn bị cho bài thi tháng 11.\nBuổi ôn tập thêm vào chiều thứ Tư.' });
}
const hasDemo = (d) => d.students.some((s) => s.demo) || d.teachers.some((x) => x.demo);
