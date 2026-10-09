import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { query } from '@/lib/db';
import { AuthService } from '@/lib/auth';

const requirementSchema = z.object({
  clientLeadPoc: z.string().min(1, 'Client lead POC is required'),
  clientPoc: z.string().optional(),
  roleTitle: z.string().min(1, 'Role title is required'),
  location: z.string().optional(),
  experience: z.string().optional(),
  noticePeriod: z.string().optional(),
  skills: z.array(z.string()).min(1, 'At least one skill is required'),
  technologies: z.array(z.string()).optional(),
  priority: z.enum(['High', 'Medium', 'Low']).default('Medium'),
  openPositions: z.number().int().min(1).default(1),
  slaDays: z.number().int().min(1).default(30),
  submittingTo: z.string().optional(),
  clientJdId: z.string().optional(),
  description: z.string().optional(),
});

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const assignment = searchParams.get('assignment');
    const clientId = searchParams.get('clientId');
    const ownerId = searchParams.get('ownerId');
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = (page - 1) * limit;

    let whereClause = 'WHERE r.is_deleted = false';
    const params: any[] = [];
    let paramIndex = 1;

    if (status) {
      whereClause += ` AND r.status = $${paramIndex++}`;
      params.push(status);
    }

    if (assignment) {
      whereClause += ` AND r.assignment = $${paramIndex++}`;
      params.push(assignment);
    }

    if (clientId) {
      whereClause += ` AND r.client_id = $${paramIndex++}`;
      params.push(clientId);
    }

    if (ownerId) {
      whereClause += ` AND r.owner_id = $${paramIndex++}`;
      params.push(ownerId);
    }

    const countQuery = `
      SELECT COUNT(*) as total
      FROM requirements r
      ${whereClause}
    `;

    const dataQuery = `
      SELECT 
        r.*,
        rec.name as owner_name,
        rec.email as owner_email,
        rec.title as owner_title,
        c.name as client_name
      FROM requirements r
      JOIN recruiters rec ON r.owner_id = rec.id
      JOIN clients c ON r.client_id = c.id
      ${whereClause}
      ORDER BY r.created_at DESC
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
    console.error('Get requirements error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch requirements' },
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
    const validatedData = requirementSchema.parse(body);

    // Generate requirement ID
    const idResult = await query('SELECT generate_requirement_id() as id');
    const requirementId = idResult.rows[0].id;

    // Find or create client
    let clientId;
    const clientResult = await query(
      'SELECT id FROM clients WHERE email = $1',
      [validatedData.clientLeadPoc]
    );

    if (clientResult.rows.length > 0) {
      clientId = clientResult.rows[0].id;
    } else {
      // Create new client
      const newClientResult = await query(
        'INSERT INTO clients (name, email) VALUES ($1, $2) RETURNING id',
        [validatedData.clientLeadPoc, validatedData.clientLeadPoc]
      );
      clientId = newClientResult.rows[0].id;
    }

    // Create requirement
    const result = await query(
      `INSERT INTO requirements (
        id, client_id, client_lead_poc, client_poc, role_title, location, 
        experience, notice_period, skills, technologies, priority, open_positions, 
        sla_days, submitting_to, client_jd_id, description, owner_id, updated_by
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18
      ) RETURNING *`,
      [
        requirementId,
        clientId,
        validatedData.clientLeadPoc,
        validatedData.clientPoc,
        validatedData.roleTitle,
        validatedData.location,
        validatedData.experience,
        validatedData.noticePeriod,
        validatedData.skills,
        validatedData.technologies,
        validatedData.priority,
        validatedData.openPositions,
        validatedData.slaDays,
        validatedData.submittingTo,
        validatedData.clientJdId,
        validatedData.description,
        user.id,
        user.email,
      ]
    );

    return NextResponse.json({
      success: true,
      data: result.rows[0],
    });
  } catch (error: any) {
    console.error('Create requirement error:', error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.errors },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: error.message || 'Failed to create requirement' },
      { status: 500 }
    );
  }
}
