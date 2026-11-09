import React, { useState, useEffect, useRef } from 'react';
import {
  Layers,
  Play,
  RefreshCw,
  AlertCircle,
  Cpu,
  DollarSign,
  ShieldAlert,
  ArrowRight,
  ExternalLink,
  ChevronDown,
} from 'lucide-react';
import { api, AnalysisReport } from '../api';
import { ProgressTracker } from '../components/ProgressTracker';

interface DashboardProps {
  onAnalysisComplete: (report: AnalysisReport) => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ onAnalysisComplete }) => {
  const [resourceGroups, setResourceGroups] = useState<string[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<string>('');
  const [customGroup, setCustomGroup] = useState<string>('');
  const [isFetchingGroups, setIsFetchingGroups] = useState<boolean>(false);
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  // Live progress state
  const [currentProgressMsg, setCurrentProgressMsg] = useState<string>('');
  const [progressLogs, setProgressLogs] = useState<string[]>([]);
  const [isPipelineComplete, setIsPipelineComplete] = useState<boolean>(false);
  const [completedReport, setCompletedReport] = useState<AnalysisReport | null>(null);

  const wsRef = useRef<WebSocket | null>(null);

  // Load resource groups on mount
  useEffect(() => {
    loadResourceGroups();
  }, []);

  const loadResourceGroups = async () => {
    setIsFetchingGroups(true);
    setFetchError(null);
    try {
      const groups = await api.getResourceGroups();
      setResourceGroups(groups);
      if (groups.length > 0 && !selectedGroup) {
        setSelectedGroup(groups[0]);
      }
    } catch (err: any) {
      setFetchError(err?.message || 'Failed to fetch AWS resource groups.');
    } finally {
      setIsFetchingGroups(false);
    }
  };

  const handleRunAnalysis = async () => {
    const targetGroup = selectedGroup === '__custom__' ? customGroup.trim() : selectedGroup;

    if (!targetGroup) {
      setAnalysisError('Please choose or enter an AWS Resource Group to analyze.');
      return;
    }

    setAnalysisError(null);
    setIsAnalyzing(true);
    setIsPipelineComplete(false);
    setCompletedReport(null);
    setProgressLogs([]);
    setCurrentProgressMsg('Initializing analysis pipeline...');

    const analysisId = `analysis_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    // Set up WebSocket connection for real-time progress
    // Try proxy ws first (/ws/progress/{analysis_id}), or direct backend port 8000
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${wsProtocol}//${window.location.hostname}:8000/ws/progress/${analysisId}`;

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        const initLog = `Connected to live progress feed [${analysisId}]`;
        setProgressLogs((prev) => [...prev, initLog]);
      };

      ws.onmessage = (event) => {
        const msg = event.data;
        setCurrentProgressMsg(msg);
        setProgressLogs((prev) => [...prev, msg]);
        if (msg.includes('Analysis complete')) {
          setIsPipelineComplete(true);
        }
      };

      ws.onerror = (e) => {
        console.warn('WebSocket connection notice:', e);
      };

      ws.onclose = () => {
        // ws closed
      };
    } catch (wsErr) {
      console.warn('Could not connect WebSocket:', wsErr);
    }

    try {
      const report = await api.runAnalysis(targetGroup, analysisId);
      setCompletedReport(report);
      setIsPipelineComplete(true);
      setCurrentProgressMsg('Analysis complete');
      setProgressLogs((prev) => [...prev, 'Analysis complete. Full report generated.']);
    } catch (err: any) {
      setAnalysisError(err?.message || 'Cost analysis failed. Please verify your AWS credentials & resource group.');
    } finally {
      setIsAnalyzing(false);
      if (wsRef.current) {
        try {
          wsRef.current.close();
        } catch {}
      }
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Top Welcome / Hero Banner */}
      <div className="relative rounded-3xl p-6 sm:p-10 overflow-hidden bg-gradient-to-r from-indigo-950/60 via-slate-900 to-slate-950 border border-slate-800 shadow-2xl">
        <div className="absolute top-0 right-0 -mt-12 -mr-12 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 max-w-3xl">
          <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-semibold mb-4">
            <Cpu className="w-3.5 h-3.5 text-indigo-400" />
            <span>Autonomous Cloud FinOps Auditor</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight leading-tight">
            Detect Idle Resources & Slash Cloud Waste with AI
          </h1>
          <p className="mt-3 text-slate-300 text-sm sm:text-base leading-relaxed">
            Select an AWS Resource Group to scan compute, storage, databases, and networking.
            Our GPT-4o engine discovers misconfigurations, idle assets, and generates copy-paste CLI remediation commands.
          </p>
        </div>
      </div>

      {/* Main Grid: Control Panel + Live Progress */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Column: Resource Group Selection & Execution (5 cols) */}
        <div className="lg:col-span-5 space-y-6">
          <div className="glass-panel p-6 sm:p-7 rounded-2xl border border-slate-800 shadow-xl space-y-6">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800/80">
              <div className="flex items-center space-x-2.5">
                <div className="h-8 w-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
                  <Layers className="w-4 h-4" />
                </div>
                <h2 className="text-base font-semibold text-white">Target Resource Group</h2>
              </div>
              <button
                type="button"
                onClick={loadResourceGroups}
                disabled={isFetchingGroups || isAnalyzing}
                title="Refresh AWS Resource Groups"
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 border border-slate-700/60 transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${isFetchingGroups ? 'animate-spin text-indigo-400' : ''}`} />
              </button>
            </div>

            {fetchError && (
              <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-start space-x-2.5">
                <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-amber-200">Notice:</p>
                  <p className="text-amber-300/90">{fetchError}</p>
                  <p className="text-slate-400 mt-1">You can enter a custom group name below to proceed.</p>
                </div>
              </div>
            )}

            {/* Dropdown Selector */}
            <div className="space-y-2">
              <label htmlFor="resource-group-select" className="block text-xs font-medium text-slate-300">
                Choose AWS Resource Group
              </label>
              <div className="relative">
                <select
                  id="resource-group-select"
                  value={selectedGroup}
                  disabled={isAnalyzing}
                  onChange={(e) => setSelectedGroup(e.target.value)}
                  className="w-full appearance-none px-4 py-3 bg-slate-900 border border-slate-800 rounded-xl text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500 transition-all cursor-pointer pr-10"
                >
                  {resourceGroups.length > 0 ? (
                    resourceGroups.map((group) => (
                      <option key={group} value={group} className="bg-slate-900 text-white">
                        {group}
                      </option>
                    ))
                  ) : (
                    <option value="" disabled>
                      {isFetchingGroups ? 'Loading groups from AWS CLI...' : 'No AWS groups listed'}
                    </option>
                  )}
                  <option value="__custom__" className="bg-slate-900 text-indigo-300">
                    + Enter custom resource group name...
                  </option>
                </select>
                <div className="absolute inset-y-0 right-0 pr-3.5 flex items-center pointer-events-none text-slate-500">
                  <ChevronDown className="w-4 h-4" />
                </div>
              </div>
            </div>

            {/* Custom group name input if selected */}
            {(selectedGroup === '__custom__' || resourceGroups.length === 0) && (
              <div className="space-y-2 animate-in fade-in">
                <label htmlFor="custom-resource-group" className="block text-xs font-medium text-slate-300">
                  Resource Group Name
                </label>
                <input
                  id="custom-resource-group"
                  type="text"
                  placeholder="e.g. production-workloads-us-east-1"
                  value={customGroup}
                  disabled={isAnalyzing}
                  onChange={(e) => setCustomGroup(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500 transition-all font-mono"
                />
              </div>
            )}

            {/* Run Analysis Action Button */}
            <div className="pt-2">
              <button
                id="run-analysis-btn"
                type="button"
                onClick={handleRunAnalysis}
                disabled={isAnalyzing}
                className="w-full py-3.5 px-5 rounded-xl bg-gradient-to-r from-indigo-600 via-indigo-500 to-cyan-500 hover:from-indigo-500 hover:to-cyan-400 text-white font-semibold text-sm shadow-xl shadow-indigo-600/30 flex items-center justify-center space-x-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed group"
              >
                <Play className={`w-4 h-4 fill-white ${isAnalyzing ? 'animate-pulse' : 'group-hover:scale-110 transition-transform'}`} />
                <span>{isAnalyzing ? 'Investigating Resources...' : 'Run Cost Analysis'}</span>
              </button>
            </div>

            {/* Target Summary Specs */}
            <div className="pt-4 border-t border-slate-800/80 grid grid-cols-2 gap-3 text-xs">
              <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800">
                <span className="text-slate-500 block">AI Engine</span>
                <span className="text-indigo-300 font-semibold mt-0.5 block">OpenAI GPT-4o</span>
              </div>
              <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800">
                <span className="text-slate-500 block">Persistence</span>
                <span className="text-emerald-300 font-semibold mt-0.5 block">AWS PostgreSQL</span>
              </div>
            </div>
          </div>

          {/* Quick info card */}
          <div className="p-5 rounded-2xl bg-indigo-950/20 border border-indigo-500/20 text-xs text-slate-400 space-y-2">
            <div className="flex items-center space-x-2 text-indigo-300 font-medium">
              <DollarSign className="w-4 h-4 text-emerald-400" />
              <span>What gets audited?</span>
            </div>
            <p className="leading-relaxed">
              Unattached EBS volumes, unassociated Elastic IPs, idle EC2 instances, underutilized RDS clusters, missing lifecycle rules on S3, and sub-optimal provisioning tiers.
            </p>
          </div>
        </div>

        {/* Right Column: Live Status & Progress Tracker (7 cols) */}
        <div className="lg:col-span-7 space-y-6">
          {/* Progress Section */}
          <ProgressTracker
            currentMessage={currentProgressMsg}
            logs={progressLogs}
            error={analysisError}
            isComplete={isPipelineComplete}
          />

          {/* If analysis is complete and report is available, provide direct view button */}
          {completedReport && (
            <div className="glass-panel p-6 rounded-2xl border border-emerald-500/30 bg-gradient-to-r from-emerald-950/30 via-slate-900 to-indigo-950/30 shadow-2xl flex flex-col sm:flex-row items-center justify-between gap-4 animate-in fade-in">
              <div className="space-y-1 text-center sm:text-left">
                <div className="flex items-center justify-center sm:justify-start space-x-2 text-emerald-400 font-semibold text-sm">
                  <ShieldAlert className="w-4 h-4" />
                  <span>Cost Audit Ready for {completedReport.resource_group}</span>
                </div>
                <p className="text-xs text-slate-300">
                  Found <span className="font-bold text-white">{completedReport.issues?.length || 0} optimization issues</span> with potential savings of <span className="font-bold text-emerald-400">{completedReport.estimated_savings || '$0/mo'}</span>.
                </p>
              </div>

              <button
                id="view-report-btn"
                type="button"
                onClick={() => onAnalysisComplete(completedReport)}
                className="px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs uppercase tracking-wider shadow-lg shadow-emerald-500/20 flex items-center space-x-2 transition-all whitespace-nowrap"
              >
                <span>View Full Report</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
