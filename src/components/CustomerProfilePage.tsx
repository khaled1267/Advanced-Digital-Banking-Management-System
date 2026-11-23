"use client";

import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { AlertCircle, BadgeCheck, Camera, Check, CreditCard, LoaderCircle, Mail, Pencil, ShieldCheck, Upload, UserRound, X } from "lucide-react";
import { profileUpdateSchema, validateProfileImage } from "@/lib/validation/profile";
import { useCreateAvatarUploadSignatureMutation, useCustomerProfileQuery, useFinalizeAvatarUploadMutation, useRemoveAvatarMutation, useUpdateCustomerProfileMutation } from "@/store/authApi";

function initialsFor(name: string) {
  return name.trim().split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
}

function formatDate(value?: string) {
  if (!value) return "Not available";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Not available" : date.toLocaleDateString();
}

function InformationField({ label, value, icon: Icon }: { label: string; value: string; icon: typeof UserRound }) {
  return <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4">
    <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500"><Icon size={14} />{label}</div>
    <p className="mt-2 break-words text-sm font-medium text-slate-200">{value}</p>
  </div>;
}

export function CustomerProfilePage() {
  const { data, isLoading, isError, refetch } = useCustomerProfileQuery();
  const [updateProfile, updateState] = useUpdateCustomerProfileMutation();
  const [createAvatarUploadSignature, signatureState] = useCreateAvatarUploadSignatureMutation();
  const [finalizeAvatarUpload, finalizeState] = useFinalizeAvatarUploadMutation();
  const [removeAvatar, removeState] = useRemoveAvatarMutation();
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState("");
  const [formError, setFormError] = useState("");
  const [notice, setNotice] = useState("");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState("");
  const [photoError, setPhotoError] = useState("");
  const [photoNotice, setPhotoNotice] = useState("");
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const photoPreviewRef = useRef<string | null>(null);
  const profile = data?.data.profile;

  useEffect(() => {
    return () => {
      if (photoPreviewRef.current) URL.revokeObjectURL(photoPreviewRef.current);
    };
  }, []);

  function selectPhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    setPhotoError("");
    if (!file) return;
    const error = validateProfileImage(file);
    if (error) {
      if (photoPreviewRef.current) URL.revokeObjectURL(photoPreviewRef.current);
      photoPreviewRef.current = null;
      setPhotoFile(null);
      setPhotoPreview("");
      setPhotoError(error);
      return;
    }
    if (photoPreviewRef.current) URL.revokeObjectURL(photoPreviewRef.current);
    const previewUrl = URL.createObjectURL(file);
    photoPreviewRef.current = previewUrl;
    setPhotoPreview(previewUrl);
    setPhotoFile(file);
  }

  async function savePhoto() {
    if (!photoFile) return;
    setPhotoError("");
    setPhotoNotice("");
    setIsUploadingPhoto(true);
    try {
      const { data: signature } = await createAvatarUploadSignature().unwrap();
      const formData = new FormData();
      formData.set("file", photoFile);
      formData.set("api_key", signature.apiKey);
      formData.set("timestamp", String(signature.timestamp));
      formData.set("signature", signature.signature);
      formData.set("allowed_formats", signature.allowed_formats);
      formData.set("overwrite", signature.overwrite);
      formData.set("public_id", signature.public_id);
      const uploadResponse = await fetch(`https://api.cloudinary.com/v1_1/${signature.cloudName}/image/upload`, { method: "POST", body: formData });
      if (!uploadResponse.ok) throw new Error("Cloudinary upload failed.");
      const uploadResult: unknown = await uploadResponse.json();
      if (!uploadResult || typeof uploadResult !== "object" || !("public_id" in uploadResult) || uploadResult.public_id !== signature.public_id) {
        throw new Error("Cloudinary returned an unexpected upload result.");
      }
      const result = await finalizeAvatarUpload({ publicId: signature.public_id }).unwrap();
      if (photoPreviewRef.current) URL.revokeObjectURL(photoPreviewRef.current);
      photoPreviewRef.current = null;
      setPhotoFile(null);
      setPhotoPreview("");
      setPhotoNotice(result.data.cleanupPending ? "Your new photo is saved. The previous Cloudinary file could not be cleaned up." : "Your profile photo was updated.");
    } catch {
      setPhotoError(data?.data.cloudinaryConfigured ? "Could not save the photo. Please try again." : "Photo storage is not configured. Ask your administrator to configure Cloudinary on the server.");
    } finally {
      setIsUploadingPhoto(false);
    }
  }

  async function deletePhoto() {
    if (!profile?.profileImageUrl || !window.confirm("Remove your profile picture?")) return;
    setPhotoError("");
    setPhotoNotice("");
    try {
      const result = await removeAvatar().unwrap();
      setPhotoNotice(result.data.cleanupPending ? "Your photo was removed from your profile, but Cloudinary cleanup is pending." : "Your profile photo was removed.");
    } catch {
      setPhotoError("Could not remove your photo. Please try again.");
    }
  }

  async function saveName(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError("");
    setNotice("");
    const parsed = profileUpdateSchema.safeParse({ name });
    if (!parsed.success) {
      setFormError("Full name must be between 2 and 100 characters.");
      return;
    }
    try {
      await updateProfile(parsed.data).unwrap();
      setIsEditing(false);
      setNotice("Your profile information was updated.");
    } catch {
      setFormError("We could not save your changes. Please try again.");
    }
  }

  if (isLoading) return <div className="mx-auto max-w-[1120px] px-5 py-8 sm:px-8 lg:px-10" role="status"><div className="dashboard-skeleton h-44 rounded-2xl bg-white/[0.04]" /><p className="mt-3 text-xs text-slate-400">Loading your profile…</p></div>;
  if (isError || !profile || !data) return <div className="mx-auto max-w-[1120px] px-5 py-8 sm:px-8 lg:px-10"><div role="alert" className="rounded-2xl border border-rose-400/20 bg-rose-400/[0.06] p-5"><p className="text-sm font-semibold text-slate-100">Your profile could not be loaded</p><p className="mt-1 text-xs text-slate-400">Check your connection and try again.</p><button type="button" onClick={() => void refetch()} className="dashboard-interactive mt-3 rounded-lg bg-white/[0.06] px-3 py-2 text-xs font-semibold text-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300">Try again</button></div></div>;

  return <div className="mx-auto max-w-[1120px] px-5 py-7 sm:px-8 lg:px-10 lg:py-9">
    <div className="mb-6"><p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-blue-300">Personal banking</p><h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-100 sm:text-3xl">My profile</h1><p className="mt-1.5 text-sm text-slate-400">Review your personal details and profile settings.</p></div>

    {notice && <p role="status" className="mb-4 flex items-center gap-2 rounded-xl border border-emerald-300/20 bg-emerald-300/[0.07] px-4 py-3 text-xs text-emerald-200"><Check size={15} />{notice}</p>}

    <section className="rounded-2xl border border-white/[0.07] bg-[#10182b] p-5 shadow-[0_12px_35px_rgba(0,0,0,0.12)] sm:p-7" aria-labelledby="profile-heading">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
        <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-blue-300/15 bg-blue-400/10 text-xl font-semibold text-blue-200">
          {photoPreview || profile.profileImageUrl ? <div role="img" aria-label={photoPreview ? "Selected profile picture preview" : `Profile picture of ${profile.name}`} className="h-full w-full bg-cover bg-center" style={{ backgroundImage: `url("${photoPreview || profile.profileImageUrl}")` }} /> : initialsFor(profile.name)}
        </div>
        <div className="min-w-0 flex-1"><p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-blue-300">Customer profile</p><h2 id="profile-heading" className="mt-1 break-words text-xl font-semibold text-slate-100">{profile.name}</h2><p className="mt-1 break-all text-sm text-slate-400">{profile.email}</p><span className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-emerald-300/15 bg-emerald-300/[0.06] px-2.5 py-1 text-[10px] font-semibold text-emerald-200"><BadgeCheck size={13} />{profile.role === "CUSTOMER" ? "Customer" : profile.role}</span></div>
        {!isEditing && <button type="button" onClick={() => { setName(profile.name); setFormError(""); setIsEditing(true); }} className="dashboard-interactive inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 text-xs font-semibold text-slate-200 transition hover:bg-white/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300"><Pencil size={14} />Edit profile</button>}
      </div>
    </section>

    <div className="mt-5 grid items-start gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(300px,0.8fr)]">
      <section className="rounded-2xl border border-white/[0.07] bg-[#10182b] p-5 sm:p-6" aria-labelledby="personal-info-heading">
        <div className="flex items-center justify-between gap-3"><div><h2 id="personal-info-heading" className="text-sm font-semibold text-slate-100">Personal information</h2><p className="mt-1 text-[11px] text-slate-400">Your account details stored in your customer profile.</p></div><UserRound size={17} className="text-blue-300" /></div>
        {isEditing ? <form onSubmit={saveName} className="mt-5 space-y-4" noValidate>
          <div><label htmlFor="profile-name" className="mb-1.5 block text-xs font-medium text-slate-300">Full name</label><input id="profile-name" name="name" autoComplete="name" required minLength={2} maxLength={100} value={name} onChange={(event) => setName(event.target.value)} className="dashboard-interactive w-full rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-blue-300/40 focus:ring-2 focus:ring-blue-300/20" /></div>
          <InformationField label="Email address · read only" value={profile.email} icon={Mail} />
          {formError && <p role="alert" className="text-xs text-rose-300">{formError}</p>}
          <div className="flex flex-wrap gap-2"><button type="submit" disabled={updateState.isLoading} className="dashboard-interactive inline-flex h-10 items-center gap-2 rounded-xl bg-blue-600 px-4 text-xs font-semibold text-white transition hover:bg-blue-500 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300">{updateState.isLoading && <LoaderCircle size={14} className="animate-spin" />}Save changes</button><button type="button" onClick={() => { setIsEditing(false); setName(profile.name); setFormError(""); }} className="dashboard-interactive inline-flex h-10 items-center gap-2 rounded-xl border border-white/10 px-4 text-xs font-semibold text-slate-300 hover:bg-white/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300"><X size={14} />Cancel</button></div>
        </form> : <div className="mt-5 grid gap-3 sm:grid-cols-2"><InformationField label="Full name" value={profile.name} icon={UserRound} /><InformationField label="Email address" value={profile.email} icon={Mail} /></div>}
        <div className="mt-3 grid gap-3 sm:grid-cols-2"><InformationField label="Customer ID" value={profile.id} icon={ShieldCheck} /><InformationField label="Member since" value={formatDate(profile.createdAt)} icon={BadgeCheck} /></div>
      </section>

      <div className="grid gap-5">
        <section className="rounded-2xl border border-white/[0.07] bg-[#10182b] p-5 sm:p-6" aria-labelledby="account-info-heading">
          <div className="flex items-center justify-between gap-3"><div><h2 id="account-info-heading" className="text-sm font-semibold text-slate-100">Account information</h2><p className="mt-1 text-[11px] text-slate-400">Accounts linked to your profile.</p></div><CreditCard size={17} className="text-blue-300" /></div>
          <p className="mt-5 text-3xl font-semibold tracking-tight text-slate-100">{data.data.accounts.length}<span className="ml-2 text-xs font-medium text-slate-400">{data.data.accounts.length === 1 ? "account" : "accounts"}</span></p>
          {data.data.accounts.length ? <ul className="mt-4 divide-y divide-white/[0.07]">{data.data.accounts.map((account) => <li key={account.id} className="flex items-center justify-between gap-3 py-3"><div className="min-w-0"><p className="font-mono text-xs font-semibold text-slate-200">{account.maskedAccountNumber}</p><p className="mt-1 text-[10px] text-slate-500">{account.accountType === "SAVINGS" ? "Savings" : "Current"} · Opened {formatDate(account.createdAt)}</p></div><span className="shrink-0 rounded-full bg-white/[0.06] px-2 py-1 text-[9px] font-semibold text-slate-300">{account.status}</span></li>)}</ul> : <p className="mt-4 rounded-xl border border-dashed border-white/10 px-3 py-4 text-center text-xs text-slate-400">No accounts are linked to your profile yet.</p>}
        </section>

        <section className="rounded-2xl border border-white/[0.07] bg-[#10182b] p-5 sm:p-6" aria-labelledby="photo-settings-heading">
          <div className="flex items-center justify-between gap-3"><div><h2 id="photo-settings-heading" className="text-sm font-semibold text-slate-100">Profile picture</h2><p className="mt-1 text-[11px] text-slate-400">JPG, PNG, or WebP · up to 5 MB</p></div><Camera size={17} className="text-blue-300" /></div>
          <div className="mt-4 flex flex-wrap gap-2">
            <label className={`dashboard-interactive inline-flex h-9 items-center gap-2 rounded-lg border border-white/10 px-3 text-[11px] font-semibold text-slate-200 focus-within:ring-2 focus-within:ring-blue-300 ${data.data.cloudinaryConfigured ? "cursor-pointer hover:bg-white/[0.05]" : "cursor-not-allowed opacity-50"}`}><Upload size={13} />{profile.profileImageUrl ? "Change Photo" : photoFile ? "Choose another" : "Upload Photo"}<input type="file" accept="image/jpeg,image/png,image/webp" onChange={selectPhoto} disabled={!data.data.cloudinaryConfigured || isUploadingPhoto || removeState.isLoading} className="sr-only" aria-label="Choose a JPG, PNG, or WebP profile picture" /></label>
            {profile.profileImageUrl && <button type="button" onClick={() => void deletePhoto()} disabled={removeState.isLoading || isUploadingPhoto} className="dashboard-interactive inline-flex h-9 items-center gap-2 rounded-lg border border-white/10 px-3 text-[11px] font-semibold text-slate-200 hover:bg-white/[0.05] disabled:cursor-wait disabled:opacity-60"><X size={13} />{removeState.isLoading ? "Removing…" : "Remove Photo"}</button>}
          </div>
          {photoFile && <div className="mt-3 space-y-2 rounded-lg bg-white/[0.03] px-3 py-2"><div className="flex items-center justify-between gap-3"><p className="min-w-0 truncate text-[10px] text-slate-300">Ready to upload: {photoFile.name}</p><button type="button" onClick={() => { if (photoPreviewRef.current) URL.revokeObjectURL(photoPreviewRef.current); photoPreviewRef.current = null; setPhotoFile(null); setPhotoPreview(""); setPhotoError(""); }} className="dashboard-interactive shrink-0 rounded px-2 py-1 text-[10px] font-semibold text-slate-300 hover:bg-white/[0.06]">Cancel preview</button></div><button type="button" onClick={() => void savePhoto()} disabled={isUploadingPhoto || signatureState.isLoading || finalizeState.isLoading} className="dashboard-interactive inline-flex h-9 items-center gap-2 rounded-lg bg-blue-600 px-3 text-[11px] font-semibold text-white hover:bg-blue-500 disabled:cursor-wait disabled:opacity-60">{isUploadingPhoto || signatureState.isLoading || finalizeState.isLoading ? <><LoaderCircle size={13} className="animate-spin" />Uploading photo…</> : <><Upload size={13} />Save Photo</>}</button></div>}
          {photoError && <p role="alert" className="mt-3 flex items-center gap-2 text-[11px] text-rose-300"><AlertCircle size={14} />{photoError}</p>}
          {photoNotice && <p role="status" className="mt-3 flex items-center gap-2 text-[11px] text-emerald-200"><Check size={14} />{photoNotice}</p>}
          {!data.data.cloudinaryConfigured && <div role="status" className="mt-4 rounded-xl border border-amber-300/15 bg-amber-300/[0.05] p-3"><p className="text-[11px] font-semibold text-amber-100">Cloudinary is not configured</p><p className="mt-1 text-[10px] leading-4 text-slate-400">Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET in the server environment to upload or change a photo.</p></div>}
        </section>
      </div>
    </div>
  </div>;
}
