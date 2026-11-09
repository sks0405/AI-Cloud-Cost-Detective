import React from 'react';
import { Cloud, History, LayoutDashboard, LogOut, ShieldAlert } from 'lucide-react';
import { api, User } from '../api';

interface NavbarProps {
  currentTab: 'dashboard' | 'history' | 'report';
  setCurrentTab: (tab: 'dashboard' | 'history' | 'report') => void;
  user: User | null;
}

export const Navbar: React.FC<NavbarProps> = ({ currentTab, setCurrentTab, user }) => {
  return (
    <nav className="glass-panel sticky top-0 z-50 border-b border-slate-800/80 bg-slate-950/80 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo & Brand */}
          <div className="flex items-center space-x-3 cursor-pointer" onClick={() => setCurrentTab('dashboard')}>
            <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-cyan-400 p-0.5 shadow-lg shadow-indigo-500/20 flex items-center justify-center">
              <div className="h-full w-full bg-slate-950 rounded-[10px] flex items-center justify-center">
                <ShieldAlert className="h-5 w-5 text-indigo-400" />
              </div>
            </div>
            <div>
              <span className="text-lg font-bold bg-gradient-to-r from-white via-slate-200 to-indigo-200 bg-clip-text text-transparent">
                Cloud Cost Detective
              </span>
              <span className="ml-2 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 rounded-full">
                AI FinOps
              </span>
            </div>
          </div>

          {/* Nav Links */}
          <div className="flex items-center space-x-1 sm:space-x-3">
            <button
              onClick={() => setCurrentTab('dashboard')}
              className={`flex items-center space-x-2 px-3.5 py-2 rounded-lg text-sm font-medium transition-all ${
                currentTab === 'dashboard'
                  ? 'bg-indigo-600/20 text-indigo-300 border border-indigo-500/30 shadow-inner'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <LayoutDashboard className="h-4 w-4" />
              <span>Dashboard</span>
            </button>

            <button
              onClick={() => setCurrentTab('history')}
              className={`flex items-center space-x-2 px-3.5 py-2 rounded-lg text-sm font-medium transition-all ${
                currentTab === 'history'
                  ? 'bg-indigo-600/20 text-indigo-300 border border-indigo-500/30 shadow-inner'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <History className="h-4 w-4" />
              <span>History</span>
            </button>
          </div>

          {/* User profile & Logout */}
          <div className="flex items-center space-x-3">
            {user && (
              <div className="hidden sm:flex items-center space-x-2 px-3 py-1.5 rounded-full bg-slate-900 border border-slate-800 text-xs text-slate-300">
                <div className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="font-mono text-slate-300 max-w-[160px] truncate">{user.email}</span>
              </div>
            )}

            <button
              onClick={() => api.logout()}
              title="Log out"
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 border border-rose-500/20 transition-colors"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Logout</span>
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
};
