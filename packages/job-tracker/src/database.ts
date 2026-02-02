import Database from 'better-sqlite3';

export interface JobApplication {
  id: number;
  company: string;
  role: string;
  location?: string;
  type: 'targeted' | 'mass' | 'network';
  status: 'applied' | 'screening' | 'interview' | 'offer' | 'rejected' | 'ghosted';
  jobUrl?: string;
  applicationDate: string;
  lastUpdate: string;
  notes?: string;
  source?: string; // LinkedIn, company site, referral, etc.
  contactPerson?: string;
  salary?: string;
  remote: boolean;
}

export interface DailyStats {
  date: string;
  applicationsCount: number;
  targetApplications: number;
  goal: number;
}

export interface Analytics {
  totalApplications: number;
  byStatus: Record<string, number>;
  byType: Record<string, number>;
  responseRate: number;
  interviewRate: number;
  averageResponseTime?: number;
  recentActivity: DailyStats[];
}

class JobDatabase {
  private db: Database.Database;

  constructor(dbPath = '/app/state/job-tracker.db') {
    this.db = new Database(dbPath);
    this.initialize();
  }

  private initialize() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS applications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        company TEXT NOT NULL,
        role TEXT NOT NULL,
        location TEXT,
        type TEXT DEFAULT 'targeted',
        status TEXT DEFAULT 'applied',
        jobUrl TEXT,
        applicationDate TEXT NOT NULL,
        lastUpdate TEXT NOT NULL,
        notes TEXT,
        source TEXT,
        contactPerson TEXT,
        salary TEXT,
        remote INTEGER DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS daily_goals (
        date TEXT PRIMARY KEY,
        goal INTEGER DEFAULT 2
      );

      CREATE INDEX IF NOT EXISTS idx_status ON applications(status);
      CREATE INDEX IF NOT EXISTS idx_date ON applications(applicationDate);
    `);
  }

  // Applications CRUD
  createApplication(app: Omit<JobApplication, 'id'>): JobApplication {
    const stmt = this.db.prepare(`
      INSERT INTO applications
      (company, role, location, type, status, jobUrl, applicationDate, lastUpdate, notes, source, contactPerson, salary, remote)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      app.company,
      app.role,
      app.location || null,
      app.type,
      app.status,
      app.jobUrl || null,
      app.applicationDate,
      app.lastUpdate,
      app.notes || null,
      app.source || null,
      app.contactPerson || null,
      app.salary || null,
      app.remote ? 1 : 0
    );

    return this.getApplication(result.lastInsertRowid as number)!;
  }

  getApplication(id: number): JobApplication | undefined {
    const stmt = this.db.prepare('SELECT * FROM applications WHERE id = ?');
    const row = stmt.get(id) as any;
    if (!row) return undefined;
    return { ...row, remote: row.remote === 1 };
  }

  getAllApplications(filters?: {
    status?: string;
    type?: string;
    startDate?: string;
    endDate?: string;
  }): JobApplication[] {
    let query = 'SELECT * FROM applications WHERE 1=1';
    const params: any[] = [];

    if (filters?.status) {
      query += ' AND status = ?';
      params.push(filters.status);
    }
    if (filters?.type) {
      query += ' AND type = ?';
      params.push(filters.type);
    }
    if (filters?.startDate) {
      query += ' AND applicationDate >= ?';
      params.push(filters.startDate);
    }
    if (filters?.endDate) {
      query += ' AND applicationDate <= ?';
      params.push(filters.endDate);
    }

    query += ' ORDER BY applicationDate DESC';

    const stmt = this.db.prepare(query);
    const rows = stmt.all(...params) as any[];
    return rows.map(row => ({ ...row, remote: row.remote === 1 }));
  }

  updateApplication(id: number, updates: Partial<JobApplication>): JobApplication | undefined {
    const fields = Object.keys(updates).filter(k => k !== 'id');
    if (fields.length === 0) return this.getApplication(id);

    const setClause = fields.map(f => `${f} = ?`).join(', ');
    const values = fields.map(f => {
      const value = (updates as any)[f];
      if (f === 'remote') return value ? 1 : 0;
      return value;
    });

    const stmt = this.db.prepare(`
      UPDATE applications
      SET ${setClause}, lastUpdate = datetime('now')
      WHERE id = ?
    `);

    stmt.run(...values, id);
    return this.getApplication(id);
  }

  deleteApplication(id: number): boolean {
    const stmt = this.db.prepare('DELETE FROM applications WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  }

  // Analytics
  getAnalytics(): Analytics {
    const total = this.db.prepare('SELECT COUNT(*) as count FROM applications').get() as { count: number };

    const byStatus = this.db.prepare(`
      SELECT status, COUNT(*) as count
      FROM applications
      GROUP BY status
    `).all() as { status: string; count: number }[];

    const byType = this.db.prepare(`
      SELECT type, COUNT(*) as count
      FROM applications
      GROUP BY type
    `).all() as { type: string; count: number }[];

    const statusMap = Object.fromEntries(byStatus.map(s => [s.status, s.count]));
    const typeMap = Object.fromEntries(byType.map(t => [t.type, t.count]));

    const responded = (statusMap.screening || 0) + (statusMap.interview || 0) + (statusMap.offer || 0);
    const responseRate = total.count > 0 ? (responded / total.count) * 100 : 0;

    const interviewed = (statusMap.interview || 0) + (statusMap.offer || 0);
    const interviewRate = total.count > 0 ? (interviewed / total.count) * 100 : 0;

    // Recent activity (last 30 days)
    const recentActivity = this.db.prepare(`
      SELECT
        DATE(applicationDate) as date,
        COUNT(*) as applicationsCount
      FROM applications
      WHERE applicationDate >= DATE('now', '-30 days')
      GROUP BY DATE(applicationDate)
      ORDER BY date DESC
    `).all() as { date: string; applicationsCount: number }[];

    const activityWithGoals: DailyStats[] = recentActivity.map(activity => ({
      date: activity.date,
      applicationsCount: activity.applicationsCount,
      targetApplications: activity.applicationsCount,
      goal: 2 // Default goal
    }));

    return {
      totalApplications: total.count,
      byStatus: statusMap,
      byType: typeMap,
      responseRate,
      interviewRate,
      recentActivity: activityWithGoals
    };
  }

  close() {
    this.db.close();
  }
}

export default JobDatabase;
