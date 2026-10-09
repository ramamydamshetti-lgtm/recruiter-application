'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Save } from 'lucide-react';
import { PageBackNav } from '@/components/ui/PageBackNav';
import { PageHeader } from '@/components/ui/PageHeader';
import { FormSection } from '@/components/ui/FormSection';
import { Field, TextInput, Select } from '@/components/ui/Field';
import { getClient, updateClient } from '@/lib/api/clients';

const industries = [
  'Technology',
  'Healthcare',
  'Finance',
  'Manufacturing',
  'Retail',
  'Education',
  'Government',
  'Consulting',
  'Other',
];

type Props = {
  clientId: string;
};

export function EditClientPage({ clientId }: Props) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    pocName: '',
    pocEmail: '',
    pocPhone: '',
    industry: '',
    location: '',
    isActive: true,
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const { client } = await getClient(clientId);
        if (cancelled) return;
        setFormData({
          name: client.name,
          pocName: client.pocName,
          pocEmail: client.pocEmail,
          pocPhone: client.pocPhone ?? '',
          industry: client.industry ?? '',
          location: client.location ?? '',
          isActive: client.isActive,
        });
      } catch (e) {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : 'Failed to load client');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [clientId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setSubmitError(null);

    try {
      await updateClient(clientId, {
        name: formData.name,
        pocName: formData.pocName,
        pocEmail: formData.pocEmail,
        pocPhone: formData.pocPhone.trim() ? formData.pocPhone.trim() : null,
        industry: formData.industry.trim() ? formData.industry.trim() : null,
        location: formData.location.trim() ? formData.location.trim() : null,
        isActive: formData.isActive,
      });
      router.push(`/clients/${clientId}`);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Failed to update client');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleInputChange = (field: string, value: string | boolean) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  if (loading) {
    return <div className="p-8 text-sm text-gray-500">Loading client…</div>;
  }

  if (loadError) {
    return (
      <div className="p-8 text-center">
        <p className="text-sm text-red-600">{loadError}</p>
        <div className="mt-4 flex justify-start">
          <PageBackNav className="mb-0" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageBackNav />

      <PageHeader
        title="Edit Client"
        subtitle="Updates the clients table row (POC, industry, active flag)."
      />

      {submitError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {submitError}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <FormSection
          title="Client Information"
          description="Basic information about the client organization"
        >
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <Field label="Client Name">
              <TextInput
                value={formData.name}
                onChange={(e) => handleInputChange('name', e.target.value)}
                placeholder="Enter client company name"
                required
              />
            </Field>

            <Field label="Industry">
              <Select
                value={formData.industry}
                onChange={(e) => handleInputChange('industry', e.target.value)}
              >
                <option value="">Select industry</option>
                {industries.map((industry) => (
                  <option key={industry} value={industry}>
                    {industry}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Location">
              <TextInput
                value={formData.location}
                onChange={(e) => handleInputChange('location', e.target.value)}
                placeholder="City, State/Country"
              />
            </Field>

            <Field label="Account status">
              <Select
                value={formData.isActive ? 'active' : 'inactive'}
                onChange={(e) => handleInputChange('isActive', e.target.value === 'active')}
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </Select>
            </Field>
          </div>
        </FormSection>

        <FormSection
          title="Point of Contact"
          description="Primary contact person for this client"
        >
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <Field label="Contact Name">
              <TextInput
                value={formData.pocName}
                onChange={(e) => handleInputChange('pocName', e.target.value)}
                placeholder="Full name of contact person"
                required
              />
            </Field>

            <Field label="Email Address">
              <TextInput
                type="email"
                value={formData.pocEmail}
                onChange={(e) => handleInputChange('pocEmail', e.target.value)}
                placeholder="contact@company.com"
                required
              />
            </Field>

            <Field label="Phone Number">
              <TextInput
                type="tel"
                value={formData.pocPhone}
                onChange={(e) => handleInputChange('pocPhone', e.target.value)}
                placeholder="+1-555-0123"
              />
            </Field>
          </div>
        </FormSection>

        <div className="flex items-center justify-end gap-4 border-t border-gray-200 pt-6">
          <Link
            href={`/clients/${clientId}`}
            className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={isSubmitting}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            {isSubmitting ? 'Updating...' : 'Update Client'}
          </button>
        </div>
      </form>
    </div>
  );
}
