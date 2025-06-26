import React from 'react';
import { 
  Mic, 
  Pause, 
  Play, 
  Trash2, 
  MicOff,
  Loader2,
  Send
} from 'lucide-react';
import { useAudioRecorder } from '../hooks/useAudioRecorder';
import { formatTime } from '../utils/formatTime';
import AudioWaveform from './AudioWaveform';

interface AudioRecorderProps {
  onDownload?: (audioBlob: Blob) => void;
  onDelete?: () => void;
}

const AudioRecorder: React.FC<AudioRecorderProps> = ({ onDownload, onDelete }) => {
  const {
    state,
    duration,
    playbackTime,
    hasPermission,
    audioBlob,
    totalRecordingDuration,
    getDisplayTime,
    requestPermission,
    startRecording,
    pauseRecording,
    resumeRecording,
    playAudio,
    pausePlayback,
    deleteRecording,
    downloadRecording,
  } = useAudioRecorder();

  const handleDownload = () => {
    const blob = downloadRecording();
    if (blob && onDownload) {
      onDownload(blob);
    }
  };

  const handleDelete = () => {
    deleteRecording();
    if (onDelete) {
      onDelete();
    }
  };

  const isRecording = state === 'recording';
  const isPaused = state === 'paused';
  const isPlaying = state === 'playing';
  const isDownloading = state === 'downloading';
  const showControls = isPaused || isPlaying || isRecording;

  // Initial permission request state
  if (hasPermission === null) {
    return (
      <div className="bg-gray-900 rounded-2xl p-4 max-w-md mx-auto h-40 flex items-center justify-center">
        <button
          onClick={requestPermission}
          className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-3 rounded-lg font-medium transition-colors duration-150 flex items-center gap-2"
        >
          <Mic className="w-5 h-5" />
          Allow mic access to record
        </button>
      </div>
    );
  }

  // Permission denied state
  if (hasPermission === false) {
    return (
      <div className="bg-gray-900 rounded-2xl p-4 max-w-md mx-auto h-40 flex items-center justify-center">
        <div className="text-center text-gray-300">
          <MicOff className="w-8 h-8 mx-auto mb-3 text-red-500" />
          <p className="mb-4">Microphone access denied</p>
          <button
            onClick={requestPermission}
            className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-lg text-sm transition-colors duration-150"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gray-900 rounded-2xl p-4 max-w-md mx-auto h-40 flex flex-col relative">
      {/* Timer and Waveform/Recording Text - Fixed height container */}
      <div className="h-12 flex items-center relative mb-4">
        {/* Download Animation - Positioned in top section */}
        {isDownloading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none">
            <div className="flex items-center gap-2 mb-2">
              <Loader2 className="w-4 h-4 animate-spin text-green-400" />
              <p className="text-green-400 text-sm">Submitting...</p>
            </div>
            <div className="w-32 bg-gray-700 rounded-full h-1">
              <div className="bg-green-600 h-1 rounded-full animate-pulse" style={{ width: '60%' }}></div>
            </div>
          </div>
        )}

        {/* Normal content - hidden during download */}
        {!isDownloading && showControls && (
          <>
            {/* Timer - positioned on the left */}
            <div className="absolute left-0 flex items-center">
              <span className="text-white text-lg font-medium">
                {formatTime(getDisplayTime())}
              </span>
            </div>
            
            {/* Recording text - centered with the record button */}
            {isRecording && (
              <div className="absolute left-1/2 transform -translate-x-1/2 flex items-center justify-center">
                <span className="text-red-400 text-sm font-medium animate-pulse">
                  recording
                </span>
              </div>
            )}
            
            {/* Waveform - extends from after timer to download button position, only when not recording */}
            {!isRecording && (
              <div className="absolute left-16 right-0 flex items-center justify-center">
                <AudioWaveform 
                  audioBlob={audioBlob}
                  isPlaying={isPlaying}
                  playbackTime={playbackTime}
                  totalRecordingDuration={totalRecordingDuration}
                  className="w-full"
                />
              </div>
            )}
          </>
        )}
      </div>

      {/* Controls - Fixed height container at bottom */}
      <div className="h-14 flex items-center justify-between mt-auto">
        {/* Delete Button - Fixed size - Hidden during download */}
        {!isDownloading && (
          <div className="relative group">
            <button
              onClick={handleDelete}
              disabled={state === 'idle'}
              className={`w-12 h-12 rounded-full transition-colors duration-150 flex items-center justify-center ${
                state === 'idle'
                  ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                  : 'bg-gray-700 hover:bg-gray-600 text-white'
              }`}
            >
              <Trash2 className="w-5 h-5" />
            </button>
            {/* Tooltip */}
            {state !== 'idle' && (
              <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-black text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap">
                Delete
              </div>
            )}
          </div>
        )}

        {/* Spacer when delete button is hidden */}
        {isDownloading && <div className="w-12 h-12" />}

        {/* Main Record/Pause Button - Fixed container size */}
        <div className="flex-1 flex justify-center items-center h-14">
          {state === 'idle' && (
            <button
              onClick={startRecording}
              className="bg-red-600 hover:bg-red-700 text-white px-6 py-3 rounded-lg font-medium transition-colors duration-150 flex items-center justify-center"
            >
              Record reply
            </button>
          )}
          
          {isRecording && (
            <div className="relative group">
              <button
                onClick={pauseRecording}
                className="bg-red-600 hover:bg-red-700 text-white w-14 h-14 rounded-full transition-colors duration-150 flex items-center justify-center"
              >
                <Pause className="w-6 h-6" />
              </button>
              {/* Tooltip */}
              <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-black text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap">
                Pause recording
              </div>
            </div>
          )}
          
          {isPaused && (
            <div className="flex gap-2 items-center">
              <div className="relative group">
                <button
                  onClick={resumeRecording}
                  className="bg-red-600 hover:bg-red-700 text-white w-12 h-12 rounded-full transition-colors duration-150 flex items-center justify-center"
                >
                  <Mic className="w-5 h-5" />
                </button>
                {/* Tooltip */}
                <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-black text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap">
                  Resume recording
                </div>
              </div>
              <div className="relative group">
                <button
                  onClick={playAudio}
                  className="bg-green-600 hover:bg-green-700 text-white w-12 h-12 rounded-full transition-colors duration-150 flex items-center justify-center"
                >
                  <Play className="w-5 h-5" />
                </button>
                {/* Tooltip */}
                <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-black text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap">
                  Play
                </div>
              </div>
            </div>
          )}
          
          {isPlaying && (
            <button
              onClick={pausePlayback}
              className="bg-green-600 hover:bg-green-700 text-white w-14 h-14 rounded-full transition-colors duration-150 flex items-center justify-center"
            >
              <Pause className="w-6 h-6" />
            </button>
          )}
        </div>

        {/* Submit Button - Plane icon only */}
        <div className="relative group">
          <button
            onClick={handleDownload}
            disabled={state === 'idle' || state === 'recording' || isDownloading}
            className={`w-12 h-12 rounded-full transition-colors duration-150 flex items-center justify-center ${
              state === 'idle' || state === 'recording' || isDownloading
                ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                : 'bg-green-600 hover:bg-green-700 text-white'
            }`}
          >
            {isDownloading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-5 h-5" />
            )}
          </button>
          {/* Tooltip */}
          {state !== 'idle' && state !== 'recording' && !isDownloading && (
            <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-black text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap">
              Submit
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AudioRecorder;