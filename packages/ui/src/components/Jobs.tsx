import { useEffect, useState } from 'react';
import { JobApplication, JobAnalytics } from '@singularity/shared';
import clsx from 'clsx';

const JOB_TRACKER_API = 'http://localhost:3002';

const statusColors = {
  applied: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  screening: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
  interview: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  offer: 'bg-green-500/10 text-green-400 border-green-500/20',
  rejected: 'bg-red-500/10 text-red-400 border-red-500/20',
  ghosted: 'bg-gray-500/10 text-gray-400 border-gray-500/20',
};

const typeColors = {
  targeted: 'bg-emerald-500/10 text-emerald-400',
  mass: 'bg-orange-500/10 text-orange-400',
  network: 'bg-cyan-500/10 text-cyan-400',
};

export function Jobs() {
  const [applications, setApplications] = useState<JobApplication[]>([]);
  const [analytics, setAnalytics] = useState<JobAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedApp, setSelectedApp] = useState<JobApplication | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [filterType, setFilterType] = useState<string>('');

  useEffect(() => {
    fetchApplications();
    fetchAnalytics();
  }, [filterStatus, filterType]);

  const fetchApplications = async () => {
    try {
      const params = new URLSearchParams();
      if (filterStatus) params.append('status', filterStatus);
      if (filterType) params.append('type', filterType);

      const response = await fetch(`${JOB_TRACKER_API}/api/jobs?${params}`);
      const data = await response.json();
      setApplications(data);
    } catch (error) {
      console.error('Failed to fetch applications:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchAnalytics = async () => {
    try {
      const response = await fetch(`${JOB_TRACKER_API}/api/jobs/analytics`);
      const data = await response.json();
      setAnalytics(data);
    } catch (error) {
      console.error('Failed to fetch analytics:', error);
    }
  };

  const handleStatusUpdate = async (id: number, status: string) => {
    try {
      await fetch(`${JOB_TRACKER_API}/api/jobs/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      fetchApplications();
      fetchAnalytics();
    } catch (error) {
      console.error('Failed to update status:', error);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this application?')) return;
    try {
      await fetch(`${JOB_TRACKER_API}/api/jobs/${id}`, { method: 'DELETE' });
      fetchApplications();
      fetchAnalytics();
      setSelectedApp(null);
    } catch (error) {
      console.error('Failed to delete application:', error);
    }
  };

  const handleExport = async () => {
    window.open(`${JOB_TRACKER_API}/api/jobs/export`, '_blank');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-slate-400">
        Loading applications...
      </div>
    );
  }

  const todayCount = applications.filter(app =>
    app.applicationDate.startsWith(new Date().toISOString().split('T')[0])
  ).length;

  return (
    <div className="flex flex-col h-full bg-slate-900">
      {/* Header with analytics */}
      <div className="flex-none p-6 border-b border-slate-700 bg-slate-800">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-bold text-white">Job Applications</h2>
          <div className="flex gap-2">
            <button
              onClick={handleExport}
              className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors"
            >
              Export CSV
            </button>
            <button
              onClick={() => setShowForm(true)}
              className="px-4 py-2 bg-primary-600 hover:bg-primary-500 text-white rounded-lg transition-colors"
            >
              + Add Application
            </button>
          </div>
        </div>

        {/* Analytics Grid */}
        {analytics && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div className="bg-slate-700/50 rounded-lg p-4">
              <div className="text-slate-400 text-sm mb-1">Total</div>
              <div className="text-2xl font-bold text-white">{analytics.totalApplications}</div>
            </div>
            <div className="bg-slate-700/50 rounded-lg p-4">
              <div className="text-slate-400 text-sm mb-1">Today</div>
              <div className="text-2xl font-bold text-white">
                {todayCount} <span className="text-sm text-slate-400">/ 2</span>
              </div>
            </div>
            <div className="bg-slate-700/50 rounded-lg p-4">
              <div className="text-slate-400 text-sm mb-1">Response Rate</div>
              <div className="text-2xl font-bold text-green-400">
                {analytics.responseRate.toFixed(1)}%
              </div>
            </div>
            <div className="bg-slate-700/50 rounded-lg p-4">
              <div className="text-slate-400 text-sm mb-1">Interview Rate</div>
              <div className="text-2xl font-bold text-purple-400">
                {analytics.interviewRate.toFixed(1)}%
              </div>
            </div>
            <div className="bg-slate-700/50 rounded-lg p-4">
              <div className="text-slate-400 text-sm mb-1">Active</div>
              <div className="text-2xl font-bold text-blue-400">
                {(analytics.byStatus.applied || 0) + (analytics.byStatus.screening || 0)}
              </div>
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="flex gap-2 mt-4">
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="px-3 py-2 bg-slate-700 text-white rounded-lg border border-slate-600"
          >
            <option value="">All Statuses</option>
            <option value="applied">Applied</option>
            <option value="screening">Screening</option>
            <option value="interview">Interview</option>
            <option value="offer">Offer</option>
            <option value="rejected">Rejected</option>
            <option value="ghosted">Ghosted</option>
          </select>
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="px-3 py-2 bg-slate-700 text-white rounded-lg border border-slate-600"
          >
            <option value="">All Types</option>
            <option value="targeted">Targeted</option>
            <option value="mass">Mass</option>
            <option value="network">Network</option>
          </select>
          {(filterStatus || filterType) && (
            <button
              onClick={() => {
                setFilterStatus('');
                setFilterType('');
              }}
              className="px-3 py-2 text-slate-400 hover:text-white"
            >
              Clear Filters
            </button>
          )}
        </div>
      </div>

      {/* Application List */}
      <div className="flex-1 overflow-auto p-6">
        {applications.length === 0 ? (
          <div className="text-center text-slate-400 py-12">
            No applications yet. Click "Add Application" to get started!
          </div>
        ) : (
          <div className="grid gap-3">
            {applications.map((app) => (
              <div
                key={app.id}
                onClick={() => setSelectedApp(app)}
                className={clsx(
                  'p-4 rounded-lg border cursor-pointer transition-all',
                  selectedApp?.id === app.id
                    ? 'bg-slate-700 border-primary-500'
                    : 'bg-slate-800 border-slate-700 hover:border-slate-600'
                )}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <h3 className="text-lg font-semibold text-white">{app.company}</h3>
                      <span className={clsx('px-2 py-1 text-xs rounded', typeColors[app.type])}>
                        {app.type}
                      </span>
                      {app.remote && (
                        <span className="px-2 py-1 text-xs rounded bg-teal-500/10 text-teal-400">
                          Remote
                        </span>
                      )}
                    </div>
                    <div className="text-slate-300 mb-2">{app.role}</div>
                    {app.location && (
                      <div className="text-sm text-slate-400 mb-2">📍 {app.location}</div>
                    )}
                    <div className="flex items-center gap-3 text-sm text-slate-400">
                      <span>Applied: {new Date(app.applicationDate).toLocaleDateString()}</span>
                      {app.source && <span>via {app.source}</span>}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <select
                      value={app.status}
                      onChange={(e) => handleStatusUpdate(app.id, e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                      className={clsx(
                        'px-3 py-1 text-sm rounded border font-medium',
                        statusColors[app.status]
                      )}
                    >
                      <option value="applied">Applied</option>
                      <option value="screening">Screening</option>
                      <option value="interview">Interview</option>
                      <option value="offer">Offer</option>
                      <option value="rejected">Rejected</option>
                      <option value="ghosted">Ghosted</option>
                    </select>
                  </div>
                </div>
                {selectedApp?.id === app.id && (
                  <div className="mt-4 pt-4 border-t border-slate-600">
                    {app.notes && (
                      <div className="text-sm text-slate-300 mb-3">
                        <strong>Notes:</strong> {app.notes}
                      </div>
                    )}
                    <div className="flex gap-2">
                      {app.jobUrl && (
                        <a
                          href={app.jobUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-3 py-1 text-sm bg-slate-600 hover:bg-slate-500 text-white rounded"
                        >
                          View Job
                        </a>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(app.id);
                        }}
                        className="px-3 py-1 text-sm bg-red-600 hover:bg-red-500 text-white rounded"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add Application Modal */}
      {showForm && (
        <ApplicationForm
          onClose={() => setShowForm(false)}
          onSuccess={() => {
            setShowForm(false);
            fetchApplications();
            fetchAnalytics();
          }}
        />
      )}
    </div>
  );
}

function ApplicationForm({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [formData, setFormData] = useState({
    company: '',
    role: '',
    location: '',
    type: 'targeted' as const,
    status: 'applied' as const,
    jobUrl: '',
    notes: '',
    source: '',
    contactPerson: '',
    salary: '',
    remote: false,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await fetch(`${JOB_TRACKER_API}/api/jobs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      onSuccess();
    } catch (error) {
      console.error('Failed to create application:', error);
      alert('Failed to create application');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-slate-800 rounded-lg p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <h3 className="text-xl font-bold text-white mb-4">Add Job Application</h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-slate-400 mb-1">Company *</label>
              <input
                type="text"
                required
                value={formData.company}
                onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                className="w-full px-3 py-2 bg-slate-700 text-white rounded border border-slate-600"
              />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">Role *</label>
              <input
                type="text"
                required
                value={formData.role}
                onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                className="w-full px-3 py-2 bg-slate-700 text-white rounded border border-slate-600"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-slate-400 mb-1">Type</label>
              <select
                value={formData.type}
                onChange={(e) => setFormData({ ...formData, type: e.target.value as any })}
                className="w-full px-3 py-2 bg-slate-700 text-white rounded border border-slate-600"
              >
                <option value="targeted">Targeted</option>
                <option value="mass">Mass</option>
                <option value="network">Network</option>
              </select>
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">Status</label>
              <select
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
                className="w-full px-3 py-2 bg-slate-700 text-white rounded border border-slate-600"
              >
                <option value="applied">Applied</option>
                <option value="screening">Screening</option>
                <option value="interview">Interview</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm text-slate-400 mb-1">Location</label>
            <input
              type="text"
              value={formData.location}
              onChange={(e) => setFormData({ ...formData, location: e.target.value })}
              className="w-full px-3 py-2 bg-slate-700 text-white rounded border border-slate-600"
            />
          </div>
          <div>
            <label className="block text-sm text-slate-400 mb-1">Job URL</label>
            <input
              type="url"
              value={formData.jobUrl}
              onChange={(e) => setFormData({ ...formData, jobUrl: e.target.value })}
              className="w-full px-3 py-2 bg-slate-700 text-white rounded border border-slate-600"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-slate-400 mb-1">Source</label>
              <input
                type="text"
                placeholder="e.g., LinkedIn, Referral"
                value={formData.source}
                onChange={(e) => setFormData({ ...formData, source: e.target.value })}
                className="w-full px-3 py-2 bg-slate-700 text-white rounded border border-slate-600"
              />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">Salary Range</label>
              <input
                type="text"
                placeholder="e.g., €80k-100k"
                value={formData.salary}
                onChange={(e) => setFormData({ ...formData, salary: e.target.value })}
                className="w-full px-3 py-2 bg-slate-700 text-white rounded border border-slate-600"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm text-slate-400 mb-1">Contact Person</label>
            <input
              type="text"
              value={formData.contactPerson}
              onChange={(e) => setFormData({ ...formData, contactPerson: e.target.value })}
              className="w-full px-3 py-2 bg-slate-700 text-white rounded border border-slate-600"
            />
          </div>
          <div>
            <label className="flex items-center gap-2 text-sm text-slate-400">
              <input
                type="checkbox"
                checked={formData.remote}
                onChange={(e) => setFormData({ ...formData, remote: e.target.checked })}
                className="rounded"
              />
              Remote position
            </label>
          </div>
          <div>
            <label className="block text-sm text-slate-400 mb-1">Notes</label>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              rows={3}
              className="w-full px-3 py-2 bg-slate-700 text-white rounded border border-slate-600"
            />
          </div>
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-primary-600 hover:bg-primary-500 text-white rounded"
            >
              Add Application
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
