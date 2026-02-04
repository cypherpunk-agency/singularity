# Interview Prep Command Center

A full-stack application built to help prepare for technical interviews, specifically designed for Tommi's Parity Technologies staff lead interview.

## Overview

This application provides a comprehensive toolkit for tracking interview preparation across two critical areas:

1. **System Design Topics** - 30+ curated topics across 8 categories
2. **Algorithm Problems** - Problem-solving tracker with difficulty levels and categories

## Features

### System Design Tracking
- **Topic Library**: 30 pre-populated topics across categories:
  - Distributed Systems (CAP theorem, Consensus, Consistent Hashing, etc.)
  - Databases (Sharding, Replication, Indexing, Transactions)
  - Caching (LRU/LFU, CDN, Redis, Cache Invalidation)
  - Scalability (Load Balancing, Horizontal/Vertical Scaling, Auto-scaling)
  - Message Queues (Kafka, Event Sourcing, Patterns)
  - API Design (REST, GraphQL, gRPC, Rate Limiting)
  - Security (OAuth/JWT, Encryption, DDoS Protection)
  - Monitoring (Metrics, Distributed Tracing, Alerting)

- **Confidence Tracking**: Rate your understanding (1-5 scale) for each topic
- **Spaced Repetition**: Automatic review scheduling based on confidence level
  - Confidence 1: Review in 1 day
  - Confidence 2: Review in 3 days
  - Confidence 3: Review in 7 days
  - Confidence 4: Review in 14 days
  - Confidence 5: Review in 30 days

### Study Session Logging
- Log study sessions with topic, date, duration, and notes
- Automatic last_studied date tracking
- Study time analytics (7 days, 30 days, all time)
- Daily breakdown visualization

### Algorithm Problem Tracker
- Track problems by category (Arrays, Trees, Graphs, DP, etc.)
- Difficulty levels (Easy, Medium, Hard)
- Status tracking (Unsolved, Attempted, Solved)
- Time/space complexity notes
- Last attempted date tracking

### Analytics Dashboard
- Topics needing review (overdue or never studied)
- Weak areas identification (low confidence topics)
- Study time statistics
- Recent sessions overview
- Problem-solving progress
- Confidence distribution visualization

### Interview Questions Bank
- 10+ common system design questions pre-populated
- Linked to relevant topics
- Expected discussion points for each question
- Random question selector for practice

## Tech Stack

### Backend
- **Framework**: Fastify (Node.js)
- **Database**: SQLite with better-sqlite3
- **Port**: 3003
- **API Style**: RESTful

### Frontend
- **Framework**: React + TypeScript
- **Build**: Vite
- **Styling**: Tailwind CSS
- **Integration**: Built into Singularity UI as `/interview` route

## API Endpoints

### Topics
- `GET /topics` - Get all system design topics
- `GET /topics/:id` - Get single topic
- `POST /topics` - Create new topic
- `PUT /topics/:id` - Update topic (confidence, notes, etc.)
- `DELETE /topics/:id` - Delete topic
- `GET /topics/category/:category` - Get topics by category
- `GET /categories` - Get all categories

### Study Sessions
- `GET /sessions` - Get all study sessions
- `GET /sessions/topic/:topicId` - Get sessions for specific topic
- `POST /sessions` - Log new study session (auto-updates topic review dates)
- `PUT /sessions/:id` - Update session
- `DELETE /sessions/:id` - Delete session

### Algorithm Problems
- `GET /problems` - Get all problems (supports query params: category, difficulty, status)
- `GET /problems/:id` - Get single problem
- `POST /problems` - Create new problem
- `PUT /problems/:id` - Update problem
- `DELETE /problems/:id` - Delete problem
- `GET /problem-categories` - Get all problem categories

### Analytics
- `GET /analytics` - Get comprehensive analytics
  - Topics by category with average confidence
  - Confidence distribution
  - Study time breakdown (7d, 30d, all time, daily)
  - Recent sessions
  - Problem statistics
  - Topics needing review
  - Weak areas
- `GET /questions` - Get all interview questions (optional topic_id filter)
- `GET /questions/random` - Get random interview question

### Health
- `GET /health` - Health check endpoint

## Database Schema

### system_design_topics
```sql
CREATE TABLE system_design_topics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  confidence INTEGER DEFAULT 3,
  last_studied DATE,
  next_review DATE,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### study_sessions
```sql
CREATE TABLE study_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  topic_id INTEGER,
  date DATE NOT NULL,
  duration_minutes INTEGER,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (topic_id) REFERENCES system_design_topics(id)
);
```

### algorithm_problems
```sql
CREATE TABLE algorithm_problems (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  difficulty TEXT NOT NULL,
  status TEXT DEFAULT 'unsolved',
  time_complexity TEXT,
  space_complexity TEXT,
  notes TEXT,
  last_attempted DATE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### interview_questions
```sql
CREATE TABLE interview_questions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  topic_id INTEGER,
  question TEXT NOT NULL,
  expected_topics TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (topic_id) REFERENCES system_design_topics(id)
);
```

## Getting Started

### Installation
```bash
cd /app/packages/interview-prep-api
npm install
```

### Running
```bash
npm start
```

The API will start on `http://localhost:3003`

### Development
```bash
npm run dev  # Uses --watch flag for auto-reload
```

## Data Management

### Automatic Seeding
On first run, the database is automatically seeded with:
- 30 system design topics across 8 categories
- 10 sample algorithm problems
- 10 common interview questions

### Database Location
`/app/packages/interview-prep-api/data/interview-prep.db`

## Usage Guide

### Logging a Study Session
1. Study a topic (e.g., "CAP Theorem" for 90 minutes)
2. Click "Log Study Session" in UI
3. Select topic, date, duration, add notes
4. System automatically:
   - Updates topic's `last_studied` date
   - Calculates `next_review` based on confidence level
   - Adds to study time statistics

### Updating Confidence
- Click confidence buttons (1-5) on any topic
- Higher confidence = longer review intervals
- System recalculates next review date

### Tracking Problems
- Update status: Unsolved → Attempted → Solved
- Add complexity notes (O(n), O(log n), etc.)
- Filter by category, difficulty, or status

### Using Analytics
- Check "Topics Needing Review" daily
- Focus on "Weak Areas" (confidence ≤ 2)
- Monitor study time trends
- Track problem-solving progress

## Pre-populated Content

### System Design Topics (30)
8 categories with 2-5 topics each covering all major interview areas

### Interview Questions (10)
Classic questions like:
- Design Twitter
- Design URL Shortener
- Design Rate Limiter
- Design Chat System
- Design Video Streaming Platform
- Design Instagram
- Design Uber
- Design Web Crawler
- Design Notification System
- Design Search Autocomplete

### Algorithm Problems (10)
Sample problems across categories:
- Arrays & Strings: Two Sum
- Linked Lists: Reverse Linked List
- Trees: Binary Tree Inorder Traversal
- Graphs: Number of Islands
- Dynamic Programming: Longest Increasing Subsequence
- Stacks & Queues: Valid Parentheses
- Heaps: Merge K Sorted Lists
- Backtracking: Word Search
- Sliding Window: Sliding Window Maximum
- Topological Sort: Course Schedule

## Future Enhancements

### Planned Features
1. **Mock Interview Mode**: Timed practice sessions with random questions
2. **Study Plan Generator**: AI-suggested weekly study schedule
3. **Flashcards**: Quick review mode for key concepts
4. **Video Resources**: Link topics to YouTube tutorials
5. **Progress Sharing**: Export progress reports
6. **Collaboration**: Share notes with study partners
7. **Mobile App**: React Native version for on-the-go study
8. **Notion Integration**: Sync with existing job tracker

### Potential Improvements
- Whiteboard drawing tool for system design diagrams
- Code editor for algorithm practice
- Video recording for mock interviews
- Peer review system
- Interview feedback logging
- Company-specific question banks
- Behavioral interview question tracker

## Integration with Singularity

This project is fully integrated into the Singularity control center:
- Accessible via `/interview` route
- Shares UI design language
- Runs as independent microservice
- Can be enhanced with agent capabilities (automated reminders, study suggestions)

## Built By

Singularity Agent - Night Project #2 (2026-02-02)

Built in 4 hours to support Tommi's interview preparation for Parity Technologies.

## License

MIT
