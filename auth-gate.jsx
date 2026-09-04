import React, { useEffect, useState } from "react";
import { C, SHELL_W, serif } from "./avalon-dm.jsx";
import { supabase, supabaseConfigured } from "./supabase-client.js";

const inputStyle = {
  background: C.panel,
  border: `1px solid ${C.line}`,
  color: C.text,
  padding: "14px 15px",
  fontSize: 16,
  outline: "none",
  transition: "border-color .18s",
};

function friendlyAuthError(error) {
  const message = error?.message || "登录失败，请稍后重试";
  if (/invalid login credentials/i.test(message)) return "Email 或密码不正确";
  if (/email not confirmed/i.test(message)) return "请先到邮箱完成验证";
  if (/user already registered/i.test(message)) return "这个 Email 已经注册，请直接登录";
  if (/password should be at least/i.test(message)) return "密码至少需要 6 个字符";
  if (/rate limit/i.test(message)) return "操作太频繁，请稍后再试";
  return message;
}

function AuthScreen({ onAuthenticated }) {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    if (!supabase || busy) return;
    setBusy(true);
    setMessage("");
    setIsError(false);

    try {
      if (mode === "register") {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        if (data.session) onAuthenticated(data.session);
        else setMessage("验证邮件已寄出。完成验证后，再回来登录。");
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) throw error;
        onAuthenticated(data.session);
      }
    } catch (error) {
      setIsError(true);
      setMessage(friendlyAuthError(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ background: C.ink, color: C.text, minHeight: "100dvh" }} className="flex justify-center">
      <main className="shell-col flex min-h-dvh w-full flex-col justify-center px-5 py-8" style={{ maxWidth: SHELL_W }}>
        <div style={{ ...serif, color: C.goldDim, fontSize: 11, letterSpacing: "0.34em" }}>AVALON · 主持人</div>
        <h1 style={{ ...serif, color: C.text, fontSize: 32, letterSpacing: "0.04em", marginTop: 8 }}>
          {mode === "login" ? "回到圆桌" : "建立主持人账号"}
        </h1>
        <p style={{ color: C.dim, fontSize: 14, lineHeight: 1.8, marginTop: 12 }}>
          玩家、身份与对局历史会保存到你的私有云端记录，只有这个账号能够读取。
        </p>

        {!supabaseConfigured ? (
          <div className="rounded-xl p-4 mt-6" style={{ border: `1px solid ${C.crimson}`, color: C.crimson }}>
            Supabase 尚未配置。请设置 VITE_SUPABASE_URL 与 VITE_SUPABASE_PUBLISHABLE_KEY。
          </div>
        ) : (
          <form onSubmit={submit} className="flex flex-col gap-3 mt-7">
            <label className="flex flex-col gap-2">
              <span style={{ ...serif, color: C.goldDim, fontSize: 12, letterSpacing: "0.2em" }}>EMAIL</span>
              <input
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="w-full rounded-xl"
                style={inputStyle}
                onFocus={(event) => (event.target.style.borderColor = C.gold)}
                onBlur={(event) => (event.target.style.borderColor = C.line)}
              />
            </label>
            <label className="flex flex-col gap-2">
              <span style={{ ...serif, color: C.goldDim, fontSize: 12, letterSpacing: "0.2em" }}>密码</span>
              <input
                type="password"
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                required
                minLength={6}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="w-full rounded-xl"
                style={inputStyle}
              />
            </label>

            {message && (
              <div className="rounded-xl p-3" role={isError ? "alert" : "status"}
                style={{ background: C.panel, color: isError ? C.crimson : C.azure, fontSize: 13, lineHeight: 1.6 }}>
                {message}
              </div>
            )}

            <button type="submit" disabled={busy}
              className="w-full rounded-xl active:scale-95 transition mt-2"
              style={{ background: busy ? C.panel : C.gold, color: busy ? C.dim : C.ink, padding: "15px 22px", fontSize: 16, fontWeight: 700 }}>
              {busy ? "请稍候…" : mode === "login" ? "登录，开始主持" : "注册并发送验证邮件"}
            </button>
          </form>
        )}

        <button
          type="button"
          onClick={() => { setMode((value) => value === "login" ? "register" : "login"); setMessage(""); }}
          className="w-full rounded-xl active:scale-95 transition mt-3"
          style={{ border: `1px solid ${C.line}`, color: C.dim, padding: "13px", fontSize: 14 }}>
          {mode === "login" ? "第一次来？建立账号" : "已经有账号？返回登录"}
        </button>
      </main>
    </div>
  );
}

export default function AuthGate({ children }) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return undefined;
    }

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setLoading(false);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center" style={{ background: C.ink, color: C.gold, ...serif }}>
        正在打开圆桌…
      </div>
    );
  }

  if (!session) return <AuthScreen onAuthenticated={setSession} />;

  const signOut = async () => {
    if (supabase) await supabase.auth.signOut();
  };

  return children({ session, signOut });
}
