import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { query } from '@/lib/db';
import { AuthService } from '@/lib/auth';

const updateRequirementSchema = z.object({
  status: z.enum(['Open', 'Assigned', 'Submitted', 'Interview', 'Selected', 'Rejected', 'Closed']).optional(),
  assignment: z.enum(['Unassigned', 'Assigned']).optional(),
  priority: z.enum(['High', 'Medium', 'Low']).optional(),
  submissionsCount: z.number().int().min(0).optional(),
});

const assignRequirementSchema = z.object({
  ownerId: z.string().uuid('Invalid owner ID'),
});

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;

    const result = await query(
      `SELECT 
        r.*,
        rec.name as owner_name,
        rec.email as owner_email,
        rec.title as owner_title,
        c.name as client_name,
        c.email as client_email
      FROM requirements r
      JOIN recruiters rec ON r.owner_id = rec.id
      JOIN clients c ON r.client_id = c.id
      WHERE r.id = $1 AND r.is_deleted = false`,
      [id]
    );

    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: 'Requirement not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: result.rows[0],
    });
  } catch (error: any) {
    console.error('Get requirement error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch requirement' },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
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

    const { id } = params;
    const body = await request.json();
    const validatedData = updateRequirementSchema.parse(body);

    // Check if requirement exists
    const existingResult = await query(
      'SELECT id FROM requirements WHERE id = $1 AND is_deleted = false',
      [id]
    );

    if (existingResult.rows.length === 0) {
      return NextResponse.json(
        { error: 'Requirement not found' },
        { status: 404 }
      );
    }

    // Build dynamic update query
    const updateFields = [];
    const updateValues = [];
    let paramIndex = 1;

    Object.entries(validatedData).forEach(([key, value]) => {
      if (value !== undefined) {
        updateFields.push(`${key} = $${paramIndex++}`);
        updateValues.push(value);
      }
    });

    if (updateFields.length === 0) {
      return NextResponse.json(
        { error: 'No valid fields to update' },
        { status: 400 }
      );
    }

    updateFields.push(`updated_by = $${paramIndex++}`);
    updateValues.push(user.email);
    updateValues.push(id);

    const updateQuery = `
      UPDATE requirements 
      SET ${updateFields.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `;

    const result = await query(updateQuery, updateValues);

    return NextResponse.json({
      success: true,
      data: result.rows[0],
    });
  } catch (error: any) {
    console.error('Update requirement error:', error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.errors },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: error.message || 'Failed to update requirement' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
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

    const { id } = params;

    // Soft delete requirement
    const result = await query(
      `UPDATE requirements 
       SET is_deleted = true, deleted_at = CURRENT_TIMESTAMP, updated_by = $1
       WHERE id = $2 AND is_deleted = false
       RETURNING *`,
      [user.email, id]
    );

    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: 'Requirement not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Requirement deleted successfully',
    });
  } catch (error: any) {
    console.error('Delete requirement error:', error);
    return NextResponse.json(
      { error: 'Failed to delete requirement' },
      { status: 500 }
    );
  }
}
