import { useState } from "react";
import { BANK } from "../lib/config";
import { vnd } from "../lib/types";

// Dynamic VietQR image (amount + memo prefilled). Needs internet; falls back to /qr.png.
export default function BankCard({ amount, memo }: { amount: number; memo?: string }) {
  const [useStatic, setUseStatic] = useState(false);
  const qr = useStatic
    ? `${import.meta.env.BASE_URL}qr.png`
    : `https://img.vietqr.io/image/${BANK.bankCode}-${BANK.accountNo}-compact2.png?amount=${Math.round(
      amount
    )}&accountName=${encodeURIComponent(BANK.accountName)}${memo ? `&addInfo=${encodeURIComponent(memo)}` : ""
    }`;

  const Row = ({ k, v }: { k: string; v: string }) => (
    <div className="flex justify-between gap-4 py-1.5 text-sm">
      <span className="text-text/60">{k}</span>
      <button
        type="button"
        className="font-medium text-right cursor-pointer hover:underline"
        title="Click to copy"
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
        alt="Bank transfer QR code"
        onError={() => setUseStatic(true)}
        className="w-44 h-44 object-contain self-center rounded bg-white border border-border"
      />
      <div className="flex-1">
        <Row k="Bank" v={BANK.bankName} />
        <Row k="Account no." v={BANK.accountNo} />
        <Row k="Account name" v={BANK.accountName} />
        <Row k="Amount" v={vnd(amount)} />
        <Row k="Transfer note" v={memo ?? "(shown after you place the order)"} />
        <p className="text-xs text-text/50 mt-2">Click a value to copy it.</p>
      </div>
    </div>
  );
}