import React, { useState } from 'react';
import { Mail, Lock, UserPlus, Loader2, ShieldCheck, AlertCircle, ArrowLeft, Check } from 'lucide-react';
import { api } from '../api';

interface SignupProps {
  onSwitchToLogin: () => void;
  onSignupSuccess: () => void;
}

export const Signup: React.FC<SignupProps> = ({ onSwitchToLogin, onSignupSuccess }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email || !password || !confirmPassword) {
      setError('Please fill out all required fields.');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters long.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match. Please verify.');
      return;
    }

    try {
      setIsLoading(true);
      await api.signup(email, password);
      onSignupSuccess();
    } catch (err: any) {
      setError(err?.message || 'Failed to create account. Please try again.');
    } finally {
      setIsLoading(false);
    }
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
            Create Your Account
          </h1>
          <p className="text-slate-400 text-sm mt-1.5">
            Start auditing your AWS cloud infrastructure for hidden costs
          </p>
        </div>

        {/* Card */}
        <div className="glass-panel p-8 rounded-2xl border border-slate-800/80 shadow-2xl backdrop-blur-xl">
          <div className="mb-6">
            <h2 className="text-xl font-bold text-white">Join Cost Detective</h2>
            <p className="text-xs text-slate-400 mt-1">
              Protected by custom bcrypt hashing and secure JWT tokens
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
                  id="signup-email"
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
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Password <span className="text-slate-500">(minimum 6 characters)</span>
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                  <Lock className="h-4 w-4 text-slate-500" />
                </div>
                <input
                  id="signup-password"
                  type="password"
                  required
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-900/80 border border-slate-800 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500 transition-all"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Confirm Password
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                  <Lock className="h-4 w-4 text-slate-500" />
                </div>
                <input
                  id="signup-confirm-password"
                  type="password"
                  required
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-900/80 border border-slate-800 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500 transition-all"
                />
              </div>
            </div>

            {/* Feature Checklist */}
            <div className="py-2 text-xs text-slate-400 space-y-1.5">
              <div className="flex items-center space-x-2">
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span>Immediate access to AWS resource group audits</span>
              </div>
              <div className="flex items-center space-x-2">
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span>AI-powered automated remediation recommendations</span>
              </div>
            </div>

            <button
              id="signup-submit-btn"
              type="submit"
              disabled={isLoading}
              className="w-full mt-2 py-2.5 px-4 rounded-xl bg-gradient-to-r from-indigo-600 via-indigo-500 to-indigo-600 hover:from-indigo-500 hover:to-indigo-500 text-white font-medium text-sm shadow-lg shadow-indigo-600/25 flex items-center justify-center space-x-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed group"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Registering...</span>
                </>
              ) : (
                <>
                  <UserPlus className="w-4 h-4" />
                  <span>Create Account</span>
                </>
              )}
            </button>
          </form>
        </div>

        {/* Switch to Login */}
        <div className="text-center mt-6">
          <p className="text-xs text-slate-400">
            Already have an account?{' '}
            <button
              id="switch-to-login-btn"
              onClick={onSwitchToLogin}
              className="text-indigo-400 hover:text-indigo-300 font-semibold transition-colors ml-1 inline-flex items-center gap-1"
            >
              <ArrowLeft className="w-3 h-3" /> Sign in instead
            </button>
          </p>
        </div>
      </div>
    </div>
  );
};
