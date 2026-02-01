import { useStore } from '../store';
import { Status } from './Status';
import { Chat } from './Chat';
import { Files } from './Files';
import { Outputs } from './Outputs';
import { History } from './History';
import clsx from 'clsx';

const navItems = [
  { id: 'chat', label: 'Chat', icon: '💬' },
  { id: 'files', label: 'Files', icon: '📁' },
  { id: 'outputs', label: 'Outputs', icon: '📤' },
  { id: 'history', label: 'History', icon: '📜' },
] as const;

export function Layout() {
  const { activeView, setActiveView } = useStore();

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
            <button
              key={item.id}
              onClick={() => setActiveView(item.id)}
              className={clsx(
                'w-12 h-12 rounded-lg flex flex-col items-center justify-center gap-1 transition-colors',
                activeView === item.id
                  ? 'bg-primary-600 text-white'
                  : 'text-slate-400 hover:bg-slate-700 hover:text-white'
              )}
              title={item.label}
            >
              <span className="text-lg">{item.icon}</span>
              <span className="text-[10px]">{item.label}</span>
            </button>
          ))}
        </nav>

        {/* Content */}
        <main className="flex-1 overflow-hidden">
          {activeView === 'chat' && <Chat />}
          {activeView === 'files' && <Files />}
          {activeView === 'outputs' && <Outputs />}
          {activeView === 'history' && <History />}
        </main>
      </div>
    </div>
  );
}
