import { API_BASE_URL } from "../../../lib/env";

export interface ExecuteToolRequest {
  tool: string;
  url: string;
}

export interface JobResponse {
  job_id: string;
}

export interface JobStatusResponse {
  job_id: string;
  agent_id: number;
  task_name: string;
  status: 'pending' | 'running' | 'success' | 'failure';
  payload: Record<string, any>;
  result: Record<string, any>;
  created_at: string;
  completed_at?: string;
}

export interface ResearchNote {
  id: number;
  vector_id: string;
  source_url: string;
  content: string;
  created_at: string;
}

export interface ResearchNotesResponse {
  notes: ResearchNote[];
}

export class ResearchService {
  private baseUrl: string;

  constructor() {
    this.baseUrl = API_BASE_URL;
  }

  async executeResearchTool(agentId: number, url: string): Promise<JobResponse> {
    const response = await fetch(`${this.baseUrl}/agents/${agentId}/execute-tool`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        tool: 'crawl4ai_scrape',
        url: url
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to start research job: ${response.statusText}`);
    }

    return response.json();
  }

  async getJobStatus(jobId: string): Promise<JobStatusResponse> {
    const response = await fetch(`${this.baseUrl}/jobs/${jobId}`);

    if (!response.ok) {
      throw new Error(`Failed to get job status: ${response.statusText}`);
    }

    return response.json();
  }

  async getResearchNotes(agentId: number, limit = 20): Promise<ResearchNotesResponse> {
    const response = await fetch(`${this.baseUrl}/agents/${agentId}/research?limit=${limit}`);

    if (!response.ok) {
      throw new Error(`Failed to get research notes: ${response.statusText}`);
    }

    return response.json();
  }

  async pollJobUntilComplete(
    jobId: string, 
    onStatusUpdate?: (status: JobStatusResponse) => void,
    pollIntervalMs = 2000,
    maxAttempts = 30
  ): Promise<JobStatusResponse> {
    let attempts = 0;
    
    while (attempts < maxAttempts) {
      try {
        const status = await this.getJobStatus(jobId);
        
        if (onStatusUpdate) {
          onStatusUpdate(status);
        }

        if (status.status === 'success' || status.status === 'failure') {
          return status;
        }

        attempts++;
        await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
      } catch (error) {
        console.error('Error polling job status:', error);
        attempts++;
        await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
      }
    }

    throw new Error(`Job polling timed out after ${maxAttempts} attempts`);
  }
}

export const researchService = new ResearchService();