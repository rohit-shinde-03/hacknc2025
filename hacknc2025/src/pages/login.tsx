import Head from "next/head";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/router";
import supabase from "../../utils/supabase";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const [isSignUp, setIsSignUp] = useState(false);
  // unified message used for both signup success and generic signup failures
  const verificationMessage =
    "If the details are valid, we’ve sent an email for account verification. Please check your inbox.";
  const [signUpHintVisible, setSignUpHintVisible] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{
    email?: string;
    password?: string;
    confirmPassword?: string;
  }>({});
  const [confirmPassword, setConfirmPassword] = useState("");

  function validate(): boolean {
    const errs: {
      email?: string;
      password?: string;
      confirmPassword?: string;
    } = {};
    if (!email) errs.email = "Email is required";
    else if (!email.includes("@"))
      errs.email = "Please enter a valid email address";

    if (!password) errs.password = "Password is required";
    else if (password.length < 6)
      errs.password = "Password must be at least 6 characters";

    if (isSignUp) {
      if (!confirmPassword)
        errs.confirmPassword = "Please confirm your password";
      else if (confirmPassword !== password)
        errs.confirmPassword = "Passwords do not match";
    }

    setFieldErrors(errs);
    const ok = Object.keys(errs).length === 0;
    if (!ok) setError("Please fix the errors below.");
    else setError(null);
    return ok;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    setLoading(true);
    setError(null);
    setSignUpHintVisible(false);

    try {
      if (isSignUp) {
        // First check if the user already exists by attempting to sign in with the provided credentials
        const existingUserCheck = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        // If sign in succeeds, the user already exists with this exact email and password
        if (existingUserCheck.data.user && !existingUserCheck.error) {
          // Sign them out immediately since we were just checking
          await supabase.auth.signOut();
          setError(
            "If the details are valid, we’ve sent an email for account verification. Please check your inbox."
          );
          setSignUpHintVisible(true);
          setLoading(false);
          return;
        }

        // Now attempt to create the account
        const result = await supabase.auth.signUp({
          email,
          password,
        });

        if (result.error) {
          // Decide whether this looks like a field/input error (revealable) or a generic
          // server/duplication error (we'll show the non-committal message).
          const errorMsgRaw = result.error.message || "";
          const errorMsg = errorMsgRaw.toLowerCase();

          // Keywords that imply the error is about the provided fields and can be shown
          const fieldIndicators = [
            "email",
            "password",
            "invalid",
            "format",
            "too short",
            "length",
            "confirm",
            "required",
            "missing",
            "pattern",
            "must",
          ];

          const isFieldError = fieldIndicators.some((k) =>
            errorMsg.includes(k)
          );

          if (isFieldError) {
            // Reveal the specific, actionable message for field errors
            setError(result.error.message || "Please check your input fields.");
            setSignUpHintVisible(true);
          } else {
            // For any other sign-up failure (including duplication), show the generic message
            setError(verificationMessage);
            setSignUpHintVisible(true);
          }
          setLoading(false);
          return;
        }

        // Success - account was created. Show the same generic verification message.
        setError(verificationMessage);
        setSignUpHintVisible(true);
        setLoading(false);
        return;
      } else {
        // Sign in flow
        const result = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (result.error) {
          setError(result.error.message || "Sign in failed");
          setLoading(false);
          return;
        }

        // Redirect to home (or another protected page)
        router.push("/");
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-gradient-to-br from-indigo-50 via-white to-purple-50">
      <Head>
        <title>{isSignUp ? "Create account" : "Sign in"}</title>
      </Head>

      <main aria-labelledby="login-heading" className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <h1
            id="login-heading"
            className="text-3xl font-bold text-slate-900 mb-2"
          >
            {isSignUp ? "Create your account" : "Welcome back"}
          </h1>
          <p className="text-slate-600">
            {isSignUp
              ? "Sign up to get started"
              : "Sign in to continue to your account"}
          </p>
        </div>

        {/* Form Card */}
        <div className="bg-white rounded-2xl p-8 shadow-xl border border-slate-100">
          <form
            onSubmit={handleSubmit}
            className="flex flex-col gap-5"
            noValidate
          >
            {error && (
              <div className="text-red-700 bg-red-50 px-4 py-3 rounded-lg text-sm border border-red-100">
                {error}
              </div>
            )}

            {/* unified verification message is shown via `error` for sign-up success/failures */}

            {signUpHintVisible && (
              <div className="flex gap-2 items-center">
                <button
                  type="button"
                  onClick={() => {
                    setIsSignUp(false);
                    setError(null);
                    setFieldErrors({});
                    setSignUpHintVisible(false);
                    setEmail("");
                    setPassword("");
                    setConfirmPassword("");
                  }}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700"
                >
                  Sign in instead
                </button>
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="email"
                className="text-sm font-medium text-slate-700"
              >
                Email address
              </label>
              <input
                id="email"
                name="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={`px-4 py-3 rounded-lg border bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all ${
                  fieldErrors.email
                    ? "border-red-300 focus:ring-red-500"
                    : "border-slate-200"
                }`}
                placeholder="Enter your email"
                autoComplete="email"
                required
              />
              {fieldErrors.email && (
                <p className="text-xs text-red-600 mt-1">{fieldErrors.email}</p>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="password"
                className="text-sm font-medium text-slate-700"
              >
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={`w-full px-4 py-3 rounded-lg border bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all ${
                    fieldErrors.password
                      ? "border-red-300 focus:ring-red-500"
                      : "border-slate-200"
                  }`}
                  placeholder="Enter your password"
                  autoComplete="current-password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate-500 hover:text-slate-700 font-medium"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
              {fieldErrors.password && (
                <p className="text-xs text-red-600 mt-1">
                  {fieldErrors.password}
                </p>
              )}
            </div>

            {isSignUp && (
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="confirmPassword"
                  className="text-sm font-medium text-slate-700"
                >
                  Confirm password
                </label>
                <input
                  id="confirmPassword"
                  name="confirmPassword"
                  type={showPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className={`px-4 py-3 rounded-lg border bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all ${
                    fieldErrors.confirmPassword
                      ? "border-red-300 focus:ring-red-500"
                      : "border-slate-200"
                  }`}
                  placeholder="Re-enter your password"
                  autoComplete="new-password"
                  required
                />
                {fieldErrors.confirmPassword && (
                  <p className="text-xs text-red-600 mt-1">
                    {fieldErrors.confirmPassword}
                  </p>
                )}
              </div>
            )}

            {!isSignUp && (
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={remember}
                    onChange={(e) => setRemember(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-2 focus:ring-indigo-500"
                  />
                  <span className="select-none text-slate-700">
                    Remember me
                  </span>
                </label>
                <a
                  href="#"
                  onClick={(e) => e.preventDefault()}
                  className="text-sm text-indigo-600 hover:text-indigo-700 font-medium"
                >
                  Forgot password?
                </a>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="mt-2 bg-indigo-600 text-white font-semibold rounded-lg py-3 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed transition-all"
            >
              {loading
                ? isSignUp
                  ? "Creating account..."
                  : "Signing in..."
                : isSignUp
                ? "Create account"
                : "Sign in"}
            </button>
          </form>
        </div>

        {/* Toggle between sign in and sign up */}
        <div className="mt-6 text-center">
          <p className="text-sm text-slate-600">
            {isSignUp ? "Already have an account? " : "Don't have an account? "}
            <button
              onClick={() => {
                setIsSignUp(!isSignUp);
                setError(null);
                setFieldErrors({});
                setSignUpHintVisible(false);
                setEmail("");
                setPassword("");
                setConfirmPassword("");
              }}
              className="text-indigo-600 hover:text-indigo-700 font-semibold hover:underline"
            >
              {isSignUp ? "Sign in" : "Create account"}
            </button>
          </p>
        </div>

        {/* Back to home link */}
        <div className="mt-4 text-center">
          <Link
            href="/"
            className="text-sm text-slate-500 hover:text-slate-700 hover:underline"
          >
            ← Back to home
          </Link>
        </div>
      </main>
    </div>
  );
}
