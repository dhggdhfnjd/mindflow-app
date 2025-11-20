import React, { useState, useEffect, useRef } from 'react';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, AreaChart, Area 
} from 'recharts';
import { 
  Activity, Music, Brain, AlertCircle, BookOpen, Settings, Play, Pause, SkipForward, Heart, 
  Smartphone, BarChart2, User, ShieldCheck, LogIn, Wifi, Copy, ExternalLink, HelpCircle, X, CheckCircle, Monitor, Key, Zap, AlertTriangle
} from 'lucide-react';

// --- 設定區域 ---

const CLIENT_ID = 'ae9cd0d87e4a4564936fbb84b3f937c1';
const REDIRECT_URI = window.location.origin.replace(/\/$/, ""); 

const AUTH_ENDPOINT = "https://accounts.spotify.com/authorize";
const RESPONSE_TYPE = "token";
const SCOPES = "user-read-currently-playing user-read-playback-state user-read-recently-played user-read-email user-read-private";
const LOGIN_URL = `${AUTH_ENDPOINT}?client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=${RESPONSE_TYPE}&scope=${encodeURIComponent(SCOPES)}&show_dialog=true`;

// --- 模擬數據 ---
const MOCK_SONG_DATABASE = [
  { id: 1, name: "Rainy Day Jazz", artist: "Relaxing Vibes", cover: "bg-blue-900", features: { valence: 0.2, energy: 0.3, tempo: 70 } },
  { id: 2, name: "High Intensity Workout", artist: "Gym Heroes", cover: "bg-red-600", features: { valence: 0.8, energy: 0.9, tempo: 140 } },
  { id: 3, name: "Melancholy Strings", artist: "Orchestra Z", cover: "bg-gray-700", features: { valence: 0.1, energy: 0.2, tempo: 60 } },
  { id: 4, name: "Happy Pop Hits", artist: "Pop Star", cover: "bg-pink-500", features: { valence: 0.9, energy: 0.8, tempo: 120 } },
  { id: 6, name: "Anxious Glitch", artist: "Noise Maker", cover: "bg-green-900", features: { valence: 0.3, energy: 0.8, tempo: 160 } },
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
  const [isRealMode, setIsRealMode] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [connMethod, setConnMethod] = useState('manual'); // Default to manual in this env
  const [anomalyDetected, setAnomalyDetected] = useState(false);
  
  // 播放與歌曲狀態
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentSong, setCurrentSong] = useState(MOCK_SONG_DATABASE[0]);
  
  // AI 模型狀態
  const [userBaseline, setUserBaseline] = useState({ valence: 0.5, energy: 0.5 });
  const [sessionData, setSessionData] = useState([]); 
  const [currentEmotionState, setCurrentEmotionState] = useState({ label: "Neutral", score: 0 });
  
  // 日誌系統
  const [journalEntries, setJournalEntries] = useState([]);
  const [showJournalPrompt, setShowJournalPrompt] = useState(false);
  const [journalInput, setJournalInput] = useState("");

  const timerRef = useRef(null);
  const redirectInputRef = useRef(null);

  // --- 初始化：檢查 Token ---
  useEffect(() => {
    const hash = window.location.hash;
    let tokenFromStorage = window.localStorage.getItem("spotify_token");

    if (!tokenFromStorage && hash) {
      const tokenPart = hash.substring(1).split("&").find(elem => elem.startsWith("access_token"));
      if (tokenPart) {
        tokenFromStorage = tokenPart.split("=")[1];
        window.location.hash = "";
        window.localStorage.setItem("spotify_token", tokenFromStorage);
      }
    }

    if (tokenFromStorage) {
      setToken(tokenFromStorage);
      setIsRealMode(true);
    }
  }, []);

  const logout = () => {
    setToken("");
    setManualToken("");
    window.localStorage.removeItem("spotify_token");
    setIsRealMode(false);
    setSessionData([]);
  };

  // --- 核心邏輯：獲取真實數據 ---
  const fetchSpotifyData = async () => {
    if (!token) return;
    setIsLoading(true);

    try {
      const response = await fetch("https://api.spotify.com/v1/me/player/currently-playing", {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (response.status === 401) {
        // Token 過期
        console.error("Token expired");
        logout();
        return;
      }

      if (response.status === 204 || response.status > 400) {
        setIsLoading(false);
        return; 
      }

      const data = await response.json();
      if (!data || !data.item) {
        setIsLoading(false);
        return;
      }

      // 檢查是否為音樂軌道
      if (data.item.type !== 'track') {
         console.log("Not a track (podcast/ad), skipping features");
         setIsLoading(false);
         return;
      }

      const trackId = data.item.id;
      

      let features = { valence: 0.5, energy: 0.5, tempo: 120 };
      try {
        const featuresResponse = await fetch(`https://api.spotify.com/v1/audio-features/${trackId}`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        
        if (featuresResponse.ok) {
            const featuresData = await featuresResponse.json();
            if (featuresData) {
                features = featuresData;
            }
        }
      } catch (e) {
        console.warn("Failed to load audio features", e);
      }

      const newSong = {
        id: trackId,
        name: data.item.name,
        artist: data.item.artists.map(a => a.name).join(", "),
        cover: data.item.album.images[0]?.url ? `bg-[url('${data.item.album.images[0].url}')] bg-cover bg-center` : 'bg-gray-800',
        imageUrl: data.item.album.images[0]?.url,
        features: {
          valence: features.valence || 0.5,
          energy: features.energy || 0.5,
          tempo: features.tempo || 100
        }
      };

      setCurrentSong(newSong);
      updateSessionData(newSong);
      
    } catch (error) {
      console.error("Error fetching Spotify data:", error);
      if (error.message && error.message.includes("401")) logout();
    }
    setIsLoading(false);
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
      if (!showJournalPrompt && activeTab !== 'journal') {
        // Real App: Send Push Notification
      }
    } else {
      setAnomalyDetected(false);
    }
  }, [sessionData]);

  useEffect(() => {
    if (isRealMode) {
      timerRef.current = setInterval(fetchSpotifyData, 5000);
      fetchSpotifyData();
    } else if (isPlaying) {
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
  }, [isPlaying, isRealMode, token]);

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
        setIsRealMode(true);
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
      <div className="grid grid-cols-2 gap-4">
        <Card className="flex flex-col items-center justify-center p-6 bg-gradient-to-br from-gray-800 to-gray-900 relative overflow-hidden">
           {isRealMode && <div className="absolute top-2 right-2"><Wifi size={12} className="text-green-500 animate-pulse"/></div>}
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
              <button 
                onClick={() => setShowJournalPrompt(true)}
                className="mt-2 text-xs bg-red-600 text-white px-3 py-1 rounded-full hover:bg-red-500"
              >
                Log Emotion
              </button>
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

      {!isRealMode ? (
         <Card className="flex flex-col items-center justify-center p-6 space-y-4 border-green-500/30 border-dashed">
           <h3 className="text-lg font-bold text-white">Connect to Reality</h3>
           
           {/* 選項切換 */}
           <div className="flex gap-2 mb-2 bg-gray-800 p-1 rounded-lg">
              <button onClick={() => setConnMethod('manual')} className={`px-3 py-1 text-xs rounded-md ${connMethod === 'manual' ? 'bg-green-600 text-white' : 'text-gray-400'}`}>Manual (Best for Preview)</button>
              <button onClick={() => setConnMethod('auto')} className={`px-3 py-1 text-xs rounded-md ${connMethod === 'auto' ? 'bg-gray-600 text-white' : 'text-gray-400'}`}>Auto (For App/Web)</button>
              <button onClick={() => setConnMethod('sim')} className={`px-3 py-1 text-xs rounded-md ${connMethod === 'sim' ? 'bg-blue-600 text-white' : 'text-gray-400'}`}>Simulation</button>
           </div>

           {connMethod === 'manual' && (
             <div className="w-full bg-gray-800 p-4 rounded-lg border border-gray-600 space-y-3 animate-in fade-in">
                <div className="flex items-center gap-2 border-b border-gray-700 pb-2">
                   <Key size={16} className="text-yellow-400"/>
                   <span className="text-sm font-bold text-white">Manual Token</span>
                </div>
                
                {/* 警語：解釋為什麼要用手動模式 */}
                <div className="bg-yellow-900/30 border border-yellow-800 p-2 rounded text-[10px] text-yellow-200 flex gap-2">
                    <AlertTriangle size={14} className="shrink-0 mt-0.5"/>
                    <span>Redirects (Auto Login) usually cause 404 errors in this preview window. Use this manual method to test instantly.</span>
                </div>

                <ol className="list-decimal list-inside text-[10px] text-gray-300 space-y-1">
                  <li>Open <a href="https://developer.spotify.com/documentation/web-api/reference/get-the-users-currently-playing-track" target="_blank" rel="noreferrer" className="text-blue-400 underline">Spotify API Reference</a></li>
                  <li>Find <strong>"Try it"</strong> (right side) & Click <strong>"Get Token"</strong>.</li>
                  <li>Copy the <strong>"Access Token"</strong> string.</li>
                </ol>
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
             <div className="w-full bg-gray-800 p-4 rounded-lg border border-gray-600 space-y-3 animate-in fade-in opacity-70">
                <div className="flex items-center gap-2 border-b border-gray-700 pb-2">
                   <Zap size={16} className="text-green-400"/>
                   <span className="text-sm font-bold text-white">Standard Auto-Login</span>
                </div>
                
                {/* 警告 */}
                <div className="bg-red-900/30 border border-red-800 p-2 rounded text-[10px] text-red-200 flex gap-2">
                    <X size={14} className="shrink-0 mt-0.5"/>
                    <span>This option will likely FAIL with "404" in this preview window. Only use if deploying to a real domain.</span>
                </div>

                <div className="flex items-center gap-2 bg-black/30 p-2 rounded border border-gray-600">
                   <input ref={redirectInputRef} type="text" readOnly value={REDIRECT_URI} onClick={handleInputClick} className="bg-transparent text-xs text-green-400 flex-1 outline-none font-mono"/>
                   <span className="text-[10px] text-gray-500 cursor-pointer" onClick={handleInputClick}>{copied ? "Copied" : "Copy URI"}</span>
                </div>
                
                <a 
                   href={LOGIN_URL}
                   target="_blank" 
                   rel="noopener noreferrer"
                   className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-full transition-all active:scale-95 bg-[#1DB954] hover:bg-[#1ed760] text-black font-bold mt-2"
                >
                  <LogIn size={18} /> Login with Spotify
                </a>
             </div>
           )}

           {connMethod === 'sim' && (
             <div className="w-full text-center animate-in fade-in">
                <p className="text-xs text-gray-400 mb-2">Use Simulation Mode (No Spotify required)</p>
                <Button variant="secondary" onClick={() => setIsPlaying(!isPlaying)} className="w-full">
                   {isPlaying ? "Stop Simulation" : "Start Simulation"}
                </Button>
             </div>
           )}

         </Card>
      ) : (
        <Card className="relative overflow-hidden group">
          {currentSong.imageUrl ? (
             <div className="absolute inset-0 opacity-20 bg-cover bg-center blur-md transition-all duration-1000" style={{backgroundImage: `url(${currentSong.imageUrl})`}}></div>
          ) : (
             <div className={`absolute inset-0 opacity-20 ${currentSong.cover} transition-colors duration-1000`}></div>
          )}
          
          <div className="relative z-10 flex items-center space-x-4">
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
                <span title="Valence">V: {currentSong.features?.valence?.toFixed(2) || '0.50'}</span>
                <span title="Energy">E: {currentSong.features?.energy?.toFixed(2) || '0.50'}</span>
                <span title="Tempo">BPM: {currentSong.features?.tempo?.toFixed(0) || '0'}</span>
              </div>
            </div>
            <div className="flex items-center space-x-2">
               <div className="flex flex-col items-end">
                 <span className="text-[10px] text-green-400 font-mono uppercase">Live Sync</span>
                 <div className="flex gap-1 mt-1">
                   <span className="w-1 h-4 bg-green-500 animate-pulse delay-75 rounded-full"></span>
                   <span className="w-1 h-6 bg-green-500 animate-pulse delay-150 rounded-full"></span>
                   <span className="w-1 h-3 bg-green-500 animate-pulse delay-300 rounded-full"></span>
                 </div>
               </div>
            </div>
          </div>
        </Card>
      )}

      <Card className="h-64 flex flex-col">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-gray-300 font-semibold flex items-center gap-2">
            <Activity size={16} />
            Emotional Trajectory (Layer B)
          </h3>
          {isRealMode && <Badge variant="success">Real-time</Badge>}
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
              <Area 
                type="monotone" 
                dataKey="moodIndex" 
                stroke="#10B981" 
                strokeWidth={2}
                fillOpacity={1} 
                fill="url(#colorMood)" 
                isAnimationActive={false} 
              />
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
              <textarea 
                value={journalInput}
                onChange={(e) => setJournalInput(e.target.value)}
                placeholder="I'm feeling..."
                className="w-full h-32 bg-gray-800 border border-gray-700 rounded-lg p-3 text-white placeholder-gray-500 focus:ring-2 focus:ring-green-500 focus:outline-none resize-none mb-4"
              />
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

  // 2. 校準頁面
  const renderCalibration = () => (
    <div className="space-y-6 animate-in slide-in-from-right duration-300">
      <div className="text-center space-y-2 mb-8">
        <h2 className="text-2xl font-bold text-white">Phase I: Calibration</h2>
        <p className="text-gray-400 text-sm">AI Learning Status</p>
      </div>

      <Card>
        <h3 className="text-lg font-semibold text-white mb-4">Current Baseline Profile</h3>
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="bg-gray-900/50 p-4 rounded-lg text-center">
            <div className="text-2xl font-bold text-green-400">{userBaseline.valence.toFixed(2)}</div>
            <div className="text-xs text-gray-500">Avg Valence</div>
          </div>
          <div className="bg-gray-900/50 p-4 rounded-lg text-center">
            <div className="text-2xl font-bold text-purple-400">{userBaseline.energy.toFixed(2)}</div>
            <div className="text-xs text-gray-500">Avg Energy</div>
          </div>
        </div>
        <div className="space-y-2">
          <div className="flex justify-between text-sm text-gray-400">
            <span>Learning Progress</span>
            <span>{sessionData.length > 50 ? '100%' : `${(sessionData.length / 50 * 100).toFixed(0)}%`}</span>
          </div>
          <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
            <div 
              className="h-full bg-green-500 transition-all duration-500" 
              style={{ width: `${Math.min(100, sessionData.length / 50 * 100)}%` }}
            ></div>
          </div>
        </div>
      </Card>
      
      {isRealMode && (
         <Button variant="danger" onClick={logout} className="w-full">Disconnect Spotify</Button>
      )}
    </div>
  );

  // 3. 日誌頁面
  const renderJournal = () => (
    <div className="space-y-6 animate-in slide-in-from-right duration-300">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-white">Emotion Log</h2>
        <Button variant="secondary" onClick={() => { /* Export Logic */ }}>Export</Button>
      </div>

      {journalEntries.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <BookOpen size={48} className="mx-auto mb-4 opacity-20" />
          <p>No entries yet.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {journalEntries.map(entry => (
            <Card key={entry.id} className="border-l-4 border-l-blue-500">
              <div className="flex justify-between items-start mb-2">
                <span className="text-xs text-gray-400">{entry.date}</span>
                <Badge variant="info">{entry.detectedEmotion}</Badge>
              </div>
              <p className="text-gray-300 mb-3">{entry.text}</p>
              <div className="text-xs text-gray-500 flex items-center gap-1">
                <Music size={12} />
                Trigger: <span className="text-gray-400">{entry.triggerSong}</span>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-black text-white font-sans selection:bg-green-500 selection:text-black pb-20 sm:pb-0">
      <div className="sticky top-0 z-40 bg-black/80 backdrop-blur-md border-b border-gray-800 p-4 flex justify-between items-center">
        <div className="flex items-center gap-2">
          <Brain className="text-green-500 w-6 h-6" />
          <h1 className="text-lg font-bold tracking-tight">MindFlow AI</h1>
        </div>
        <div className="flex gap-2 items-center">
           {isRealMode && <span className="text-[10px] text-green-500 border border-green-500 px-2 rounded-full">ONLINE</span>}
        </div>
      </div>

      <main className="max-w-md mx-auto p-4 pt-6">
        {activeTab === 'dashboard' && renderDashboard()}
        {activeTab === 'calibration' && renderCalibration()}
        {activeTab === 'journal' && renderJournal()}
      </main>

      <div className="fixed bottom-0 left-0 right-0 bg-gray-900 border-t border-gray-800 p-2 z-50 pb-safe">
        <div className="max-w-md mx-auto flex justify-around items-center">
          <button 
            onClick={() => setActiveTab('dashboard')}
            className={`flex flex-col items-center p-2 rounded-lg transition-colors ${activeTab === 'dashboard' ? 'text-green-500' : 'text-gray-500 hover:text-gray-300'}`}
          >
            <Activity size={24} />
            <span className="text-[10px] mt-1">Monitor</span>
          </button>
          <button 
            onClick={() => setActiveTab('calibration')}
            className={`flex flex-col items-center p-2 rounded-lg transition-colors ${activeTab === 'calibration' ? 'text-green-500' : 'text-gray-500 hover:text-gray-300'}`}
          >
            <Settings size={24} />
            <span className="text-[10px] mt-1">Settings</span>
          </button>
          <button 
            onClick={() => setActiveTab('journal')}
            className={`flex flex-col items-center p-2 rounded-lg transition-colors ${activeTab === 'journal' ? 'text-green-500' : 'text-gray-500 hover:text-gray-300'}`}
          >
            <BookOpen size={24} />
            <span className="text-[10px] mt-1">Journal</span>
          </button>
        </div>
      </div>
    </div>
  );
}
