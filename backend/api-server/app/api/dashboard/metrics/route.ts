import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { AuthService } from '@/lib/auth';

export async function GET(request: NextRequest) {
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

    const { searchParams } = new URL(request.url);
    const recruiterId = searchParams.get('recruiterId') || user.id;
    const timeRange = searchParams.get('timeRange') || '30'; // days

    // Get overall metrics
    const overallMetricsQuery = `
      SELECT 
        COUNT(DISTINCT r.id) as total_requirements,
        COUNT(DISTINCT CASE WHEN r.status = 'Open' THEN r.id END) as open_requirements,
        COUNT(DISTINCT CASE WHEN r.assignment = 'Assigned' THEN r.id END) as assigned_requirements,
        COUNT(DISTINCT cs.id) as total_submissions,
        COUNT(DISTINCT CASE WHEN cs.status = 'Interview' THEN cs.id END) as interviews,
        COUNT(DISTINCT CASE WHEN cs.status = 'Selected' THEN cs.id END) as selections,
        COUNT(DISTINCT CASE WHEN cs.status = 'Rejected' THEN cs.id END) as rejections
      FROM requirements r
      LEFT JOIN candidate_submissions cs ON r.id = cs.requirement_id
      WHERE r.is_deleted = false
    `;

    // Get recruiter-specific metrics
    const recruiterMetricsQuery = `
      SELECT 
        rec.id,
        rec.name,
        rec.email,
        COUNT(DISTINCT r.id) as active_requirements,
        COUNT(DISTINCT cs.id) as total_submissions,
        COUNT(DISTINCT CASE WHEN cs.status = 'Interview' THEN cs.id END) as interviews,
        COUNT(DISTINCT CASE WHEN cs.status = 'Selected' THEN cs.id END) as selections,
        COUNT(DISTINCT CASE WHEN cs.status = 'Rejected' THEN cs.id END) as rejections,
        AVG(EXTRACT(DAY FROM (CURRENT_TIMESTAMP - r.created_at))) as avg_days_open,
        COUNT(DISTINCT CASE WHEN r.priority = 'High' THEN r.id END) as high_priority_reqs
      FROM recruiters rec
      LEFT JOIN requirements r ON rec.id = r.owner_id AND r.is_deleted = false AND r.status NOT IN ('Closed', 'Rejected')
      LEFT JOIN candidate_submissions cs ON rec.id = cs.submitted_by AND cs.submitted_on >= CURRENT_TIMESTAMP - INTERVAL '${timeRange} days'
      WHERE rec.is_active = true
      GROUP BY rec.id, rec.name, rec.email
      ORDER BY total_submissions DESC
    `;

    // Get status distribution
    const statusDistributionQuery = `
      SELECT 
        r.status,
        COUNT(*) as count
      FROM requirements r
      WHERE r.is_deleted = false
      GROUP BY r.status
      ORDER BY count DESC
    `;

    // Get priority distribution
    const priorityDistributionQuery = `
      SELECT 
        r.priority,
        COUNT(*) as count
      FROM requirements r
      WHERE r.is_deleted = false AND r.status NOT IN ('Closed', 'Rejected')
      GROUP BY r.priority
      ORDER BY 
        CASE r.priority 
          WHEN 'High' THEN 1 
          WHEN 'Medium' THEN 2 
          WHEN 'Low' THEN 3 
        END
    `;

    // Get recent activity
    const recentActivityQuery = `
      SELECT 
        'requirement' as type,
        r.id,
        r.role_title as title,
        r.client_lead_poc as client,
        r.status,
        r.created_at,
        rec.name as owner_name
      FROM requirements r
      JOIN recruiters rec ON r.owner_id = rec.id
      WHERE r.created_at >= CURRENT_TIMESTAMP - INTERVAL '7 days'
        AND r.is_deleted = false
      
      UNION ALL
      
      SELECT 
        'submission' as type,
        cs.id,
        c.name as title,
        r.client_lead_poc as client,
        cs.status,
        cs.submitted_on as created_at,
        rec.name as owner_name
      FROM candidate_submissions cs
      JOIN candidates c ON cs.candidate_id = c.id
      JOIN requirements r ON cs.requirement_id = r.id
      JOIN recruiters rec ON cs.submitted_by = rec.id
      WHERE cs.submitted_on >= CURRENT_TIMESTAMP - INTERVAL '7 days'
      
      ORDER BY created_at DESC
      LIMIT 20
    `;

    // Get performance trends
    const performanceTrendsQuery = `
      SELECT 
        DATE_TRUNC('day', cs.submitted_on) as date,
        COUNT(*) as submissions,
        COUNT(DISTINCT CASE WHEN cs.status = 'Interview' THEN cs.id END) as interviews,
        COUNT(DISTINCT CASE WHEN cs.status = 'Selected' THEN cs.id END) as selections
      FROM candidate_submissions cs
      WHERE cs.submitted_on >= CURRENT_TIMESTAMP - INTERVAL '${timeRange} days'
      GROUP BY DATE_TRUNC('day', cs.submitted_on)
      ORDER BY date ASC
    `;

    const [
      overallMetrics,
      recruiterMetrics,
      statusDistribution,
      priorityDistribution,
      recentActivity,
      performanceTrends
    ] = await Promise.all([
      query(overallMetricsQuery),
      query(recruiterMetricsQuery),
      query(statusDistributionQuery),
      query(priorityDistributionQuery),
      query(recentActivityQuery),
      query(performanceTrendsQuery)
    ]);

    return NextResponse.json({
      success: true,
      data: {
        overall: overallMetrics.rows[0],
        recruiterMetrics: recruiterMetrics.rows,
        statusDistribution: statusDistribution.rows,
        priorityDistribution: priorityDistribution.rows,
        recentActivity: recentActivity.rows,
        performanceTrends: performanceTrends.rows,
      },
    });
  } catch (error: any) {
    console.error('Get dashboard metrics error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch dashboard metrics' },
      { status: 500 }
    );
  }
}
