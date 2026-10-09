"""
AI-Powered Matching Service for Recruitment Platform
Handles intelligent matching between candidates and job positions
"""

import os
import logging
from typing import Dict, List, Optional, Any, Tuple
from dataclasses import dataclass
from datetime import datetime
import json
import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
from sklearn.ensemble import RandomForestClassifier
from sklearn.preprocessing import StandardScaler
import pickle

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

@dataclass
class MatchResult:
    """Match result structure"""
    candidate_id: str
    job_id: str
    match_score: float
    match_factors: Dict[str, float]
    recommendations: List[str]
    confidence: float
    created_at: datetime

@dataclass
class CandidateProfile:
    """Candidate profile for matching"""
    id: str
    name: str
    skills: List[str]
    experience_years: float
    education_level: str
    job_titles: List[str]
    industries: List[str]
    location: str
    salary_expectation: Optional[float]
    resume_text: str
    work_history: List[Dict[str, Any]]

@dataclass
class JobProfile:
    """Job profile for matching"""
    id: str
    title: str
    description: str
    required_skills: List[str]
    experience_years: float
    education_level: str
    industry: str
    location: str
    salary_range: Tuple[float, float]
    company: str

class FeatureExtractor:
    """Extract features for matching"""
    
    def __init__(self):
        self.tfidf_vectorizer = TfidfVectorizer(
            max_features=1000,
            stop_words='english',
            ngram_range=(1, 2)
        )
        self.is_fitted = False
    
    def fit(self, documents: List[str]):
        """Fit TF-IDF vectorizer on documents"""
        self.tfidf_vectorizer.fit(documents)
        self.is_fitted = True
    
    def transform(self, documents: List[str]) -> np.ndarray:
        """Transform documents to TF-IDF vectors"""
        if not self.is_fitted:
            raise ValueError("Vectorizer not fitted. Call fit() first.")
        
        return self.tfidf_vectorizer.transform(documents).toarray()
    
    def extract_features(self, candidate: CandidateProfile, job: JobProfile) -> Dict[str, float]:
        """Extract features for candidate-job pair"""
        features = {}
        
        # Skills similarity
        skills_similarity = self._calculate_skills_similarity(candidate.skills, job.required_skills)
        features['skills_similarity'] = skills_similarity
        
        # Experience match
        experience_match = self._calculate_experience_match(candidate.experience_years, job.experience_years)
        features['experience_match'] = experience_match
        
        # Education match
        education_match = self._calculate_education_match(candidate.education_level, job.education_level)
        features['education_match'] = education_match
        
        # Location match
        location_match = self._calculate_location_match(candidate.location, job.location)
        features['location_match'] = location_match
        
        # Salary match
        salary_match = self._calculate_salary_match(candidate.salary_expectation, job.salary_range)
        features['salary_match'] = salary_match
        
        # Title similarity
        title_similarity = self._calculate_title_similarity(candidate.job_titles, job.title)
        features['title_similarity'] = title_similarity
        
        # Industry match
        industry_match = self._calculate_industry_match(candidate.industries, job.industry)
        features['industry_match'] = industry_match
        
        # Text similarity using TF-IDF
        text_similarity = self._calculate_text_similarity(candidate.resume_text, job.description)
        features['text_similarity'] = text_similarity
        
        return features
    
    def _calculate_skills_similarity(self, candidate_skills: List[str], required_skills: List[str]) -> float:
        """Calculate skills similarity using Jaccard index"""
        if not candidate_skills or not required_skills:
            return 0.0
        
        candidate_set = set([skill.lower().strip() for skill in candidate_skills])
        required_set = set([skill.lower().strip() for skill in required_skills])
        
        intersection = len(candidate_set.intersection(required_set))
        union = len(candidate_set.union(required_set))
        
        return intersection / union if union > 0 else 0.0
    
    def _calculate_experience_match(self, candidate_exp: float, required_exp: float) -> float:
        """Calculate experience match"""
        if candidate_exp >= required_exp:
            return 1.0
        else:
            return candidate_exp / required_exp if required_exp > 0 else 0.0
    
    def _calculate_education_match(self, candidate_edu: str, required_edu: str) -> float:
        """Calculate education match"""
        education_levels = {
            'high school': 1,
            'associate': 2,
            'bachelor': 3,
            'master': 4,
            'phd': 5,
            'doctorate': 5
        }
        
        candidate_level = education_levels.get(candidate_edu.lower(), 0)
        required_level = education_levels.get(required_edu.lower(), 0)
        
        if candidate_level >= required_level:
            return 1.0
        else:
            return candidate_level / required_level if required_level > 0 else 0.0
    
    def _calculate_location_match(self, candidate_loc: str, job_loc: str) -> float:
        """Calculate location match"""
        if not candidate_loc or not job_loc:
            return 0.0
        
        candidate_loc = candidate_loc.lower().strip()
        job_loc = job_loc.lower().strip()
        
        # Exact match
        if candidate_loc == job_loc:
            return 1.0
        
        # Same city
        if candidate_loc.split(',')[0] == job_loc.split(',')[0]:
            return 0.8
        
        # Same state
        if len(candidate_loc.split(',')) > 1 and len(job_loc.split(',')) > 1:
            if candidate_loc.split(',')[1].strip() == job_loc.split(',')[1].strip():
                return 0.6
        
        return 0.0
    
    def _calculate_salary_match(self, candidate_salary: Optional[float], job_salary_range: Tuple[float, float]) -> float:
        """Calculate salary match"""
        if not candidate_salary or not job_salary_range:
            return 0.5  # Neutral score if no data
        
        min_salary, max_salary = job_salary_range
        
        if candidate_salary < min_salary:
            return candidate_salary / min_salary
        elif candidate_salary > max_salary:
            return max_salary / candidate_salary
        else:
            return 1.0
    
    def _calculate_title_similarity(self, candidate_titles: List[str], job_title: str) -> float:
        """Calculate title similarity"""
        if not candidate_titles or not job_title:
            return 0.0
        
        job_title = job_title.lower().strip()
        
        # Check for exact or partial matches
        for title in candidate_titles:
            title = title.lower().strip()
            if job_title == title:
                return 1.0
            elif job_title in title or title in job_title:
                return 0.7
            elif any(word in title for word in job_title.split()):
                return 0.5
        
        return 0.0
    
    def _calculate_industry_match(self, candidate_industries: List[str], job_industry: str) -> float:
        """Calculate industry match"""
        if not candidate_industries or not job_industry:
            return 0.0
        
        job_industry = job_industry.lower().strip()
        candidate_industries = [ind.lower().strip() for ind in candidate_industries]
        
        return 1.0 if job_industry in candidate_industries else 0.0
    
    def _calculate_text_similarity(self, resume_text: str, job_description: str) -> float:
        """Calculate text similarity using TF-IDF"""
        if not resume_text or not job_description:
            return 0.0
        
        try:
            documents = [resume_text, job_description]
            tfidf_matrix = self.tfidf_vectorizer.transform(documents)
            similarity = cosine_similarity(tfidf_matrix[0:1], tfidf_matrix[1:2])[0][0]
            return float(similarity)
        except Exception as e:
            logger.error(f"Error calculating text similarity: {str(e)}")
            return 0.0

class MatchingModel:
    """Machine learning model for matching"""
    
    def __init__(self):
        self.model = RandomForestClassifier(n_estimators=100, random_state=42)
        self.scaler = StandardScaler()
        self.is_trained = False
    
    def train(self, X: np.ndarray, y: np.ndarray):
        """Train the matching model"""
        try:
            # Scale features
            X_scaled = self.scaler.fit_transform(X)
            
            # Train model
            self.model.fit(X_scaled, y)
            self.is_trained = True
            
            logger.info("Matching model trained successfully")
        except Exception as e:
            logger.error(f"Error training model: {str(e)}")
    
    def predict_match(self, features: Dict[str, float]) -> float:
        """Predict match probability"""
        if not self.is_trained:
            return self._calculate_rule_based_score(features)
        
        try:
            # Convert features to array
            feature_names = ['skills_similarity', 'experience_match', 'education_match', 
                           'location_match', 'salary_match', 'title_similarity', 
                           'industry_match', 'text_similarity']
            
            feature_values = [features.get(name, 0.0) for name in feature_names]
            feature_array = np.array(feature_values).reshape(1, -1)
            
            # Scale features
            feature_scaled = self.scaler.transform(feature_array)
            
            # Predict probability
            probability = self.model.predict_proba(feature_scaled)[0][1]
            return float(probability)
            
        except Exception as e:
            logger.error(f"Error predicting match: {str(e)}")
            return self._calculate_rule_based_score(features)
    
    def _calculate_rule_based_score(self, features: Dict[str, float]) -> float:
        """Calculate rule-based match score"""
        weights = {
            'skills_similarity': 0.3,
            'experience_match': 0.2,
            'education_match': 0.1,
            'location_match': 0.1,
            'salary_match': 0.1,
            'title_similarity': 0.1,
            'industry_match': 0.05,
            'text_similarity': 0.05
        }
        
        score = 0.0
        for feature_name, weight in weights.items():
            score += features.get(feature_name, 0.0) * weight
        
        return min(score, 1.0)
    
    def save_model(self, filepath: str):
        """Save trained model"""
        if self.is_trained:
            with open(filepath, 'wb') as f:
                pickle.dump({
                    'model': self.model,
                    'scaler': self.scaler,
                    'is_trained': self.is_trained
                }, f)
    
    def load_model(self, filepath: str):
        """Load trained model"""
        try:
            with open(filepath, 'rb') as f:
                data = pickle.load(f)
                self.model = data['model']
                self.scaler = data['scaler']
                self.is_trained = data['is_trained']
            logger.info("Model loaded successfully")
        except Exception as e:
            logger.error(f"Error loading model: {str(e)}")

class MatchingService:
    """Main matching service"""
    
    def __init__(self):
        self.feature_extractor = FeatureExtractor()
        self.matching_model = MatchingModel()
        self._setup_model()
    
    def _setup_model(self):
        """Setup the matching model"""
        model_path = os.getenv('MATCHING_MODEL_PATH', 'models/matching_model.pkl')
        
        if os.path.exists(model_path):
            self.matching_model.load_model(model_path)
        else:
            # Initialize with rule-based scoring
            logger.info("Using rule-based matching (no trained model found)")
    
    def match_candidate_to_job(self, candidate: CandidateProfile, job: JobProfile) -> MatchResult:
        """Match candidate to job"""
        try:
            # Extract features
            features = self.feature_extractor.extract_features(candidate, job)
            
            # Calculate match score
            match_score = self.matching_model.predict_match(features)
            
            # Generate recommendations
            recommendations = self._generate_recommendations(features, candidate, job)
            
            # Calculate confidence
            confidence = self._calculate_confidence(features)
            
            return MatchResult(
                candidate_id=candidate.id,
                job_id=job.id,
                match_score=match_score,
                match_factors=features,
                recommendations=recommendations,
                confidence=confidence,
                created_at=datetime.utcnow()
            )
            
        except Exception as e:
            logger.error(f"Error matching candidate {candidate.id} to job {job.id}: {str(e)}")
            return MatchResult(
                candidate_id=candidate.id,
                job_id=job.id,
                match_score=0.0,
                match_factors={},
                recommendations=[],
                confidence=0.0,
                created_at=datetime.utcnow()
            )
    
    def find_matches_for_job(self, job: JobProfile, candidates: List[CandidateProfile], 
                           top_k: int = 10) -> List[MatchResult]:
        """Find top matches for a job"""
        matches = []
        
        for candidate in candidates:
            match_result = self.match_candidate_to_job(candidate, job)
            matches.append(match_result)
        
        # Sort by match score and confidence
        matches.sort(key=lambda x: (x.match_score * x.confidence), reverse=True)
        
        return matches[:top_k]
    
    def find_matches_for_candidate(self, candidate: CandidateProfile, jobs: List[JobProfile], 
                                 top_k: int = 10) -> List[MatchResult]:
        """Find top matches for a candidate"""
        matches = []
        
        for job in jobs:
            match_result = self.match_candidate_to_job(candidate, job)
            matches.append(match_result)
        
        # Sort by match score and confidence
        matches.sort(key=lambda x: (x.match_score * x.confidence), reverse=True)
        
        return matches[:top_k]
    
    def _generate_recommendations(self, features: Dict[str, float], candidate: CandidateProfile, 
                                job: JobProfile) -> List[str]:
        """Generate recommendations based on match factors"""
        recommendations = []
        
        # Skills recommendations
        if features.get('skills_similarity', 0) < 0.5:
            missing_skills = set(job.required_skills) - set(candidate.skills)
            if missing_skills:
                recommendations.append(f"Consider developing skills: {', '.join(list(missing_skills)[:3])}")
        
        # Experience recommendations
        if features.get('experience_match', 0) < 0.8:
            recommendations.append(f"Experience requirement: {job.experience_years} years (you have {candidate.experience_years})")
        
        # Education recommendations
        if features.get('education_match', 0) < 0.8:
            recommendations.append(f"Education level: {job.education_level} required")
        
        # Location recommendations
        if features.get('location_match', 0) < 0.5:
            recommendations.append(f"Location mismatch: Job in {job.location}, candidate in {candidate.location}")
        
        # Salary recommendations
        if features.get('salary_match', 0) < 0.5:
            recommendations.append(f"Salary expectations may not align with job range")
        
        return recommendations
    
    def _calculate_confidence(self, features: Dict[str, float]) -> float:
        """Calculate confidence in match score"""
        # Check data completeness
        feature_count = sum(1 for v in features.values() if v > 0)
        total_features = len(features)
        completeness = feature_count / total_features if total_features > 0 else 0
        
        # Check feature consistency
        high_features = sum(1 for v in features.values() if v > 0.7)
        consistency = high_features / total_features if total_features > 0 else 0
        
        # Combine completeness and consistency
        confidence = (completeness + consistency) / 2
        
        return confidence
    
    def train_model(self, training_data: List[Dict[str, Any]]):
        """Train the matching model with historical data"""
        try:
            # Prepare training data
            X = []
            y = []
            
            for data_point in training_data:
                features = data_point['features']
                label = data_point['label']  # 1 for good match, 0 for bad match
                
                # Convert features to array
                feature_names = ['skills_similarity', 'experience_match', 'education_match', 
                               'location_match', 'salary_match', 'title_similarity', 
                               'industry_match', 'text_similarity']
                
                feature_values = [features.get(name, 0.0) for name in feature_names]
                X.append(feature_values)
                y.append(label)
            
            # Train model
            X_array = np.array(X)
            y_array = np.array(y)
            
            self.matching_model.train(X_array, y_array)
            
            # Save model
            model_path = os.getenv('MATCHING_MODEL_PATH', 'models/matching_model.pkl')
            os.makedirs(os.path.dirname(model_path), exist_ok=True)
            self.matching_model.save_model(model_path)
            
            logger.info("Model training completed successfully")
            
        except Exception as e:
            logger.error(f"Error training model: {str(e)}")

# Usage example
if __name__ == "__main__":
    service = MatchingService()
    
    # Example candidate and job
    candidate = CandidateProfile(
        id="1",
        name="John Doe",
        skills=["Python", "JavaScript", "React", "SQL"],
        experience_years=5.0,
        education_level="bachelor",
        job_titles=["Software Engineer", "Full Stack Developer"],
        industries=["Technology", "Software"],
        location="San Francisco, CA",
        salary_expectation=120000,
        resume_text="Experienced software developer with expertise in Python and JavaScript...",
        work_history=[]
    )
    
    job = JobProfile(
        id="1",
        title="Senior Software Engineer",
        description="Looking for an experienced software engineer...",
        required_skills=["Python", "JavaScript", "React", "SQL"],
        experience_years=3.0,
        education_level="bachelor",
        industry="Technology",
        location="San Francisco, CA",
        salary_range=(100000, 150000),
        company="Tech Corp"
    )
    
    # Match candidate to job
    match_result = service.match_candidate_to_job(candidate, job)
    print(f"Match Score: {match_result.match_score:.2f}")
    print(f"Confidence: {match_result.confidence:.2f}")
    print(f"Recommendations: {match_result.recommendations}")
