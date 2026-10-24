import { useState } from "react";
import { BANK } from "../lib/config";
import { vnd } from "../lib/types";

// Dynamic VietQR image (amount + memo prefilled). Needs internet; falls back to /qr.png.
export default function BankCard({ amount, memo }: { amount: number; memo?: string }) {
  const [useStatic, setUseStatic] = useState(false);
  const qr = useStatic
    ? "/qr.png"
    : `https://img.vietqr.io/image/${BANK.bankCode}-${BANK.accountNo}-compact2.png?amount=${Math.round(
        amount
      )}&accountName=${encodeURIComponent(BANK.accountName)}${
        memo ? `&addInfo=${encodeURIComponent(memo)}` : ""
      }`;

  const Row = ({ k, v }: { k: string; v: string }) => (
    <div className="flex justify-between gap-4 py-1.5 text-sm">
      <span className="text-text/60">{k}</span>
      <button
        type="button"
        className="font-medium text-right cursor-pointer hover:underline"
        title="Nhấn để sao chép"
        onClick={() => navigator.clipboard?.writeText(v)}
      >
        {v}
      </button>
    </div>
  );

  return (
    <div className="border border-border rounded-lg p-4 flex flex-col sm:flex-row gap-4 bg-surface">
      <img
        src={qr}
        alt="Mã QR chuyển khoản ngân hàng"
        onError={() => setUseStatic(true)}
        className="w-44 h-44 object-contain self-center rounded bg-white border border-border"
      />
      <div className="flex-1">
        <Row k="Ngân hàng" v={BANK.bankName} />
        <Row k="Số tài khoản" v={BANK.accountNo} />
        <Row k="Chủ tài khoản" v={BANK.accountName} />
        <Row k="Số tiền" v={vnd(amount)} />
        <Row k="Nội dung chuyển khoản" v={memo ?? "(hiển thị sau khi bạn đặt hàng)"} />
        <p className="text-xs text-text/50 mt-2">Nhấn vào giá trị để sao chép.</p>
      </div>
    </div>
  );
}
