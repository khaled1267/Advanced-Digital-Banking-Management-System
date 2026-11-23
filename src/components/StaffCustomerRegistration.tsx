"use client";

import { useState, type FormEvent } from "react";
import { CheckCircle2, UserPlus } from "lucide-react";
import { registrationFormSchema } from "@/lib/validation/user";
import { useRegisterStaffCustomerMutation } from "@/store/staffCustomersApi";

const inputClass = "w-full rounded-xl border border-white/[0.08] bg-[#10182b] px-3.5 py-2.5 text-sm text-slate-200 outline-none transition placeholder:text-slate-500 focus:border-blue-400 focus:ring-4 focus:ring-blue-400/15";

export function StaffCustomerRegistration() {
  const [registerCustomer, request] = useRegisterStaffCustomerMutation();
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    setNotice("");
    setError("");
    const form = new FormData(formElement);
    const parsed = registrationFormSchema.safeParse({
      name: form.get("name"), email: form.get("email"), password: form.get("password"), confirmPassword: form.get("confirmPassword"),
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check the customer details and try again.");
      return;
    }
    try {
      const result = await registerCustomer({ name: parsed.data.name, email: parsed.data.email, password: parsed.data.password }).unwrap();
      setNotice(`Customer ${result.data.customer.name} was registered. The account can now be opened from Accounts.`);
      formElement.reset();
    } catch (reason: unknown) {
      const message = typeof reason === "object" && reason !== null && "data" in reason && typeof reason.data === "object" && reason.data !== null && "message" in reason.data && typeof reason.data.message === "string"
        ? reason.data.message
        : "Customer registration could not be completed.";
      setError(message);
    }
  }

  return <div className="mx-auto max-w-3xl px-4 py-7 sm:px-7 lg:px-10">
    <div className="mb-6"><p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-blue-300">Customer operations</p><h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-100">Register a customer</h1><p className="mt-1.5 text-sm text-slate-400">Create a Customer login. Customer records are created with the Customer role by the server.</p></div>
    {notice && <p role="status" className="mb-4 flex items-start gap-2 rounded-xl border border-emerald-300/15 bg-emerald-300/[0.05] px-4 py-3 text-xs leading-5 text-emerald-200"><CheckCircle2 size={15} className="mt-0.5 shrink-0" />{notice}</p>}
    <form onSubmit={submit} className="rounded-2xl border border-white/[0.08] bg-[#10182b] p-5 sm:p-7">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2"><label htmlFor="staff-customer-name" className="mb-1.5 block text-xs font-semibold text-slate-400">Customer name</label><input id="staff-customer-name" name="name" autoComplete="name" minLength={2} maxLength={100} required className={inputClass}/></div>
        <div className="sm:col-span-2"><label htmlFor="staff-customer-email" className="mb-1.5 block text-xs font-semibold text-slate-400">Email address</label><input id="staff-customer-email" name="email" type="email" autoComplete="email" maxLength={254} required className={inputClass}/></div>
        <div><label htmlFor="staff-customer-password" className="mb-1.5 block text-xs font-semibold text-slate-400">Initial password</label><input id="staff-customer-password" name="password" type="password" autoComplete="new-password" minLength={12} maxLength={128} required className={inputClass}/><p className="mt-1.5 text-[10px] leading-4 text-slate-500">At least 12 characters. Share it with the customer using your approved process.</p></div>
        <div><label htmlFor="staff-customer-confirm" className="mb-1.5 block text-xs font-semibold text-slate-400">Confirm password</label><input id="staff-customer-confirm" name="confirmPassword" type="password" autoComplete="new-password" minLength={12} maxLength={128} required className={inputClass}/></div>
      </div>
      {error && <p role="alert" className="mt-4 rounded-xl border border-rose-300/15 bg-rose-400/[0.05] px-3 py-2.5 text-xs text-rose-200">{error}</p>}
      <div className="mt-5 flex justify-end"><button type="submit" disabled={request.isLoading} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-blue-500 disabled:cursor-wait disabled:opacity-60"><UserPlus size={15}/>{request.isLoading ? "Registering…" : "Register customer"}</button></div>
    </form>
  </div>;
}
