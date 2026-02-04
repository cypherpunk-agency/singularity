import db from '../database.js';

export default async function analyticsRoutes(fastify) {
  // Get overall analytics
  fastify.get('/analytics', async (request, reply) => {
    // Total topics by category
    const topicsByCategory = db.prepare(`
      SELECT category, COUNT(*) as count, AVG(confidence) as avg_confidence
      FROM system_design_topics
      GROUP BY category
      ORDER BY category
    `).all();

    // Confidence distribution
    const confidenceDistribution = db.prepare(`
      SELECT confidence, COUNT(*) as count
      FROM system_design_topics
      GROUP BY confidence
      ORDER BY confidence
    `).all();

    // Topics needing review (past next_review date or never studied)
    const needsReview = db.prepare(`
      SELECT * FROM system_design_topics
      WHERE (next_review IS NOT NULL AND next_review <= DATE('now'))
         OR (last_studied IS NULL)
      ORDER BY next_review ASC NULLS FIRST
      LIMIT 10
    `).all();

    // Recent study sessions
    const recentSessions = db.prepare(`
      SELECT s.*, t.name as topic_name, t.category as topic_category
      FROM study_sessions s
      LEFT JOIN system_design_topics t ON s.topic_id = t.id
      ORDER BY s.date DESC
      LIMIT 10
    `).all();

    // Total study time (last 7 days, 30 days, all time)
    const studyTime7Days = db.prepare(`
      SELECT COALESCE(SUM(duration_minutes), 0) as total_minutes
      FROM study_sessions
      WHERE date >= DATE('now', '-7 days')
    `).get();

    const studyTime30Days = db.prepare(`
      SELECT COALESCE(SUM(duration_minutes), 0) as total_minutes
      FROM study_sessions
      WHERE date >= DATE('now', '-30 days')
    `).get();

    const studyTimeAllTime = db.prepare(`
      SELECT COALESCE(SUM(duration_minutes), 0) as total_minutes
      FROM study_sessions
    `).get();

    // Daily study time (last 14 days)
    const dailyStudyTime = db.prepare(`
      SELECT date, SUM(duration_minutes) as total_minutes
      FROM study_sessions
      WHERE date >= DATE('now', '-14 days')
      GROUP BY date
      ORDER BY date DESC
    `).all();

    // Algorithm problem stats
    const problemStats = db.prepare(`
      SELECT
        difficulty,
        status,
        COUNT(*) as count
      FROM algorithm_problems
      GROUP BY difficulty, status
      ORDER BY difficulty, status
    `).all();

    const problemsByCategory = db.prepare(`
      SELECT category, COUNT(*) as count
      FROM algorithm_problems
      GROUP BY category
      ORDER BY category
    `).all();

    // Weak areas (low confidence topics not recently studied)
    const weakAreas = db.prepare(`
      SELECT * FROM system_design_topics
      WHERE confidence <= 2
      ORDER BY confidence ASC, last_studied ASC NULLS FIRST
      LIMIT 10
    `).all();

    return {
      topics: {
        by_category: topicsByCategory,
        confidence_distribution: confidenceDistribution,
        total: db.prepare('SELECT COUNT(*) as count FROM system_design_topics').get().count,
        weak_areas: weakAreas
      },
      study_time: {
        last_7_days: studyTime7Days.total_minutes,
        last_30_days: studyTime30Days.total_minutes,
        all_time: studyTimeAllTime.total_minutes,
        daily_breakdown: dailyStudyTime
      },
      sessions: {
        recent: recentSessions,
        total: db.prepare('SELECT COUNT(*) as count FROM study_sessions').get().count
      },
      problems: {
        by_difficulty_status: problemStats,
        by_category: problemsByCategory,
        total: db.prepare('SELECT COUNT(*) as count FROM algorithm_problems').get().count
      },
      needs_review: needsReview
    };
  });

  // Get questions for a topic
  fastify.get('/questions', async (request, reply) => {
    const { topic_id } = request.query;

    let query = `
      SELECT q.*, t.name as topic_name, t.category as topic_category
      FROM interview_questions q
      LEFT JOIN system_design_topics t ON q.topic_id = t.id
    `;

    const params = [];
    if (topic_id) {
      query += ' WHERE q.topic_id = ?';
      params.push(topic_id);
    }

    query += ' ORDER BY q.id';

    const questions = db.prepare(query).all(...params);
    return questions;
  });

  // Get random question
  fastify.get('/questions/random', async (request, reply) => {
    const question = db.prepare(`
      SELECT q.*, t.name as topic_name, t.category as topic_category
      FROM interview_questions q
      LEFT JOIN system_design_topics t ON q.topic_id = t.id
      ORDER BY RANDOM()
      LIMIT 1
    `).get();

    return question || { question: null };
  });
}
