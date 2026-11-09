import React, { useState, useEffect } from 'react';
import {
  History as HistoryIcon,
  Layers,
  Calendar,
  AlertTriangle,
  DollarSign,
  ArrowRight,
  Server,
  RefreshCw,
  Search,
  CheckCircle2,
  Inbox,
} from 'lucide-react';
import { api, HistoryItem, AnalysisReport } from '../api';

interface HistoryProps {
  onSelectReport: (report: AnalysisReport) => void;
  onNavigateToDashboard: () => void;
}

export const History: React.FC<HistoryProps> = ({ onSelectReport, onNavigateToDashboard }) => {
  const [historyItems, setHistoryItems] = useState<HistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');

  useEffect(() => {
    loadHistory();
  }, []);

  const loadHistory = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await api.getHistory();
      setHistoryItems(data);
    } catch (err: any) {
      setError(err?.message || 'Failed to fetch analysis history.');
    } finally {
      setIsLoading(false);
    }
  };

  const filteredHistory = historyItems.filter((item) => {
    const q = searchQuery.toLowerCase();
    return (
      item.resource_group.toLowerCase().includes(q) ||
      (item.estimated_savings && item.estimated_savings.toLowerCase().includes(q))
    );
  });

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-800">
        <div>
          <div className="flex items-center space-x-2 text-indigo-400 text-xs font-semibold uppercase tracking-wider mb-1">
            <HistoryIcon className="w-4 h-4" />
            <span>Audit Trail</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            Analysis History
          </h1>
          <p className="text-slate-400 text-xs sm:text-sm mt-1">
            Browse previous AWS cloud audits, historical savings potential, and findings.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <button
            type="button"
            onClick={loadHistory}
            disabled={isLoading}
            className="inline-flex items-center space-x-2 px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 text-xs font-medium transition-all"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-indigo-400' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Search Filter */}
      {historyItems.length > 0 && (
        <div className="relative max-w-md">
          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
            <Search className="h-4 w-4 text-slate-500" />
          </div>
          <input
            type="text"
            placeholder="Search by resource group or savings..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs sm:text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500 transition-all"
          />
        </div>
      )}

      {/* Error Banner */}
      {error && (
        <div className="p-4 rounded-xl bg-rose-950/20 border border-rose-500/30 text-rose-300 text-xs flex items-center justify-between">
          <span>{error}</span>
          <button onClick={loadHistory} className="text-xs font-bold text-rose-200 underline">
            Retry
          </button>
        </div>
      )}

      {/* Loading Skeleton */}
      {isLoading && (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="glass-panel p-6 rounded-2xl border border-slate-800 animate-pulse space-y-4"
            >
              <div className="h-4 bg-slate-800 rounded w-1/4" />
              <div className="h-3 bg-slate-800/60 rounded w-1/2" />
            </div>
          ))}
        </div>
      )}

      {/* Empty State */}
      {!isLoading && historyItems.length === 0 && (
        <div className="glass-panel p-12 sm:p-16 rounded-3xl border border-slate-800 text-center space-y-4">
          <div className="h-16 w-16 mx-auto rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
            <Inbox className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-bold text-white">No Analysis Records Yet</h2>
          <p className="text-slate-400 text-sm max-w-md mx-auto">
            You haven't executed any cost audits yet. Select a resource group and launch your first scan.
          </p>
          <button
            onClick={onNavigateToDashboard}
            className="inline-flex items-center space-x-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-sm shadow-lg shadow-indigo-600/30 transition-all"
          >
            <span>Run New Audit</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* History Grid */}
      {!isLoading && filteredHistory.length > 0 && (
        <div className="space-y-4">
          {filteredHistory.map((item) => {
            const formattedDate = item.created_at
              ? new Date(item.created_at).toLocaleString()
              : 'Recently';

            return (
              <div
                key={item.id}
                onClick={() => onSelectReport(item.analysis_result)}
                className="glass-panel p-6 rounded-2xl border border-slate-800 hover:border-indigo-500/40 hover:bg-slate-900/40 transition-all cursor-pointer group shadow-lg"
              >
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  {/* Left: Resource Group & Date */}
                  <div className="space-y-1.5">
                    <div className="flex items-center space-x-3">
                      <div className="p-2 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
                        <Layers className="w-4 h-4" />
                      </div>
                      <h3 className="text-base font-bold text-white group-hover:text-indigo-300 transition-colors">
                        {item.resource_group}
                      </h3>
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono uppercase bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        {item.status || 'completed'}
                      </span>
                    </div>

                    <div className="flex items-center space-x-4 text-xs text-slate-400">
                      <div className="flex items-center space-x-1.5">
                        <Calendar className="w-3.5 h-3.5 text-slate-500" />
                        <span>{formattedDate}</span>
                      </div>
                      <div className="flex items-center space-x-1.5">
                        <Server className="w-3.5 h-3.5 text-slate-500" />
                        <span>{item.resources_scanned} scanned</span>
                      </div>
                    </div>
                  </div>

                  {/* Right: Metrics & Action */}
                  <div className="flex items-center space-x-4 sm:space-x-6 self-start md:self-auto">
                    {/* Issues pill */}
                    <div className="flex items-center space-x-2 px-3 py-1.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs font-semibold">
                      <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
                      <span>{item.issues_found} issues</span>
                    </div>

                    {/* Estimated savings */}
                    <div className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-bold">
                      <DollarSign className="w-3.5 h-3.5" />
                      <span>{item.estimated_savings || '$0/mo'}</span>
                    </div>

                    {/* Open Button */}
                    <div className="p-2 rounded-xl bg-slate-800 text-slate-400 group-hover:text-white group-hover:bg-indigo-600 transition-all">
                      <ArrowRight className="w-4 h-4" />
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
