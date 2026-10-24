import { Link } from "react-router";

export default function NotFound({ message = "Không tìm thấy trang này." }: { message?: string }) {
  return (
    <div className="max-w-xl mx-auto p-8 text-center flex flex-col gap-3">
      <h1 className="font-bold text-3xl">Không tìm thấy</h1>
      <p className="text-text/70">{message}</p>
      <Link to="/shop" className="text-primary hover:underline">Đến cửa hàng →</Link>
    </div>
  );
}
