# Nh-m-sv-lao
# Phân công công việc và Branch

Nhóm thống nhất xây dựng dự án **“Hệ thống thông tin quản lý trường học ở Lào”**. Sau khi thảo luận, các thành viên được phân công công việc cụ thể và nhóm trưởng tạo branch riêng cho từng thành viên để thuận tiện cho việc phát triển và quản lý mã nguồn.

| **STT** | **Họ và tên** | **Vai trò**                        | **Branch**                  |
| ------- | ------------- | ---------------------------------- | --------------------------- |
| 1       | **Visouda**   | Nhóm trưởng / Quản lý dự án        | `feature/setup`             |
| 2       | **Kammani**   | Quản lý học sinh / Backend         | `feature/students`          |
| 3       | **Phatsouna**      | Quản lý giáo viên, lớp và môn học  | `feature/teachers-classes`  |
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
## 3. THIẾT KẾ GIAO DIỆN(visouda)

Hệ thống quản lý trường học được thiết kế với giao diện trực quan, hiện đại và dễ sử dụng, hỗ trợ người dùng thực hiện các chức năng quản lý một cách nhanh chóng và hiệu quả.

### 3.1. Giao diện đăng nhập

Giao diện đăng nhập cho phép người dùng nhập tài khoản và mật khẩu để truy cập vào hệ thống. Hệ thống thực hiện xác thực thông tin và phân quyền người dùng dựa trên vai trò.

Các thành phần chính:

* Tên đăng nhập.
* Mật khẩu.
* Nút đăng nhập.
* Thông báo khi thông tin đăng nhập không chính xác.

### 3.2. Giao diện trang chủ

Sau khi đăng nhập thành công, người dùng được chuyển đến trang chủ của hệ thống. Trang chủ cung cấp tổng quan về tình hình quản lý trường học và các chức năng chính.

Các thông tin có thể hiển thị:

* Tổng số học sinh.
* Tổng số giáo viên.
* Tổng số lớp học.
* Tổng số môn học.
* Các thông báo mới.
* Thống kê và biểu đồ tổng quan.

### 3.3. Giao diện quản lý học sinh

Chức năng quản lý học sinh cho phép người dùng thực hiện các thao tác:

* Xem danh sách học sinh.
* Thêm học sinh mới.
* Cập nhật thông tin học sinh.
* Xóa học sinh.
* Tìm kiếm học sinh.
* Lọc học sinh theo lớp hoặc khối.

Thông tin học sinh có thể bao gồm:

* Mã học sinh.
* Họ và tên.
* Ngày sinh.
* Giới tính.
* Địa chỉ.
* Lớp.
* Số điện thoại/phụ huynh.

### 3.4. Giao diện quản lý giáo viên

Giao diện quản lý giáo viên hỗ trợ:

* Xem danh sách giáo viên.
* Thêm giáo viên.
* Chỉnh sửa thông tin giáo viên.
* Xóa giáo viên.
* Tìm kiếm giáo viên.
* Phân công giáo viên giảng dạy.

Thông tin giáo viên bao gồm:

* Mã giáo viên.
* Họ và tên.
* Ngày sinh.
* Giới tính.
* Email.
* Số điện thoại.
* Bộ môn.
* Chức vụ.

### 3.5. Giao diện quản lý lớp học

Chức năng này cho phép quản lý thông tin các lớp trong trường:

* Thêm lớp học.
* Cập nhật thông tin lớp.
* Xóa lớp.
* Xem danh sách học sinh trong lớp.
* Phân công giáo viên chủ nhiệm.

Thông tin lớp học gồm:

* Mã lớp.
* Tên lớp.
* Khối.
* Giáo viên chủ nhiệm.
* Số lượng học sinh.

### 3.6. Giao diện quản lý môn học

Giao diện quản lý môn học cho phép:

* Thêm môn học.
* Cập nhật thông tin môn học.
* Xóa môn học.
* Xem danh sách môn học.
* Quản lý số tiết hoặc thông tin liên quan đến môn học.

Thông tin môn học gồm:

* Mã môn học.
* Tên môn học.
* Số tiết.
* Bộ môn phụ trách.

### 3.7. Giao diện quản lý điểm

Chức năng quản lý điểm hỗ trợ giáo viên hoặc quản trị viên nhập và theo dõi kết quả học tập của học sinh.

Các chức năng chính:

* Nhập điểm.
* Cập nhật điểm.
* Xem điểm theo học sinh.
* Xem điểm theo lớp.
* Tính điểm trung bình.
* Xếp loại kết quả học tập.

### 3.8. Giao diện quản lý thời khóa biểu

Giao diện thời khóa biểu giúp quản lý lịch học của các lớp và giáo viên.

Các chức năng:

* Xem thời khóa biểu theo lớp.
* Xem thời khóa biểu theo giáo viên.
* Thêm và chỉnh sửa lịch học.
* Phân công giáo viên giảng dạy.
* Quản lý phòng học.

### 3.9. Giao diện thống kê và báo cáo

Hệ thống cung cấp các chức năng thống kê nhằm hỗ trợ nhà trường theo dõi tình hình hoạt động.

Một số nội dung thống kê:

* Thống kê số lượng học sinh theo lớp/khối.
* Thống kê số lượng giáo viên.
* Thống kê kết quả học tập.
* Thống kê học sinh theo mức xếp loại.
* Báo cáo kết quả học tập theo học kỳ.

### 3.10. Nguyên tắc thiết kế giao diện

Giao diện hệ thống được xây dựng theo các nguyên tắc:

* **Đơn giản:** bố cục rõ ràng, hạn chế các thành phần không cần thiết.
* **Dễ sử dụng:** các chức năng được phân nhóm và bố trí trực quan.
* **Nhất quán:** màu sắc, font chữ, nút chức năng và bố cục được sử dụng thống nhất.
* **Responsive:** giao diện có khả năng thích ứng với nhiều kích thước màn hình.
* **Hiệu quả:** hỗ trợ tìm kiếm, lọc và thao tác dữ liệu nhanh chóng.
* **Phân quyền:** các chức năng được hiển thị phù hợp với vai trò của từng người dùng.
