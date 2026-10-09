import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { query } from '@/lib/db';
import { AuthService } from '@/lib/auth';

const candidateSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Invalid email address'),
  phone: z.string().optional(),
  currentEmployer: z.string().optional(),
  location: z.string().optional(),
  experienceLabel: z.string().optional(),
  technologies: z.array(z.string()).optional(),
  linkedinUrl: z.string().url().optional().or(z.literal('')),
  highestQualification: z.string().optional(),
  currentCtc: z.number().optional(),
  expectedCtc: z.number().optional(),
  noticePeriod: z.string().optional(),
  preferredLocation: z.string().optional(),
  availableForInterview: z.boolean().default(true),
  reasonForJobChange: z.string().optional(),
  offerInHand: z.boolean().default(false),
});

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search');
    const technology = searchParams.get('technology');
    const location = searchParams.get('location');
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = (page - 1) * limit;

    let whereClause = 'WHERE 1=1';
    const params: any[] = [];
    let paramIndex = 1;

    if (search) {
      whereClause += ` AND (c.name ILIKE $${paramIndex++} OR c.email ILIKE $${paramIndex++})`;
      params.push(`%${search}%`, `%${search}%`);
    }

    if (technology) {
      whereClause += ` AND $${paramIndex++} = ANY(c.technologies)`;
      params.push(technology);
    }

    if (location) {
      whereClause += ` AND c.location ILIKE $${paramIndex++}`;
      params.push(`%${location}%`);
    }

    const countQuery = `
      SELECT COUNT(*) as total
      FROM candidates c
      ${whereClause}
    `;

    const dataQuery = `
      SELECT 
        c.*,
        (SELECT COUNT(*) FROM candidate_submissions cs WHERE cs.candidate_id = c.id) as submissions_count
      FROM candidates c
      ${whereClause}
      ORDER BY c.created_at DESC
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
    console.error('Get candidates error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch candidates' },
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
    const validatedData = candidateSchema.parse(body);

    // Check if candidate with email already exists
    const existingCandidate = await query(
      'SELECT id FROM candidates WHERE email = $1',
      [validatedData.email]
    );

    if (existingCandidate.rows.length > 0) {
      return NextResponse.json(
        { error: 'Candidate with this email already exists' },
        { status: 409 }
      );
    }

    // Generate candidate code
    const codeResult = await query('SELECT generate_candidate_code() as code');
    const candidateCode = codeResult.rows[0].code;

    // Create candidate
    const result = await query(
      `INSERT INTO candidates (
        candidate_code, name, email, phone, current_employer, location, 
        experience_label, technologies, linkedin_url, highest_qualification, 
        current_ctc, expected_ctc, notice_period, preferred_location, 
        available_for_interview, reason_for_job_change, offer_in_hand
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17
      ) RETURNING *`,
      [
        candidateCode,
        validatedData.name,
        validatedData.email,
        validatedData.phone,
        validatedData.currentEmployer,
        validatedData.location,
        validatedData.experienceLabel,
        validatedData.technologies,
        validatedData.linkedinUrl || null,
        validatedData.highestQualification,
        validatedData.currentCtc,
        validatedData.expectedCtc,
        validatedData.noticePeriod,
        validatedData.preferredLocation,
        validatedData.availableForInterview,
        validatedData.reasonForJobChange,
        validatedData.offerInHand,
      ]
    );

    return NextResponse.json({
      success: true,
      data: result.rows[0],
    });
  } catch (error: any) {
    console.error('Create candidate error:', error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.errors },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: error.message || 'Failed to create candidate' },
      { status: 500 }
    );
  }
}
