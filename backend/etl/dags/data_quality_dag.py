"""
Data Quality Monitoring DAG
Monitors data quality and sends alerts for issues
"""

from datetime import datetime, timedelta
from airflow import DAG
from airflow.operators.python import PythonOperator
from airflow.providers.postgres.hooks.postgres import PostgresHook
from airflow.providers.redis.hooks.redis import RedisHook
from airflow.providers.sendgrid.operators.sendgrid import SendGridEmailOperator
import pandas as pd
import logging
import json

# Default arguments
default_args = {
    'owner': 'data-quality',
    'depends_on_past': False,
    'start_date': datetime(2024, 1, 1),
    'email_on_failure': True,
    'email_on_retry': False,
    'retries': 1,
    'retry_delay': timedelta(minutes=5),
    'catchup': False,
}

POSTGRES_CONN_ID = 'postgres_recruitment'

def check_data_quality():
    """
    Check data quality across all tables
    """
    logging.info("Starting data quality checks")
    
    try:
        postgres_hook = PostgresHook(postgres_conn_id=POSTGRES_CONN_ID)
        
        quality_issues = []
        
        # Check candidates data quality
        candidates_quality_sql = """
        SELECT 
            'candidates' as table_name,
            COUNT(*) as total_records,
            COUNT(CASE WHEN name IS NULL OR name = '' THEN 1 END) as missing_name,
            COUNT(CASE WHEN email IS NULL OR email = '' THEN 1 END) as missing_email,
            COUNT(CASE WHEN phone IS NULL OR phone = '' THEN 1 END) as missing_phone,
            COUNT(CASE WHEN current_employer IS NULL OR current_employer = '' THEN 1 END) as missing_employer,
            COUNT(CASE WHEN location IS NULL OR location = '' THEN 1 END) as missing_location,
            COUNT(CASE WHEN technologies IS NULL OR array_length(technologies, 1) IS NULL THEN 1 END) as missing_technologies,
            COUNT(CASE WHEN email NOT LIKE '%@%' THEN 1 END) as invalid_email_format,
            COUNT(CASE WHEN created_at < CURRENT_DATE - INTERVAL '365 days' THEN 1 END) as stale_records
        FROM candidates
        """
        
        candidates_quality = postgres_hook.get_records(candidates_quality_sql)[0]
        
        # Calculate quality scores
        if candidates_quality[1] > 0:  # total_records > 0
            candidates_completeness = (
                (candidates_quality[1] - candidates_quality[2] - candidates_quality[3] - candidates_quality[4] - candidates_quality[5] - candidates_quality[6]) / 
                candidates_quality[1] * 100
            )
            
            if candidates_completeness < 80:
                quality_issues.append({
                    'table': 'candidates',
                    'issue': 'low_completeness',
                    'score': candidates_completeness,
                    'description': f'Candidates data completeness is {candidates_completeness:.2f}%'
                })
            
            if candidates_quality[8] > 0:  # invalid_email_format > 0
                quality_issues.append({
                    'table': 'candidates',
                    'issue': 'invalid_email_format',
                    'count': candidates_quality[8],
                    'description': f'{candidates_quality[8]} candidates have invalid email format'
                })
            
            if candidates_quality[9] > candidates_quality[1] * 0.1:  # stale_records > 10%
                quality_issues.append({
                    'table': 'candidates',
                    'issue': 'stale_records',
                    'count': candidates_quality[9],
                    'description': f'{candidates_quality[9]} candidates have records older than 1 year'
                })
        
        # Check requirements data quality
        requirements_quality_sql = """
        SELECT 
            'requirements' as table_name,
            COUNT(*) as total_records,
            COUNT(CASE WHEN role_title IS NULL OR role_title = '' THEN 1 END) as missing_role_title,
            COUNT(CASE WHEN client_lead_poc IS NULL OR client_lead_poc = '' THEN 1 END) as missing_client_poc,
            COUNT(CASE WHEN skills IS NULL OR array_length(skills, 1) IS NULL THEN 1 END) as missing_skills,
            COUNT(CASE WHEN priority IS NULL THEN 1 END) as missing_priority,
            COUNT(CASE WHEN status IS NULL THEN 1 END) as missing_status,
            COUNT(CASE WHEN created_at < CURRENT_DATE - INTERVAL '180 days' AND status = 'Open' THEN 1 END) as old_open_requirements
        FROM requirements 
        WHERE is_deleted = false
        """
        
        requirements_quality = postgres_hook.get_records(requirements_quality_sql)[0]
        
        if requirements_quality[1] > 0:
            requirements_completeness = (
                (requirements_quality[1] - requirements_quality[2] - requirements_quality[3] - requirements_quality[4] - requirements_quality[5] - requirements_quality[6]) / 
                requirements_quality[1] * 100
            )
            
            if requirements_completeness < 90:
                quality_issues.append({
                    'table': 'requirements',
                    'issue': 'low_completeness',
                    'score': requirements_completeness,
                    'description': f'Requirements data completeness is {requirements_completeness:.2f}%'
                })
            
            if requirements_quality[7] > 0:  # old_open_requirements > 0
                quality_issues.append({
                    'table': 'requirements',
                    'issue': 'old_open_requirements',
                    'count': requirements_quality[7],
                    'description': f'{requirements_quality[7]} requirements have been open for more than 6 months'
                })
        
        # Check submissions data quality
        submissions_quality_sql = """
        SELECT 
            'submissions' as table_name,
            COUNT(*) as total_records,
            COUNT(CASE WHEN status IS NULL THEN 1 END) as missing_status,
            COUNT(CASE WHEN submitted_on IS NULL THEN 1 END) as missing_submission_date,
            COUNT(CASE WHEN submitted_on < CURRENT_DATE - INTERVAL '30 days' AND status = 'Submitted' THEN 1 END) as pending_submissions,
            COUNT(CASE WHEN submitted_on < CURRENT_DATE - INTERVAL '90 days' AND status IN ('Interview', 'Selected') THEN 1 END) as old_active_submissions
        FROM candidate_submissions
        """
        
        submissions_quality = postgres_hook.get_records(submissions_quality_sql)[0]
        
        if submissions_quality[1] > 0:
            if submissions_quality[4] > submissions_quality[1] * 0.2:  # pending_submissions > 20%
                quality_issues.append({
                    'table': 'submissions',
                    'issue': 'high_pending_submissions',
                    'count': submissions_quality[4],
                    'description': f'{submissions_quality[4]} submissions have been pending for more than 30 days'
                })
            
            if submissions_quality[5] > 0:  # old_active_submissions > 0
                quality_issues.append({
                    'table': 'submissions',
                    'issue': 'old_active_submissions',
                    'count': submissions_quality[5],
                    'description': f'{submissions_quality[5]} active submissions are older than 90 days'
                })
        
        # Check for duplicate records
        duplicate_candidates_sql = """
        SELECT email, COUNT(*) as count
        FROM candidates
        GROUP BY email
        HAVING COUNT(*) > 1
        """
        
        duplicate_candidates = postgres_hook.get_records(duplicate_candidates_sql)
        if duplicate_candidates:
            quality_issues.append({
                'table': 'candidates',
                'issue': 'duplicate_records',
                'count': len(duplicate_candidates),
                'description': f'{len(duplicate_candidates)} duplicate candidate records found by email'
            })
        
        # Store quality issues in Redis
        redis_hook = RedisHook(redis_conn_id='redis_default')
        quality_report = {
            'issues': quality_issues,
            'candidates_quality': dict(zip(['total_records', 'missing_name', 'missing_email', 'missing_phone', 'missing_employer', 'missing_location', 'missing_technologies', 'invalid_email_format', 'stale_records'], candidates_quality)),
            'requirements_quality': dict(zip(['total_records', 'missing_role_title', 'missing_client_poc', 'missing_skills', 'missing_priority', 'missing_status', 'old_open_requirements'], requirements_quality)),
            'submissions_quality': dict(zip(['total_records', 'missing_status', 'missing_submission_date', 'pending_submissions', 'old_active_submissions'], submissions_quality)),
            'checked_at': datetime.now().isoformat()
        }
        
        redis_hook.get_conn().set(
            'data_quality_report',
            json.dumps(quality_report),
            ex=86400  # Expire in 24 hours
        )
        
        logging.info(f"Data quality check completed. Found {len(quality_issues)} issues.")
        
        return quality_issues
        
    except Exception as e:
        logging.error(f"Error in data quality check: {str(e)}")
        raise

def check_data_freshness():
    """
    Check data freshness and identify stale data
    """
    logging.info("Starting data freshness check")
    
    try:
        postgres_hook = PostgresHook(postgres_conn_id=POSTGRES_CONN_ID)
        
        freshness_issues = []
        
        # Check for recently updated records
        freshness_sql = """
        SELECT 
            'candidates' as table_name,
            COUNT(CASE WHEN updated_at >= CURRENT_DATE - INTERVAL '1 day' THEN 1 END) as updated_today,
            COUNT(CASE WHEN updated_at >= CURRENT_DATE - INTERVAL '7 days' THEN 1 END) as updated_this_week,
            COUNT(CASE WHEN updated_at >= CURRENT_DATE - INTERVAL '30 days' THEN 1 END) as updated_this_month,
            MAX(updated_at) as last_update
        FROM candidates
        
        UNION ALL
        
        SELECT 
            'requirements' as table_name,
            COUNT(CASE WHEN updated_at >= CURRENT_DATE - INTERVAL '1 day' THEN 1 END) as updated_today,
            COUNT(CASE WHEN updated_at >= CURRENT_DATE - INTERVAL '7 days' THEN 1 END) as updated_this_week,
            COUNT(CASE WHEN updated_at >= CURRENT_DATE - INTERVAL '30 days' THEN 1 END) as updated_this_month,
            MAX(updated_at) as last_update
        FROM requirements 
        WHERE is_deleted = false
        
        UNION ALL
        
        SELECT 
            'submissions' as table_name,
            COUNT(CASE WHEN updated_at >= CURRENT_DATE - INTERVAL '1 day' THEN 1 END) as updated_today,
            COUNT(CASE WHEN updated_at >= CURRENT_DATE - INTERVAL '7 days' THEN 1 END) as updated_this_week,
            COUNT(CASE WHEN updated_at >= CURRENT_DATE - INTERVAL '30 days' THEN 1 END) as updated_this_month,
            MAX(updated_at) as last_update
        FROM candidate_submissions
        """
        
        freshness_results = postgres_hook.get_records(freshness_sql)
        
        for result in freshness_results:
            table_name = result[0]
            last_update = result[4]
            
            if last_update:
                days_since_update = (datetime.now().date() - last_update.date()).days
                
                if days_since_update > 30:
                    freshness_issues.append({
                        'table': table_name,
                        'issue': 'stale_data',
                        'days_since_update': days_since_update,
                        'last_update': last_update.isoformat(),
                        'description': f'{table_name} table has not been updated for {days_since_update} days'
                    })
        
        # Store freshness report
        redis_hook = RedisHook(redis_conn_id='redis_default')
        freshness_report = {
            'issues': freshness_issues,
            'freshness_data': [dict(zip(['table', 'updated_today', 'updated_this_week', 'updated_this_month', 'last_update'], result)) for result in freshness_results],
            'checked_at': datetime.now().isoformat()
        }
        
        redis_hook.get_conn().set(
            'data_freshness_report',
            json.dumps(freshness_report),
            ex=86400
        )
        
        logging.info(f"Data freshness check completed. Found {len(freshness_issues)} issues.")
        
        return freshness_issues
        
    except Exception as e:
        logging.error(f"Error in data freshness check: {str(e)}")
        raise

def send_quality_alerts():
    """
    Send alerts for data quality issues
    """
    logging.info("Starting quality alerts processing")
    
    try:
        redis_hook = RedisHook(redis_conn_id='redis_default')
        
        # Get quality and freshness reports
        quality_report = json.loads(redis_hook.get_conn().get('data_quality_report'))
        freshness_report = json.loads(redis_hook.get_conn().get('data_freshness_report'))
        
        all_issues = quality_report['issues'] + freshness_report['issues']
        
        if not all_issues:
            logging.info("No data quality issues found. No alerts sent.")
            return
        
        # Prepare alert email
        high_priority_issues = [issue for issue in all_issues if issue['issue'] in ['low_completeness', 'stale_data', 'duplicate_records']]
        
        if high_priority_issues:
            alert_content = f"""
Data Quality Alert - {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}

High Priority Issues Found:
{'=' * 50}

"""
            
            for issue in high_priority_issues:
                alert_content += f"""
Table: {issue['table'].upper()}
Issue: {issue['issue']}
Description: {issue['description']}
Priority: HIGH

"""
            
            alert_content += f"""
Total Issues: {len(all_issues)}
High Priority Issues: {len(high_priority_issues)}
Medium Priority Issues: {len(all_issues) - len(high_priority_issues)}

Please review the data quality dashboard for detailed information.
"""
            
            # Send email alert (implementation depends on your email service)
            logging.warning(f"DATA QUALITY ALERT: {len(high_priority_issues)} high priority issues found")
            logging.warning(alert_content)
            
            # Here you would integrate with your email service
            # For example, using SendGrid, AWS SES, or SMTP
        
        logging.info("Quality alerts processing completed")
        
    except Exception as e:
        logging.error(f"Error in quality alerts processing: {str(e)}")
        raise

# Define DAG
data_quality_dag = DAG(
    'data_quality_monitoring',
    default_args=default_args,
    description='Data quality monitoring and alerting',
    schedule_interval='0 6 * * *',  # Run daily at 6 AM
    catchup=False,
    tags=['data-quality', 'monitoring'],
)

check_quality = PythonOperator(
    task_id='check_data_quality',
    python_callable=check_data_quality,
    dag=data_quality_dag,
)

check_freshness = PythonOperator(
    task_id='check_data_freshness',
    python_callable=check_data_freshness,
    dag=data_quality_dag,
)

send_alerts = PythonOperator(
    task_id='send_quality_alerts',
    python_callable=send_quality_alerts,
    dag=data_quality_dag,
)

check_quality >> check_freshness >> send_alerts
