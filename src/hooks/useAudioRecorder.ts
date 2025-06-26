import { useState, useRef, useCallback, useEffect } from 'react';

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

  const finalizeRecording = useCallback(async () => {
    // Create blob from all chunks collected so far
    const blob = new Blob(chunksRef.current, { type: 'audio/wav' });
    setAudioBlob(blob);
    
    // Clean up the old URL if it exists
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
    }
    
    const url = URL.createObjectURL(blob);
    setAudioUrl(url);

    // Decode audio to get precise duration and set as total recording duration
    try {
      const arrayBuffer = await blob.arrayBuffer();
      const audioContext = new AudioContext();
      
      try {
        const buffer = await audioContext.decodeAudioData(arrayBuffer);
        totalRecordingDurationRef.current = buffer.duration;
        console.log("Final audio duration set:", buffer.duration);
      } catch (decodeError) {
        console.error('Error decoding audio data:', decodeError);
        // Fallback to the timer-based duration if decoding fails
        totalRecordingDurationRef.current = duration;
      } finally {
        await audioContext.close();
      }
    } catch (error) {
      console.error('Error processing audio blob:', error);
      // Fallback to the timer-based duration if processing fails
      totalRecordingDurationRef.current = duration;
    }
  }, [audioUrl, duration]);

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
      
      // When starting fresh (state === 'idle' or mediaRecorderRef.current is not active)
      if (state === 'idle') {
        // Reset chunksRef.current, pausedTimeRef.current = 0, clear audioBlob and audioUrl
        chunksRef.current = [];
        pausedTimeRef.current = 0;
        setDuration(0);
        totalRecordingDurationRef.current = 0;
        setAudioBlob(null);
        if (audioUrl) {
          URL.revokeObjectURL(audioUrl);
          setAudioUrl(null);
        }
      }

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      // Remove the call to finalizeRecording() - it should only stop the stream tracks
      mediaRecorder.onstop = () => {
        // Stop the stream
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(track => track.stop());
        }
      };

      mediaRecorder.start();
      setState('recording');
      
      // When resuming (i.e., not state === 'idle'), setDuration(pausedTimeRef.current) to correctly restore the accumulated duration before starting the timer
      if (pausedTimeRef.current > 0) {
        setDuration(pausedTimeRef.current);
      }
      startTimer();
    } catch (error) {
      console.error('Failed to start recording:', error);
      setHasPermission(false);
    }
  }, [startTimer, state, audioUrl]);

  const pauseRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      // Call mediaRecorderRef.current.stop()
      mediaRecorderRef.current.stop();
      // Call stopTimer()
      stopTimer();
      // Set pausedTimeRef.current = duration (to save the total accumulated recording time up to this point)
      pausedTimeRef.current = duration;
      // Set setState('paused')
      setState('paused');
    }
  }, [stopTimer, duration]);

  const resumeRecording = useCallback(async () => {
    // Call startRecording(). The startRecording logic will handle resuming from pausedTimeRef.current
    await startRecording();
  }, [startRecording]);

  const playAudio = useCallback(async () => {
    // Before playing, it must call await finalizeRecording() to ensure audioBlob and audioUrl are created from all collected chunks and totalRecordingDurationRef.current is correctly set
    if (chunksRef.current.length > 0 && (!audioBlob || !audioUrl)) {
      await finalizeRecording();
    }
    
    if (audioUrl) {
      // Then, it proceeds to create/update audioRef.current with the (now finalized) audioUrl
      if (!audioRef.current) {
        audioRef.current = new Audio(audioUrl);
        audioRef.current.onended = () => {
          // When audioRef.current.onended, set playbackTime to totalRecordingDurationRef.current and waveform reflect the full duration
          setPlaybackTime(totalRecordingDurationRef.current);
          setState('paused');
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
  }, [audioUrl, startPlaybackTimer, stopPlaybackTimer, finalizeRecording, audioBlob]);

  const pausePlayback = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      setState('paused');
      stopPlaybackTimer();
    }
  }, [stopPlaybackTimer]);

  const deleteRecording = useCallback(() => {
    // clearRecording should be sufficient. It already resets all relevant states and refs. No need to call finalizeRecording here
    clearRecording();
  }, [clearRecording]);

  const downloadRecording = useCallback(async () => {
    // Call await finalizeRecording() before attempting to use audioBlob
    if (chunksRef.current.length > 0 && (!audioBlob || !audioUrl)) {
      await finalizeRecording();
    }
    
    if (audioBlob) {
      setState('downloading');
      // Simulate download process and then clear the recording
      setTimeout(() => {
        clearRecording();
      }, 2000);
      return audioBlob;
    }
    return null;
  }, [audioBlob, clearRecording, finalizeRecording]);

  // Helper function to get display time for the timer
  const getDisplayTime = useCallback(() => {
    // Ensure formatTime(getDisplayTime()) uses duration when recording/paused, and playbackTime (which can go up to totalRecordingDurationRef.current) when playing
    if (state === 'playing') {
      return Math.floor(playbackTime);
    }
    return duration;
  }, [state, playbackTime, duration]);

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
    getDisplayTime,
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