"use client";

import { useState, type FormEvent } from "react";
import { ChevronLeft, ChevronRight, Search, UserPlus, X } from "lucide-react";
import {
  useCreateAdminUserMutation,
  useGetAdminUserByIdQuery,
  useGetAdminUsersQuery,
  useUpdateAdminUserMutation,
  type ManagedUser,
} from "@/store/adminUsersApi";
import { useCurrentUserQuery } from "@/store/authApi";

const inputClass = "w-full rounded-xl border border-white/[0.08] bg-[#10182b] px-3.5 py-2.5 text-sm text-slate-200 outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:ring-4 focus:ring-blue-400/15";
const labelClass = "mb-1.5 block text-xs font-semibold text-slate-400";

function errorMessage(error: unknown) {
  if (typeof error === "object" && error !== null && "data" in error) {
    const data = error.data;
    if (typeof data === "object" && data !== null && "message" in data && typeof data.message === "string") {
      return data.message;
    }
  }
  return "Something went wrong. Please try again.";
}

function dateLabel(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(value));
}

export function AdminUsersManager() {
  const [search, setSearch] = useState("");
  const [role, setRole] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState("");
  const [formMode, setFormMode] = useState<"create" | "edit" | null>(null);
  const [formError, setFormError] = useState("");
  const [success, setSuccess] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [formRole, setFormRole] = useState<"STAFF" | "CUSTOMER">("STAFF");
  const [formStatus, setFormStatus] = useState<"ACTIVE" | "INACTIVE">("ACTIVE");
  const [editingRoleAllowed, setEditingRoleAllowed] = useState(true);
  const [editingStatusAllowed, setEditingStatusAllowed] = useState(true);
  const { data: currentUserResponse } = useCurrentUserQuery();
  const query = useGetAdminUsersQuery({
    search: search.trim() || undefined,
    role: role ? (role as "ADMIN" | "STAFF" | "CUSTOMER") : undefined,
    status: status ? (status as "ACTIVE" | "INACTIVE") : undefined,
    page,
    limit: 10,
  });
  const detailQuery = useGetAdminUserByIdQuery(selectedId, { skip: !selectedId });
  const [createUser, createState] = useCreateAdminUserMutation();
  const [updateUser, updateState] = useUpdateAdminUserMutation();
  const data = query.data?.data;
  const selectedUser = detailQuery.data?.data.user;

  function clearFeedback() {
    setFormError("");
    setSuccess("");
  }

  function startCreate() {
    clearFeedback();
    setName("");
    setEmail("");
    setPassword("");
    setFormRole("STAFF");
    setFormStatus("ACTIVE");
    setEditingRoleAllowed(true);
    setEditingStatusAllowed(true);
    setFormMode("create");
  }

  function startEdit(user: ManagedUser) {
    clearFeedback();
    setSelectedId(user.id);
    setName(user.name);
    setFormRole(user.role === "ADMIN" ? "STAFF" : user.role);
    setFormStatus(user.status);
    setEditingRoleAllowed(user.role !== "ADMIN" && user.id !== currentUserResponse?.data.user.id);
    setEditingStatusAllowed(user.id !== currentUserResponse?.data.user.id);
    setFormMode("edit");
  }

  async function submitForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    clearFeedback();
    try {
      if (formMode === "create") {
        await createUser({ name, email, password, role: formRole }).unwrap();
        setSuccess("User account created successfully.");
        setFormMode(null);
      } else if (formMode === "edit" && selectedId) {
        await updateUser({
          id: selectedId,
          name,
          ...(editingRoleAllowed ? { role: formRole } : {}),
          ...(editingStatusAllowed ? { status: formStatus } : {}),
        }).unwrap();
        setSuccess("User details updated successfully.");
        setFormMode(null);
      }
    } catch (error: unknown) {
      setFormError(errorMessage(error));
    }
  }

  async function toggleStatus(user: ManagedUser) {
    clearFeedback();
    try {
      await updateUser({ id: user.id, status: user.status === "ACTIVE" ? "INACTIVE" : "ACTIVE" }).unwrap();
      setSuccess(`${user.name} is now ${user.status === "ACTIVE" ? "inactive" : "active"}.`);
    } catch (error: unknown) {
      setFormError(errorMessage(error));
    }
  }

  return (
    <div className="mx-auto max-w-[1440px] px-5 py-7 sm:px-8 lg:px-10 lg:py-9">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium text-slate-400">Administration</p>
          <h1 className="mt-1.5 text-2xl font-semibold tracking-tight text-slate-100">User management</h1>
          <p className="mt-1 text-sm text-slate-400">Manage staff and customer access across Northstar Bank.</p>
        </div>
        <button type="button" onClick={startCreate} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-500">
          <UserPlus size={16} /> Create user
        </button>
      </div>

      {(success || formError) && <div role={formError ? "alert" : "status"} className={`mb-4 rounded-xl border px-4 py-3 text-sm ${formError ? "border-rose-400/20 bg-rose-400/10 text-rose-200" : "border-emerald-400/20 bg-emerald-400/10 text-emerald-200"}`}>{formError || success}</div>}

      {formMode && (
        <form onSubmit={submitForm} className="mb-5 rounded-2xl border border-white/[0.08] bg-[#10182b] p-5 shadow-sm sm:p-6">
          <div className="mb-5 flex items-center justify-between">
            <div><h2 className="font-semibold text-slate-100">{formMode === "create" ? "Create user account" : "Edit user"}</h2><p className="mt-1 text-xs text-slate-400">Admin access is managed separately and cannot be assigned here.</p></div>
            <button type="button" onClick={() => setFormMode(null)} className="rounded-lg p-2 text-slate-400 hover:bg-white/[0.07]" aria-label="Close form"><X size={18} /></button>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div><label className={labelClass} htmlFor="managed-name">Full name</label><input id="managed-name" className={inputClass} value={name} onChange={(event) => setName(event.target.value)} required minLength={2} maxLength={100} /></div>
            {formMode === "create" && <div><label className={labelClass} htmlFor="managed-email">Email</label><input id="managed-email" className={inputClass} type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></div>}
            {formMode === "create" && <div><label className={labelClass} htmlFor="managed-password">Temporary password</label><input id="managed-password" className={inputClass} type="password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={12} maxLength={128} autoComplete="new-password" /></div>}
            {(formMode === "create" || editingRoleAllowed) && <div><label className={labelClass} htmlFor="managed-role">Role</label><select id="managed-role" className={inputClass} value={formRole} onChange={(event) => setFormRole(event.target.value as "STAFF" | "CUSTOMER")}><option value="STAFF">Staff</option><option value="CUSTOMER">Customer</option></select></div>}
            {formMode === "edit" && editingStatusAllowed && <div><label className={labelClass} htmlFor="managed-status">Status</label><select id="managed-status" className={inputClass} value={formStatus} onChange={(event) => setFormStatus(event.target.value as "ACTIVE" | "INACTIVE")}><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option></select></div>}
          </div>
          <div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => setFormMode(null)} className="rounded-xl border border-white/[0.08] px-4 py-2.5 text-sm font-medium text-slate-400 hover:bg-white/[0.04]">Cancel</button><button type="submit" disabled={createState.isLoading || updateState.isLoading} className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-60">{createState.isLoading || updateState.isLoading ? "Saving…" : formMode === "create" ? "Create account" : "Save changes"}</button></div>
        </form>
      )}

      {selectedId && (
        <section className="mb-5 rounded-2xl border border-white/[0.08] bg-[#10182b] p-5 shadow-sm" aria-label="User details">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-[10px] font-semibold uppercase tracking-widest text-emerald-200">User details</p><h2 className="mt-1 text-lg font-semibold text-slate-100">{detailQuery.isLoading ? "Loading user…" : selectedUser?.name ?? "User unavailable"}</h2></div><button type="button" onClick={() => setSelectedId("")} className="rounded-lg p-2 text-slate-400 hover:bg-white/[0.07]" aria-label="Close details"><X size={18} /></button></div>
          {detailQuery.isError ? <p role="alert" className="mt-3 text-sm text-rose-200">{errorMessage(detailQuery.error)}</p> : selectedUser && <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4"><div><p className="text-xs text-slate-400">Email</p><p className="mt-1 font-medium text-slate-200">{selectedUser.email}</p></div><div><p className="text-xs text-slate-400">Role</p><p className="mt-1 font-medium text-slate-200">{selectedUser.role}</p></div><div><p className="text-xs text-slate-400">Created</p><p className="mt-1 font-medium text-slate-200">{dateLabel(selectedUser.createdAt)}</p></div><div><p className="text-xs text-slate-400">Last updated</p><p className="mt-1 font-medium text-slate-200">{dateLabel(selectedUser.updatedAt)}</p></div></div>}
        </section>
      )}

      <section className="overflow-hidden rounded-2xl border border-white/[0.08] bg-[#10182b] shadow-sm">
        <div className="flex flex-col gap-3 border-b border-white/[0.06] p-4 sm:flex-row sm:items-center sm:p-5">
          <label className="relative min-w-0 flex-1"><span className="sr-only">Search users by name or email</span><Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" /><input className={`${inputClass} pl-10`} placeholder="Search name or email" value={search} onChange={(event) => { setPage(1); setSearch(event.target.value); }} /></label>
          <select aria-label="Filter by role" className={`${inputClass} sm:w-40`} value={role} onChange={(event) => { setPage(1); setRole(event.target.value); }}><option value="">All roles</option><option value="ADMIN">Admin</option><option value="STAFF">Staff</option><option value="CUSTOMER">Customer</option></select>
          <select aria-label="Filter by status" className={`${inputClass} sm:w-40`} value={status} onChange={(event) => { setPage(1); setStatus(event.target.value); }}><option value="">All statuses</option><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option></select>
        </div>

        {query.isLoading ? <div className="p-12 text-center text-sm text-slate-400" role="status">Loading users…</div> : query.isError ? <div className="p-12 text-center" role="alert"><p className="text-sm font-medium text-rose-200">Could not load users.</p><button type="button" onClick={() => void query.refetch()} className="mt-2 text-sm font-semibold text-emerald-200">Try again</button></div> : data?.users.length ? <>
          <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left"><thead className="bg-white/[0.04] text-[10px] uppercase tracking-wider text-slate-400"><tr><th className="px-5 py-3.5 font-semibold">User</th><th className="px-4 py-3.5 font-semibold">Role</th><th className="px-4 py-3.5 font-semibold">Status</th><th className="px-4 py-3.5 font-semibold">Joined</th><th className="px-5 py-3.5 text-right font-semibold">Actions</th></tr></thead><tbody className="divide-y divide-white/[0.06]">{data.users.map((user) => <tr key={user.id} className="hover:bg-white/[0.035]"><td className="px-5 py-4"><button type="button" onClick={() => setSelectedId(user.id)} className="text-left"><span className="block text-sm font-semibold text-slate-200 hover:text-emerald-200">{user.name}</span><span className="mt-1 block text-xs text-slate-400">{user.email}</span></button></td><td className="px-4 py-4"><span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${user.role === "ADMIN" ? "bg-violet-400/10 text-violet-200" : user.role === "STAFF" ? "bg-blue-400/10 text-blue-200" : "bg-white/[0.07] text-slate-400"}`}>{user.role}</span></td><td className="px-4 py-4"><span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${user.status === "ACTIVE" ? "bg-emerald-400/10 text-emerald-200" : "bg-rose-400/10 text-rose-200"}`}>{user.status}</span></td><td className="px-4 py-4 text-xs text-slate-400">{dateLabel(user.createdAt)}</td><td className="px-5 py-4"><div className="flex justify-end gap-3 text-xs font-semibold"><button type="button" onClick={() => startEdit(user)} className="text-slate-100 hover:text-emerald-200">Edit</button>{user.id !== currentUserResponse?.data.user.id && <button type="button" onClick={() => void toggleStatus(user)} className={user.status === "ACTIVE" ? "text-rose-200 hover:text-rose-200" : "text-emerald-200 hover:text-blue-200"}>{user.status === "ACTIVE" ? "Deactivate" : "Activate"}</button>}</div></td></tr>)}</tbody></table></div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.06] px-5 py-4"><p className="text-xs text-slate-400">{data.total} users · Page {data.page} of {Math.max(1, data.totalPages)}</p><div className="flex gap-2"><button type="button" aria-label="Previous page" disabled={page <= 1} onClick={() => setPage((value) => value - 1)} className="rounded-lg border border-white/[0.08] p-2 text-slate-400 hover:bg-white/[0.04] disabled:cursor-not-allowed disabled:opacity-40"><ChevronLeft size={16} /></button><button type="button" aria-label="Next page" disabled={page >= data.totalPages} onClick={() => setPage((value) => value + 1)} className="rounded-lg border border-white/[0.08] p-2 text-slate-400 hover:bg-white/[0.04] disabled:cursor-not-allowed disabled:opacity-40"><ChevronRight size={16} /></button></div></div>
        </> : <div className="p-12 text-center"><p className="text-sm font-semibold text-slate-400">No users found</p><p className="mt-1 text-xs text-slate-400">Try a different search or filter.</p></div>}
      </section>
    </div>
  );
}
