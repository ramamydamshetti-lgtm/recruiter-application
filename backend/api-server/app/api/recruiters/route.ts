import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { AuthService } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const role = searchParams.get('role');
    const active = searchParams.get('active');

    let whereClause = 'WHERE 1=1';
    const params: any[] = [];
    let paramIndex = 1;

    if (role) {
      whereClause += ` AND role = $${paramIndex++}`;
      params.push(role);
    }

    if (active !== null) {
      whereClause += ` AND is_active = $${paramIndex++}`;
      params.push(active === 'true');
    }

    const result = await query(
      `SELECT 
        id, name, email, title, role, phone, is_active, last_login, created_at
      FROM recruiters 
      ${whereClause}
      ORDER BY name ASC`,
      params
    );

    return NextResponse.json({
      success: true,
      data: result.rows,
    });
  } catch (error: any) {
    console.error('Get recruiters error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch recruiters' },
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
    if (!user || user.role !== 'Admin') {
      return NextResponse.json(
        { error: 'Admin access required' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { name, email, password, title = 'Recruiter', role = 'Recruiter', phone } = body;

    if (!name || !email || !password) {
      return NextResponse.json(
        { error: 'Name, email, and password are required' },
        { status: 400 }
      );
    }

    // Check if recruiter with email already exists
    const existingRecruiter = await query(
      'SELECT id FROM recruiters WHERE email = $1',
      [email]
    );

    if (existingRecruiter.rows.length > 0) {
      return NextResponse.json(
        { error: 'Recruiter with this email already exists' },
        { status: 409 }
      );
    }

    // Hash password
    const passwordHash = await AuthService.hashPassword(password);

    // Create recruiter
    const result = await query(
      `INSERT INTO recruiters (name, email, password_hash, title, role, phone)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, name, email, title, role, phone, is_active, created_at`,
      [name, email, passwordHash, title, role, phone]
    );

    return NextResponse.json({
      success: true,
      data: result.rows[0],
    });
  } catch (error: any) {
    console.error('Create recruiter error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to create recruiter' },
      { status: 500 }
    );
  }
}
