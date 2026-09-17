# Nh-m-sv-lao
# Phân công công việc và Branch

Nhóm thống nhất xây dựng dự án **“Hệ thống thông tin quản lý trường học ở Lào”**. Sau khi thảo luận, các thành viên được phân công công việc cụ thể và nhóm trưởng tạo branch riêng cho từng thành viên để thuận tiện cho việc phát triển và quản lý mã nguồn.

| **STT** | **Họ và tên** | **Vai trò**                        | **Branch**                  |
| ------- | ------------- | ---------------------------------- | --------------------------- |
| 1       | **Visouda**   | Nhóm trưởng / Quản lý dự án        | `feature/setup`             |
| 2       | **Kammani**   | Quản lý học sinh / Backend         | `feature/students`          |
| 3       | **Phai**      | Quản lý giáo viên, lớp và môn học  | `feature/teachers-classes`  |
| 4       | **Phosi**     | Quản lý điểm và điểm danh          | `feature/scores-attendance` |
| 5       | **Thor**      | Thời khóa biểu, học phí / Kiểm thử | `feature/schedule-fees`     |

## Phân công công việc

| **Thành viên** | **Công việc**                                                                                                               |
| -------------- | --------------------------------------------------------------------------------------------------------------------------- |
| **Visouda**    | Khởi tạo dự án, quản lý Repository, tạo branch, thiết lập cấu trúc project, tích hợp các chức năng và quản lý tiến độ nhóm. |
| **Kammani**    | Xây dựng chức năng quản lý học sinh và phụ huynh: thêm, sửa, xóa, tìm kiếm và xem thông tin học sinh.                       |
| **Phai**       | Xây dựng chức năng quản lý giáo viên, lớp học và môn học; phân công giáo viên và quản lý thông tin lớp.                     |
| **Phosi**      | Xây dựng chức năng quản lý điểm và điểm danh; nhập, sửa, xem điểm và thống kê tình trạng đi học của học sinh.               |
| **Thor**       | Xây dựng chức năng thời khóa biểu và học phí; kiểm thử chức năng, phát hiện lỗi và hỗ trợ hoàn thiện hệ thống.              |

## Cấu trúc Branch

```text
main
│
├── feature/setup
├── feature/students
├── feature/teachers-classes
├── feature/scores-attendance
└── feature/schedule-fees
```

## Quy trình làm việc trên GitHub

Mỗi thành viên phát triển chức năng của mình trên branch riêng:

```bash
git checkout -b feature/students
```

Sau khi hoàn thành:

```bash
git add .
git commit -m "Add student management"
git push origin feature/students
```

Sau đó tạo **Pull Request** để nhóm trưởng **Visouda** kiểm tra code và merge vào branch `main`.

```text
feature/students
       │
       ▼
Pull Request
       │
       ▼
Visouda kiểm tra
       │
       ▼
     main
```
