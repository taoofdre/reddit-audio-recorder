import { useState, useRef, useCallback, useEffect } from 'react';
import { encodeAudioBufferToWavBlob } from '../utils';

export type RecorderState = 'idle' | 'recording' | 'paused' | 'playing' | 'downloading';

export const useAudioRecorder = () => {
  const [state, setState] = useState<RecorderState>('idle');
  const [duration, setDuration] = useState(0);
  const [playbackTime, setPlaybackTime] = useState(0);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const playbackTimerRef = useRef<NodeJS.Timeout | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const pausedTimeRef = useRef<number>(0);
  const totalRecordingDurationRef = useRef<number>(0);

  // Check for existing permissions on mount
  useEffect(() => {
    const checkPermissions = async () => {
      try {
        // Check if permissions API is available
        if (navigator.permissions && navigator.permissions.query) {
          const permissionStatus = await navigator.permissions.query({ name: 'microphone' as PermissionName });
          
          if (permissionStatus.state === 'granted') {
            setHasPermission(true);
          } else if (permissionStatus.state === 'denied') {
            setHasPermission(false);
          } else {
            // Permission is 'prompt' - leave as null to show permission request
            setHasPermission(null);
          }
        } else {
          // Fallback: try to access microphone directly
          try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            setHasPermission(true);
            // Stop the stream immediately since we're just checking permissions
            stream.getTracks().forEach(track => track.stop());
          } catch (error) {
            // If we can't access it, we need to request permission
            setHasPermission(null);
          }
        }
      } catch (error) {
        console.error('Error checking permissions:', error);
        setHasPermission(null);
      }
    };

    checkPermissions();
  }, []);

  const requestPermission = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setHasPermission(true);
      streamRef.current = stream;
      
      // Stop the stream for now, we'll request it again when recording
      stream.getTracks().forEach(track => track.stop());
    } catch (error) {
      setHasPermission(false);
      console.error('Permission denied:', error);
    }
  }, []);

  const startTimer = useCallback(() => {
    timerRef.current = setInterval(() => {
      setDuration(prev => prev + 1);
    }, 1000);
  }, []);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const startPlaybackTimer = useCallback(() => {
    playbackTimerRef.current = setInterval(() => {
      if (audioRef.current && !audioRef.current.paused && !audioRef.current.ended) {
        // Use the actual audio current time directly
        // The waveform component will handle the scaling based on total recording duration
        setPlaybackTime(audioRef.current.currentTime);
      }
    }, 100);
  }, []);

  const stopPlaybackTimer = useCallback(() => {
    if (playbackTimerRef.current) {
      clearInterval(playbackTimerRef.current);
      playbackTimerRef.current = null;
    }
  }, []);

  const clearRecording = useCallback(() => {
    stopTimer();
    stopPlaybackTimer();
    
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
    }
    
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
    }
    
    setState('idle');
    setDuration(0);
    setPlaybackTime(0);
    setAudioBlob(null);
    setAudioUrl(null);
    chunksRef.current = [];
    pausedTimeRef.current = 0;
    totalRecordingDurationRef.current = 0;
  }, [stopTimer, stopPlaybackTimer, audioUrl]);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      
      // Only reset chunks if this is a fresh recording (not a resume)
      if (state === 'idle') {
        chunksRef.current = [];
        setDuration(0);
        pausedTimeRef.current = 0;
        totalRecordingDurationRef.current = 0;
      }

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const originalBlob = new Blob(chunksRef.current, { type: 'audio/wav' });
        let processedBlob = originalBlob;
        let audioCtx: AudioContext | null = null;

        try {
          audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
          const arrayBuffer = await originalBlob.arrayBuffer();
          const decodedAudioBuffer = await audioCtx.decodeAudioData(arrayBuffer);

          totalRecordingDurationRef.current = decodedAudioBuffer.duration;
          console.log("Actual audio duration from decoded buffer:", decodedAudioBuffer.duration);

          processedBlob = encodeAudioBufferToWavBlob(decodedAudioBuffer);

        } catch (error) {
          console.error("Error processing audio blob, falling back to original:", error);
          totalRecordingDurationRef.current = duration;
          console.log("Fell back to timer-based duration:", duration);
        } finally {
          if (audioCtx && audioCtx.state !== 'closed') {
            try {
              await audioCtx.close();
            } catch (closeError) {
              console.error("Error closing AudioContext:", closeError);
            }
          }
        }

        setAudioBlob(processedBlob);
        const newUrl = URL.createObjectURL(processedBlob);
        setAudioUrl(newUrl);

        if (streamRef.current) {
          streamRef.current.getTracks().forEach(track => track.stop());
          streamRef.current = null;
        }
      };

      mediaRecorder.start();
      setState('recording');
      
      // Resume timer from where it was paused
      if (pausedTimeRef.current > 0) {
        setDuration(pausedTimeRef.current);
      }
      startTimer();
    } catch (error) {
      console.error('Failed to start recording:', error);
      setHasPermission(false);
    }
  }, [startTimer, state, audioUrl, duration]);

  const pauseRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
      pausedTimeRef.current = duration; // Store the current duration
      setState('paused');
      stopTimer();
    }
  }, [stopTimer, duration]);

  const resumeRecording = useCallback(async () => {
    // Resume recording by starting a new recording session
    // The chunks will be accumulated in the existing chunksRef.current array
    await startRecording();
  }, [startRecording]);

  const playAudio = useCallback(() => {
    if (audioUrl) {
      if (!audioRef.current) {
        audioRef.current = new Audio(audioUrl);
        audioRef.current.onended = () => {
          setState('paused');
          setPlaybackTime(0);
          stopPlaybackTimer();
        };
        audioRef.current.onpause = () => {
          stopPlaybackTimer();
        };
        audioRef.current.onplay = () => {
          startPlaybackTimer();
        };
        audioRef.current.onloadedmetadata = () => {
          // Reset playback time when audio loads
          setPlaybackTime(0);
        };
      } else {
        // Update the audio source if it has changed
        audioRef.current.src = audioUrl;
        audioRef.current.load(); // Reload the audio element
      }
      
      audioRef.current.play();
      setState('playing');
      startPlaybackTimer();
    }
  }, [audioUrl, startPlaybackTimer, stopPlaybackTimer]);

  const pausePlayback = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      setState('paused');
      stopPlaybackTimer();
    }
  }, [stopPlaybackTimer]);

  const deleteRecording = useCallback(() => {
    clearRecording();
  }, [clearRecording]);

  const downloadRecording = useCallback(() => {
    if (audioBlob) {
      setState('downloading');
      // Simulate download process and then clear the recording
      setTimeout(() => {
        clearRecording();
      }, 2000);
      return audioBlob;
    }
    return null;
  }, [audioBlob, clearRecording]);

  useEffect(() => {
    return () => {
      stopTimer();
      stopPlaybackTimer();
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
      }
    };
  }, [stopTimer, stopPlaybackTimer, audioUrl]);

  return {
    state,
    duration,
    playbackTime,
    hasPermission,
    audioBlob,
    totalRecordingDuration: totalRecordingDurationRef.current,
    requestPermission,
    startRecording,
    pauseRecording,
    resumeRecording,
    playAudio,
    pausePlayback,
    deleteRecording,
    downloadRecording,
  };
};