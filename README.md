# Nh-m-6
Phân công công việc và Branch

Nhóm thống nhất xây dựng dự án “Trò chơi Rắn săn mồi (Snake Game)”. Sau khi thảo luận, các thành viên được phân công công việc cụ thể và nhóm trưởng tạo branch riêng cho từng thành viên để thuận tiện cho việc phát triển và quản lý mã nguồn.

STT	Họ và tên	Vai trò	Branch
1	Nguyễn Bảo Ngọc	Nhóm trưởng / Quản lý dự án	feature/setup
2	Hoàng Anh Tuấn	Thiết kế giao diện / Frontend	feature/ui
3	Nguyễn Thu Hà	Lập trình rắn / Điều khiển	feature/snake
4	Nguyễn Trang Nhung	Thức ăn / Tính điểm	feature/food-score
5	Khuất Duy Hải	Va chạm / Kiểm thử	feature/collision-testing
Phân công công việc
Thành viên	Công việc
Nguyễn Bảo Ngọc	Khởi tạo dự án, quản lý Repository, tạo branch, tích hợp các chức năng và quản lý tiến độ nhóm.
Hoàng Anh Tuấn	Thiết kế giao diện game, màn hình bắt đầu, màn hình chơi và màn hình Game Over.
Nguyễn Thu Hà	Lập trình con rắn, xử lý di chuyển và điều khiển bằng các phím mũi tên, xử lý tăng chiều dài.
Nguyễn Trang Nhung	Lập trình thức ăn xuất hiện ngẫu nhiên, xử lý việc rắn ăn thức ăn và tính điểm.
Khuất Duy Hải	Xử lý va chạm với tường và thân rắn, điều kiện Game Over, kiểm thử và sửa lỗi.
Cấu trúc Branch
main
│
├── feature/setup
├── feature/ui
├── feature/snake
├── feature/food-score
└── feature/collision-testing

Quy trình làm việc:

Nhóm trưởng tạo Repository
        ↓
Mời các thành viên vào Repository
        ↓
Tạo branch cho từng thành viên
        ↓
Mỗi thành viên phát triển trên branch riêng
        ↓
Commit và Push code lên GitHub
        ↓
Tạo Pull Request
        ↓
Nhóm trưởng kiểm tra
        ↓
Merge vào branch main
