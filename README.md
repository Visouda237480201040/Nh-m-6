# Nh-m-6
## Phân công công việc và Branch

Nhóm thống nhất xây dựng dự án **“Trò chơi Rắn săn mồi (Snake Game)”**. Sau khi thảo luận, các thành viên được phân công công việc cụ thể và nhóm trưởng tạo branch riêng cho từng thành viên để thuận tiện cho việc phát triển và quản lý mã nguồn.

| **STT** | **Họ và tên** | **Vai trò** | **Branch** |
|---|---|---|---|
| 1 | Thảo Vy | Nhóm trưởng / Quản lý dự án | `feature/setup` |
| 2 | May Ngọc | Thiết kế giao diện / Frontend | `feature/ui` |
| 3 | Nam | Lập trình rắn / Điều khiển | `feature/snake` |
| 4 | Phong | Thức ăn / Tính điểm | `feature/food-score` |
| 5 | Phát | Va chạm / Kiểm thử | `feature/collision-testing` |

### Phân công công việc

| **Thành viên** | **Công việc** |
|---|---|
| **Thảo Vy** | Khởi tạo dự án, quản lý Repository, tạo branch, tích hợp các chức năng và quản lý tiến độ nhóm. |
| **May Ngọc** | Thiết kế giao diện game, màn hình bắt đầu, màn hình chơi và màn hình Game Over. |
| **Nam** | Lập trình con rắn, xử lý di chuyển và điều khiển bằng các phím mũi tên, xử lý tăng chiều dài. |
| **Phong** | Lập trình thức ăn xuất hiện ngẫu nhiên, xử lý việc rắn ăn thức ăn và tính điểm. |
| **Phát** | Xử lý va chạm với tường và thân rắn, điều kiện Game Over, kiểm thử và sửa lỗi. |

### Cấu trúc Branch

```text
main
│
├── feature/setup
├── feature/ui
├── feature/snake
├── feature/food-score
└── feature/collision-testing
