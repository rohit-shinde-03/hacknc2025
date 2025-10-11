import Head from "next/head";
import Link from "next/link";
import { useState } from "react";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function validate(): boolean {
    if (!email) {
      setError("Email is required");
      return false;
    }
    if (!email.includes("@")) {
      setError("Please enter a valid email address");
      return false;
    }
    if (!password) {
      setError("Password is required");
      return false;
    }
    setError(null);
    return true;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    // Frontend-only: just log the values. In a real app you'd call an API.
    // Avoid sending secrets to logs in production.
    console.log({ email, password: password ? "[REDACTED]" : "", remember });
    alert("Login submitted (frontend only).\nEmail: " + email + "\nRemember: " + remember);
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-gradient-to-b from-slate-50 to-white">
      <Head>
        <title>Login</title>
      </Head>

      <main
        aria-labelledby="login-heading"
        className="w-full max-w-md bg-white rounded-2xl p-8 shadow-lg"
      >
        <h1 id="login-heading" className="text-lg font-semibold mb-4 text-slate-900">
          Sign in to your account
        </h1>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3" noValidate>
          {error && (
            <div className="text-red-700 bg-red-50 px-3 py-2 rounded">{error}</div>
          )}

          <label className="flex flex-col text-sm" htmlFor="email">
            <span className="mb-1 text-slate-900">Email</span>
            <input
              id="email"
              name="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-4 focus:ring-indigo-200 text-slate-900"
              autoComplete="email"
              required
            />
          </label>

          <label className="flex flex-col text-sm" htmlFor="password">
            <span className="mb-1 text-slate-900">Password</span>
            <input
              id="password"
              name="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-4 focus:ring-indigo-200 text-slate-900"
              autoComplete="current-password"
              required
            />
          </label>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              className="w-4 h-4"
            />
            <span className="select-none text-slate-900">Remember me</span>
          </label>

          <button
            type="submit"
            className="mt-1 bg-slate-900 text-white font-semibold rounded-lg py-2 hover:bg-slate-800"
          >
            Sign in
          </button>
        </form>

        <div className="mt-4 flex items-center justify-between text-sm">
          <Link href="/" className="text-slate-900 hover:underline">
            Back to home
          </Link>
          <a href="#" onClick={(e) => e.preventDefault()} className="text-slate-900">
            Forgot password?
          </a>
        </div>
      </main>
    </div>
  );
}
