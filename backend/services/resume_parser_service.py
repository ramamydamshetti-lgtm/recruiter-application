"""
Resume Parser Service for Recruitment Platform
Handles parsing and analysis of candidate resumes
"""

import os
import logging
import re
from typing import Dict, List, Optional, Any
from dataclasses import dataclass
from datetime import datetime
import json
from abc import ABC, abstractmethod

# Resume parsing libraries
import docx
import PyPDF2
from bs4 import BeautifulSoup
import spacy
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

@dataclass
class ParsedResume:
    """Standardized parsed resume structure"""
    name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    location: Optional[str] = None
    summary: Optional[str] = None
    experience: List[Dict[str, Any]] = None
    education: List[Dict[str, Any]] = None
    skills: List[str] = None
    certifications: List[str] = None
    languages: List[str] = None
    total_experience_years: Optional[float] = None
    file_path: Optional[str] = None
    parsed_at: Optional[datetime] = None

class ResumeParser(ABC):
    """Abstract base class for resume parsers"""
    
    @abstractmethod
    def parse(self, file_path: str) -> ParsedResume:
        """Parse resume from file"""
        pass
    
    @abstractmethod
    def extract_text(self, file_path: str) -> str:
        """Extract text from resume file"""
        pass

class PDFResumeParser(ResumeParser):
    """PDF resume parser"""
    
    def extract_text(self, file_path: str) -> str:
        """Extract text from PDF file"""
        try:
            with open(file_path, 'rb') as file:
                pdf_reader = PyPDF2.PdfReader(file)
                text = ""
                for page in pdf_reader.pages:
                    text += page.extract_text()
                return text
        except Exception as e:
            logger.error(f"Error extracting text from PDF {file_path}: {str(e)}")
            return ""
    
    def parse(self, file_path: str) -> ParsedResume:
        """Parse PDF resume"""
        text = self.extract_text(file_path)
        return self._parse_text(text, file_path)
    
    def _parse_text(self, text: str, file_path: str) -> ParsedResume:
        """Parse extracted text into structured data"""
        parsed = ParsedResume(
            file_path=file_path,
            parsed_at=datetime.utcnow()
        )
        
        # Extract contact information
        parsed.name = self._extract_name(text)
        parsed.email = self._extract_email(text)
        parsed.phone = self._extract_phone(text)
        parsed.location = self._extract_location(text)
        
        # Extract sections
        parsed.summary = self._extract_summary(text)
        parsed.experience = self._extract_experience(text)
        parsed.education = self._extract_education(text)
        parsed.skills = self._extract_skills(text)
        parsed.certifications = self._extract_certifications(text)
        parsed.languages = self._extract_languages(text)
        
        # Calculate total experience
        parsed.total_experience_years = self._calculate_total_experience(parsed.experience)
        
        return parsed
    
    def _extract_name(self, text: str) -> Optional[str]:
        """Extract name from resume text"""
        # Simple regex for name extraction (2-3 words, capitalized)
        name_patterns = [
            r'^([A-Z][a-z]+ [A-Z][a-z]+(?: [A-Z][a-z]+)?)',
            r'([A-Z][a-z]+ [A-Z][a-z]+)\n',
            r'Name[:\s]*([A-Z][a-z]+ [A-Z][a-z]+(?: [A-Z][a-z]+)?)'
        ]
        
        for pattern in name_patterns:
            match = re.search(pattern, text, re.MULTILINE)
            if match:
                return match.group(1).strip()
        
        return None
    
    def _extract_email(self, text: str) -> Optional[str]:
        """Extract email from resume text"""
        email_pattern = r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b'
        match = re.search(email_pattern, text)
        return match.group(0) if match else None
    
    def _extract_phone(self, text: str) -> Optional[str]:
        """Extract phone number from resume text"""
        phone_patterns = [
            r'\b\d{3}[-.]?\d{3}[-.]?\d{4}\b',
            r'\(\d{3}\)\s*\d{3}[-.]?\d{4}',
            r'\+\d{1,3}\s*\d{3}[-.]?\d{3}[-.]?\d{4}'
        ]
        
        for pattern in phone_patterns:
            match = re.search(pattern, text)
            if match:
                return match.group(0)
        
        return None
    
    def _extract_location(self, text: str) -> Optional[str]:
        """Extract location from resume text"""
        location_patterns = [
            r'([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*,\s*[A-Z]{2})',
            r'([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*,\s*[A-Z][a-z]+)',
            r'(Location[:\s]*[^\n]+)'
        ]
        
        for pattern in location_patterns:
            match = re.search(pattern, text)
            if match:
                return match.group(1).strip()
        
        return None
    
    def _extract_summary(self, text: str) -> Optional[str]:
        """Extract summary/objective section"""
        summary_patterns = [
            r'(?:Summary|Objective|Profile|About)[:\s]*\n?(.*?)(?:\n\n|\n[A-Z])',
            r'(?:SUMMARY|OBJECTIVE|PROFILE|ABOUT)[:\s]*\n?(.*?)(?:\n\n|\n[A-Z])'
        ]
        
        for pattern in summary_patterns:
            match = re.search(pattern, text, re.DOTALL | re.IGNORECASE)
            if match:
                return match.group(1).strip()
        
        return None
    
    def _extract_experience(self, text: str) -> List[Dict[str, Any]]:
        """Extract work experience section"""
        experience = []
        
        # Look for experience section
        exp_section = self._extract_section(text, ['Experience', 'Work Experience', 'Employment', 'Professional Experience'])
        
        if exp_section:
            # Extract individual experiences
            exp_entries = re.split(r'\n(?=[A-Z][a-z]+.*?\n.*?\d{4})', exp_section)
            
            for entry in exp_entries:
                if len(entry.strip()) > 20:  # Filter out short entries
                    exp_data = self._parse_experience_entry(entry)
                    if exp_data:
                        experience.append(exp_data)
        
        return experience
    
    def _extract_education(self, text: str) -> List[Dict[str, Any]]:
        """Extract education section"""
        education = []
        
        # Look for education section
        edu_section = self._extract_section(text, ['Education', 'Academic', 'Qualifications'])
        
        if edu_section:
            # Extract individual education entries
            edu_entries = re.split(r'\n(?=[A-Z][a-z]+.*?(?:University|College|Institute|School))', edu_section)
            
            for entry in edu_entries:
                if len(entry.strip()) > 20:
                    edu_data = self._parse_education_entry(entry)
                    if edu_data:
                        education.append(edu_data)
        
        return education
    
    def _extract_skills(self, text: str) -> List[str]:
        """Extract skills section"""
        skills = []
        
        # Look for skills section
        skills_section = self._extract_section(text, ['Skills', 'Technical Skills', 'Technologies', 'Competencies'])
        
        if skills_section:
            # Extract skills using various patterns
            skill_patterns = [
                r'([A-Za-z]+(?:\s+[A-Za-z]+)*)',  # General words
                r'([A-Z][a-z]+(?:[A-Z][a-z]+)*)',  # CamelCase
                r'([a-z]+(?:_[a-z]+)*)'  # snake_case
            ]
            
            # Common technical skills
            tech_skills = [
                'Python', 'Java', 'JavaScript', 'React', 'Node.js', 'SQL', 'AWS', 'Docker',
                'Kubernetes', 'Git', 'MongoDB', 'PostgreSQL', 'Redis', 'Angular', 'Vue.js',
                'TypeScript', 'HTML', 'CSS', 'Machine Learning', 'Data Science', 'AI',
                'TensorFlow', 'PyTorch', 'Scikit-learn', 'Pandas', 'NumPy', 'Flask',
                'Django', 'FastAPI', 'REST API', 'GraphQL', 'Microservices', 'DevOps'
            ]
            
            # Extract skills from text
            for skill in tech_skills:
                if skill.lower() in skills_section.lower():
                    skills.append(skill)
        
        return list(set(skills))  # Remove duplicates
    
    def _extract_certifications(self, text: str) -> List[str]:
        """Extract certifications section"""
        certifications = []
        
        cert_section = self._extract_section(text, ['Certifications', 'Certificates', 'Professional Certifications'])
        
        if cert_section:
            # Extract certification names
            cert_pattern = r'([A-Z][a-zA-Z\s]+(?:Certified|Certificate|Certification)[A-Za-z\s]*)'
            matches = re.findall(cert_pattern, cert_section)
            certifications.extend([cert.strip() for cert in matches])
        
        return certifications
    
    def _extract_languages(self, text: str) -> List[str]:
        """Extract languages section"""
        languages = []
        
        lang_section = self._extract_section(text, ['Languages', 'Language Proficiency'])
        
        if lang_section:
            # Common languages
            common_langs = ['English', 'Spanish', 'French', 'German', 'Chinese', 'Japanese', 
                           'Korean', 'Portuguese', 'Russian', 'Arabic', 'Hindi', 'Italian']
            
            for lang in common_langs:
                if lang.lower() in lang_section.lower():
                    languages.append(lang)
        
        return languages
    
    def _extract_section(self, text: str, section_names: List[str]) -> Optional[str]:
        """Extract a specific section from resume text"""
        for name in section_names:
            pattern = rf'{name}[:\s]*\n?(.*?)(?:\n\n|\n[A-Z][a-z]+(?:\s+[a-z]+)*[:\s]|$)'
            match = re.search(pattern, text, re.DOTALL | re.IGNORECASE)
            if match:
                return match.group(1).strip()
        
        return None
    
    def _parse_experience_entry(self, entry: str) -> Optional[Dict[str, Any]]:
        """Parse individual experience entry"""
        lines = entry.strip().split('\n')
        if len(lines) < 2:
            return None
        
        # Extract title and company from first line
        first_line = lines[0].strip()
        title_company = re.split(r'[,|@]', first_line)
        
        title = title_company[0].strip() if title_company else ""
        company = title_company[1].strip() if len(title_company) > 1 else ""
        
        # Extract dates from second line
        dates = self._extract_dates(lines[1] if len(lines) > 1 else "")
        
        # Extract description from remaining lines
        description = '\n'.join(lines[2:]) if len(lines) > 2 else ""
        
        return {
            'title': title,
            'company': company,
            'start_date': dates.get('start_date'),
            'end_date': dates.get('end_date'),
            'current': dates.get('current', False),
            'description': description.strip()
        }
    
    def _parse_education_entry(self, entry: str) -> Optional[Dict[str, Any]]:
        """Parse individual education entry"""
        lines = entry.strip().split('\n')
        if len(lines) < 1:
            return None
        
        # Extract degree and institution
        first_line = lines[0].strip()
        
        # Look for degree patterns
        degree_patterns = [
            r'(Bachelor|Master|PhD|Doctorate|Associate|B\.S\.|M\.S\.|Ph\.D\.)',
            r'(Engineering|Computer Science|Business|Arts|Science)'
        ]
        
        degree = None
        for pattern in degree_patterns:
            match = re.search(pattern, first_line, re.IGNORECASE)
            if match:
                degree = match.group(0)
                break
        
        # Look for institution
        institution_patterns = [
            r'(University|College|Institute|School)',
            r'([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\s+(?:University|College|Institute|School))'
        ]
        
        institution = None
        for pattern in institution_patterns:
            match = re.search(pattern, first_line)
            if match:
                institution = match.group(0)
                break
        
        # Extract dates
        dates = self._extract_dates(lines[1] if len(lines) > 1 else "")
        
        return {
            'degree': degree,
            'institution': institution,
            'start_date': dates.get('start_date'),
            'end_date': dates.get('end_date'),
            'gpa': self._extract_gpa(entry)
        }
    
    def _extract_dates(self, text: str) -> Dict[str, Any]:
        """Extract dates from text"""
        dates = {}
        
        # Date patterns
        date_patterns = [
            r'(\d{1,2}/\d{1,2}/\d{4})\s*-\s*(\d{1,2}/\d{1,2}/\d{4})',
            r'(\w+ \d{4})\s*-\s*(\w+ \d{4})',
            r'(\d{4})\s*-\s*(\d{4})',
            r'(\w+ \d{4})\s*-\s*(Present|Current)',
            r'(\d{4})\s*-\s*(Present|Current)'
        ]
        
        for pattern in date_patterns:
            match = re.search(pattern, text)
            if match:
                dates['start_date'] = match.group(1)
                dates['end_date'] = match.group(2) if match.group(2).lower() not in ['present', 'current'] else None
                dates['current'] = match.group(2).lower() in ['present', 'current']
                break
        
        return dates
    
    def _extract_gpa(self, text: str) -> Optional[float]:
        """Extract GPA from text"""
        gpa_pattern = r'GPA[:\s]*([0-3]\.\d{1,2})'
        match = re.search(gpa_pattern, text, re.IGNORECASE)
        return float(match.group(1)) if match else None
    
    def _calculate_total_experience(self, experience: List[Dict[str, Any]]) -> Optional[float]:
        """Calculate total years of experience"""
        total_years = 0
        
        for exp in experience:
            if exp.get('start_date') and exp.get('end_date'):
                # Simple calculation - would need proper date parsing for accuracy
                total_years += 1  # Placeholder
            elif exp.get('current'):
                total_years += 1  # Placeholder
        
        return total_years if total_years > 0 else None

class DOCXResumeParser(PDFResumeParser):
    """DOCX resume parser"""
    
    def extract_text(self, file_path: str) -> str:
        """Extract text from DOCX file"""
        try:
            doc = docx.Document(file_path)
            text = ""
            for paragraph in doc.paragraphs:
                text += paragraph.text + "\n"
            return text
        except Exception as e:
            logger.error(f"Error extracting text from DOCX {file_path}: {str(e)}")
            return ""

class ResumeParserService:
    """Main resume parser service"""
    
    def __init__(self):
        self.parsers = {
            '.pdf': PDFResumeParser(),
            '.docx': DOCXResumeParser()
        }
        
        # Load NLP model for advanced parsing
        try:
            self.nlp = spacy.load("en_core_web_sm")
        except OSError:
            logger.warning("spaCy model not found, using basic parsing only")
            self.nlp = None
    
    def parse_resume(self, file_path: str) -> Optional[ParsedResume]:
        """Parse resume file"""
        file_ext = os.path.splitext(file_path)[1].lower()
        
        if file_ext not in self.parsers:
            logger.error(f"Unsupported file format: {file_ext}")
            return None
        
        try:
            return self.parsers[file_ext].parse(file_path)
        except Exception as e:
            logger.error(f"Error parsing resume {file_path}: {str(e)}")
            return None
    
    def extract_skills_advanced(self, text: str) -> List[str]:
        """Extract skills using NLP"""
        if not self.nlp:
            return []
        
        try:
            doc = self.nlp(text)
            
            # Extract noun chunks and named entities
            skills = []
            for chunk in doc.noun_chunks:
                if len(chunk.text.split()) <= 3:  # Keep short phrases
                    skills.append(chunk.text)
            
            # Extract organizations (might include companies/technologies)
            for ent in doc.ents:
                if ent.label_ in ['ORG', 'PRODUCT']:
                    skills.append(ent.text)
            
            return list(set(skills))
        except Exception as e:
            logger.error(f"Error in advanced skill extraction: {str(e)}")
            return []
    
    def calculate_resume_score(self, resume: ParsedResume, job_requirements: Dict[str, Any]) -> float:
        """Calculate resume-job match score"""
        score = 0.0
        
        # Skills matching
        if resume.skills and job_requirements.get('skills'):
            required_skills = set(job_requirements['skills'])
            resume_skills = set(resume.skills)
            skills_match = len(required_skills.intersection(resume_skills)) / len(required_skills)
            score += skills_match * 0.4
        
        # Experience matching
        if resume.total_experience_years and job_requirements.get('experience_years'):
            exp_years = resume.total_experience_years
            required_years = job_requirements['experience_years']
            exp_match = min(exp_years / required_years, 1.0)
            score += exp_match * 0.3
        
        # Education matching
        if resume.education and job_requirements.get('education_level'):
            # Simple education matching - could be enhanced
            education_match = 0.5  # Placeholder
            score += education_match * 0.2
        
        # Location matching
        if resume.location and job_requirements.get('location'):
            location_match = 0.5  # Placeholder - would need geocoding
            score += location_match * 0.1
        
        return min(score, 1.0)

# Usage example
if __name__ == "__main__":
    service = ResumeParserService()
    
    # Parse a resume
    resume = service.parse_resume("sample_resume.pdf")
    if resume:
        print(f"Parsed resume for: {resume.name}")
        print(f"Email: {resume.email}")
        print(f"Skills: {', '.join(resume.skills)}")
        print(f"Experience: {resume.total_experience_years} years")
