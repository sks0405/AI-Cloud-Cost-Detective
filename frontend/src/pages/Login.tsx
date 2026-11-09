import React, { useState } from 'react';
import { Mail, Lock, ArrowRight, Loader2, ShieldCheck, AlertCircle, Sparkles } from 'lucide-react';
import { api } from '../api';

interface LoginProps {
  onSwitchToSignup: () => void;
  onLoginSuccess: () => void;
}

export const Login: React.FC<LoginProps> = ({ onSwitchToSignup, onLoginSuccess }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email || !password) {
      setError('Please provide both email and password.');
      return;
    }

    try {
      setIsLoading(true);
      await api.login(email, password);
      onLoginSuccess();
    } catch (err: any) {
      setError(err?.message || 'Failed to authenticate. Please check your credentials.');
    } finally {
      setIsLoading(false);
    }
  };

  const fillDemoAccount = () => {
    setEmail('devops@example.com');
    setPassword('secret123');
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden bg-slate-950">
      {/* Background Decorative Mesh & Glows */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[550px] h-[550px] bg-gradient-to-tr from-indigo-600/15 via-purple-600/10 to-cyan-500/15 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute -bottom-20 -left-20 w-96 h-96 bg-indigo-900/10 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-md relative z-10">
        {/* Brand Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center h-16 w-16 rounded-2xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-cyan-400 p-0.5 shadow-xl shadow-indigo-500/20 mb-4">
            <div className="h-full w-full bg-slate-950 rounded-[14px] flex items-center justify-center">
              <ShieldCheck className="h-8 w-8 text-indigo-400" />
            </div>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
            Cloud Cost Detective
          </h1>
          <p className="text-slate-400 text-sm mt-1.5">
            AI-driven cloud resource auditing & cost optimization
          </p>
        </div>

        {/* Card */}
        <div className="glass-panel p-8 rounded-2xl border border-slate-800/80 shadow-2xl backdrop-blur-xl">
          <div className="mb-6">
            <h2 className="text-xl font-bold text-white">Welcome back</h2>
            <p className="text-xs text-slate-400 mt-1">
              Enter your credentials to access your AWS cost audits
            </p>
          </div>

          {error && (
            <div className="mb-6 p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-start space-x-2.5 animate-in fade-in">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Work Email
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                  <Mail className="h-4 w-4 text-slate-500" />
                </div>
                <input
                  id="login-email"
                  type="email"
                  required
                  placeholder="name@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-900/80 border border-slate-800 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500 transition-all"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-medium text-slate-300">
                  Password
                </label>
              </div>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                  <Lock className="h-4 w-4 text-slate-500" />
                </div>
                <input
                  id="login-password"
                  type="password"
                  required
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-900/80 border border-slate-800 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500 transition-all"
                />
              </div>
            </div>

            <button
              id="login-submit-btn"
              type="submit"
              disabled={isLoading}
              className="w-full mt-2 py-2.5 px-4 rounded-xl bg-gradient-to-r from-indigo-600 via-indigo-500 to-indigo-600 hover:from-indigo-500 hover:to-indigo-500 text-white font-medium text-sm shadow-lg shadow-indigo-600/25 flex items-center justify-center space-x-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed group"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Authenticating...</span>
                </>
              ) : (
                <>
                  <span>Sign In</span>
                  <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
                </>
              )}
            </button>
          </form>

          {/* Quick Demo Helper */}
          <div className="mt-5 pt-4 border-t border-slate-800/80 flex items-center justify-between text-xs">
            <span className="text-slate-500">Need a quick test?</span>
            <button
              type="button"
              onClick={fillDemoAccount}
              className="text-indigo-400 hover:text-indigo-300 inline-flex items-center gap-1 font-medium transition-colors"
            >
              <Sparkles className="w-3 h-3 text-amber-400" />
              Fill Demo Credentials
            </button>
          </div>
        </div>

        {/* Switch to Signup */}
        <div className="text-center mt-6">
          <p className="text-xs text-slate-400">
            Don't have an account yet?{' '}
            <button
              id="switch-to-signup-btn"
              onClick={onSwitchToSignup}
              className="text-indigo-400 hover:text-indigo-300 font-semibold transition-colors ml-1"
            >
              Create an account &rarr;
            </button>
          </p>
        </div>
      </div>
    </div>
  );
};
