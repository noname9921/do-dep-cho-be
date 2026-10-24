import { useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";

function Login() {
  const [err, setErr] = useState("");
  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setErr("");
    const { error } = await supabase!.auth.signInWithPassword({
      email: String(f.get("email")),
      password: String(f.get("password")),
    });
    if (error) setErr(/invalid login credentials/i.test(error.message) ? "Email hoặc mật khẩu không đúng." : error.message);
  }
  const input = "w-full p-2.5 rounded-md border border-border bg-surface";
  return (
    <form onSubmit={onSubmit} className="max-w-sm mx-auto mt-16 bg-surface border border-border rounded-lg p-8 flex flex-col gap-4">
      <h1 className="font-bold text-2xl">Đăng nhập quản trị</h1>
      <input name="email" type="email" placeholder="Email" required className={input} />
      <input name="password" type="password" placeholder="Mật khẩu" required className={input} />
      <button className="py-3 rounded-md bg-primary text-white font-semibold cursor-pointer">Đăng nhập</button>
      {err && <p className="text-sm text-danger">{err}</p>}
    </form>
  );
}

// Renders children only for a signed-in Supabase user
export default function AdminGate({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession()
      .then(({ data }) => setSession(data.session))
      .catch(() => setSession(null))
      .finally(() => setReady(true));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  if (!supabase) {
    return (
      <p className="max-w-xl mx-auto p-8 text-text/70">
        Trang này cần Supabase. Hãy thêm <code>VITE_SUPABASE_URL</code> và <code>VITE_SUPABASE_ANON_KEY</code> vào <code>.env</code>.
      </p>
    );
  }
  if (!ready) return <p className="p-8 text-text/60">Đang tải…</p>;
  return session ? <>{children}</> : <Login />;
}
