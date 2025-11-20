import React, { useState, useEffect, useRef } from 'react';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, AreaChart, Area 
} from 'recharts';
import { 
  Activity, Music, Brain, AlertCircle, BookOpen, Settings, Play, Pause, SkipForward, Heart, 
  Smartphone, BarChart2, User, ShieldCheck, LogIn, Wifi, Copy, ExternalLink, HelpCircle, X, CheckCircle, Monitor, Key, Zap, AlertTriangle, Radio, RefreshCw
} from 'lucide-react';

// --- 設定區域 ---

const CLIENT_ID = 'ae9cd0d87e4a4564936fbb84b3f937c1';
// 自動抓取當前網址 (Vercel 網址)
const REDIRECT_URI = window.location.origin.replace(/\/$/, ""); 

const AUTH_ENDPOINT = "https://accounts.spotify.com/authorize";
const RESPONSE_TYPE = "token";
// 確保權限正確 (user-read-private)
const SCOPES = "user-read-currently-playing user-read-playback-state user-read-recently-played user-read-email user-read-private";
const LOGIN_URL = `${AUTH_ENDPOINT}?client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=${RESPONSE_TYPE}&scope=${encodeURIComponent(SCOPES)}`;

// --- 模擬數據 ---
const MOCK_SONG_DATABASE = [
  { id: 1, name: "Rainy Day Jazz", artist: "Relaxing Vibes", cover: "bg-blue-900", features: { valence: 0.2, energy: 0.3, tempo: 70 } },
  { id: 2, name: "High Intensity Workout", artist: "Gym Heroes", cover: "bg-red-600", features: { valence: 0.8, energy: 0.9, tempo: 140 } },
  { id: 3, name: "Melancholy Strings", artist: "Orchestra Z", cover: "bg-gray-700", features: { valence: 0.1, energy: 0.2, tempo: 60 } },
];

// AI 模型參數
const AI_CONFIG = {
  baselineLearningRate: 0.1,
  anomalyThreshold: 0.35,
};

// --- 輔助元件 ---
const Card = ({ children, className = "" }) => (
  <div className={`bg-gray-800/50 backdrop-blur-md border border-gray-700 rounded-xl p-4 ${className}`}>
    {children}
  </div>
);

const Badge = ({ children, variant = "default" }) => {
  const colors = {
    default: "bg-gray-700 text-gray-300",
    success: "bg-green-900/50 text-green-400 border-green-800",
    warning: "bg-yellow-900/50 text-yellow-400 border-yellow-800",
    danger: "bg-red-900/50 text-red-400 border-red-800",
    info: "bg-blue-900/50 text-blue-400 border-blue-800",
  };
  return (
    <span className={`px-2 py-1 rounded-full text-xs font-medium border ${colors[variant] || colors.default}`}>
      {children}
    </span>
  );
};

const Button = ({ onClick, children, variant = "primary", className = "", disabled = false }) => {
  const variants = {
    primary: "bg-green-500 hover:bg-green-600 text-black font-bold",
    secondary: "bg-gray-700 hover:bg-gray-600 text-white",
    outline: "border border-gray-500 hover:bg-gray-800 text-gray-300",
    danger: "bg-red-500 hover:bg-red-600 text-white",
    spotify: "bg-[#1DB954] hover:bg-[#1ed760] text-black font-bold",
    blue: "bg-blue-600 hover:bg-blue-500 text-white font-bold"
  };
  return (
    <button 
      onClick={onClick} 
      disabled={disabled}
      className={`px-4 py-2 rounded-full transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed ${variants[variant]} ${className}`}
    >
      {children}
    </button>
  );
};

// --- 主要應用程式元件 ---

export default function AcousticBiomarkerApp() {
  const [token, setToken] = useState("");
  const [manualToken, setManualToken] = useState("");
  const [activeTab, setActiveTab] = useState('dashboard');
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  const [debugMsg, setDebugMsg] = useState("Initializing...");
  
  const [isLoading, setIsLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [anomalyDetected, setAnomalyDetected] = useState(false);
  
  // FIX: 預設改為 'auto'，適合 Real Domain 部署
  const [connMethod, setConnMethod] = useState('auto'); 
  
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentSong, setCurrentSong] = useState(MOCK_SONG_DATABASE[0]);
  
  // AI 模型狀態
  const [userBaseline, setUserBaseline] = useState({ valence: 0.5, energy: 0.5 });
  const [sessionData, setSessionData] = useState([]); 
  const [currentEmotionState, setCurrentEmotionState] = useState({ label: "Neutral", score: 0 });
  
  const [journalEntries, setJournalEntries] = useState([]);
  const [showJournalPrompt, setShowJournalPrompt] = useState(false);
  const [journalInput, setJournalInput] = useState("");

  const timerRef = useRef(null);
  const redirectInputRef = useRef(null);

  // --- 初始化：檢查 Token ---
  useEffect(() => {
    const hash = window.location.hash;
    let tokenFromStorage = window.localStorage.getItem("spotify_token");

    if (hash) {
      const tokenPart = hash.substring(1).split("&").find(elem => elem.startsWith("access_token"));
      if (tokenPart) {
        tokenFromStorage = tokenPart.split("=")[1];
        window.location.hash = "";
        window.localStorage.setItem("spotify_token", tokenFromStorage);
        setDebugMsg("Token extracted from URL hash.");
      }
    }

    if (tokenFromStorage) {
      setToken(tokenFromStorage);
      setConnectionStatus('idle');
      setDebugMsg("Token loaded.");
    } else {
      setDebugMsg("No token found.");
    }
  }, []);

  const logout = () => {
    setToken("");
    window.localStorage.removeItem("spotify_token");
    setConnectionStatus('disconnected');
    setSessionData([]);
    setDebugMsg("Logged out.");
  };

  // --- 核心邏輯：獲取真實數據 ---
  const fetchSpotifyData = async () => {
    if (!token) return;
    
    try {
      const response = await fetch("https://api.spotify.com/v1/me/player/currently-playing", {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (response.status === 401) {
        setDebugMsg("Token Expired (401)");
        logout();
        return;
      }

      if (response.status === 204) {
        setConnectionStatus('idle');
        setDebugMsg("Spotify Connected (No Music)");
        return; 
      }

      const data = await response.json();
      if (!data || !data.item) {
        setConnectionStatus('idle');
        return;
      }

      setConnectionStatus('active');
      setDebugMsg(`Playing: ${data.item.name}`);

      if (data.item.type !== 'track') {
         setDebugMsg("Podcast/Ad Detected (No Features)");
         return;
      }

      const trackId = data.item.id;
      
      const isSameSong = currentSong.id === trackId;
      const isDefaultFeatures = currentSong.features.valence === 0.5 && currentSong.features.energy === 0.5;

      if (isSameSong && !isDefaultFeatures) {
         return;
      }

      let features = { valence: 0.5, energy: 0.5, tempo: 120 };
      try {
        const featuresResponse = await fetch(`https://api.spotify.com/v1/audio-features/${trackId}`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        
        if (featuresResponse.ok) {
            const featuresData = await featuresResponse.json();
            if (featuresData) {
                features = featuresData;
                setDebugMsg("Features Loaded!");
            } else {
                setDebugMsg("Features API returned null");
            }
        } else {
            setDebugMsg(`Features Error: ${featuresResponse.status}`);
        }
      } catch (e) {
        console.warn("Failed to load audio features", e);
        setDebugMsg("Features Network Error");
      }

      const newSong = {
        id: trackId,
        name: data.item.name,
        artist: data.item.artists.map(a => a.name).join(", "),
        cover: data.item.album.images[0]?.url ? `bg-[url('${data.item.album.images[0].url}')] bg-cover bg-center` : 'bg-gray-800',
        imageUrl: data.item.album.images[0]?.url,
        features: {
          valence: features.valence ?? 0.5,
          energy: features.energy ?? 0.5,
          tempo: features.tempo ?? 120
        }
      };

      setCurrentSong(newSong);
      updateSessionData(newSong);
      
    } catch (error) {
      console.error("Error fetching Spotify data:", error);
      setDebugMsg(`Error: ${error.message}`);
    }
  };

  const calculateEmotion = (features) => {
    if (!features) return { label: "Neutral", score: 0.5, color: "text-gray-400" };
    const { valence, energy } = features;
    if (valence > 0.6 && energy > 0.6) return { label: "Happy/Excited", score: 0.9, color: "text-yellow-400" };
    if (valence < 0.4 && energy < 0.4) return { label: "Sad/Melancholic", score: 0.2, color: "text-blue-400" };
    if (valence < 0.4 && energy > 0.6) return { label: "Anxious/Tense", score: 0.3, color: "text-red-400" };
    if (valence > 0.6 && energy < 0.4) return { label: "Calm/Relaxed", score: 0.8, color: "text-green-400" };
    return { label: "Neutral", score: 0.5, color: "text-gray-400" };
  };

  const updateSessionData = (song) => {
    setSessionData(prev => {
      const newData = [...prev, {
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        timestamp: Date.now(),
        song: song.name,
        features: song.features,
        moodIndex: (song.features.valence + song.features.energy) / 2 
      }];
      return newData.slice(-20);
    });
  };

  useEffect(() => {
    if (sessionData.length === 0) return;
    const lastSession = sessionData[sessionData.length - 1];
    const emotion = calculateEmotion(lastSession.features);
    setCurrentEmotionState(emotion);

    const dist = Math.sqrt(
      Math.pow(lastSession.features.valence - userBaseline.valence, 2) + 
      Math.pow(lastSession.features.energy - userBaseline.energy, 2)
    );

    setUserBaseline(prev => ({
      valence: prev.valence * (1 - AI_CONFIG.baselineLearningRate) + lastSession.features.valence * AI_CONFIG.baselineLearningRate,
      energy: prev.energy * (1 - AI_CONFIG.baselineLearningRate) + lastSession.features.energy * AI_CONFIG.baselineLearningRate
    }));

    if (dist > AI_CONFIG.anomalyThreshold) {
      setAnomalyDetected(true);
    } else {
      setAnomalyDetected(false);
    }
  }, [sessionData]);

  useEffect(() => {
    if (connectionStatus !== 'disconnected') {
      timerRef.current = setInterval(fetchSpotifyData, 5000);
      fetchSpotifyData(); 
    } else if (isPlaying && connectionStatus === 'disconnected') {
      timerRef.current = setInterval(() => {
        const randomIdx = Math.floor(Math.random() * MOCK_SONG_DATABASE.length);
        const s = MOCK_SONG_DATABASE[randomIdx];
        setCurrentSong(s);
        updateSessionData(s);
      }, 3000);
    } else {
      clearInterval(timerRef.current);
    }
    return () => clearInterval(timerRef.current);
  }, [isPlaying, connectionStatus, token]);

  const handleJournalSubmit = (e) => {
    e.preventDefault();
    if (!journalInput.trim()) return;
    
    const newEntry = {
      id: Date.now(),
      date: new Date().toLocaleString(),
      text: journalInput,
      triggerSong: currentSong.name,
      detectedEmotion: currentEmotionState.label
    };
    
    setJournalEntries([newEntry, ...journalEntries]);
    setJournalInput("");
    setShowJournalPrompt(false);
    setAnomalyDetected(false);
    setActiveTab('journal');
  };

  const handleManualTokenSubmit = () => {
    if (manualToken.length > 10) {
        setToken(manualToken);
        window.localStorage.setItem("spotify_token", manualToken);
    } else {
        alert("Please enter a valid token");
    }
  };
  
  const handleInputClick = () => {
    if (redirectInputRef.current) {
      redirectInputRef.current.select();
      try { document.execCommand('copy'); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch (e) {}
    }
  };

  // --- UI 元件渲染 ---

  const renderDashboard = () => (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* 連線狀態指示器 */}
      <div className="bg-gray-900 border border-gray-700 rounded-lg p-3 flex justify-between items-center">
         <div className="flex items-center gap-2">
            <div className={`w-3 h-3 rounded-full ${connectionStatus === 'active' ? 'bg-green-500 animate-pulse' : connectionStatus === 'idle' ? 'bg-yellow-500' : 'bg-gray-500'}`}></div>
            <div className="flex flex-col">
               <span className="text-xs font-bold text-white uppercase">
                  {connectionStatus === 'active' ? 'Monitoring Active' : connectionStatus === 'idle' ? 'Spotify Connected (Idle)' : 'Disconnected'}
               </span>
               <span className="text-[10px] text-gray-400 font-mono truncate max-w-[200px]">{debugMsg}</span>
            </div>
         </div>
         {connectionStatus !== 'disconnected' && (
             <button onClick={logout} className="text-xs text-red-400 hover:text-red-300 border border-red-900 px-2 py-1 rounded">Logout</button>
         )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Card className="flex flex-col items-center justify-center p-6 bg-gradient-to-br from-gray-800 to-gray-900 relative overflow-hidden">
           {connectionStatus === 'active' && <div className="absolute top-2 right-2"><Wifi size={12} className="text-green-500 animate-pulse"/></div>}
          <span className="text-gray-400 text-xs uppercase tracking-wider mb-2">Current Mood</span>
          <div className={`text-xl font-bold ${currentEmotionState.color}`}>{currentEmotionState.label}</div>
          <div className="text-xs text-gray-500 mt-1">AI Inference (Layer A)</div>
        </Card>
        
        <Card className={`flex flex-col items-center justify-center p-6 border-2 ${anomalyDetected ? 'border-red-500/50 bg-red-900/10' : 'border-green-500/20'}`}>
          <span className="text-gray-400 text-xs uppercase tracking-wider mb-2">Status Monitor</span>
          {anomalyDetected ? (
            <>
              <AlertCircle className="w-8 h-8 text-red-500 mb-2 animate-pulse" />
              <span className="text-red-400 font-bold text-sm text-center">Shift Detected</span>
              <button onClick={() => setShowJournalPrompt(true)} className="mt-2 text-xs bg-red-600 text-white px-3 py-1 rounded-full hover:bg-red-500">Log Emotion</button>
            </>
          ) : (
            <>
              <ShieldCheck className="w-8 h-8 text-green-500 mb-2" />
              <span className="text-green-400 font-bold text-sm">Stable</span>
              <span className="text-xs text-gray-500 mt-1">Layer C Active</span>
            </>
          )}
        </Card>
      </div>

      {/* 播放器區塊 */}
      {connectionStatus === 'disconnected' ? (
         <Card className="flex flex-col items-center justify-center p-6 space-y-4 border-green-500/30 border-dashed">
           <h3 className="text-lg font-bold text-white">Connect to Reality</h3>
           
           <div className="flex gap-2 mb-2 bg-gray-800 p-1 rounded-lg">
              <button onClick={() => setConnMethod('auto')} className={`px-3 py-1 text-xs rounded-md ${connMethod === 'auto' ? 'bg-green-600 text-white' : 'text-gray-400'}`}>Auto (App)</button>
              <button onClick={() => setConnMethod('manual')} className={`px-3 py-1 text-xs rounded-md ${connMethod === 'manual' ? 'bg-gray-600 text-white' : 'text-gray-400'}`}>Manual</button>
              <button onClick={() => setConnMethod('sim')} className={`px-3 py-1 text-xs rounded-md ${connMethod === 'sim' ? 'bg-blue-600 text-white' : 'text-gray-400'}`}>Sim</button>
           </div>

           {connMethod === 'manual' && (
             <div className="w-full bg-gray-800 p-4 rounded-lg border border-gray-600 space-y-3 animate-in fade-in">
                <div className="flex items-center gap-2 border-b border-gray-700 pb-2">
                   <Key size={16} className="text-yellow-400"/>
                   <span className="text-sm font-bold text-white">Manual Token</span>
                </div>
                <div className="flex gap-2 mt-2">
                   <input 
                      type="text" 
                      placeholder="Paste OAuth Token here..." 
                      value={manualToken}
                      onChange={(e) => setManualToken(e.target.value)}
                      className="flex-1 bg-black border border-gray-600 rounded px-2 py-2 text-xs text-white focus:ring-2 focus:ring-green-500 outline-none"
                   />
                   <Button variant="primary" onClick={handleManualTokenSubmit} className="text-xs whitespace-nowrap">Connect</Button>
                </div>
             </div>
           )}

           {connMethod === 'auto' && (
             <div className="w-full bg-gray-800 p-4 rounded-lg border border-gray-600 space-y-3 animate-in fade-in">
                <div className="flex items-center gap-2 border-b border-gray-700 pb-2">
                   <Zap size={16} className="text-green-400"/>
                   <span className="text-sm font-bold text-white">Standard Auto-Login</span>
                </div>
                <p className="text-[10px] text-gray-400">Redirect URI for Spotify Dashboard:</p>
                <div className="flex items-center gap-2 bg-black/30 p-2 rounded border border-gray-600">
                   <input ref={redirectInputRef} type="text" readOnly value={REDIRECT_URI} onClick={handleInputClick} className="bg-transparent text-xs text-green-400 flex-1 outline-none font-mono"/>
                   <span className="text-[10px] text-gray-500 cursor-pointer" onClick={handleInputClick}>{copied ? "Copied" : "Copy URI"}</span>
                </div>
                
                {/* FIX: 移除了 target="_blank" 以防止彈出新視窗 */}
                <a 
                   href={LOGIN_URL}
                   className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-full transition-all active:scale-95 bg-[#1DB954] hover:bg-[#1ed760] text-black font-bold mt-2"
                >
                  <LogIn size={18} /> Login with Spotify
                </a>
             </div>
           )}

           {connMethod === 'sim' && (
             <div className="w-full text-center animate-in fade-in">
                <Button variant="secondary" onClick={() => {setIsPlaying(!isPlaying); setDebugMsg("Running Simulation Mode");}} className="w-full text-xs">
                  {isPlaying ? "Stop Simulation" : "Start Simulation Mode"}
                </Button>
             </div>
           )}
         </Card>
      ) : (
        <Card className="relative overflow-hidden group min-h-[120px] flex items-center justify-center">
          {connectionStatus === 'idle' ? (
             <div className="text-center p-4 z-10">
                <Music className="w-8 h-8 text-gray-500 mx-auto mb-2" />
                <h3 className="text-white font-bold">Waiting for Music...</h3>
                <p className="text-xs text-gray-400">Please open Spotify and play a song to start tracking.</p>
             </div>
          ) : (
             <>
               <div className={`absolute inset-0 opacity-20 ${currentSong.cover} transition-all duration-1000`}></div>
               {currentSong.imageUrl && <div className="absolute inset-0 opacity-20 bg-cover bg-center blur-md" style={{backgroundImage: `url(${currentSong.imageUrl})`}}></div>}
               
               <div className="relative z-10 flex items-center space-x-4 w-full">
                 {currentSong.imageUrl ? (
                   <img src={currentSong.imageUrl} alt="Cover" className="w-16 h-16 rounded-lg shadow-lg" />
                 ) : (
                   <div className={`w-16 h-16 rounded-lg shadow-lg ${currentSong.cover} flex items-center justify-center`}>
                     <Music className="text-white/70" />
                   </div>
                 )}
                 
                 <div className="flex-1 min-w-0">
                   <h3 className="text-white font-bold truncate">{currentSong.name}</h3>
                   <p className="text-gray-400 text-sm truncate">{currentSong.artist}</p>
                   <div className="flex items-center space-x-2 mt-1 text-xs text-gray-500">
                     {currentSong.features?.valence === 0.5 && currentSong.features?.energy === 0.5 ? (
                        <span className="flex items-center gap-1 text-yellow-400 animate-pulse"><RefreshCw size={10}/> Analysing...</span>
                     ) : (
                        <>
                           <span title="Valence">V: {currentSong.features?.valence?.toFixed(2)}</span>
                           <span title="Energy">E: {currentSong.features?.energy?.toFixed(2)}</span>
                        </>
                     )}
                   </div>
                 </div>
                 <div className="flex flex-col items-end">
                    <span className="text-[10px] text-green-400 font-mono uppercase">Live</span>
                    <div className="flex gap-1 mt-1">
                      <span className="w-1 h-4 bg-green-500 animate-pulse delay-75 rounded-full"></span>
                      <span className="w-1 h-6 bg-green-500 animate-pulse delay-150 rounded-full"></span>
                    </div>
                 </div>
               </div>
             </>
          )}
        </Card>
      )}

      <Card className="h-64 flex flex-col">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-gray-300 font-semibold flex items-center gap-2">
            <Activity size={16} />
            Emotional Trajectory (Layer B)
          </h3>
        </div>
        <div className="flex-1 w-full min-h-0">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={sessionData}>
              <defs>
                <linearGradient id="colorMood" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10B981" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#10B981" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} />
              <XAxis dataKey="time" stroke="#6B7280" fontSize={10} tickLine={false} axisLine={false} />
              <YAxis stroke="#6B7280" fontSize={10} tickLine={false} axisLine={false} domain={[0, 1]} />
              <RechartsTooltip 
                contentStyle={{ backgroundColor: '#1F2937', border: 'none', borderRadius: '8px', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}
                itemStyle={{ color: '#D1D5DB' }}
              />
              <Area type="monotone" dataKey="moodIndex" stroke="#10B981" strokeWidth={2} fillOpacity={1} fill="url(#colorMood)" isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {showJournalPrompt && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in zoom-in duration-200">
          <Card className="w-full max-w-md bg-gray-900 border-gray-700 shadow-2xl">
            <div className="flex items-start gap-4 mb-4">
              <div className="p-3 bg-blue-500/20 rounded-full">
                <Brain className="text-blue-400 w-6 h-6" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-white">Check-in</h3>
                <p className="text-gray-400 text-sm mt-1">
                  AI detected a shift ({currentEmotionState.label}). How are you feeling right now?
                </p>
              </div>
            </div>
            <form onSubmit={handleJournalSubmit}>
              <textarea value={journalInput} onChange={(e) => setJournalInput(e.target.value)} placeholder="I'm feeling..." className="w-full h-32 bg-gray-800 border border-gray-700 rounded-lg p-3 text-white placeholder-gray-500 focus:ring-2 focus:ring-green-500 focus:outline-none resize-none mb-4"/>
              <div className="flex gap-3 justify-end">
                <Button variant="outline" onClick={() => setShowJournalPrompt(false)}>Skip</Button>
                <Button variant="primary" type="submit">Save Entry</Button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
}
