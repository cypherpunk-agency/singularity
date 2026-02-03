import { useState, useEffect } from 'react';
import { Play, Plus, X, TrendingUp, Calendar, BookOpen, Target } from 'lucide-react';

const API_URL = '/api/interview';

interface Topic {
  id: number;
  name: string;
  category: string;
  confidence: number;
  last_studied: string | null;
  next_review: string | null;
  notes: string | null;
}

interface StudySession {
  id?: number;
  topic_id: number;
  date: string;
  duration_minutes: number;
  notes: string;
  topic_name?: string;
  topic_category?: string;
}

interface Problem {
  id: number;
  title: string;
  category: string;
  difficulty: string;
  status: string;
  time_complexity: string | null;
  space_complexity: string | null;
  notes: string | null;
  last_attempted: string | null;
}

interface Analytics {
  topics: {
    by_category: Array<{ category: string; count: number; avg_confidence: number }>;
    confidence_distribution: Array<{ confidence: number; count: number }>;
    total: number;
    weak_areas: Topic[];
  };
  study_time: {
    last_7_days: number;
    last_30_days: number;
    all_time: number;
    daily_breakdown: Array<{ date: string; total_minutes: number }>;
  };
  sessions: {
    recent: StudySession[];
    total: number;
  };
  problems: {
    by_difficulty_status: Array<{ difficulty: string; status: string; count: number }>;
    by_category: Array<{ category: string; count: number }>;
    total: number;
  };
  needs_review: Topic[];
}

export function InterviewPrep() {
  const [view, setView] = useState<'dashboard' | 'topics' | 'sessions' | 'problems'>('dashboard');
  const [topics, setTopics] = useState<Topic[]>([]);
  const [problems, setProblems] = useState<Problem[]>([]);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [showAddSession, setShowAddSession] = useState(false);
  const [sessionForm, setSessionForm] = useState<StudySession>({
    topic_id: 0,
    date: new Date().toISOString().split('T')[0],
    duration_minutes: 60,
    notes: ''
  });

  useEffect(() => {
    loadTopics();
    loadProblems();
    loadAnalytics();
  }, []);

  const loadTopics = async () => {
    const res = await fetch(`${API_URL}/topics`);
    const data = await res.json();
    setTopics(data);
  };

  const loadProblems = async () => {
    const res = await fetch(`${API_URL}/problems`);
    const data = await res.json();
    setProblems(data);
  };

  const loadAnalytics = async () => {
    const res = await fetch(`${API_URL}/analytics`);
    const data = await res.json();
    setAnalytics(data);
  };

  const updateTopicConfidence = async (topicId: number, newConfidence: number) => {
    await fetch(`${API_URL}/topics/${topicId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confidence: newConfidence })
    });
    loadTopics();
    loadAnalytics();
  };

  const addStudySession = async () => {
    if (!sessionForm.topic_id || !sessionForm.duration_minutes) return;

    await fetch(`${API_URL}/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(sessionForm)
    });

    setShowAddSession(false);
    setSessionForm({
      topic_id: 0,
      date: new Date().toISOString().split('T')[0],
      duration_minutes: 60,
      notes: ''
    });
    loadAnalytics();
    loadTopics();
  };

  const updateProblemStatus = async (problemId: number, newStatus: string) => {
    await fetch(`${API_URL}/problems/${problemId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: newStatus,
        last_attempted: new Date().toISOString().split('T')[0]
      })
    });
    loadProblems();
    loadAnalytics();
  };

  const groupTopicsByCategory = () => {
    const grouped: Record<string, Topic[]> = {};
    topics.forEach(topic => {
      if (!grouped[topic.category]) grouped[topic.category] = [];
      grouped[topic.category].push(topic);
    });
    return grouped;
  };

  const renderDashboard = () => {
    if (!analytics) return <div className="p-4 text-slate-400">Loading...</div>;

    return (
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-white">Interview Prep Dashboard</h1>
          <button
            onClick={() => setShowAddSession(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            <Plus className="w-4 h-4" />
            Log Study Session
          </button>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
            <div className="flex items-center gap-3">
              <Calendar className="w-8 h-8 text-blue-400" />
              <div>
                <div className="text-sm text-slate-400">Last 7 Days</div>
                <div className="text-2xl font-bold text-white">{Math.floor(analytics.study_time.last_7_days / 60)}h {analytics.study_time.last_7_days % 60}m</div>
              </div>
            </div>
          </div>

          <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
            <div className="flex items-center gap-3">
              <BookOpen className="w-8 h-8 text-green-400" />
              <div>
                <div className="text-sm text-slate-400">Topics Covered</div>
                <div className="text-2xl font-bold text-white">{topics.filter(t => t.last_studied).length}/{analytics.topics.total}</div>
              </div>
            </div>
          </div>

          <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
            <div className="flex items-center gap-3">
              <Target className="w-8 h-8 text-purple-400" />
              <div>
                <div className="text-sm text-slate-400">Problems Solved</div>
                <div className="text-2xl font-bold text-white">
                  {problems.filter(p => p.status === 'solved').length}/{analytics.problems.total}
                </div>
              </div>
            </div>
          </div>

          <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
            <div className="flex items-center gap-3">
              <TrendingUp className="w-8 h-8 text-orange-400" />
              <div>
                <div className="text-sm text-slate-400">Need Review</div>
                <div className="text-2xl font-bold text-white">{analytics.needs_review.length}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Needs Review */}
        {analytics.needs_review.length > 0 && (
          <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
            <h2 className="text-xl font-bold mb-4 text-white">Topics Needing Review</h2>
            <div className="space-y-2">
              {analytics.needs_review.slice(0, 5).map(topic => (
                <div key={topic.id} className="flex items-center justify-between p-3 bg-orange-500/10 rounded-lg border border-orange-500/20">
                  <div>
                    <div className="font-medium text-white">{topic.name}</div>
                    <div className="text-sm text-slate-400">{topic.category}</div>
                  </div>
                  <div className="text-sm text-orange-400">
                    {topic.next_review ? `Due ${topic.next_review}` : 'Not yet studied'}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recent Sessions */}
        <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
          <h2 className="text-xl font-bold mb-4 text-white">Recent Study Sessions</h2>
          {analytics.sessions.recent.length === 0 ? (
            <p className="text-slate-400">No study sessions logged yet. Click "Log Study Session" to start tracking!</p>
          ) : (
            <div className="space-y-2">
              {analytics.sessions.recent.map(session => (
                <div key={session.id} className="flex items-center justify-between p-3 bg-slate-700/50 rounded-lg">
                  <div>
                    <div className="font-medium text-white">{session.topic_name}</div>
                    <div className="text-sm text-slate-400">{session.date}</div>
                  </div>
                  <div className="text-sm font-medium text-blue-400">
                    {session.duration_minutes} min
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderTopics = () => {
    const grouped = groupTopicsByCategory();

    return (
      <div className="p-6 space-y-6">
        <h1 className="text-2xl font-bold text-white">System Design Topics</h1>

        {Object.entries(grouped).map(([category, categoryTopics]) => (
          <div key={category} className="bg-slate-800 rounded-lg p-6 border border-slate-700">
            <h2 className="text-xl font-bold mb-4 text-white">{category}</h2>
            <div className="space-y-2">
              {categoryTopics.map(topic => (
                <div key={topic.id} className="flex items-center justify-between p-3 bg-slate-700/50 rounded-lg">
                  <div className="flex-1">
                    <div className="font-medium text-white">{topic.name}</div>
                    {topic.last_studied && (
                      <div className="text-sm text-slate-400">Last studied: {topic.last_studied}</div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {[1, 2, 3, 4, 5].map(level => (
                      <button
                        key={level}
                        onClick={() => updateTopicConfidence(topic.id, level)}
                        className={`w-8 h-8 rounded-full ${
                          topic.confidence >= level
                            ? 'bg-blue-600 text-white'
                            : 'bg-slate-600 text-slate-400'
                        } hover:bg-blue-500 hover:text-white transition-colors`}
                      >
                        {level}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  };

  const renderProblems = () => {
    const byCategory: Record<string, Problem[]> = {};
    problems.forEach(p => {
      if (!byCategory[p.category]) byCategory[p.category] = [];
      byCategory[p.category].push(p);
    });

    const statusColors: Record<string, string> = {
      unsolved: 'bg-slate-600 text-slate-300',
      attempted: 'bg-yellow-500/20 text-yellow-400',
      solved: 'bg-green-500/20 text-green-400'
    };

    const difficultyColors: Record<string, string> = {
      Easy: 'text-green-400',
      Medium: 'text-yellow-400',
      Hard: 'text-red-400'
    };

    return (
      <div className="p-6 space-y-6">
        <h1 className="text-2xl font-bold text-white">Algorithm Problems</h1>

        {Object.entries(byCategory).map(([category, categoryProblems]) => (
          <div key={category} className="bg-slate-800 rounded-lg p-6 border border-slate-700">
            <h2 className="text-xl font-bold mb-4 text-white">{category}</h2>
            <div className="space-y-2">
              {categoryProblems.map(problem => (
                <div key={problem.id} className="flex items-center justify-between p-3 bg-slate-700/50 rounded-lg">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-white">{problem.title}</span>
                      <span className={`text-sm font-medium ${difficultyColors[problem.difficulty]}`}>
                        {problem.difficulty}
                      </span>
                    </div>
                    {problem.last_attempted && (
                      <div className="text-sm text-slate-400">Last attempted: {problem.last_attempted}</div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <select
                      value={problem.status}
                      onChange={(e) => updateProblemStatus(problem.id, e.target.value)}
                      className={`px-3 py-1 rounded-full text-sm font-medium ${statusColors[problem.status]}`}
                    >
                      <option value="unsolved">Unsolved</option>
                      <option value="attempted">Attempted</option>
                      <option value="solved">Solved</option>
                    </select>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full bg-slate-900">
      {/* Navigation */}
      <div className="bg-slate-800 border-b border-slate-700">
        <div className="flex gap-4 px-6 py-3">
          <button
            onClick={() => setView('dashboard')}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              view === 'dashboard'
                ? 'bg-blue-600 text-white'
                : 'text-slate-400 hover:bg-slate-700 hover:text-white'
            }`}
          >
            Dashboard
          </button>
          <button
            onClick={() => setView('topics')}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              view === 'topics'
                ? 'bg-blue-600 text-white'
                : 'text-slate-400 hover:bg-slate-700 hover:text-white'
            }`}
          >
            Topics
          </button>
          <button
            onClick={() => setView('problems')}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              view === 'problems'
                ? 'bg-blue-600 text-white'
                : 'text-slate-400 hover:bg-slate-700 hover:text-white'
            }`}
          >
            Problems
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {view === 'dashboard' && renderDashboard()}
        {view === 'topics' && renderTopics()}
        {view === 'problems' && renderProblems()}
      </div>

      {/* Add Session Modal */}
      {showAddSession && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 rounded-lg p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-white">Log Study Session</h2>
              <button onClick={() => setShowAddSession(false)}>
                <X className="w-6 h-6 text-slate-400 hover:text-white" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1">Topic</label>
                <select
                  value={sessionForm.topic_id}
                  onChange={(e) => setSessionForm({ ...sessionForm, topic_id: Number(e.target.value) })}
                  className="w-full px-3 py-2 bg-slate-700 text-white border border-slate-600 rounded-lg"
                >
                  <option value={0}>Select topic...</option>
                  {topics.map(topic => (
                    <option key={topic.id} value={topic.id}>
                      {topic.category} - {topic.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1">Date</label>
                <input
                  type="date"
                  value={sessionForm.date}
                  onChange={(e) => setSessionForm({ ...sessionForm, date: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-700 text-white border border-slate-600 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1">Duration (minutes)</label>
                <input
                  type="number"
                  value={sessionForm.duration_minutes}
                  onChange={(e) => setSessionForm({ ...sessionForm, duration_minutes: Number(e.target.value) })}
                  className="w-full px-3 py-2 bg-slate-700 text-white border border-slate-600 rounded-lg"
                  min={1}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1">Notes (optional)</label>
                <textarea
                  value={sessionForm.notes}
                  onChange={(e) => setSessionForm({ ...sessionForm, notes: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-700 text-white border border-slate-600 rounded-lg placeholder-slate-500"
                  rows={3}
                  placeholder="What did you learn? Any insights?"
                />
              </div>

              <div className="flex gap-2">
                <button
                  onClick={addStudySession}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  <Play className="w-4 h-4 inline mr-2" />
                  Save Session
                </button>
                <button
                  onClick={() => setShowAddSession(false)}
                  className="px-4 py-2 border border-slate-600 text-slate-300 rounded-lg hover:bg-slate-700"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
