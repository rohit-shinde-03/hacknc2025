import Head from "next/head";
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
    <div className="min-h-screen flex items-center justify-center p-6 bg-black">
      <Head>
        <title>{isSignUp ? "Create account" : "Sign in"}</title>
      </Head>

      <main aria-labelledby="login-heading" className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <h1
            id="login-heading"
            className="text-xl font-bold text-green-400 mb-4"
            style={{ textShadow: '2px 2px 0px rgba(0,0,0,0.8)' }}
          >
            8-BIT BEAT MAKER
          </h1>
          <h2 className="text-sm font-bold text-cyan-400 mb-2">
            {isSignUp ? "CREATE ACCOUNT" : "WELCOME BACK"}
          </h2>
          <p className="text-[10px] text-yellow-400">
            {isSignUp
              ? "Sign up to get started"
              : "Sign in to continue"}
          </p>
        </div>

        {/* Form Card */}
        <div className="bg-gray-900 border-4 border-cyan-400 p-8 shadow-[8px_8px_0px_0px_rgba(0,139,139,1)]">
          <form
            onSubmit={handleSubmit}
            className="flex flex-col gap-5"
            noValidate
          >
            {error && (
              <div className="text-white bg-red-500 px-4 py-3 border-2 border-red-700 text-xs">
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
                  className="px-4 py-2 bg-cyan-400 text-black border-2 border-cyan-600 text-xs font-bold hover:bg-cyan-500 shadow-[2px_2px_0px_0px_rgba(0,139,139,1)] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none"
                >
                  SIGN IN INSTEAD
                </button>
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="email"
                className="text-xs font-bold text-cyan-400"
              >
                EMAIL ADDRESS
              </label>
              <input
                id="email"
                name="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={`px-4 py-3 border-2 bg-gray-800 text-white text-xs placeholder:text-gray-500 placeholder:text-xs focus:outline-none focus:ring-2 focus:ring-cyan-400 transition-all ${
                  fieldErrors.email
                    ? "border-red-500 focus:ring-red-500"
                    : "border-cyan-400"
                }`}
                placeholder="Enter your email"
                autoComplete="email"
                required
              />
              {fieldErrors.email && (
                <p className="text-[10px] text-red-400 mt-1">{fieldErrors.email}</p>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="password"
                className="text-xs font-bold text-cyan-400"
              >
                PASSWORD
              </label>
              <div className="relative">
                <input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={`w-full px-4 py-3 border-2 bg-gray-800 text-white text-xs placeholder:text-gray-500 placeholder:text-xs focus:outline-none focus:ring-2 focus:ring-cyan-400 transition-all ${
                    fieldErrors.password
                      ? "border-red-500 focus:ring-red-500"
                      : "border-cyan-400"
                  }`}
                  placeholder="Enter your password"
                  autoComplete="current-password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-cyan-400 hover:text-cyan-300 font-bold"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? "HIDE" : "SHOW"}
                </button>
              </div>
              {fieldErrors.password && (
                <p className="text-[10px] text-red-400 mt-1">
                  {fieldErrors.password}
                </p>
              )}
            </div>

            {isSignUp && (
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="confirmPassword"
                  className="text-xs font-bold text-cyan-400"
                >
                  CONFIRM PASSWORD
                </label>
                <input
                  id="confirmPassword"
                  name="confirmPassword"
                  type={showPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className={`px-4 py-3 border-2 bg-gray-800 text-white text-xs placeholder:text-gray-500 placeholder:text-xs focus:outline-none focus:ring-2 focus:ring-cyan-400 transition-all ${
                    fieldErrors.confirmPassword
                      ? "border-red-500 focus:ring-red-500"
                      : "border-cyan-400"
                  }`}
                  placeholder="Re-enter your password"
                  autoComplete="new-password"
                  required
                />
                {fieldErrors.confirmPassword && (
                  <p className="text-[10px] text-red-400 mt-1">
                    {fieldErrors.confirmPassword}
                  </p>
                )}
              </div>
            )}

            {!isSignUp && (
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 text-xs cursor-pointer">
                  <input
                    type="checkbox"
                    checked={remember}
                    onChange={(e) => setRemember(e.target.checked)}
                    className="w-3 h-3 border-2 border-cyan-400 bg-gray-800 text-cyan-400 focus:ring-2 focus:ring-cyan-400"
                  />
                  <span className="select-none text-yellow-400 font-bold">
                    REMEMBER ME
                  </span>
                </label>
                <a
                  href="#"
                  onClick={(e) => e.preventDefault()}
                  className="text-[10px] text-yellow-400 hover:text-yellow-300 font-bold"
                >
                  FORGOT PASSWORD?
                </a>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="mt-2 bg-green-400 text-black font-bold border-4 border-green-600 py-3 hover:bg-green-500 focus:outline-none focus:ring-2 focus:ring-green-400 disabled:opacity-60 disabled:cursor-not-allowed transition-all shadow-[4px_4px_0px_0px_rgba(0,100,0,1)] active:translate-x-1 active:translate-y-1 active:shadow-none text-sm"
            >
              {loading
                ? isSignUp
                  ? "CREATING..."
                  : "SIGNING IN..."
                : isSignUp
                ? "CREATE ACCOUNT"
                : "SIGN IN"}
            </button>
          </form>
        </div>

        {/* Toggle between sign in and sign up */}
        <div className="mt-6 text-center">
          <p className="text-[10px] text-gray-400">
            {isSignUp ? "ALREADY HAVE AN ACCOUNT? " : "DON'T HAVE AN ACCOUNT? "}
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
              className="text-cyan-400 hover:text-cyan-300 font-bold hover:underline"
            >
              {isSignUp ? "SIGN IN" : "CREATE ACCOUNT"}
            </button>
          </p>
        </div>
      </main>
    </div>
  );
}
