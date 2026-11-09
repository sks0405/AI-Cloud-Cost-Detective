import React, { useState, useEffect } from 'react';
import { Navbar } from './components/Navbar';
import { Login } from './pages/Login';
import { Signup } from './pages/Signup';
import { Dashboard } from './pages/Dashboard';
import { Report } from './pages/Report';
import { History } from './pages/History';
import { isAuthenticated, getUser, User, AnalysisReport } from './api';

type TabType = 'dashboard' | 'history' | 'report';
type AuthView = 'login' | 'signup';

export const App: React.FC = () => {
  const [authed, setAuthed] = useState<boolean>(isAuthenticated());
  const [currentUser, setCurrentUser] = useState<User | null>(getUser());
  const [authView, setAuthView] = useState<AuthView>('login');
  const [currentTab, setCurrentTab] = useState<TabType>('dashboard');
  const [selectedReport, setSelectedReport] = useState<AnalysisReport | null>(null);

  // Sync auth state across changes (login, logout, 401 events)
  useEffect(() => {
    const handleAuthChange = () => {
      const isAuth = isAuthenticated();
      setAuthed(isAuth);
      setCurrentUser(getUser());
      if (!isAuth) {
        setAuthView('login');
      }
    };

    window.addEventListener('auth_change', handleAuthChange);
    return () => window.removeEventListener('auth_change', handleAuthChange);
  }, []);

  // Handler when an analysis completes on the dashboard
  const handleAnalysisComplete = (report: AnalysisReport) => {
    setSelectedReport(report);
    setCurrentTab('report');
  };

  // Handler when user selects a report from history
  const handleSelectHistoryReport = (report: AnalysisReport) => {
    setSelectedReport(report);
    setCurrentTab('report');
  };

  // If not logged in, show Auth views
  if (!authed) {
    if (authView === 'signup') {
      return (
        <Signup
          onSwitchToLogin={() => setAuthView('login')}
          onSignupSuccess={() => {
            setAuthed(true);
            setCurrentUser(getUser());
          }}
        />
      );
    }
    return (
      <Login
        onSwitchToSignup={() => setAuthView('signup')}
        onLoginSuccess={() => {
          setAuthed(true);
          setCurrentUser(getUser());
        }}
      />
    );
  }

  // Authenticated Application Shell
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-indigo-500 selection:text-white">
      {/* Top Navigation */}
      <Navbar
        currentTab={currentTab}
        setCurrentTab={(tab) => setCurrentTab(tab)}
        user={currentUser}
      />

      {/* Main Content Area */}
      <main className="flex-1 pb-16">
        {currentTab === 'dashboard' && (
          <Dashboard onAnalysisComplete={handleAnalysisComplete} />
        )}

        {currentTab === 'report' && (
          <Report
            report={selectedReport}
            onBack={() => setCurrentTab('dashboard')}
          />
        )}

        {currentTab === 'history' && (
          <History
            onSelectReport={handleSelectHistoryReport}
            onNavigateToDashboard={() => setCurrentTab('dashboard')}
          />
        )}
      </main>

      {/* Modern Minimal Footer */}
      <footer className="border-t border-slate-900 bg-slate-950/60 py-6 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>AI Cloud Cost Detective &bull; Enterprise FinOps Automated Auditor</span>
          <span className="font-mono text-slate-600">FastAPI &bull; AWS CLI &bull; OpenAI &bull; PostgreSQL &bull; React</span>
        </div>
      </footer>
    </div>
  );
};

export default App;
