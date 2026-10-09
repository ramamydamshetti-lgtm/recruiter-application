'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Save } from 'lucide-react';
import { PageBackNav } from '@/components/ui/PageBackNav';
import { PageHeader } from '@/components/ui/PageHeader';
import { FormSection } from '@/components/ui/FormSection';
import { Field, TextInput, Select } from '@/components/ui/Field';
import { createClient } from '@/lib/api/clients';

const industries = [
  'Technology',
  'Healthcare',
  'Finance',
  'Manufacturing',
  'Retail',
  'Education',
  'Government',
  'Consulting',
  'Other'
];

export function NewClientPage() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    pocName: '',
    pocEmail: '',
    pocPhone: '',
    industry: '',
    location: ''
  });

  const [submitError, setSubmitError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const created = await createClient({
        name: formData.name,
        pocName: formData.pocName,
        pocEmail: formData.pocEmail,
        pocPhone: formData.pocPhone || undefined,
        industry: formData.industry || undefined,
        location: formData.location || undefined,
      });
      router.push(`/clients/${created.id}`);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Failed to create client');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  return (
    <div className="space-y-6">
      <PageBackNav />

      <PageHeader
        title="Add New Client"
        subtitle="Creates a row in the clients table for job demands and submissions."
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
                required
              >
                <option value="" disabled>
                  Select industry
                </option>
                {industries.map(industry => (
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
            href="/clients"
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
            {isSubmitting ? 'Creating...' : 'Create Client'}
          </button>
        </div>
      </form>
    </div>
  );
}
