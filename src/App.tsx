import React from 'react';
import AudioRecorder from './components/AudioRecorder';

function App() {
  const handleDownload = (audioBlob: Blob) => {
    // Create a download link
    const url = URL.createObjectURL(audioBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `recording-${new Date().getTime()}.wav`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    console.log('Audio downloaded:', audioBlob);
  };

  const handleDelete = () => {
    console.log('Recording deleted');
  };

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <h1 className="text-2xl font-bold text-gray-800 text-center mb-8">
          Audio Recorder
        </h1>
        <AudioRecorder 
          onDownload={handleDownload}
          onDelete={handleDelete}
        />
        <div className="mt-8 text-center text-gray-600 text-sm">
          <p>Click "Allow mic access" to start recording</p>
          <p className="mt-2">Features: Record, Pause, Resume, Playback, Download, Delete</p>
          <p className="mt-2 text-xs text-gray-500">Audio saved as WAV • 48kHz • 128kbps</p>
        </div>
      </div>
    </div>
  );
}

export default App;