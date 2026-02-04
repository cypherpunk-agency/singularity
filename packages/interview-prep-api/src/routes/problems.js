import db from '../database.js';

export default async function problemsRoutes(fastify) {
  // Get all algorithm problems
  fastify.get('/problems', async (request, reply) => {
    const { category, difficulty, status } = request.query;

    let query = 'SELECT * FROM algorithm_problems WHERE 1=1';
    const params = [];

    if (category) {
      query += ' AND category = ?';
      params.push(category);
    }
    if (difficulty) {
      query += ' AND difficulty = ?';
      params.push(difficulty);
    }
    if (status) {
      query += ' AND status = ?';
      params.push(status);
    }

    query += ' ORDER BY category, difficulty, title';

    const problems = db.prepare(query).all(...params);
    return problems;
  });

  // Get single problem
  fastify.get('/problems/:id', async (request, reply) => {
    const { id } = request.params;
    const problem = db.prepare('SELECT * FROM algorithm_problems WHERE id = ?').get(id);
    if (!problem) {
      return reply.code(404).send({ error: 'Problem not found' });
    }
    return problem;
  });

  // Create problem
  fastify.post('/problems', async (request, reply) => {
    const { title, category, difficulty, status, time_complexity, space_complexity, notes } = request.body;

    const result = db.prepare(`
      INSERT INTO algorithm_problems
      (title, category, difficulty, status, time_complexity, space_complexity, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      title,
      category,
      difficulty,
      status || 'unsolved',
      time_complexity || null,
      space_complexity || null,
      notes || null
    );

    const problem = db.prepare('SELECT * FROM algorithm_problems WHERE id = ?').get(result.lastInsertRowid);
    return reply.code(201).send(problem);
  });

  // Update problem
  fastify.put('/problems/:id', async (request, reply) => {
    const { id } = request.params;
    const { title, category, difficulty, status, time_complexity, space_complexity, notes, last_attempted } = request.body;

    const updates = [];
    const values = [];

    if (title !== undefined) {
      updates.push('title = ?');
      values.push(title);
    }
    if (category !== undefined) {
      updates.push('category = ?');
      values.push(category);
    }
    if (difficulty !== undefined) {
      updates.push('difficulty = ?');
      values.push(difficulty);
    }
    if (status !== undefined) {
      updates.push('status = ?');
      values.push(status);
    }
    if (time_complexity !== undefined) {
      updates.push('time_complexity = ?');
      values.push(time_complexity);
    }
    if (space_complexity !== undefined) {
      updates.push('space_complexity = ?');
      values.push(space_complexity);
    }
    if (notes !== undefined) {
      updates.push('notes = ?');
      values.push(notes);
    }
    if (last_attempted !== undefined) {
      updates.push('last_attempted = ?');
      values.push(last_attempted);
    }

    if (updates.length === 0) {
      return reply.code(400).send({ error: 'No updates provided' });
    }

    values.push(id);
    db.prepare(`UPDATE algorithm_problems SET ${updates.join(', ')} WHERE id = ?`).run(...values);

    const problem = db.prepare('SELECT * FROM algorithm_problems WHERE id = ?').get(id);
    return problem;
  });

  // Delete problem
  fastify.delete('/problems/:id', async (request, reply) => {
    const { id } = request.params;
    db.prepare('DELETE FROM algorithm_problems WHERE id = ?').run(id);
    return { success: true };
  });

  // Get all problem categories
  fastify.get('/problem-categories', async (request, reply) => {
    const categories = db.prepare('SELECT DISTINCT category FROM algorithm_problems ORDER BY category').all();
    return categories.map(c => c.category);
  });
}
