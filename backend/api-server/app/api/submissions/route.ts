import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { query } from '@/lib/db';
import { AuthService } from '@/lib/auth';

const submissionSchema = z.object({
  candidateId: z.string().uuid('Invalid candidate ID'),
  requirementId: z.string().min(1, 'Requirement ID is required'),
  soNumber: z.string().optional(),
  totalExperience: z.string().optional(),
  relevantExperience: z.string().optional(),
  currentCtc: z.string().optional(),
  expectedCtc: z.string().optional(),
  noticePeriod: z.string().optional(),
  currentLocation: z.string().optional(),
  preferredLocation: z.string().optional(),
  availableForInterview: z.boolean().default(true),
  reasonForJobChange: z.string().optional(),
  offerInHand: z.boolean().default(false),
  linkedinUrl: z.string().url().optional().or(z.literal('')),
  highestQualification: z.string().optional(),
});

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const candidateId = searchParams.get('candidateId');
    const requirementId = searchParams.get('requirementId');
    const submittedBy = searchParams.get('submittedBy');
    const status = searchParams.get('status');
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = (page - 1) * limit;

    let whereClause = 'WHERE 1=1';
    const params: any[] = [];
    let paramIndex = 1;

    if (candidateId) {
      whereClause += ` AND cs.candidate_id = $${paramIndex++}`;
      params.push(candidateId);
    }

    if (requirementId) {
      whereClause += ` AND cs.requirement_id = $${paramIndex++}`;
      params.push(requirementId);
    }

    if (submittedBy) {
      whereClause += ` AND cs.submitted_by = $${paramIndex++}`;
      params.push(submittedBy);
    }

    if (status) {
      whereClause += ` AND cs.status = $${paramIndex++}`;
      params.push(status);
    }

    const countQuery = `
      SELECT COUNT(*) as total
      FROM candidate_submissions cs
      ${whereClause}
    `;

    const dataQuery = `
      SELECT 
        cs.*,
        c.name as candidate_name,
        c.email as candidate_email,
        c.phone as candidate_phone,
        r.role_title as requirement_role,
        r.client_lead_poc as client_name,
        rec.name as submitted_by_name,
        rec.email as submitted_by_email
      FROM candidate_submissions cs
      JOIN candidates c ON cs.candidate_id = c.id
      JOIN requirements r ON cs.requirement_id = r.id
      JOIN recruiters rec ON cs.submitted_by = rec.id
      ${whereClause}
      ORDER BY cs.submitted_on DESC
      LIMIT $${paramIndex++} OFFSET $${paramIndex++}
    `;

    params.push(limit, offset);

    const [countResult, dataResult] = await Promise.all([
      query(countQuery, params.slice(0, -2)),
      query(dataQuery, params),
    ]);

    const total = parseInt(countResult.rows[0].total);
    const totalPages = Math.ceil(total / limit);

    return NextResponse.json({
      success: true,
      data: dataResult.rows,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    });
  } catch (error: any) {
    console.error('Get submissions error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch submissions' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '');

    if (!token) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const user = await AuthService.getCurrentUser(token);
    if (!user) {
      return NextResponse.json(
        { error: 'Invalid token' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const validatedData = submissionSchema.parse(body);

    // Check if candidate exists
    const candidateResult = await query(
      'SELECT id FROM candidates WHERE id = $1',
      [validatedData.candidateId]
    );

    if (candidateResult.rows.length === 0) {
      return NextResponse.json(
        { error: 'Candidate not found' },
        { status: 404 }
      );
    }

    // Check if requirement exists
    const requirementResult = await query(
      'SELECT id FROM requirements WHERE id = $1 AND is_deleted = false',
      [validatedData.requirementId]
    );

    if (requirementResult.rows.length === 0) {
      return NextResponse.json(
        { error: 'Requirement not found' },
        { status: 404 }
      );
    }

    // Check if submission already exists
    const existingSubmission = await query(
      'SELECT id FROM candidate_submissions WHERE candidate_id = $1 AND requirement_id = $2',
      [validatedData.candidateId, validatedData.requirementId]
    );

    if (existingSubmission.rows.length > 0) {
      return NextResponse.json(
        { error: 'Candidate already submitted for this requirement' },
        { status: 409 }
      );
    }

    // Create submission
    const result = await query(
      `INSERT INTO candidate_submissions (
        candidate_id, requirement_id, submitted_by, so_number, total_experience,
        relevant_experience, current_ctc, expected_ctc, notice_period,
        current_location, preferred_location, available_for_interview,
        reason_for_job_change, offer_in_hand, linkedin_url, highest_qualification
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16
      ) RETURNING *`,
      [
        validatedData.candidateId,
        validatedData.requirementId,
        user.id,
        validatedData.soNumber,
        validatedData.totalExperience,
        validatedData.relevantExperience,
        validatedData.currentCtc,
        validatedData.expectedCtc,
        validatedData.noticePeriod,
        validatedData.currentLocation,
        validatedData.preferredLocation,
        validatedData.availableForInterview,
        validatedData.reasonForJobChange,
        validatedData.offerInHand,
        validatedData.linkedinUrl || null,
        validatedData.highestQualification,
      ]
    );

    // Update requirement submissions count
    await query(
      'UPDATE requirements SET submissions_count = submissions_count + 1 WHERE id = $1',
      [validatedData.requirementId]
    );

    return NextResponse.json({
      success: true,
      data: result.rows[0],
    });
  } catch (error: any) {
    console.error('Create submission error:', error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.errors },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: error.message || 'Failed to create submission' },
      { status: 500 }
    );
  }
}
