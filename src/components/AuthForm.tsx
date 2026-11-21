"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { useDispatch } from "react-redux";
import { ArrowRight, Eye, EyeOff, Landmark, ShieldCheck } from "lucide-react";
import {
  registrationFormSchema,
  userLoginSchema,
  type RegistrationFormInput,
} from "@/lib/validation/user";
import { authApi, useLoginMutation, useRegisterMutation } from "@/store/authApi";
import type { AppDispatch } from "@/store/store";

type AuthMode = "login" | "register";
type FormErrors = Record<string, string>;

function getApiMessage(error: unknown, fallback: string) {
  if (typeof error === "object" && error !== null && "data" in error) {
    const data = error.data;
    if (
      typeof data === "object" &&
      data !== null &&
      "message" in data &&
      typeof data.message === "string"
    ) {
      return data.message;
    }
  }

  return fallback;
}

export function AuthForm({ mode }: { mode: AuthMode }) {
  const isRegister = mode === "register";
  const router = useRouter();
  const dispatch = useDispatch<AppDispatch>();
  const [register, registerState] = useRegisterMutation();
  const [login, loginState] = useLoginMutation();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [apiError, setApiError] = useState("");
  const isSubmitting = registerState.isLoading || loginState.isLoading;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrors({});
    setApiError("");

    if (isRegister) {
      const result = registrationFormSchema.safeParse({
        name,
        email,
        password,
        confirmPassword,
      });

      if (!result.success) {
        setErrors(
          Object.fromEntries(
            result.error.issues.map((issue) => [issue.path[0], issue.message]),
          ),
        );
        return;
      }

      try {
        await register({
          name: result.data.name,
          email: result.data.email,
          password: result.data.password,
        }).unwrap();
        router.push("/login");
      } catch (error: unknown) {
        setApiError(getApiMessage(error, "Registration could not be completed."));
      }
      return;
    }

    const result = userLoginSchema.safeParse({ email, password });
    if (!result.success) {
      setErrors(
        Object.fromEntries(
          result.error.issues.map((issue) => [issue.path[0], issue.message]),
        ),
      );
      return;
    }

    try {
      await login(result.data).unwrap();
      await dispatch(
        authApi.endpoints.currentUser.initiate(undefined, {
          forceRefetch: true,
          subscribe: false,
        }),
      ).unwrap();
      router.replace("/dashboard");
    } catch (error: unknown) {
      setApiError(getApiMessage(error, "Login could not be completed."));
    }
  }

  function renderFieldError(field: keyof RegistrationFormInput | "email") {
    const message = errors[field];
    return message ? (
      <p id={`${field}-error`} className="mt-1.5 text-xs text-rose-700">
        {message}
      </p>
    ) : null;
  }

  const inputClassName =
    "mt-2 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-[#10B981] focus:ring-4 focus:ring-emerald-100";

  return (
    <main className="min-h-screen bg-[#f5f7fa] lg:grid lg:grid-cols-2">
      <section className="relative hidden min-h-screen overflow-hidden bg-[#142B4A] px-12 py-10 text-white lg:flex lg:flex-col lg:justify-between xl:px-20">
        <div className="absolute -right-32 top-28 h-96 w-96 rounded-full border border-white/10" />
        <div className="absolute -right-16 top-44 h-64 w-64 rounded-full border border-white/10" />
        <Link href="/" className="relative inline-flex w-fit items-center gap-3" aria-label="Northstar Bank home">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10">
            <Landmark size={21} />
          </span>
          <span className="text-lg font-bold tracking-tight">northstar<span className="text-[#10B981]">.</span></span>
        </Link>

        <div className="relative max-w-lg py-12">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs text-emerald-100">
            <ShieldCheck size={14} /> Banking made clear
          </span>
          <h1 className="mt-7 text-4xl font-semibold leading-tight tracking-tight xl:text-5xl">
            {isRegister ? "A better way to manage your money." : "Welcome back to banking that puts you first."}
          </h1>
          <p className="mt-5 max-w-md text-sm leading-7 text-blue-100/75">
            {isRegister
              ? "Create your secure account and bring your everyday banking into one calm, simple place."
              : "Sign in to see your account experience and keep your finances moving with confidence."}
          </p>
          <div className="mt-10 max-w-sm rounded-2xl border border-white/10 bg-white/[0.07] p-5 backdrop-blur-sm">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-400/15 text-emerald-300"><ShieldCheck size={19} /></span>
              <div><p className="text-sm font-semibold">Your security comes first</p><p className="mt-1 text-xs text-blue-100/65">Protected access for every session.</p></div>
            </div>
          </div>
        </div>

        <p className="relative text-xs text-blue-100/50">© 2026 Northstar Bank. Secure digital banking.</p>
      </section>

      <section className="flex min-h-screen items-center justify-center px-5 py-10 sm:px-8">
        <div className="w-full max-w-[440px]">
          <Link href="/" className="mb-9 inline-flex items-center gap-2.5 text-[#142B4A] lg:hidden">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#142B4A] text-white"><Landmark size={19} /></span>
            <span className="text-base font-bold tracking-tight">northstar<span className="text-[#10B981]">.</span></span>
          </Link>

          <div className="rounded-3xl border border-slate-200/80 bg-white p-6 shadow-[0_12px_45px_rgba(15,23,42,0.06)] sm:p-9">
            <div className="mb-7">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700">Northstar digital banking</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-[#142B4A]">
                {isRegister ? "Create your account" : "Welcome back"}
              </h2>
              <p className="mt-2 text-sm text-slate-500">
                {isRegister ? "Start with your personal details below." : "Enter your details to sign in securely."}
              </p>
            </div>

            {apiError && (
              <div role="alert" className="mb-5 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-3 text-sm text-rose-800">
                {apiError}
              </div>
            )}

            <form className="space-y-4" onSubmit={handleSubmit} noValidate>
              {isRegister && (
                <div>
                  <label htmlFor="name" className="text-sm font-medium text-slate-700">Full name</label>
                  <input id="name" name="name" autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} className={inputClassName} placeholder="e.g. Alex Morgan" aria-invalid={Boolean(errors.name)} aria-describedby={errors.name ? "name-error" : undefined} required />
                  {renderFieldError("name")}
                </div>
              )}

              <div>
                <label htmlFor="email" className="text-sm font-medium text-slate-700">Email address</label>
                <input id="email" name="email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} className={inputClassName} placeholder="you@example.com" aria-invalid={Boolean(errors.email)} aria-describedby={errors.email ? "email-error" : undefined} required />
                {renderFieldError("email")}
              </div>

              <div>
                <label htmlFor="password" className="text-sm font-medium text-slate-700">Password</label>
                <div className="relative">
                  <input id="password" name="password" type={showPassword ? "text" : "password"} autoComplete={isRegister ? "new-password" : "current-password"} value={password} onChange={(event) => setPassword(event.target.value)} className={`${inputClassName} pr-12`} placeholder={isRegister ? "At least 12 characters" : "Enter your password"} aria-invalid={Boolean(errors.password)} aria-describedby={errors.password ? "password-error" : isRegister ? "password-hint" : undefined} required />
                  <button type="button" onClick={() => setShowPassword((visible) => !visible)} className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-500 hover:text-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600" aria-label={showPassword ? "Hide password" : "Show password"}>
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
                {renderFieldError("password")}
                {isRegister && !errors.password && <p id="password-hint" className="mt-1.5 text-xs text-slate-500">Use 12 to 128 characters.</p>}
              </div>

              {isRegister && (
                <div>
                  <label htmlFor="confirmPassword" className="text-sm font-medium text-slate-700">Confirm password</label>
                  <input id="confirmPassword" name="confirmPassword" type={showPassword ? "text" : "password"} autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} className={inputClassName} placeholder="Enter your password again" aria-invalid={Boolean(errors.confirmPassword)} aria-describedby={errors.confirmPassword ? "confirmPassword-error" : undefined} required />
                  {renderFieldError("confirmPassword")}
                </div>
              )}

              <button type="submit" disabled={isSubmitting} className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-[#142B4A] px-4 py-3.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#1d3c63] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#10B981] disabled:cursor-not-allowed disabled:opacity-65">
                {isSubmitting ? (isRegister ? "Creating account…" : "Signing in…") : (isRegister ? "Create account" : "Sign in")}
                {!isSubmitting && <ArrowRight size={16} />}
              </button>
            </form>

            <p className="mt-6 text-center text-sm text-slate-500">
              {isRegister ? "Already have an account? " : "New to Northstar? "}
              <Link href={isRegister ? "/login" : "/register"} className="font-semibold text-[#087f5b] underline-offset-4 hover:underline">
                {isRegister ? "Sign in" : "Create an account"}
              </Link>
            </p>
          </div>
          <p className="mt-5 text-center text-xs leading-5 text-slate-400">Secure access is protected by your account credentials and session cookie.</p>
        </div>
      </section>
    </main>
  );
}
