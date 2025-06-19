import React from 'react';

interface WaveformProps {
  isActive: boolean;
  className?: string;
}

const Waveform: React.FC<WaveformProps> = ({ isActive, className = '' }) => {
  const bars = Array.from({ length: 20 }, (_, i) => i);

  return (
    <div className={`flex items-center justify-center gap-1 ${className}`}>
      {bars.map((bar) => (
        <div
          key={bar}
          className={`bg-gray-400 rounded-full transition-all duration-150 ${
            isActive ? 'animate-pulse' : ''
          }`}
          style={{
            width: '3px',
            height: isActive 
              ? `${Math.random() * 20 + 10}px` 
              : '4px',
            animationDelay: `${bar * 0.1}s`,
            animationDuration: `${0.5 + Math.random() * 0.5}s`,
          }}
        />
      ))}
    </div>
  );
};

export default Waveform;