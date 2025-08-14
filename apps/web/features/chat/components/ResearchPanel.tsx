"use client";

import { useState, useEffect } from 'react';
import { useResearch } from '../hooks/useResearch';
import type { Agent } from '../types';

interface ResearchPanelProps {
  activeAgent: Agent | null;
}

export default function ResearchPanel({ activeAgent }: ResearchPanelProps) {
  const [researchUrl, setResearchUrl] = useState('');
  const {
    notes,
    notesLoading,
    notesError,
    currentJob,
    jobPolling,
    executeResearch,
    refreshNotes,
    clearJobStatus
  } = useResearch();

  // Load notes when agent changes
  useEffect(() => {
    if (activeAgent) {
      refreshNotes(activeAgent.id);
    }
  }, [activeAgent, refreshNotes]);

  const handleSubmitResearch = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!activeAgent || !researchUrl.trim()) return;
    
    // Basic URL validation
    try {
      new URL(researchUrl);
    } catch {
      alert('Please enter a valid URL');
      return;
    }

    await executeResearch(activeAgent.id, researchUrl.trim());
    setResearchUrl(''); // Clear input after submission
  };

  const getJobStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'text-yellow-600';
      case 'running': return 'text-blue-600';
      case 'success': return 'text-green-600';
      case 'failure': return 'text-red-600';
      default: return 'text-gray-600';
    }
  };

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    
    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${Math.floor(diffHours / 24)}d ago`;
  };

  if (!activeAgent) {
    return (
      <div className="p-4 text-gray-500 text-center">
        Select an agent to view research capabilities
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      <div className="border-b border-gray-200 pb-4">
        <h3 className="text-lg font-semibold text-gray-900 mb-2">
          Research URL
        </h3>
        <form onSubmit={handleSubmitResearch} className="space-y-2">
          <input
            type="url"
            value={researchUrl}
            onChange={(e) => setResearchUrl(e.target.value)}
            placeholder="https://example.com"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={jobPolling}
          />
          <button
            type="submit"
            disabled={jobPolling || !researchUrl.trim()}
            className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            {jobPolling ? 'Researching...' : 'Research Page'}
          </button>
        </form>
      </div>

      {/* Job Status */}
      {currentJob && (
        <div className="bg-gray-50 p-3 rounded-md space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-sm font-medium">Job Status</span>
            <button
              onClick={clearJobStatus}
              className="text-gray-400 hover:text-gray-600"
            >
              ×
            </button>
          </div>
          <div className={`text-sm font-medium ${getJobStatusColor(currentJob.status)}`}>
            {currentJob.status.toUpperCase()}
            {jobPolling && currentJob.status === 'running' && (
              <span className="ml-2 animate-spin">⟳</span>
            )}
          </div>
          {currentJob.status === 'success' && currentJob.result.title && (
            <div className="text-sm text-gray-600">
              ✓ Scraped: {currentJob.result.title}
            </div>
          )}
          {currentJob.status === 'failure' && currentJob.result.error && (
            <div className="text-sm text-red-600">
              ✗ Error: {currentJob.result.error}
            </div>
          )}
        </div>
      )}

      {/* Research Notes */}
      <div>
        <div className="flex justify-between items-center mb-3">
          <h3 className="text-lg font-semibold text-gray-900">
            Research Notes
          </h3>
          <button
            onClick={() => refreshNotes(activeAgent.id)}
            disabled={notesLoading}
            className="text-sm text-blue-600 hover:text-blue-800 disabled:text-gray-400"
          >
            {notesLoading ? 'Loading...' : 'Refresh'}
          </button>
        </div>

        {notesError && (
          <div className="text-red-600 text-sm mb-3">
            Error: {notesError}
          </div>
        )}

        {notes.length === 0 && !notesLoading ? (
          <div className="text-gray-500 text-center py-8">
            No research notes yet. Start by researching a URL above.
          </div>
        ) : (
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {notes.map((note) => (
              <div key={note.id} className="border border-gray-200 rounded-md p-3">
                <div className="flex justify-between items-start mb-2">
                  <a
                    href={note.source_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-medium text-blue-600 hover:text-blue-800 truncate max-w-xs"
                  >
                    {note.source_url}
                  </a>
                  <span className="text-xs text-gray-500 ml-2 flex-shrink-0">
                    {formatTimeAgo(note.created_at)}
                  </span>
                </div>
                <div className="text-sm text-gray-700 line-clamp-3">
                  {note.content.substring(0, 200)}
                  {note.content.length > 200 && '...'}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}