import React, { useState } from 'react';
import {
  DollarSign,
  AlertTriangle,
  Server,
  Terminal,
  Copy,
  Check,
  ArrowLeft,
  ShieldAlert,
  Sparkles,
  Filter,
  CheckCircle2,
  Calendar,
  Layers,
} from 'lucide-react';
import { AnalysisReport, CostIssue } from '../api';

interface ReportProps {
  report: AnalysisReport | null;
  onBack: () => void;
}

export const Report: React.FC<ReportProps> = ({ report, onBack }) => {
  const [selectedSeverity, setSelectedSeverity] = useState<'all' | 'high' | 'medium' | 'low'>('all');
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [copiedAll, setCopiedAll] = useState<boolean>(false);

  if (!report) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center">
        <div className="glass-panel p-12 rounded-3xl border border-slate-800 shadow-xl space-y-4">
          <div className="h-16 w-16 mx-auto rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-500">
            <ShieldAlert className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-bold text-white">No Analysis Report Selected</h2>
          <p className="text-slate-400 text-sm max-w-md mx-auto">
            Run an analysis from the dashboard or choose an investigation from history to view full findings.
          </p>
          <button
            onClick={onBack}
            className="inline-flex items-center space-x-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-sm transition-all"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Go to Dashboard</span>
          </button>
        </div>
      </div>
    );
  }

  const issues: CostIssue[] = report.issues || [];

  const filteredIssues = issues.filter((issue) => {
    if (selectedSeverity === 'all') return true;
    return issue.severity?.toLowerCase() === selectedSeverity;
  });

  const highCount = issues.filter((i) => i.severity?.toLowerCase() === 'high').length;
  const mediumCount = issues.filter((i) => i.severity?.toLowerCase() === 'medium').length;
  const lowCount = issues.filter((i) => i.severity?.toLowerCase() === 'low').length;

  const copyToClipboard = async (text: string, index: number) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex(null), 2000);
    } catch (err) {
      console.error('Failed to copy text', err);
    }
  };

  const copyAllCommands = async () => {
    const allCmds = issues
      .map((i) => i.fix_command)
      .filter(Boolean)
      .join('\n\n');
    try {
      await navigator.clipboard.writeText(allCmds);
      setCopiedAll(true);
      setTimeout(() => setCopiedAll(false), 2000);
    } catch (err) {
      console.error('Failed to copy commands', err);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Top Navigation Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <button
          onClick={onBack}
          className="inline-flex items-center space-x-2 text-xs font-semibold text-slate-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>&larr; Back to Dashboard</span>
        </button>

        <div className="flex items-center space-x-3 text-xs text-slate-400">
          <div className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800">
            <Layers className="w-3.5 h-3.5 text-indigo-400" />
            <span className="font-mono text-slate-200">{report.resource_group}</span>
          </div>
          {report.created_at && (
            <div className="hidden sm:flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800">
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              <span>{new Date(report.created_at).toLocaleDateString()}</span>
            </div>
          )}
        </div>
      </div>

      {/* Hero Executive Summary Card */}
      <div className="relative rounded-3xl p-6 sm:p-8 bg-gradient-to-r from-slate-900 via-indigo-950/40 to-slate-900 border border-slate-800 shadow-2xl overflow-hidden">
        <div className="relative z-10 space-y-4">
          <div className="flex items-center space-x-2 text-indigo-400 text-xs font-bold uppercase tracking-wider">
            <Sparkles className="w-4 h-4 text-amber-400" />
            <span>AI Cost Investigation Report</span>
          </div>

          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            Analysis for {report.resource_group}
          </h1>

          <p className="text-slate-300 text-sm sm:text-base leading-relaxed max-w-4xl bg-slate-950/40 p-4 rounded-xl border border-slate-800/80">
            {report.summary || 'Cost analysis completed successfully. Review detected anomalies below.'}
          </p>

          {/* Metric Cards Row */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
            {/* Savings Card */}
            <div className="p-4 rounded-2xl bg-emerald-950/20 border border-emerald-500/30 flex items-center space-x-4">
              <div className="h-12 w-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0">
                <DollarSign className="w-6 h-6" />
              </div>
              <div>
                <span className="text-xs text-slate-400 block font-medium">Estimated Monthly Savings</span>
                <span className="text-xl sm:text-2xl font-black text-emerald-400 mt-0.5 block">
                  {report.estimated_savings || '$0 / month'}
                </span>
              </div>
            </div>

            {/* Total Issues Card */}
            <div className="p-4 rounded-2xl bg-rose-950/20 border border-rose-500/30 flex items-center space-x-4">
              <div className="h-12 w-12 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400 shrink-0">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <span className="text-xs text-slate-400 block font-medium">Optimization Issues</span>
                <span className="text-xl sm:text-2xl font-black text-rose-400 mt-0.5 block">
                  {issues.length} Found
                </span>
              </div>
            </div>

            {/* Resources Scanned Card */}
            <div className="p-4 rounded-2xl bg-indigo-950/20 border border-indigo-500/30 flex items-center space-x-4">
              <div className="h-12 w-12 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 shrink-0">
                <Server className="w-6 h-6" />
              </div>
              <div>
                <span className="text-xs text-slate-400 block font-medium">Resources Scanned</span>
                <span className="text-xl sm:text-2xl font-black text-indigo-300 mt-0.5 block">
                  {report.total_resources ?? report.resources?.length ?? 0} Items
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Filter Tabs & Quick Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        {/* Severity filter badges */}
        <div className="flex items-center space-x-2">
          <span className="text-xs font-semibold text-slate-400 flex items-center gap-1.5 mr-2">
            <Filter className="w-3.5 h-3.5" /> Severity:
          </span>
          <button
            onClick={() => setSelectedSeverity('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              selectedSeverity === 'all'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            All ({issues.length})
          </button>
          <button
            onClick={() => setSelectedSeverity('high')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              selectedSeverity === 'high'
                ? 'bg-rose-500 text-white shadow-md shadow-rose-500/30'
                : 'bg-slate-900 text-rose-400 hover:bg-rose-950/30 border border-rose-500/20'
            }`}
          >
            High ({highCount})
          </button>
          <button
            onClick={() => setSelectedSeverity('medium')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              selectedSeverity === 'medium'
                ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/30'
                : 'bg-slate-900 text-amber-400 hover:bg-amber-950/30 border border-amber-500/20'
            }`}
          >
            Medium ({mediumCount})
          </button>
          <button
            onClick={() => setSelectedSeverity('low')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              selectedSeverity === 'low'
                ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/30'
                : 'bg-slate-900 text-emerald-400 hover:bg-emerald-950/30 border border-emerald-500/20'
            }`}
          >
            Low ({lowCount})
          </button>
        </div>

        {/* Copy All Fix Commands */}
        {issues.some((i) => i.fix_command) && (
          <button
            type="button"
            onClick={copyAllCommands}
            className="inline-flex items-center space-x-2 px-3.5 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700/80 text-xs font-medium transition-all"
          >
            {copiedAll ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-emerald-400">All Commands Copied!</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5 text-slate-400" />
                <span>Copy All Fix Commands</span>
              </>
            )}
          </button>
        )}
      </div>

      {/* Issues List */}
      <div className="space-y-6">
        {filteredIssues.length === 0 ? (
          <div className="glass-panel p-10 rounded-2xl border border-slate-800 text-center space-y-2">
            <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto" />
            <h3 className="text-base font-bold text-white">No issues found matching this filter</h3>
            <p className="text-xs text-slate-400">All scanned resources comply with the selected criteria.</p>
          </div>
        ) : (
          filteredIssues.map((issue, idx) => {
            const isHigh = issue.severity?.toLowerCase() === 'high';
            const isMedium = issue.severity?.toLowerCase() === 'medium';

            const severityBadgeClass = isHigh
              ? 'bg-rose-500/10 text-rose-400 border-rose-500/30'
              : isMedium
              ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
              : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';

            return (
              <div
                key={idx}
                className="glass-panel rounded-2xl border border-slate-800 p-6 sm:p-7 shadow-xl space-y-5 hover:border-slate-700/80 transition-all"
              >
                {/* Issue Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-800/80">
                  <div className="space-y-1">
                    <div className="flex items-center space-x-2.5">
                      <span className="text-xs font-mono text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/20">
                        {issue.resource_type || 'AWS Resource'}
                      </span>
                      <h3 className="text-base font-bold text-white tracking-tight">
                        {issue.resource_name || 'Unnamed Resource'}
                      </h3>
                    </div>
                    {issue.issue_type && (
                      <p className="text-xs text-slate-400">
                        Category: <span className="text-slate-300 font-medium">{issue.issue_type}</span>
                      </p>
                    )}
                  </div>

                  {/* Severity Badge */}
                  <div className="self-start sm:self-auto">
                    <span
                      className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider border ${severityBadgeClass}`}
                    >
                      {issue.severity || 'low'} severity
                    </span>
                  </div>
                </div>

                {/* Explanation & Recommendation */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs sm:text-sm">
                  <div className="space-y-1.5 p-4 rounded-xl bg-slate-900/40 border border-slate-800/80">
                    <span className="font-semibold text-slate-300 block">Root Cause / Investigation:</span>
                    <p className="text-slate-400 leading-relaxed">{issue.explanation}</p>
                  </div>

                  <div className="space-y-1.5 p-4 rounded-xl bg-indigo-950/20 border border-indigo-500/20">
                    <span className="font-semibold text-indigo-300 block">AI Recommendation:</span>
                    <p className="text-slate-300 leading-relaxed">{issue.recommendation}</p>
                  </div>
                </div>

                {/* Fix Command Code Block with Copy Button */}
                {issue.fix_command && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs text-slate-400">
                      <div className="flex items-center space-x-2 font-mono">
                        <Terminal className="w-3.5 h-3.5 text-indigo-400" />
                        <span>Remediation CLI Command</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => copyToClipboard(issue.fix_command, idx)}
                        className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
                      >
                        {copiedIndex === idx ? (
                          <>
                            <Check className="w-3 h-3 text-emerald-400" />
                            <span className="text-emerald-400 font-medium">Copied!</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3 text-slate-400" />
                            <span>Copy Command</span>
                          </>
                        )}
                      </button>
                    </div>

                    <div className="relative group">
                      <pre className="p-4 rounded-xl bg-slate-950 border border-slate-800 font-mono text-xs sm:text-sm text-cyan-300 overflow-x-auto scrollbar-thin">
                        <code>{issue.fix_command}</code>
                      </pre>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
