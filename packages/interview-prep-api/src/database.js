import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { mkdirSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Ensure data directory exists
const dataDir = join(__dirname, '../data');
mkdirSync(dataDir, { recursive: true });

const db = new Database(join(dataDir, 'interview-prep.db'));

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS system_design_topics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    confidence INTEGER DEFAULT 3,
    last_studied DATE,
    next_review DATE,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS study_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    topic_id INTEGER,
    date DATE NOT NULL,
    duration_minutes INTEGER,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (topic_id) REFERENCES system_design_topics(id)
  );

  CREATE TABLE IF NOT EXISTS algorithm_problems (
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

  CREATE TABLE IF NOT EXISTS interview_questions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    topic_id INTEGER,
    question TEXT NOT NULL,
    expected_topics TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (topic_id) REFERENCES system_design_topics(id)
  );
`);

// Seed data function
function seedData() {
  const topicCount = db.prepare('SELECT COUNT(*) as count FROM system_design_topics').get();

  if (topicCount.count === 0) {
    console.log('Seeding database with initial data...');

    // System Design Topics
    const topics = [
      // Distributed Systems
      { name: 'CAP Theorem', category: 'Distributed Systems', confidence: 3 },
      { name: 'Consensus Algorithms (Paxos, Raft)', category: 'Distributed Systems', confidence: 3 },
      { name: 'Consistent Hashing', category: 'Distributed Systems', confidence: 3 },
      { name: 'Gossip Protocol', category: 'Distributed Systems', confidence: 3 },
      { name: 'Vector Clocks', category: 'Distributed Systems', confidence: 3 },

      // Databases
      { name: 'SQL vs NoSQL', category: 'Databases', confidence: 3 },
      { name: 'Database Sharding', category: 'Databases', confidence: 3 },
      { name: 'Replication Strategies', category: 'Databases', confidence: 3 },
      { name: 'Indexing', category: 'Databases', confidence: 3 },
      { name: 'Transactions & ACID', category: 'Databases', confidence: 3 },

      // Caching
      { name: 'Cache Strategies (LRU, LFU)', category: 'Caching', confidence: 3 },
      { name: 'CDN Architecture', category: 'Caching', confidence: 3 },
      { name: 'Cache Invalidation', category: 'Caching', confidence: 3 },
      { name: 'Redis Architecture', category: 'Caching', confidence: 3 },

      // Scalability
      { name: 'Load Balancing Algorithms', category: 'Scalability', confidence: 3 },
      { name: 'Horizontal vs Vertical Scaling', category: 'Scalability', confidence: 3 },
      { name: 'Auto-scaling', category: 'Scalability', confidence: 3 },

      // Message Queues
      { name: 'Message Queue Patterns', category: 'Message Queues', confidence: 3 },
      { name: 'Kafka Architecture', category: 'Message Queues', confidence: 3 },
      { name: 'Event Sourcing', category: 'Message Queues', confidence: 3 },

      // API Design
      { name: 'REST API Design', category: 'API Design', confidence: 3 },
      { name: 'GraphQL vs REST', category: 'API Design', confidence: 3 },
      { name: 'gRPC & Protocol Buffers', category: 'API Design', confidence: 3 },
      { name: 'Rate Limiting', category: 'API Design', confidence: 3 },

      // Security
      { name: 'Authentication (OAuth, JWT)', category: 'Security', confidence: 3 },
      { name: 'Encryption (TLS, at rest)', category: 'Security', confidence: 3 },
      { name: 'DDoS Protection', category: 'Security', confidence: 3 },

      // Monitoring
      { name: 'Metrics & Logging', category: 'Monitoring', confidence: 3 },
      { name: 'Distributed Tracing', category: 'Monitoring', confidence: 3 },
      { name: 'Alerting Systems', category: 'Monitoring', confidence: 3 }
    ];

    const insertTopic = db.prepare(
      'INSERT INTO system_design_topics (name, category, confidence) VALUES (?, ?, ?)'
    );

    for (const topic of topics) {
      insertTopic.run(topic.name, topic.category, topic.confidence);
    }

    // Algorithm Categories (as placeholder problems)
    const algorithms = [
      { title: 'Two Sum', category: 'Arrays & Strings', difficulty: 'Easy', status: 'unsolved' },
      { title: 'Reverse Linked List', category: 'Linked Lists', difficulty: 'Easy', status: 'unsolved' },
      { title: 'Binary Tree Inorder Traversal', category: 'Trees', difficulty: 'Easy', status: 'unsolved' },
      { title: 'Number of Islands', category: 'Graphs', difficulty: 'Medium', status: 'unsolved' },
      { title: 'Longest Increasing Subsequence', category: 'Dynamic Programming', difficulty: 'Medium', status: 'unsolved' },
      { title: 'Valid Parentheses', category: 'Stacks & Queues', difficulty: 'Easy', status: 'unsolved' },
      { title: 'Merge K Sorted Lists', category: 'Heaps', difficulty: 'Hard', status: 'unsolved' },
      { title: 'Word Search', category: 'Backtracking', difficulty: 'Medium', status: 'unsolved' },
      { title: 'Sliding Window Maximum', category: 'Sliding Window', difficulty: 'Hard', status: 'unsolved' },
      { title: 'Course Schedule', category: 'Topological Sort', difficulty: 'Medium', status: 'unsolved' }
    ];

    const insertProblem = db.prepare(
      'INSERT INTO algorithm_problems (title, category, difficulty, status) VALUES (?, ?, ?, ?)'
    );

    for (const algo of algorithms) {
      insertProblem.run(algo.title, algo.category, algo.difficulty, algo.status);
    }

    // Interview Questions
    const questions = [
      { topic_id: 1, question: 'Design Twitter', expected_topics: 'Scalability, Caching, Database, Timeline Generation' },
      { topic_id: 1, question: 'Design URL Shortener', expected_topics: 'Hashing, Database Design, Scalability' },
      { topic_id: 1, question: 'Design Rate Limiter', expected_topics: 'Token Bucket, Sliding Window, Distributed Systems' },
      { topic_id: 1, question: 'Design Chat System (WhatsApp)', expected_topics: 'WebSockets, Message Queues, Presence' },
      { topic_id: 1, question: 'Design Video Streaming (YouTube)', expected_topics: 'CDN, Encoding, Storage, Recommendations' },
      { topic_id: 6, question: 'Design Instagram', expected_topics: 'Image Storage, Feed Generation, Caching, Sharding' },
      { topic_id: 6, question: 'Design Uber', expected_topics: 'Geospatial Indexing, Matching Algorithm, ETA Calculation' },
      { topic_id: 6, question: 'Design Web Crawler', expected_topics: 'DFS/BFS, Politeness, URL Frontier, Deduplication' },
      { topic_id: 15, question: 'Design Notification System', expected_topics: 'Message Queues, Fan-out, Rate Limiting' },
      { topic_id: 15, question: 'Design Search Autocomplete', expected_topics: 'Trie, Caching, Real-time Processing' }
    ];

    const insertQuestion = db.prepare(
      'INSERT INTO interview_questions (topic_id, question, expected_topics) VALUES (?, ?, ?)'
    );

    for (const q of questions) {
      insertQuestion.run(q.topic_id, q.question, q.expected_topics);
    }

    console.log('Database seeded successfully!');
  }
}

// Initialize seed data
seedData();

export default db;
