import React from 'react';
import { CheckCircle2, Loader2, AlertCircle, Circle, Sparkles, Terminal } from 'lucide-react';

interface ProgressTrackerProps {
  currentMessage: string;
  logs: string[];
  error?: string | null;
  isComplete?: boolean;
}

interface Step {
  id: number;
  label: string;
  matchPattern: RegExp;
}

const STEPS: Step[] = [
  { id: 1, label: 'Fetching resource groups', matchPattern: /Fetching resource groups/i },
  { id: 2, label: 'Scanning resources in group', matchPattern: /Scanning resources in/i },
  { id: 3, label: 'Analyzing costs with AI (GPT-4o)', matchPattern: /Analyzing costs with AI/i },
  { id: 4, label: 'Storing results in PostgreSQL', matchPattern: /Storing results/i },
  { id: 5, label: 'Analysis complete & report ready', matchPattern: /Analysis complete/i },
];

export const ProgressTracker: React.FC<ProgressTrackerProps> = ({
  currentMessage,
  logs,
  error,
  isComplete,
}) => {
  // Determine current active step index (0 to 4)
  const getStepIndex = () => {
    if (isComplete || /Analysis complete/i.test(currentMessage)) return 4;
    if (/Storing results/i.test(currentMessage)) return 3;
    if (/Analyzing costs with AI/i.test(currentMessage)) return 2;
    if (/Scanning resources in/i.test(currentMessage)) return 1;
    if (/Fetching resource groups/i.test(currentMessage)) return 0;
    return 0;
  };

  const activeIndex = getStepIndex();
  const progressPercent = error
    ? Math.max(10, ((activeIndex + 1) / STEPS.length) * 100)
    : isComplete
    ? 100
    : Math.min(95, Math.round(((activeIndex + 0.5) / STEPS.length) * 100));

  return (
    <div className="glass-panel p-6 sm:p-8 rounded-2xl border border-slate-800 shadow-2xl relative overflow-hidden">
      {/* Background ambient glow */}
      <div className="absolute -top-24 -right-24 w-72 h-72 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-24 -left-24 w-72 h-72 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-6 border-b border-slate-800/80 gap-3">
        <div>
          <div className="flex items-center space-x-2">
            <span className="flex h-2.5 w-2.5 relative">
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${error ? 'bg-rose-400' : isComplete ? 'bg-emerald-400' : 'bg-indigo-400'}`} />
              <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${error ? 'bg-rose-500' : isComplete ? 'bg-emerald-500' : 'bg-indigo-500'}`} />
            </span>
            <h3 className="text-lg font-semibold text-white tracking-tight flex items-center gap-2">
              Live Investigation Engine
              <Sparkles className="w-4 h-4 text-amber-400 inline" />
            </h3>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Real-time pipeline: AWS CLI scanner &rarr; OpenAI gpt-4o analyzer &rarr; PostgreSQL record
          </p>
        </div>

        {/* Progress badge */}
        <div className="flex items-center space-x-2 self-start sm:self-auto">
          <div className="px-3 py-1 rounded-full text-xs font-semibold bg-slate-900 border border-slate-800 text-slate-300">
            {error ? (
              <span className="text-rose-400 flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5" /> Pipeline Failed
              </span>
            ) : isComplete ? (
              <span className="text-emerald-400 flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5" /> Finished 100%
              </span>
            ) : (
              <span className="text-indigo-400 flex items-center gap-1.5">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> In Progress ({progressPercent}%)
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="mt-6 mb-8">
        <div className="flex justify-between text-xs font-medium text-slate-400 mb-2">
          <span>Execution Pipeline</span>
          <span>{progressPercent}%</span>
        </div>
        <div className="h-2 w-full bg-slate-900 rounded-full overflow-hidden p-0.5 border border-slate-800">
          <div
            className={`h-full rounded-full transition-all duration-500 ease-out ${
              error
                ? 'bg-rose-500 shadow-lg shadow-rose-500/50'
                : isComplete
                ? 'bg-emerald-500 shadow-lg shadow-emerald-500/50'
                : 'bg-gradient-to-r from-indigo-500 via-purple-500 to-cyan-400 shadow-lg shadow-indigo-500/50'
            }`}
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* Steps List */}
      <div className="space-y-4">
        {STEPS.map((step, idx) => {
          const isDone = isComplete || activeIndex > idx;
          const isCurrent = !isComplete && activeIndex === idx && !error;
          const isFailed = error && activeIndex === idx;

          return (
            <div
              key={step.id}
              className={`flex items-center justify-between p-3.5 rounded-xl border transition-all ${
                isCurrent
                  ? 'bg-indigo-950/30 border-indigo-500/40 shadow-md shadow-indigo-500/10'
                  : isDone
                  ? 'bg-slate-900/40 border-emerald-500/20'
                  : isFailed
                  ? 'bg-rose-950/20 border-rose-500/40'
                  : 'bg-slate-900/20 border-slate-800/40 opacity-50'
              }`}
            >
              <div className="flex items-center space-x-3.5">
                {/* Step icon */}
                <div>
                  {isFailed ? (
                    <AlertCircle className="w-5 h-5 text-rose-400 animate-pulse" />
                  ) : isDone ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                  ) : isCurrent ? (
                    <Loader2 className="w-5 h-5 text-indigo-400 animate-spin" />
                  ) : (
                    <Circle className="w-5 h-5 text-slate-600" />
                  )}
                </div>

                <div>
                  <div className="flex items-center space-x-2">
                    <span className="text-xs font-mono text-slate-500">0{step.id}</span>
                    <span
                      className={`text-sm font-medium ${
                        isCurrent
                          ? 'text-indigo-300 font-semibold'
                          : isDone
                          ? 'text-slate-200'
                          : isFailed
                          ? 'text-rose-300'
                          : 'text-slate-400'
                      }`}
                    >
                      {step.label}
                    </span>
                  </div>
                  {isCurrent && currentMessage && (
                    <p className="text-xs text-indigo-400/90 mt-0.5 font-mono animate-pulse">
                      &rarr; {currentMessage}
                    </p>
                  )}
                </div>
              </div>

              {/* Status Tag */}
              <div className="text-xs font-mono">
                {isDone && <span className="text-emerald-400 font-medium">Completed</span>}
                {isCurrent && <span className="text-indigo-400 font-medium animate-pulse">Running</span>}
                {isFailed && <span className="text-rose-400 font-medium">Failed</span>}
                {!isDone && !isCurrent && !isFailed && <span className="text-slate-600">Pending</span>}
              </div>
            </div>
          );
        })}
      </div>

      {/* Error alert if any */}
      {error && (
        <div className="mt-6 p-4 rounded-xl bg-rose-950/30 border border-rose-500/30 text-rose-300 text-sm flex items-start space-x-3">
          <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <span className="font-semibold text-rose-200">Investigation Interrupted</span>
            <p className="text-xs text-rose-300/90 font-mono break-all">{error}</p>
          </div>
        </div>
      )}

      {/* Real-time Log Output Terminal */}
      {logs.length > 0 && (
        <div className="mt-6">
          <div className="flex items-center space-x-2 text-xs font-medium text-slate-400 mb-2">
            <Terminal className="w-3.5 h-3.5 text-slate-500" />
            <span>WebSocket Live Event Feed</span>
          </div>
          <div className="bg-slate-950 rounded-xl p-3 border border-slate-800/80 max-h-36 overflow-y-auto font-mono text-xs text-slate-400 space-y-1.5 scrollbar-thin">
            {logs.map((log, index) => (
              <div key={index} className="flex items-start space-x-2">
                <span className="text-indigo-500 shrink-0">#</span>
                <span className="text-slate-300 break-words">{log}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
