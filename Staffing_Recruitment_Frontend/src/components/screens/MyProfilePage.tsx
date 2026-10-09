'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { z } from 'zod';
import {
  Briefcase,
  Camera,
  Edit3,
  ImagePlus,
  Mail,
  Phone,
  Save,
  Send,
  Trash2,
  User,
} from 'lucide-react';

import { PageHeader } from '@/components/ui/PageHeader';
import { useAuth } from '@/lib/contexts/AuthContext';
import { profilePhotoStorageKey, profileStorageKey } from '@/lib/auth/session';

function mapRoleToDbRole(role: string): 'RECRUITER' | 'LEAD' | undefined {
  const r = role.trim().toLowerCase();
  if (r === 'lead') return 'LEAD';
  if (r === 'recruiter') return 'RECRUITER';
  return undefined;
}

function mapDbRoleToUiRole(role: string | undefined | null): string {
  const r = String(role ?? '').trim().toUpperCase();
  if (r === 'LEAD') return 'Lead';
  if (r === 'ADMIN') return 'Admin';
  if (r === 'RECRUITER') return 'Recruiter';
  return 'Recruiter';
}

type EditableProfile = {
  name: string;
  email: string;
  role: string;
  phone: string;
  submittingTo: string;
};

type EditForm = EditableProfile & {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
};

const passwordChangeSchema = z
  .object({
    currentPassword: z.string(),
    newPassword: z.string(),
    confirmPassword: z.string(),
  })
  .superRefine((data, ctx) => {
    const anyFilled =
      data.currentPassword.trim() ||
      data.newPassword.trim() ||
      data.confirmPassword.trim();
    if (!anyFilled) return;
    if (!data.currentPassword.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Current password is required when changing password',
        path: ['currentPassword'],
      });
    }
    if (!data.newPassword.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'New password is required when changing password',
        path: ['newPassword'],
      });
    }
    if (!data.confirmPassword.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Confirm password is required when changing password',
        path: ['confirmPassword'],
      });
    }
  })
  .superRefine((data, ctx) => {
    if (data.newPassword.length > 0 && data.newPassword.length < 8) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'New password must be at least 8 characters',
        path: ['newPassword'],
      });
    }
  })
  .superRefine((data, ctx) => {
    if (data.newPassword && data.confirmPassword && data.newPassword !== data.confirmPassword) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Confirm password must match new password',
        path: ['confirmPassword'],
      });
    }
  });

export function MyProfilePage() {
  const { currentUser, refresh: refreshAuth } = useAuth();
  const currentUserId = currentUser?.id ?? '';

  const defaultProfile: EditableProfile = useMemo(
    () => ({
      name:
        currentUser?.name ??
        [currentUser?.firstName, currentUser?.lastName].filter(Boolean).join(' ') ??
        '',
      email: currentUser?.email ?? '',
      role: mapDbRoleToUiRole(currentUser?.role ?? currentUser?.title),
      phone: currentUser?.phone ?? '',
      submittingTo: currentUser?.submittingTo ?? '',
    }),
    [currentUser],
  );

  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [editable, setEditable] = useState<EditableProfile>(defaultProfile);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState<EditForm>(() => ({
    ...defaultProfile,
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  }));
  const [passwordErrors, setPasswordErrors] = useState<{
    currentPassword?: string;
    newPassword?: string;
    confirmPassword?: string;
  }>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editing) {
      setEditable((prev) => ({
        ...prev,
        ...defaultProfile,
        role: defaultProfile.role,
      }));
    }
  }, [defaultProfile, editing]);

  useEffect(() => {
    if (!currentUserId) {
      setEditable(defaultProfile);
      setEditForm((form) => ({ ...form, ...defaultProfile }));
      return;
    }
    if (typeof window === 'undefined') return;
    try {
      const stored = localStorage.getItem(profileStorageKey(currentUserId));
      if (!stored) {
        setEditable(defaultProfile);
        setEditForm((form) => ({ ...form, ...defaultProfile }));
        return;
      }

      const parsed = JSON.parse(stored) as EditableProfile;
      const parsedEmail = (parsed.email ?? '').trim().toLowerCase();
      const userEmail = (defaultProfile.email ?? '').trim().toLowerCase();
      if (parsedEmail && userEmail && parsedEmail !== userEmail) {
        setEditable(defaultProfile);
        setEditForm((form) => ({ ...form, ...defaultProfile }));
        return;
      }

      const nextProfile = {
        name: parsed.name ?? defaultProfile.name,
        email: parsed.email ?? defaultProfile.email,
        // Role always comes from the database (defaultProfile), never stale local cache.
        role: defaultProfile.role,
        phone: parsed.phone ?? defaultProfile.phone,
        submittingTo: parsed.submittingTo ?? defaultProfile.submittingTo,
      };
      setEditable(nextProfile);
      setEditForm((form) => ({ ...form, ...nextProfile }));
    } catch {
      setEditable(defaultProfile);
      setEditForm((form) => ({ ...form, ...defaultProfile }));
    }
  }, [currentUserId, defaultProfile]);

  useEffect(() => {
    if (!currentUserId) return;
    const avatar = (currentUser as { avatar?: string | null } | null)?.avatar;
    if (avatar) {
      setPhotoUrl(`/api/users/${currentUserId}/avatar`);
      return;
    }
    if (typeof window === 'undefined') return;
    const stored = localStorage.getItem(profilePhotoStorageKey(currentUserId));
    setPhotoUrl(stored && stored.startsWith('/api/users/') ? stored : null);
  }, [currentUserId, currentUser]);

  useEffect(() => {
    if (!currentUserId || typeof window === 'undefined') return;
    try {
      localStorage.setItem(profileStorageKey(currentUserId), JSON.stringify(editable));
    } catch {
      // Ignore local profile cache failures.
    }
  }, [editable, currentUserId]);

  const startEditing = () => {
    setEditForm({
      ...editable,
      currentPassword: '',
      newPassword: '',
      confirmPassword: '',
    });
    setPasswordErrors({});
    setEditing(true);
  };

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    setPhotoUrl(URL.createObjectURL(file));
    setPhotoFile(file);
  };

  const handleRemovePhoto = () => {
    setPhotoUrl(null);
    setPhotoFile(null);
    try {
      if (currentUserId) localStorage.removeItem(profilePhotoStorageKey(currentUserId));
    } catch {
      // Ignore local profile photo cache failures.
    }

    const token = localStorage.getItem('token');
    if (!token) return;
    void fetch('/api/auth/me/avatar', {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    }).then(() => refreshAuth());
  };

  const clearPasswordFields = () => {
    setEditForm((form) => ({
      ...form,
      currentPassword: '',
      newPassword: '',
      confirmPassword: '',
    }));
    setPasswordErrors({});
  };

  const handleSaveProfile = async () => {
    const hasAnyPassword =
      editForm.currentPassword.trim() ||
      editForm.newPassword.trim() ||
      editForm.confirmPassword.trim();

    if (hasAnyPassword) {
      const result = passwordChangeSchema.safeParse({
        currentPassword: editForm.currentPassword,
        newPassword: editForm.newPassword,
        confirmPassword: editForm.confirmPassword,
      });

      if (!result.success) {
        const errors: { currentPassword?: string; newPassword?: string; confirmPassword?: string } = {};
        for (const issue of result.error.issues) {
          const path = issue.path[0];
          if (path === 'currentPassword') errors.currentPassword = issue.message;
          else if (path === 'newPassword') errors.newPassword = issue.message;
          else if (path === 'confirmPassword') errors.confirmPassword = issue.message;
        }
        setPasswordErrors(errors);
        return;
      }

      const token = localStorage.getItem('token');
      if (!token) {
        setPasswordErrors({ currentPassword: 'Please login again' });
        return;
      }

      try {
        const res = await fetch('/api/auth/change-password', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            currentPassword: editForm.currentPassword,
            newPassword: editForm.newPassword,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          setPasswordErrors({ currentPassword: data.error ?? 'Failed to change password' });
          return;
        }
      } catch {
        setPasswordErrors({ currentPassword: 'Failed to change password' });
        return;
      }
      clearPasswordFields();
    }

    const nextProfile: EditableProfile = {
      name: editForm.name,
      email: editForm.email,
      role: editForm.role,
      phone: editForm.phone,
      submittingTo: editForm.submittingTo,
    };

    try {
      const token = localStorage.getItem('token');
      if (!token) {
        setEditable(nextProfile);
        setEditing(false);
        return;
      }

      if (photoFile) {
        const form = new FormData();
        form.append('avatar', photoFile);
        const avatarRes = await fetch('/api/auth/me/avatar', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: form,
        });

        if (!avatarRes.ok) {
          const avatarErr = await avatarRes.text().catch(() => '');
          console.error('Failed to upload avatar:', avatarRes.status, avatarErr);
        } else {
          setPhotoFile(null);
          await refreshAuth();
        }
      }

      const trimmedName = editForm.name.trim();
      const parts = trimmedName.split(/\s+/).filter(Boolean);
      const firstName = parts[0] ?? '';
      const lastName = parts.length > 1 ? parts.slice(1).join(' ') : '';
      const phone = editForm.phone.trim();
      const canSendPhone = phone.length >= 10 && phone.length <= 20 ? phone : undefined;
      const submittingTo = editForm.submittingTo.trim();
      const payload: Record<string, unknown> = {
        email: editForm.email.trim(),
        submittingTo: submittingTo.length ? submittingTo : null,
      };

      if (firstName.length >= 2) payload.firstName = firstName;
      if (lastName.length >= 2) payload.lastName = lastName;
      if (canSendPhone) payload.phone = canSendPhone;
      const dbRole = mapRoleToDbRole(editForm.role);
      if (dbRole) payload.role = dbRole;

      const res = await fetch('/api/auth/me', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        console.error('Failed to persist profile:', res.status, errText);
        return;
      }

      const updated = await res.json().catch(() => ({}));
      const savedRole = mapDbRoleToUiRole(updated?.data?.role ?? dbRole ?? editForm.role);
      const persistedProfile: EditableProfile = { ...nextProfile, role: savedRole };

      await refreshAuth();

      if (typeof window !== 'undefined' && currentUserId) {
        try {
          localStorage.setItem(profileStorageKey(currentUserId), JSON.stringify(persistedProfile));
        } catch {
          // Ignore local profile cache failures.
        }
      }

      setEditable(persistedProfile);
      setEditing(false);
      return;
    } catch (e) {
      console.error('Profile persistence failed:', e);
      return;
    }
  };

  const handleCancelEdit = () => {
    setEditForm({
      ...editable,
      currentPassword: '',
      newPassword: '',
      confirmPassword: '',
    });
    setPasswordErrors({});
    setEditing(false);
  };

  return (
    <div className="space-y-6">
      <PageHeader title="My Profile" subtitle="Manage your recruiter profile and login details" />

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700/60 dark:bg-slate-900/50">
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50/80 px-4 py-3 dark:border-slate-700/60 dark:bg-slate-800/30">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="group relative block overflow-hidden rounded-xl border-2 border-slate-200 bg-slate-100 dark:border-slate-600 dark:bg-slate-800"
            >
              <div className="flex h-16 w-16 items-center justify-center">
                {photoUrl ? (
                  <img src={photoUrl} alt="Profile" className="h-full w-full object-cover" />
                ) : (
                  <User className="h-7 w-7 text-slate-400 dark:text-slate-500" />
                )}
              </div>
              <div className="absolute inset-0 flex items-center justify-center bg-slate-900/50 opacity-0 transition group-hover:opacity-100">
                <Camera className="h-5 w-5 text-white" />
              </div>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handlePhotoChange}
            />
            <div>
              <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100">
                Basic Information
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Profile and contact details
              </p>
            </div>
          </div>
          {!editing && (
            <button
              type="button"
              onClick={startEditing}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:border-blue-300 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-blue-600/50 dark:hover:bg-slate-700"
            >
              <Edit3 className="h-4 w-4" />
              Edit
            </button>
          )}
        </div>

        <div className="p-4">
          {editing ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-3 dark:border-slate-600 dark:bg-slate-800/30">
                <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
                  Profile Photo
                </span>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                >
                  <ImagePlus className="h-3.5 w-3.5" />
                  Add Profile
                </button>
                {photoUrl && (
                  <button
                    type="button"
                    onClick={handleRemovePhoto}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-medium text-rose-700 transition hover:bg-rose-100 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300 dark:hover:bg-rose-900/40"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Remove Profile
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <ProfileInput label="Name" value={editForm.name} onChange={(name) => setEditForm((form) => ({ ...form, name }))} />
                <ProfileInput label="Email" type="email" value={editForm.email} onChange={(email) => setEditForm((form) => ({ ...form, email }))} />
                <label className="block space-y-1">
                  <span className="text-xs font-medium text-slate-600 dark:text-slate-300">Role</span>
                  <select
                    value={editForm.role}
                    onChange={(e) => setEditForm((form) => ({ ...form, role: e.target.value }))}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                  >
                    <option value="Recruiter">Recruiter</option>
                    <option value="Lead">Lead</option>
                  </select>
                </label>
                <ProfileInput label="Phone" type="tel" value={editForm.phone} placeholder="Optional" onChange={(phone) => setEditForm((form) => ({ ...form, phone }))} />
                <ProfileInput
                  label="Reporting Lead"
                  value={editForm.submittingTo}
                  placeholder={editForm.role === 'Lead' ? 'None' : 'e.g. Charlie Darwin'}
                  className="sm:col-span-2"
                  onChange={(submittingTo) => setEditForm((form) => ({ ...form, submittingTo }))}
                />
              </div>

              <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-3 dark:border-slate-600 dark:bg-slate-800/30">
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-700 dark:text-slate-300">
                  Change Password
                </h3>
                <p className="mb-2 text-xs text-slate-500 dark:text-slate-400">
                  Leave blank to keep your current password.
                </p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <PasswordInput
                    label="Current"
                    value={editForm.currentPassword}
                    error={passwordErrors.currentPassword}
                    onChange={(currentPassword) => {
                      setEditForm((form) => ({ ...form, currentPassword }));
                      setPasswordErrors((errors) => ({ ...errors, currentPassword: undefined }));
                    }}
                  />
                  <PasswordInput
                    label="New Password"
                    value={editForm.newPassword}
                    error={passwordErrors.newPassword}
                    onChange={(newPassword) => {
                      setEditForm((form) => ({ ...form, newPassword }));
                      setPasswordErrors((errors) => ({ ...errors, newPassword: undefined }));
                    }}
                  />
                  <PasswordInput
                    label="Confirm"
                    value={editForm.confirmPassword}
                    error={passwordErrors.confirmPassword}
                    onChange={(confirmPassword) => {
                      setEditForm((form) => ({ ...form, confirmPassword }));
                      setPasswordErrors((errors) => ({ ...errors, confirmPassword: undefined }));
                    }}
                  />
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={handleSaveProfile}
                  className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700"
                >
                  <Save className="h-4 w-4" />
                  Save
                </button>
                <button
                  type="button"
                  onClick={handleCancelEdit}
                  className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
              <ProfileInfo icon={<User className="h-4 w-4 text-blue-600 dark:text-blue-400" />} label="Name" value={editable.name} iconClassName="bg-blue-100/80 dark:bg-blue-900/30" />
              <ProfileInfo icon={<Mail className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />} label="Email" value={editable.email} iconClassName="bg-indigo-100/80 dark:bg-indigo-900/30" />
              <ProfileInfo icon={<Briefcase className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />} label="Role" value={editable.role} iconClassName="bg-emerald-100/80 dark:bg-emerald-900/30" />
              {editable.phone ? (
                <ProfileInfo icon={<Phone className="h-4 w-4 text-slate-600 dark:text-slate-400" />} label="Phone" value={editable.phone} iconClassName="bg-slate-200/80 dark:bg-slate-700/50" />
              ) : null}
              {editable.role !== 'Lead' ? (
                <ProfileInfo icon={<Send className="h-4 w-4 text-amber-600 dark:text-amber-400" />} label="Reporting Lead" value={editable.submittingTo || 'None'} iconClassName="bg-amber-100/80 dark:bg-amber-900/30" className="sm:col-span-2" />
              ) : null}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function ProfileInput({
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
  className = '',
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="block text-xs font-medium text-slate-500 dark:text-slate-400">
        {label}
      </label>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
      />
    </div>
  );
}

function PasswordInput({
  label,
  value,
  error,
  onChange,
}: {
  label: string;
  value: string;
  error?: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-500 dark:text-slate-400">
        {label}
      </label>
      <input
        type="password"
        value={value}
        placeholder="Optional"
        onChange={(e) => onChange(e.target.value)}
        className={`mt-1 w-full rounded-lg border px-3 py-2 text-sm dark:bg-slate-800 dark:text-slate-100 ${
          error ? 'border-rose-500 dark:border-rose-600' : 'border-slate-300 dark:border-slate-600'
        }`}
      />
      {error ? <p className="mt-1 text-xs text-rose-600 dark:text-rose-400">{error}</p> : null}
    </div>
  );
}

function ProfileInfo({
  icon,
  label,
  value,
  iconClassName,
  className = '',
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  iconClassName: string;
  className?: string;
}) {
  return (
    <div className={`flex items-center gap-3 rounded-lg bg-slate-50/80 px-3 py-2 dark:bg-slate-800/30 ${className}`}>
      <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${iconClassName}`}>
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</p>
        <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">
          {value}
        </p>
      </div>
    </div>
  );
}
