"use client";

import React, { useState, useRef } from 'react';
import axios from 'axios';
import { Mic, Square, Loader2, ShieldCheck, AlertCircle, BarChart3, Activity, Upload, FileAudio } from 'lucide-react';

interface DetectionResult {
  status: string;
  score: number;
  F0_mean: number;
  HNR_mean: number;
  rangeF0: number;
  jitter_local: number;
  shimmer: number;
  ai_points?: number;
}

const VoiceDetector = () => {
  const [activeTab, setActiveTab] = useState<'live' | 'upload'>('live');
  const [isRecording, setIsRecording] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<DetectionResult | null>(null);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationRef = useRef<number | undefined>(undefined);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const drawVisualizer = () => {
    if (!analyserRef.current || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const bufferLength = analyserRef.current.fftSize;
    const dataArray = new Uint8Array(bufferLength);

    const renderFrame = () => {
      animationRef.current = requestAnimationFrame(renderFrame);
      analyserRef.current!.getByteTimeDomainData(dataArray);
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.lineWidth = 3;
        ctx.strokeStyle = '#6366f1';
        ctx.shadowBlur = 15;
        ctx.shadowColor = '#6366f1';
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        const sliceWidth = (canvas.width * 1.0) / bufferLength;
        let x = 0;
        for (let i = 0; i < bufferLength; i++) {
          const v = dataArray[i] / 128.0;
          const y = (v * canvas.height) / 2;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
          x += sliceWidth;
        }
        ctx.lineTo(canvas.width, canvas.height / 2);
        ctx.stroke();
      }
    };
    renderFrame();
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const audioContext = new AudioContext();
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      audioContextRef.current = audioContext;
      analyserRef.current = analyser;

      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };
      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        uploadAudio(audioBlob);
        if (animationRef.current) cancelAnimationFrame(animationRef.current);
        if (audioContextRef.current) audioContextRef.current.close();
      };
      mediaRecorder.start();
      setIsRecording(true);
      setResult(null);
      drawVisualizer();
    } catch (err) {
      alert("Izin mic ditolak!");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
    }
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setResult(null);
      uploadAudio(file);
    }
  };

  const uploadAudio = async (file: Blob | File) => {
    if (file.size < 1000) return;
    setIsLoading(true);
    const formData = new FormData();
    const fileName = file instanceof File ? file.name : 'recording.webm';
    formData.append('file', file, fileName);

    try {
      const response = await axios.post('https://nupers-ai-voice-detector.hf.space/api/detect_voice', formData);
      setResult(response.data);
    } catch (error) {
      alert("Gagal menghubungi server backend.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 p-4 md:p-8 transition-colors duration-500 font-sans">
      <div className="max-w-xl mx-auto space-y-8">
        
        <div className="text-center space-y-3">
          <div className="inline-flex p-3 bg-indigo-500/10 rounded-2xl mb-2">
            <Activity className="w-8 h-8 text-indigo-400" />
          </div>
          <h1 className="text-4xl font-extrabold tracking-tight bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent ">
            AI Voice Detector
          </h1>
          <p className="text-slate-500 text-sm tracking-widest font-medium ">Detect. Verify. Audit.</p>
        </div>

        {/* Tab Switcher */}
        <div className="flex p-1 bg-slate-900 border border-slate-800 rounded-xl max-w-[300px] mx-auto">
          <button 
            onClick={() => { setActiveTab('live'); setResult(null); }}
            className={`flex-1 flex items-center justify-center gap-2 py-2 text-xs font-bold rounded-lg transition-all ${activeTab === 'live' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
          >
            <Mic size={14} /> LIVE
          </button>
          <button 
            onClick={() => { setActiveTab('upload'); setResult(null); }}
            className={`flex-1 flex items-center justify-center gap-2 py-2 text-xs font-bold rounded-lg transition-all ${activeTab === 'upload' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
          >
            <Upload size={14} /> UPLOAD
          </button>
        </div>

        {/* Action Container */}
        <div className="bg-slate-900/50 border border-slate-800 rounded-3xl p-8 backdrop-blur-xl shadow-2xl relative overflow-hidden">
          {activeTab === 'live' ? (
            <div className="space-y-6">
              <canvas ref={canvasRef} className="w-full h-24 mb-4 opacity-40" width={400} height={100} />
              <div className="flex flex-col items-center">
                <button
                  onClick={isRecording ? stopRecording : startRecording}
                  disabled={isLoading}
                  className={`p-8 rounded-full transition-all duration-500 ${isRecording ? 'bg-red-500/20 text-red-500 shadow-[0_0_30px_rgba(239,68,68,0.3)]' : 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20 hover:scale-105'}`}
                >
                  {isLoading ? <Loader2 className="w-12 h-12 animate-spin" /> : isRecording ? <Square className="w-12 h-12 fill-current animate-pulse" /> : <Mic className="w-12 h-12" />}
                </button>
                <p className={`mt-6 text-xs font-black tracking-[0.2em]  ${isRecording ? 'text-red-400 animate-pulse' : 'text-slate-500'}`}>
                  {isRecording ? "Scanning Frequency..." : isLoading ? "Deconstructing Audio..." : "Ready to Stream"}
                </p>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center py-6 space-y-6">
              <div className="w-20 h-20 bg-slate-950 border border-slate-800 rounded-2xl flex items-center justify-center text-indigo-400 shadow-inner">
                <FileAudio size={40} strokeWidth={1.5} />
              </div>
              <div className="text-center space-y-1">
                <h3 className="text-lg font-bold text-slate-200">Upload Recording</h3>
                <p className="text-slate-500 text-xs">Supported: .wav, .mp3, .m4a, .webm</p>
                <p className="text-slate-500 text-xs">Maks 10MB</p>
              </div>
              <input type="file" accept="audio/*" className="hidden" ref={fileInputRef} onChange={handleFileUpload} />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isLoading}
                className="px-8 py-3 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-black tracking-widest  transition-all border border-slate-700 disabled:opacity-50"
              >
                {isLoading ? "Processing..." : "Select File"}
              </button>
            </div>
          )}
        </div>

        {/* Result Area */}
        {result && (
          <div className="w-full bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl animate-in zoom-in-95 duration-500">
            <div className={`p-8 text-white flex flex-col md:flex-row items-center justify-between gap-6 ${result.status === "Human Voice" ? 'bg-gradient-to-br from-emerald-600/20 to-slate-900 border-b border-emerald-500/20' : 'bg-gradient-to-br from-orange-600/20 to-slate-900 border-b border-orange-500/20'}`}>
              <div className="flex items-center space-x-4">
                <div className={`p-3 rounded-2xl ${result.status === "Human Voice" ? 'bg-emerald-500' : 'bg-orange-500'}`}>
                  {result.status === "Human Voice" ? <ShieldCheck className="w-8 h-8" /> : <AlertCircle className="w-8 h-8" />}
                </div>
                <div>
                  <span className="text-[10px] font-black text-slate-400  tracking-widest">Audit Verdict</span>
                  <h2 className="text-3xl font-black italic ">{result.status}</h2>
                </div>
              </div>
              <div className="bg-slate-950/50 p-4 rounded-2xl border border-white/5 text-center min-w-[120px]">
                <span className="text-[10px] opacity-60 block font-bold mb-1  tracking-tighter text-slate-400">Score</span>
                <span className="text-3xl font-mono font-bold text-indigo-400">{(result.score * 100).toFixed(0)}%</span>
              </div>
            </div>

            <div className="p-8 grid grid-cols-2 md:grid-cols-3 gap-4 bg-slate-900/50">
              <StatBox icon={<Activity size={14}/>} label="F0 MEAN" value={`${result.F0_mean} Hz`} />
              <StatBox icon={<BarChart3 size={14}/>} label="HNR MEAN" value={`${result.HNR_mean} dB`} />
              <StatBox icon={<Activity size={14}/>} label="JITTER" value={`${result.jitter_local}%`} />
              <StatBox icon={<BarChart3 size={14}/>} label="RANGE F0" value={`${result.rangeF0} Hz`} />
              <StatBox icon={<ShieldCheck size={14}/>} label="AI POINTS" value={`${result.ai_points}/4`} />
              <div className="md:col-span-1 bg-slate-950/30 p-4 rounded-2xl border border-slate-800 flex items-center justify-center">
                 <span className="text-[10px] text-slate-600 font-black  tracking-tighter">Verified by Praat</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const StatBox = ({ label, value, icon }: { label: string, value: string | number, icon: React.ReactNode }) => (
  <div className="bg-slate-950/50 p-4 rounded-2xl border border-slate-800 hover:border-indigo-500/30 transition-colors group">
    <div className="flex items-center space-x-2 mb-2 text-indigo-400/50 group-hover:text-indigo-400 transition-colors">
      {icon}
      <span className="text-[10px] font-black tracking-widest ">{label}</span>
    </div>
    <span className="text-lg font-bold text-slate-200 font-mono tracking-tight">{value}</span>
  </div>
);

export default VoiceDetector;