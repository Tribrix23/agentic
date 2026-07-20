import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { motion } from 'framer-motion';

export const SettingsModal = ({ 
  user, 
  onClose, 
  onLogout 
}: { 
  user: { name: string, avatar: string, email?: string, token?: string },
  onClose: () => void,
  onLogout: () => void 
}) => {
  const [email, setEmail] = useState<string>('Loading...');

  useEffect(() => {
    async function fetchEmail() {
      if (!user.token) {
        setEmail('No token provided');
        return;
      }
      try {
        const result = await (window as any).electron.fetchSupabaseEmail(user.token);
        
        if (result.error) {
          console.error('Error fetching email via IPC:', result.error);
          setEmail('Error: ' + result.error);
        } else if (result.email) {
          setEmail(result.email);
        } else {
          setEmail('No email found');
        }
      } catch (err: any) {
        console.error('Unexpected error fetching email:', err);
        setEmail('Error: ' + (err.message || String(err)));
      }
    }
    fetchEmail();
  }, [user.token]);

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-8 bg-black/60 backdrop-blur-sm">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="w-full max-w-2xl bg-[#0f0f13] border border-white/10 rounded-xl shadow-2xl flex flex-col overflow-hidden"
      >
        
        {/* Header */}
        <div className="flex items-start justify-between p-6 pb-4">
          <div>
            <h2 className="text-2xl font-bold text-white mb-1">Account</h2>
            <p className="text-[#8b8b93] text-sm">Manage your plan, credentials, and general preferences.</p>
          </div>
          <button 
            onClick={onClose}
            className="p-2 text-[#8b8b93] hover:text-white hover:bg-white/5 rounded-md transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 pt-2 flex-1">
          
          <h3 className="text-white font-semibold text-sm mb-3">Account</h3>
          
          <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
            {/* Plan Info */}
            <div className="flex items-center justify-between p-4 border-b border-white/5">
              <div className="flex flex-col">
                <span className="text-white font-medium text-[14px]">Your Plan: Quantix AI Pro</span>
                <span className="text-[#8b8b93] text-[13px]">You can upgrade to a Quantix AI Ultra plan to receive higher rate limits.</span>
              </div>
              <button className="bg-[#4F46E5] hover:bg-[#6366F1] text-white px-4 py-1.5 rounded-md text-[13px] font-medium transition-colors">
                Upgrade
              </button>
            </div>
            
            {/* Email / Logout */}
            <div className="flex items-center justify-between p-4">
              <div className="flex flex-col">
                <span className="text-white font-medium text-[14px]">Email</span>
                <span className="text-[#8b8b93] text-[13px]">{email}</span>
              </div>
              <button 
                onClick={onLogout}
                className="bg-white/5 hover:bg-red-500/20 text-[#a8a8b1] hover:text-red-400 px-4 py-1.5 rounded-md text-[13px] font-medium transition-colors border border-white/5 hover:border-red-500/30"
              >
                Sign Out
              </button>
            </div>
          </div>

          <p className="mt-8 text-[12px] text-[#6b6b73]">
            By using this app, you agree to its <span className="text-[#4F46E5] hover:underline cursor-pointer">Terms of Service</span>
          </p>

        </div>

      </motion.div>
    </div>
  );
};
