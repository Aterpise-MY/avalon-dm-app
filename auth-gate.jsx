import React, { useEffect, useState } from "react";
import { C, SHELL_W, serif } from "./avalon-dm.jsx";
import { supabase, supabaseConfigured } from "./supabase-client.js";

function friendlyAuthError(error) {
  const message = error?.message || "登录失败，请稍后重试";
  if (/provider.+not enabled|unsupported provider/i.test(message)) {
    return "Google 登录尚未在 Supabase 启用";
  }
  if (/rate limit/i.test(message)) return "操作太频繁，请稍后再试";
  return message;
}

function AuthScreen() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const startGoogleLogin = async () => {
    if (!supabase || busy) return;
    setBusy(true);
    setMessage("");

    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: window.location.origin,
          queryParams: { prompt: "select_account" },
        },
      });
      if (error) throw error;
    } catch (error) {
      setMessage(friendlyAuthError(error));
      setBusy(false);
    }
  };

  return (
    <div style={{ background: C.ink, color: C.text, minHeight: "100dvh" }} className="flex justify-center">
      <main className="shell-col flex min-h-dvh w-full flex-col justify-center px-5 py-8" style={{ maxWidth: SHELL_W }}>
        <div style={{ ...serif, color: C.goldDim, fontSize: 11, letterSpacing: "0.34em" }}>AVALON · 主持人</div>
        <h1 style={{ ...serif, color: C.text, fontSize: 32, letterSpacing: "0.04em", marginTop: 8 }}>
          回到圆桌
        </h1>
        <p style={{ color: C.dim, fontSize: 14, lineHeight: 1.8, marginTop: 12 }}>
          使用你的 Google 账号进入。玩家、身份与对局历史只对你的账号开放。
        </p>

        {!supabaseConfigured ? (
          <div className="rounded-xl p-4 mt-6" style={{ border: `1px solid ${C.crimson}`, color: C.crimson }}>
            Supabase 尚未配置。请设置 VITE_SUPABASE_URL 与 VITE_SUPABASE_PUBLISHABLE_KEY。
          </div>
        ) : (
          <button
            type="button"
            onClick={startGoogleLogin}
            disabled={busy}
            className="mt-7 flex w-full items-center justify-center gap-3 rounded-xl active:scale-95 transition"
            style={{
              background: busy ? C.panel : C.gold,
              color: busy ? C.dim : C.ink,
              padding: "15px 22px",
              fontSize: 16,
              fontWeight: 700,
              minHeight: 54,
            }}
          >
            <span
              aria-hidden="true"
              className="flex items-center justify-center rounded-full"
              style={{
                width: 24,
                height: 24,
                background: busy ? C.line : C.text,
                color: busy ? C.dim : C.ink,
                fontFamily: "Arial, sans-serif",
                fontWeight: 800,
                fontSize: 15,
              }}
            >
              G
            </span>
            {busy ? "正在前往 Google…" : "使用 Google 账号登录"}
          </button>
        )}

        {message && (
          <div
            className="rounded-xl p-3 mt-3"
            role="alert"
            style={{ background: C.panel, color: C.crimson, fontSize: 13, lineHeight: 1.6 }}
          >
            {message}
          </div>
        )}
        <p style={{ color: C.dim, fontSize: 12, lineHeight: 1.7, marginTop: 14, textAlign: "center" }}>
          首次登录会自动建立主持人账号，无需另外设置密码。
        </p>
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

  if (!session) return <AuthScreen />;

  const signOut = async () => {
    if (supabase) await supabase.auth.signOut();
  };

  return children({ session, signOut });
}
