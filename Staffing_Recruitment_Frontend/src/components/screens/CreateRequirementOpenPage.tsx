'use client';

import { useState, useCallback } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useRouter } from 'next/navigation';
import { notify } from '@/lib/notify';
import { TextInput, Select, Field } from '@/components/ui';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { parseBudgetInrInput } from '@/lib/utils/parseBudgetInr';
import {
  REQUIREMENT_FROM_CUSTOM,
  REQUIREMENT_FROM_SELECT_OPTIONS,
  SUBMISSION_CLIENTS,
} from '@/lib/domain/submissions/constants';

// Simple open schema - NO VALIDATION RESTRICTIONS
const schema = z
  .object({
    // All fields are optional or have minimal validation
    requirementId: z.string().optional(),
    roleTitle: z.string().optional(),
    location: z.string().optional(),
    openPositions: z.number().optional(),
    priority: z.string().optional(),
    experienceLevel: z.string().optional(),
    employmentType: z.enum(['Full-time', 'Contract']),
    workMode: z.string().optional(),
    budgetAmountInr: z.string(),
    // Required in schema; we already provide a default value via RHF `defaultValues`.
    budgetCurrency: z.enum(['INR', 'USD', 'EUR']),
    skills: z.array(z.string()).optional(),
    experience: z.string().optional(),
    noticePeriod: z.string().optional(),
    submittingTo: z.string().optional(),
    submittingToCustom: z.string().optional(),
    clientLeadPoc: z.string().optional(),
    clientPoc: z.string().optional(),
    clientId: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    const amount = parseBudgetInrInput(data.budgetAmountInr);
    if (amount == null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['budgetAmountInr'],
        message: 'Enter a budget amount in the selected currency (e.g. 1800000 or 18 LPA).',
      });
    }
    if (
      data.submittingTo === REQUIREMENT_FROM_CUSTOM &&
      (!data.submittingToCustom || !data.submittingToCustom.trim())
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['submittingToCustom'],
        message: 'Enter the company or source name.',
      });
    }
  });

type CreateRequirementForm = z.infer<typeof schema>;

const PRIORITY_OPTIONS = [
  { value: 'High', label: 'High' },
  { value: 'Medium', label: 'Medium' },
  { value: 'Low', label: 'Low' },
];

const EXPERIENCE_LEVEL_OPTIONS = [
  { value: 'Entry Level', label: 'Entry Level' },
  { value: 'Junior', label: 'Junior' },
  { value: 'Mid-Senior', label: 'Mid-Senior' },
  { value: 'Senior', label: 'Senior' },
  { value: 'Lead', label: 'Lead' },
  { value: 'Principal', label: 'Principal' },
  { value: 'Director', label: 'Director' },
];

const EMPLOYMENT_TYPE_OPTIONS = [
  { value: 'Full-time', label: 'Full-time' },
  { value: 'Contract', label: 'Contract' },
];

const WORK_MODE_OPTIONS = [
  { value: 'On-site', label: 'On-site' },
  { value: 'Remote', label: 'Remote' },
  { value: 'Hybrid', label: 'Hybrid' },
];

export default function CreateRequirementOpenPage() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [skills, setSkills] = useState<string[]>([]);

  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
    setValue,
    watch,
  } = useForm<CreateRequirementForm>({
    resolver: zodResolver(schema),
    defaultValues: {
      requirementId: '',
      roleTitle: '',
      location: '',
      openPositions: 1,
      priority: 'Medium',
      experienceLevel: '',
      employmentType: 'Full-time',
      workMode: '',
      budgetAmountInr: '',
      budgetCurrency: 'INR',
      skills: [],
      experience: '',
      noticePeriod: '',
      submittingTo: SUBMISSION_CLIENTS[0]?.value,
      submittingToCustom: '',
      clientLeadPoc: '',
      clientPoc: '',
      clientId: '',
    },
  });

  const watchedSkills = watch('skills', []);
  const submittingToWatch = watch('submittingTo');
  const employmentTypeWatch = watch('employmentType');

  const handleSkillAdd = useCallback(() => {
    const skillInput = document.getElementById('skill-input') as HTMLInputElement;
    const skill = skillInput?.value?.trim();
    
    if (skill && watchedSkills && !watchedSkills.includes(skill)) {
    const newSkills = [...(watchedSkills || []), skill];
      setValue('skills', newSkills);
      setSkills(newSkills);
      if (skillInput) skillInput.value = '';
    }
  }, [watchedSkills, setValue]);

  const handleSkillRemove = useCallback((skillToRemove: string) => {
    const newSkills = (watchedSkills || []).filter(skill => skill !== skillToRemove);
    setValue('skills', newSkills);
    setSkills(newSkills);
  }, [watchedSkills, setValue]);

  const onSubmit = async (data: CreateRequirementForm) => {
    setIsSubmitting(true);
    
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        notify.error('Please login first');
        router.push('/login');
        return;
      }

      const { budgetAmountInr, submittingToCustom, submittingTo, ...rest } = data;
      const overallBudget = parseBudgetInrInput(budgetAmountInr)!;
      const resolvedSubmittingTo =
        submittingTo === REQUIREMENT_FROM_CUSTOM
          ? submittingToCustom?.trim() ?? ''
          : submittingTo ?? '';

      const response = await fetch('/api/requirements', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          ...rest,
          overallBudget,
          budgetCurrency: data.budgetCurrency,
          submittingTo: resolvedSubmittingTo || undefined,
        }),
      });

      const result = await response.json();

      if (result.success) {
        notify.success('Job demand created successfully!');
        router.push('/requirements');
      } else {
        notify.error(result.message || 'Failed to create job demand');
      }
    } catch (error) {
      notify.error('Network error. Please try again.');
      console.error('Error creating requirement:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Create New Job Demand</h1>
          <p className="text-gray-600 mt-2">Enter job demand details - NO VALIDATION RESTRICTIONS</p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)}>
          <div className="space-y-8">
            {/* Basic Information */}
            <Card>
              <CardHeader>
                <CardTitle>Basic Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <Field label="Requirement ID" error={errors.requirementId?.message}>
                    <TextInput
                      {...register('requirementId')}
                      placeholder="REQ-YYYY-MM-DD-001 (optional)"
                    />
                  </Field>

                  <Field label="Job Title" error={errors.roleTitle?.message}>
                    <Controller
                      control={control}
                      name="roleTitle"
                      render={({ field }) => (
                        <TextInput
                          {...field}
                          value={field.value ?? ''}
                          placeholder="e.g. Senior Software Engineer"
                        />
                      )}
                    />
                  </Field>

                  <Field label="Location" error={errors.location?.message}>
                    <TextInput
                      {...register('location')}
                      placeholder="e.g. San Francisco, CA"
                    />
                  </Field>

                  <Field label="Number of Positions" error={errors.openPositions?.message}>
                    <TextInput
                      type="number"
                      min={1}
                      {...register('openPositions', { valueAsNumber: true })}
                    />
                  </Field>

                  <Field label="Priority" error={errors.priority?.message}>
                    <Select {...register('priority')}>
                      {PRIORITY_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </Select>
                  </Field>

                </div>
              </CardContent>
            </Card>

            {/* Position Details */}
            <Card>
              <CardHeader>
                <CardTitle>Position Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <Field label="Experience Level" error={errors.experienceLevel?.message}>
                    <Controller
                      control={control}
                      name="experienceLevel"
                      render={({ field }) => (
                        <Select {...field} value={field.value ?? ''}>
                          <option value="">Select Experience Level</option>
                          {EXPERIENCE_LEVEL_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </Select>
                      )}
                    />
                  </Field>

                  <Field label="Employment Type" hint="Only Full-time or Contract" error={errors.employmentType?.message}>
                    <Controller
                      control={control}
                      name="employmentType"
                      render={({ field }) => (
                        <Select {...field} value={field.value ?? ''}>
                          {EMPLOYMENT_TYPE_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </Select>
                      )}
                    />
                  </Field>

                  <Field label="Work Mode" error={errors.workMode?.message}>
                    <Controller
                      control={control}
                      name="workMode"
                      render={({ field }) => (
                        <Select {...field} value={field.value ?? ''}>
                          <option value="">Select Work Mode</option>
                          {WORK_MODE_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </Select>
                      )}
                    />
                  </Field>

                  <Field label="Experience" error={errors.experience?.message}>
                    <TextInput
                      {...register('experience')}
                      placeholder="e.g. 5-7 years"
                    />
                  </Field>

                  <Field label="Budget currency" error={errors.budgetCurrency?.message}>
                    <Controller
                      control={control}
                      name="budgetCurrency"
                      render={({ field }) => (
                        <Select {...field} value={field.value ?? 'INR'}>
                          <option value="INR">INR (₹)</option>
                          <option value="USD">USD ($)</option>
                          <option value="EUR">EUR (€)</option>
                        </Select>
                      )}
                    />
                  </Field>

                  <Field
                    label={
                      employmentTypeWatch === 'Contract'
                        ? 'Monthly budget (amount in selected currency)'
                        : 'Yearly budget (amount in selected currency)'
                    }
                    hint={
                      employmentTypeWatch === 'Contract'
                        ? 'Enter monthly pay as a full number (e.g. 150000).'
                        : 'Enter annual pay as a full number (e.g. 1800000), or shorthand like 18 LPA.'
                    }
                    error={errors.budgetAmountInr?.message}
                  >
                    <Controller
                      control={control}
                      name="budgetAmountInr"
                      render={({ field }) => (
                        <div className="flex w-full items-center gap-2">
                          <TextInput
                            type="text"
                            inputMode="decimal"
                            autoComplete="off"
                            placeholder={
                              employmentTypeWatch === 'Contract'
                                ? 'e.g. 150000 (monthly)'
                                : 'e.g. 1800000 or 18 LPA'
                            }
                            className="min-w-0 flex-1"
                            value={field.value ?? ''}
                            onChange={(e) => field.onChange(e.target.value)}
                            onBlur={field.onBlur}
                            name={field.name}
                            ref={field.ref}
                          />
                          <span className="shrink-0 text-sm font-medium text-gray-500">
                            {employmentTypeWatch === 'Contract' ? 'per month' : 'per year'}
                          </span>
                        </div>
                      )}
                    />
                  </Field>

                  <Field label="Notice Period" error={errors.noticePeriod?.message}>
                    <TextInput
                      {...register('noticePeriod')}
                      placeholder="e.g. 30 days"
                    />
                  </Field>

                  <Field label="Client ID" error={errors.clientId?.message}>
                    <TextInput
                      {...register('clientId')}
                      placeholder="Client ID (optional)"
                    />
                  </Field>
                </div>
              </CardContent>
            </Card>

            {/* Client Information */}
            <Card>
              <CardHeader>
                <CardTitle>Client Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <Field
                    label="Requirement From"
                    error={errors.submittingTo?.message ?? errors.submittingToCustom?.message}
                  >
                    <Select {...register('submittingTo')}>
                      {REQUIREMENT_FROM_SELECT_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </Select>
                  </Field>

                  {submittingToWatch === REQUIREMENT_FROM_CUSTOM ? (
                    <Field label="Company / source name" error={errors.submittingToCustom?.message}>
                      <TextInput
                        {...register('submittingToCustom')}
                        placeholder="e.g. New client or vendor name"
                        autoComplete="organization"
                      />
                    </Field>
                  ) : null}

                  <Field label="Client Lead POC" error={errors.clientLeadPoc?.message}>
                    <TextInput
                      {...register('clientLeadPoc')}
                      placeholder="Client Lead Name"
                    />
                  </Field>

                  <Field label="Client POC" error={errors.clientPoc?.message}>
                    <TextInput
                      {...register('clientPoc')}
                      placeholder="Client POC Email"
                    />
                  </Field>
                </div>
              </CardContent>
            </Card>

            {/* Skills */}
            <Card>
              <CardHeader>
                <CardTitle>Skills</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-2">
                  <TextInput
                    id="skill-input"
                    placeholder="Add a skill"
                    onKeyPress={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleSkillAdd();
                      }
                    }}
                  />
                  <Button type="button" onClick={handleSkillAdd}>
                    Add Skill
                  </Button>
                </div>
                
                {(watchedSkills || []).length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {(watchedSkills || []).map((skill) => (
                      <span
                        key={skill}
                        className="inline-flex items-center px-3 py-1 rounded-full text-sm bg-blue-100 text-blue-800"
                      >
                        {skill}
                        <button
                          type="button"
                          onClick={() => handleSkillRemove(skill)}
                          className="ml-2 text-blue-600 hover:text-blue-800"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Submit Buttons */}
            <div className="flex justify-end gap-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => router.back()}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isSubmitting}
                className="min-w-[120px]"
              >
                {isSubmitting ? 'Creating...' : 'Create Job Demand'}
              </Button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
