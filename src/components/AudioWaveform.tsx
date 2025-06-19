import React, { useEffect, useRef, useState } from 'react';

interface AudioWaveformProps {
  audioBlob: Blob | null;
  isPlaying?: boolean;
  playbackTime?: number;
  totalRecordingDuration?: number;
  className?: string;
}

const AudioWaveform: React.FC<AudioWaveformProps> = ({ 
  audioBlob, 
  isPlaying = false, 
  playbackTime = 0, 
  totalRecordingDuration = 0,
  className = '' 
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [waveformData, setWaveformData] = useState<number[]>([]);
  const [canvasWidth, setCanvasWidth] = useState(280);
  const [actualAudioDuration, setActualAudioDuration] = useState(0);

  // Update canvas width based on container size
  useEffect(() => {
    const updateWidth = () => {
      if (containerRef.current) {
        const width = containerRef.current.offsetWidth;
        setCanvasWidth(Math.max(width, 100)); // Minimum width of 100px
      }
    };

    updateWidth();
    window.addEventListener('resize', updateWidth);
    return () => window.removeEventListener('resize', updateWidth);
  }, []);

  useEffect(() => {
    if (!audioBlob) {
      setWaveformData([]);
      setActualAudioDuration(0);
      return;
    }

    const analyzeAudio = async () => {
      try {
        const arrayBuffer = await audioBlob.arrayBuffer();
        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
        
        // Get the actual audio duration from the decoded audio buffer
        const audioDuration = audioBuffer.duration;
        setActualAudioDuration(audioDuration);
        
        const channelData = audioBuffer.getChannelData(0);
        // Scale number of samples based on canvas width
        const samples = Math.floor(canvasWidth / 5); // Approximately 5px per bar
        const blockSize = Math.floor(channelData.length / samples);
        const waveform: number[] = [];

        for (let i = 0; i < samples; i++) {
          let sum = 0;
          for (let j = 0; j < blockSize; j++) {
            sum += Math.abs(channelData[i * blockSize + j] || 0);
          }
          waveform.push(sum / blockSize);
        }

        // Normalize the waveform data
        const maxAmplitude = Math.max(...waveform);
        const normalizedWaveform = waveform.map(amplitude => 
          maxAmplitude > 0 ? amplitude / maxAmplitude : 0
        );

        setWaveformData(normalizedWaveform);
        audioContext.close();
      } catch (error) {
        console.error('Error analyzing audio:', error);
        setWaveformData([]);
        setActualAudioDuration(0);
      }
    };

    analyzeAudio();
  }, [audioBlob, canvasWidth]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || waveformData.length === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { width, height } = canvas;
    const barWidth = width / waveformData.length;
    
    // Calculate progress based on the relationship between actual audio time and total recording time
    let progress = 0;
    if (isPlaying && actualAudioDuration > 0) {
      // Scale the audio playback time to match the total recording duration
      // This accounts for the fact that paused recordings create compressed audio
      const scaledPlaybackTime = (playbackTime / actualAudioDuration) * totalRecordingDuration;
      progress = Math.min(Math.max(scaledPlaybackTime / totalRecordingDuration, 0), 1);
    }

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Draw waveform bars
    waveformData.forEach((amplitude, index) => {
      const barHeight = Math.max(2, amplitude * height * 0.8);
      const x = index * barWidth;
      const y = (height - barHeight) / 2;

      // Calculate if this bar should be green based on progress
      const barPosition = index / waveformData.length;
      const shouldBeGreen = isPlaying && progress > barPosition;
      
      // Set color: bright green for played, gray for unplayed
      ctx.fillStyle = shouldBeGreen ? '#22c55e' : '#9ca3af';
      ctx.fillRect(x, y, Math.max(2, barWidth - 1), barHeight);
    });
  }, [waveformData, isPlaying, playbackTime, actualAudioDuration, totalRecordingDuration, canvasWidth]);

  if (waveformData.length === 0) {
    // Show placeholder bars while loading or if no audio
    const numBars = Math.floor(canvasWidth / 8); // Adjust spacing for placeholder
    return (
      <div 
        ref={containerRef}
        className={`flex items-center justify-center gap-1 ${className}`} 
        style={{ height: '40px' }}
      >
        {Array.from({ length: numBars }, (_, i) => (
          <div
            key={i}
            className="bg-gray-400 rounded-full"
            style={{
              width: '3px',
              height: '4px',
            }}
          />
        ))}
      </div>
    );
  }

  return (
    <div ref={containerRef} className={`${className}`} style={{ height: '40px' }}>
      <canvas
        ref={canvasRef}
        width={canvasWidth}
        height={40}
        className="w-full h-full"
      />
    </div>
  );
};

export default AudioWaveform;