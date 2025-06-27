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
  const isFinalized = useRef<boolean>(false);

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
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          sampleRate: 48000,
          channelCount: 2,
          echoCancellation: true,
          noiseSuppression: true
        }
      });
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

  // Convert WebM audio to WAV format
  const convertToWav = useCallback(async (webmBlob: Blob): Promise<Blob> => {
    try {
      const arrayBuffer = await webmBlob.arrayBuffer();
      const audioContext = new AudioContext({ sampleRate: 48000 });
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
      
      // Create WAV file
      const length = audioBuffer.length;
      const numberOfChannels = audioBuffer.numberOfChannels;
      const sampleRate = audioBuffer.sampleRate;
      const arrayBuffer2 = new ArrayBuffer(44 + length * numberOfChannels * 2);
      const view = new DataView(arrayBuffer2);
      
      // WAV header
      const writeString = (offset: number, string: string) => {
        for (let i = 0; i < string.length; i++) {
          view.setUint8(offset + i, string.charCodeAt(i));
        }
      };
      
      writeString(0, 'RIFF');
      view.setUint32(4, 36 + length * numberOfChannels * 2, true);
      writeString(8, 'WAVE');
      writeString(12, 'fmt ');
      view.setUint32(16, 16, true);
      view.setUint16(20, 1, true);
      view.setUint16(22, numberOfChannels, true);
      view.setUint32(24, sampleRate, true);
      view.setUint32(28, sampleRate * numberOfChannels * 2, true);
      view.setUint16(32, numberOfChannels * 2, true);
      view.setUint16(34, 16, true);
      writeString(36, 'data');
      view.setUint32(40, length * numberOfChannels * 2, true);
      
      // Convert audio data
      let offset = 44;
      for (let i = 0; i < length; i++) {
        for (let channel = 0; channel < numberOfChannels; channel++) {
          const sample = Math.max(-1, Math.min(1, audioBuffer.getChannelData(channel)[i]));
          view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
          offset += 2;
        }
      }
      
      await audioContext.close();
      return new Blob([arrayBuffer2], { type: 'audio/wav' });
    } catch (error) {
      console.error('Error converting to WAV:', error);
      // Return original blob if conversion fails
      return webmBlob;
    }
  }, []);

  const finalizeRecording = useCallback(async (): Promise<{ blob: Blob; url: string } | null> => {
    if (isFinalized.current || chunksRef.current.length === 0) {
      return null;
    }

    console.log('Finalizing recording with', chunksRef.current.length, 'chunks');
    
    // Create blob from all chunks collected so far
    const webmBlob = new Blob(chunksRef.current, { type: 'audio/webm' });
    
    // Convert to WAV format
    const wavBlob = await convertToWav(webmBlob);
    
    // Clean up the old URL if it exists
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
    }
    
    const url = URL.createObjectURL(wavBlob);

    // Decode audio to get precise duration and set as total recording duration
    try {
      const arrayBuffer = await wavBlob.arrayBuffer();
      const audioContext = new AudioContext();
      
      try {
        const buffer = await audioContext.decodeAudioData(arrayBuffer);
        totalRecordingDurationRef.current = buffer.duration;
        console.log("Final audio duration set:", buffer.duration);
        isFinalized.current = true;
      } catch (decodeError) {
        console.error('Error decoding audio data:', decodeError);
        // Fallback to the timer-based duration if decoding fails
        totalRecordingDurationRef.current = duration;
        isFinalized.current = true;
      } finally {
        await audioContext.close();
      }
    } catch (error) {
      console.error('Error processing audio blob:', error);
      // Fallback to the timer-based duration if processing fails
      totalRecordingDurationRef.current = duration;
      isFinalized.current = true;
    }

    // Update state after processing is complete
    setAudioBlob(wavBlob);
    setAudioUrl(url);

    return { blob: wavBlob, url };
  }, [audioUrl, duration, convertToWav]);

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
    isFinalized.current = false;
  }, [stopTimer, stopPlaybackTimer, audioUrl]);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          sampleRate: 48000,
          channelCount: 2,
          echoCancellation: true,
          noiseSuppression: true
        }
      });
      streamRef.current = stream;
      
      // Try to use the best available audio format with quality settings
      let mimeType = 'audio/webm';
      let options: MediaRecorderOptions = {};
      
      if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
        mimeType = 'audio/webm;codecs=opus';
        options = {
          mimeType,
          audioBitsPerSecond: 128000
        };
      } else if (MediaRecorder.isTypeSupported('audio/webm')) {
        options = {
          mimeType: 'audio/webm',
          audioBitsPerSecond: 128000
        };
      }
      
      const mediaRecorder = new MediaRecorder(stream, options);
      mediaRecorderRef.current = mediaRecorder;
      
      // When starting fresh (state === 'idle')
      if (state === 'idle') {
        // Reset everything for a fresh recording
        chunksRef.current = [];
        pausedTimeRef.current = 0;
        setDuration(0);
        totalRecordingDurationRef.current = 0;
        setAudioBlob(null);
        if (audioUrl) {
          URL.revokeObjectURL(audioUrl);
          setAudioUrl(null);
        }
        isFinalized.current = false;
      } else {
        // If it's a resume operation (i.e., not state === 'idle'), explicitly set isFinalized.current = false
        // This ensures that if the recording was previously finalized and then resumed, 
        // it knows to re-finalize with the new data
        isFinalized.current = false;
      }

      mediaRecorder.ondataavailable = (event) => {
        console.log('Data available, size:', event.data.size);
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
          console.log('Total chunks now:', chunksRef.current.length);
        }
      };

      mediaRecorder.onstop = async () => {
        console.log('MediaRecorder stopped, total chunks:', chunksRef.current.length);
        // Stop the stream
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(track => track.stop());
        }
        // The onstop event should only handle stopping the stream tracks
      };

      // Request data every second to ensure we capture all audio
      mediaRecorder.start(1000);
      setState('recording');
      
      // When resuming, restore the accumulated duration
      if (pausedTimeRef.current > 0) {
        setDuration(pausedTimeRef.current);
      }
      startTimer();
    } catch (error) {
      console.error('Failed to start recording:', error);
      setHasPermission(false);
    }
  }, [startTimer, state, audioUrl]);

  const pauseRecording = useCallback(async () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      console.log('Pausing recording, current chunks:', chunksRef.current.length);
      
      // Create a promise that resolves when the MediaRecorder stops
      const stopPromise = new Promise<void>((resolve) => {
        if (mediaRecorderRef.current) {
          const originalOnStop = mediaRecorderRef.current.onstop;
          mediaRecorderRef.current.onstop = async (event) => {
            // Call the original onstop handler first
            if (originalOnStop) {
              await originalOnStop.call(mediaRecorderRef.current, event);
            }
            resolve();
          };
        } else {
          resolve();
        }
      });
      
      // Stop the current recording session
      mediaRecorderRef.current.stop();
      stopTimer();
      
      // Wait for the MediaRecorder to finish stopping and collect final data
      await stopPromise;
      
      // Save the current duration
      pausedTimeRef.current = duration;
      
      // Set state to paused first
      setState('paused');
      
      // Then finalize the recording so the waveform appears
      if (chunksRef.current.length > 0) {
        console.log('Finalizing recording after pause');
        // Use setTimeout to ensure state update has been processed
        setTimeout(async () => {
          await finalizeRecording();
        }, 50);
      }
    }
  }, [stopTimer, duration, finalizeRecording]);

  const resumeRecording = useCallback(async () => {
    console.log('Resuming recording, existing chunks:', chunksRef.current.length);
    // Before calling await startRecording(), add the line isFinalized.current = false
    // This is critical to signal that new audio data is being added and a new finalization will be required
    isFinalized.current = false;
    // Start a new recording session that will add to existing chunks
    await startRecording();
  }, [startRecording]);

  const playAudio = useCallback(async () => {
    let currentAudioUrl = audioUrl;
    let currentAudioBlob = audioBlob;

    // If we need to finalize the recording, do it and use the returned values
    if (chunksRef.current.length > 0 && (!audioBlob || !audioUrl || !isFinalized.current)) {
      console.log('Finalizing before playback');
      const result = await finalizeRecording();
      
      if (result) {
        currentAudioBlob = result.blob;
        currentAudioUrl = result.url;
      }
      
      // Wait a bit for the state to update after finalization
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    if (currentAudioUrl) {
      // Create or update audio element
      if (!audioRef.current) {
        audioRef.current = new Audio(currentAudioUrl);
        audioRef.current.onended = () => {
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
          setPlaybackTime(0);
        };
      } else {
        // Update the audio source if it has changed
        audioRef.current.src = currentAudioUrl;
        audioRef.current.load();
      }
      
      try {
        await audioRef.current.play();
        setState('playing');
        startPlaybackTimer();
      } catch (error) {
        console.error('Error playing audio:', error);
      }
    } else {
      console.error('No audio URL available for playback');
    }
  }, [audioUrl, audioBlob, startPlaybackTimer, stopPlaybackTimer, finalizeRecording]);

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

  const downloadRecording = useCallback(async () => {
    let currentAudioBlob = audioBlob;

    // If we need to finalize the recording, do it and use the returned blob
    if (chunksRef.current.length > 0 && (!audioBlob || !audioUrl || !isFinalized.current)) {
      console.log('Finalizing before download');
      const result = await finalizeRecording();
      
      if (result) {
        currentAudioBlob = result.blob;
      }
    }
    
    if (currentAudioBlob) {
      setState('downloading');
      // Simulate download process and then clear the recording
      setTimeout(() => {
        clearRecording();
      }, 2000);
      return currentAudioBlob;
    }
    return null;
  }, [audioBlob, clearRecording, finalizeRecording]);

  // Helper function to get display time for the timer
  const getDisplayTime = useCallback(() => {
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