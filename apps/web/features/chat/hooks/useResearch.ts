import { useState, useCallback } from 'react';
import { researchService, type JobStatusResponse, type ResearchNote } from '../services/researchService';

export interface UseResearchReturn {
  // Research notes
  notes: ResearchNote[];
  notesLoading: boolean;
  notesError: string | null;
  
  // Job management
  currentJob: JobStatusResponse | null;
  jobPolling: boolean;
  
  // Actions
  executeResearch: (agentId: number, url: string) => Promise<void>;
  refreshNotes: (agentId: number) => Promise<void>;
  clearJobStatus: () => void;
}

export function useResearch(): UseResearchReturn {
  const [notes, setNotes] = useState<ResearchNote[]>([]);
  const [notesLoading, setNotesLoading] = useState(false);
  const [notesError, setNotesError] = useState<string | null>(null);
  
  const [currentJob, setCurrentJob] = useState<JobStatusResponse | null>(null);
  const [jobPolling, setJobPolling] = useState(false);

  const refreshNotes = useCallback(async (agentId: number) => {
    setNotesLoading(true);
    setNotesError(null);
    
    try {
      const response = await researchService.getResearchNotes(agentId);
      setNotes(response.notes);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to load research notes';
      setNotesError(errorMessage);
      console.error('Error loading research notes:', error);
    } finally {
      setNotesLoading(false);
    }
  }, []);

  const executeResearch = useCallback(async (agentId: number, url: string) => {
    try {
      setJobPolling(true);
      setCurrentJob(null);
      
      // Start the research job
      const jobResponse = await researchService.executeResearchTool(agentId, url);
      
      // Poll for completion
      const finalStatus = await researchService.pollJobUntilComplete(
        jobResponse.job_id,
        (status) => {
          setCurrentJob(status);
        }
      );
      
      setCurrentJob(finalStatus);
      
      // If successful, refresh the notes
      if (finalStatus.status === 'success') {
        await refreshNotes(agentId);
      }
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Research job failed';
      console.error('Error executing research:', error);
      
      // Set a failure status for display
      setCurrentJob({
        job_id: 'unknown',
        agent_id: agentId,
        task_name: 'crawl4ai_scrape',
        status: 'failure',
        payload: { url },
        result: { error: errorMessage },
        created_at: new Date().toISOString()
      });
    } finally {
      setJobPolling(false);
    }
  }, [refreshNotes]);

  const clearJobStatus = useCallback(() => {
    setCurrentJob(null);
  }, []);

  return {
    notes,
    notesLoading,
    notesError,
    currentJob,
    jobPolling,
    executeResearch,
    refreshNotes,
    clearJobStatus
  };
}