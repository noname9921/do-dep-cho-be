import { useState } from "react";
import { CONTACT } from "../lib/config";
import { supabase } from "../lib/supabase";

export default function Contact() {
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [err, setErr] = useState("");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget; // React nulls e.currentTarget after the first await
    const f = new FormData(form);
    const row = { name: String(f.get("name")), email: String(f.get("email")), message: String(f.get("message")) };

    if (!supabase) {
      // demo mode: open the visitor's mail app
      window.location.href = `mailto:${CONTACT.email}?subject=${encodeURIComponent("Tin nhắn từ " + row.name)}&body=${encodeURIComponent(row.message + "\n\n" + row.email)}`;
      return;
    }
    setStatus("sending");
    setErr("");
    const { error } = await supabase.from("messages").insert(row);
    if (error) { setErr(error.message); setStatus("error"); return; }
    setStatus("sent");
    form.reset();
  }

  const input = "w-full p-2.5 rounded-md border border-border bg-surface";

  return (
    <div className="max-w-6xl mx-auto p-8 grid md:grid-cols-2 gap-8">
      <section className="bg-surface border border-border rounded-lg p-8 flex flex-col gap-4">
        <h1 className="font-bold text-4xl">Liên hệ với chúng tôi</h1>
        <dl className="flex flex-col gap-3 text-sm">
          <div><dt className="text-text/60">Điện thoại</dt><dd className="font-medium">{CONTACT.phone}</dd></div>
          <div><dt className="text-text/60">Email</dt><dd className="font-medium">{CONTACT.email}</dd></div>
          <div><dt className="text-text/60">Zalo</dt><dd><a className="font-medium text-primary hover:underline" href={CONTACT.zalo} target="_blank" rel="noreferrer">Chat trên Zalo</a></dd></div>
          <div><dt className="text-text/60">Địa chỉ</dt><dd className="font-medium">{CONTACT.address}</dd></div>
          <div><dt className="text-text/60">Giờ làm việc</dt><dd className="font-medium">{CONTACT.hours}</dd></div>
        </dl>
      </section>

      <form onSubmit={onSubmit} className="bg-surface border border-border rounded-lg p-8 flex flex-col gap-4">
        <h2 className="font-semibold text-2xl">Gửi tin nhắn cho chúng tôi</h2>
        <label className="flex flex-col gap-1 text-sm">Họ và tên<input name="name" required className={input} /></label>
        <label className="flex flex-col gap-1 text-sm">Email<input name="email" type="email" required className={input} /></label>
        <label className="flex flex-col gap-1 text-sm">Nội dung tin nhắn<textarea name="message" required rows={5} className={input} /></label>
        <button disabled={status === "sending"} className="py-3 rounded-md bg-primary text-white font-semibold hover:opacity-90 disabled:opacity-40 cursor-pointer">
          {status === "sending" ? "Đang gửi…" : "Gửi"}
        </button>
        {status === "sent" && <p className="text-success text-sm">Cảm ơn bạn! Chúng tôi sẽ phản hồi sớm.</p>}
        {status === "error" && <p className="text-danger text-sm">Không gửi được: {err}</p>}
      </form>
    </div>
  );
}
