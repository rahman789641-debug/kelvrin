import React from "react";
import { GlareCard } from "@/components/ui/glare-cards";
import { Sparkles, Network, Activity } from "lucide-react";
import { motion } from "framer-motion";
import { 
  AreaChart, 
  Area, 
  ResponsiveContainer, 
  Tooltip, 
  BarChart, 
  Bar 
} from "recharts";

// Mock data for Recharts
const chartData = [
  { time: "00:00", value: 45 },
  { time: "04:00", value: 52 },
  { time: "08:00", value: 48 },
  { time: "12:00", value: 70 },
  { time: "16:00", value: 61 },
  { time: "20:00", value: 85 },
  { time: "23:59", value: 99 },
];

export default function DemoOne() {
  return (
    <div className="min-h-screen w-full bg-[#050505] flex flex-col items-center justify-center p-6 lg:p-24 relative overflow-hidden font-sans">
      
      {/* 1. Dynamic Background Orbs */}
      <div className="absolute top-0 -left-20 w-[500px] h-[500px] bg-blue-600/10 rounded-full blur-[140px] mix-blend-screen pointer-events-none animate-pulse" />
      <div className="absolute bottom-0 -right-20 w-[600px] h-[600px] bg-emerald-500/10 rounded-full blur-[160px] mix-blend-screen pointer-events-none" />

      {/* 2. Header Section */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center mb-20 relative z-10"
      >
        <p className="text-zinc-500 max-w-xl mx-auto text-lg font-light leading-relaxed">
          Real-time neural telemetry and generative optics powered by distributed node architecture.
        </p>
      </motion.div>

      {/* 3. Grid Layout */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 w-full max-w-7xl relative z-10">
        
        {/* Card 1: Recharts Area Animation */}
        <GlareCard tiltIntensity={12} className="flex flex-col h-[450px] bg-zinc-900/50 border-zinc-800/50 p-8">
          <div className="flex justify-between items-start mb-auto">
            <div className="space-y-6">
              <div className="flex items-center gap-2 text-emerald-400">
                <Activity size={18} />
                <span className="text-xs font-mono uppercase tracking-widest">Live Flow</span>
              </div>
              <h3 className="text-2xl font-semibold text-white">Neural Load</h3>
            </div>
            <span className="text-3xl font-mono text-white/90">82%</span>
          </div>

          <div className="h-48 w-full mt-8">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="colorVal" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <Tooltip 
                  contentStyle={{ backgroundColor: '#18181b', border: '1px solid #3f3f46', borderRadius: '8px', color: '#fff' }}
                  itemStyle={{ color: '#10b981' }}
                />
                <Area 
                  type="monotone" 
                  dataKey="value" 
                  stroke="#10b981" 
                  strokeWidth={2}
                  fillOpacity={1} 
                  fill="url(#colorVal)" 
                  animationDuration={2000}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </GlareCard>

        {/* Card 2: Interactive Media Focus */}
        <GlareCard 
          tiltIntensity={20} 
          glareColor="rgba(56, 189, 248, 0.4)"
          className="h-[450px] p-0 overflow-hidden group border-none"
        >
          <div className="absolute inset-0 bg-gradient-to-t from-[#050505] via-[#050505]/20 to-transparent z-10" />
          <img 
            src="/assets/synthetic-core.jpg"
            onError={(e) => {
              e.currentTarget.src = "https://cdn.21st.dev/assets/mirror/3f/3f7ce4aaef5fe69a1c2cfa1a2b6a891c4d654fde9b6656999fe504c159fde0cb.jpg";
            }}
            alt="Core engine"
            className="w-full h-full object-cover transition-all duration-700 ease-out group-hover:scale-110 grayscale group-hover:grayscale-0"
          />
          <div className="absolute inset-0 z-20 p-8 flex flex-col justify-end">
             <div className="translate-y-4 group-hover:translate-y-0 transition-transform duration-500">
                <h3 className="text-2xl font-bold text-white mb-2">Synthetic Core</h3>
                <p className="text-zinc-400 text-sm mb-6 opacity-0 group-hover:opacity-100 transition-opacity duration-500">
                   Accessing the primary rendering pipeline for cross-chain verification.
                </p>
                <div className="flex items-center gap-4">
                   <div className="h-[1px] flex-1 bg-white/20" />
                   <Sparkles className="text-blue-400 animate-pulse" size={16} />
                </div>
             </div>
          </div>
        </GlareCard>

        {/* Card 3: System Analytics Bar Chart */}
        <GlareCard 
          tiltIntensity={15}
          glareColor="rgba(244, 63, 94, 0.2)"
          className="h-[450px] flex flex-col justify-between bg-zinc-950/80 border-white/5"
        >
          <div className="p-8 space-y-6">
            <div className="flex justify-between items-center">
              <Network className="text-rose-500" size={24} />
              <div className="flex gap-1">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-bounce" style={{ animationDelay: `${i * 0.2}s` }} />
                ))}
              </div>
            </div>
            <div>
              <p className="text-zinc-500 text-xs font-mono mb-1 uppercase tracking-tighter">Latent Response</p>
              <h3 className="text-4xl font-bold text-white tracking-tighter">0.002<span className="text-rose-500 text-lg">ms</span></h3>
            </div>
          </div>
          
          <div className="h-40 w-full px-2 overflow-hidden">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <Bar 
                  dataKey="value" 
                  fill="#f43f5e" 
                  radius={[4, 4, 0, 0]}
                  animationBegin={500}
                  animationDuration={1500}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </GlareCard>
      </div>

    </div>
  );
}
