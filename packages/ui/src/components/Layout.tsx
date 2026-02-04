import { useEffect } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { Status } from './Status';
import clsx from 'clsx';

const navItems = [
  { path: '/chat', label: 'Chat', icon: '💬' },
  { path: '/jobs', label: 'Jobs', icon: '💼' },
  { path: '/interview', label: 'Interview', icon: '🎯' },
  { path: '/files', label: 'Files', icon: '📁' },
  { path: '/outputs', label: 'Outputs', icon: '📤' },
  { path: '/history', label: 'History', icon: '📜' },
] as const;

export function Layout() {
  const location = useLocation();

  // Update document title based on active view
  useEffect(() => {
    const titles: Record<string, string> = {
      '/chat': 'Chat - Singularity',
      '/jobs': 'Jobs - Singularity',
      '/interview': 'Interview Prep - Singularity',
      '/files': 'Files - Singularity',
      '/outputs': 'Outputs - Singularity',
      '/history': 'History - Singularity',
    };
    // Find matching title (handle nested routes like /files/config/SOUL.md)
    const basePath = '/' + location.pathname.split('/')[1];
    document.title = titles[basePath] || 'Singularity';
  }, [location.pathname]);

  return (
    <div className="flex flex-col h-screen bg-slate-900">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-slate-700 bg-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-primary-500 flex items-center justify-center">
            <div className="w-3 h-3 rounded-full bg-slate-900" />
          </div>
          <h1 className="text-xl font-semibold text-white">Singularity</h1>
        </div>
        <Status />
      </header>

      {/* Main content area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar navigation */}
        <nav className="w-16 bg-slate-800 border-r border-slate-700 flex flex-col items-center py-4 gap-2">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                clsx(
                  'w-12 h-12 rounded-lg flex flex-col items-center justify-center gap-1 transition-colors',
                  isActive
                    ? 'bg-primary-600 text-white'
                    : 'text-slate-400 hover:bg-slate-700 hover:text-white'
                )
              }
              title={item.label}
            >
              <span className="text-lg">{item.icon}</span>
              <span className="text-[10px]">{item.label}</span>
            </NavLink>
          ))}
        </nav>

        {/* Content */}
        <main className="flex-1 overflow-hidden">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
