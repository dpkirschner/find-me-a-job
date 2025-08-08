'use client';

import { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

// Simple logger utility
const logger = {
  debug: (_message: string, _data?: unknown) => {
    // Debug logging disabled - uncomment the lines below to re-enable
    // if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
    //   console.log(`[CHAT DEBUG] ${_message}`, _data || '');
    // }
  },
  info: (message: string, data?: unknown) => {
    if (typeof window !== 'undefined') {
      console.log(`[CHAT INFO] ${message}`, data || '');
    }
  },
  error: (message: string, error?: unknown) => {
    if (typeof window !== 'undefined') {
      console.error(`[CHAT ERROR] ${message}`, error || '');
    }
  }
};

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

// Control tokens that should not be displayed in the UI
type ControlToken = '[DONE]';

const CONTROL_TOKENS: readonly ControlToken[] = ['[DONE]'] as const;

const isControlToken = (data: string): data is ControlToken => {
  return CONTROL_TOKENS.some(token => data === token);
};

const containsControlToken = (data: string): boolean => {
  return CONTROL_TOKENS.some(token => data.includes(token));
};

export default function Chat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Cleanup effect to abort fetch on component unmount
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  const handleStopGenerating = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const controller = new AbortController();
    abortControllerRef.current = controller;

    const userInput = input;
    logger.info('Starting chat request', { userInput });

    // Change #1: Atomic state update
    const userMessage: Message = { role: 'user', content: userInput };
    const assistantMessage: Message = { role: 'assistant', content: '' };
    setMessages(prev => [...prev, userMessage, assistantMessage]);

    setInput('');
    setIsLoading(true);

    try {
      logger.debug('Sending POST request to /chat');
      const response = await fetch('/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ message: userInput }),
        signal: controller.signal, // Change #3: Add AbortSignal to fetch
        cache: 'no-store',
      });

      if (!response.ok) {
        logger.error('Response not OK', { status: response.status, statusText: response.statusText });
        // Change #2: Throw error with specific detail from API
        const errorData = await response.json();
        throw new Error(errorData.detail || `HTTP error! status: ${response.status}`);
      }

      logger.debug('Response OK, starting to read stream');
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (reader) {
        let chunkCount = 0;
        let shouldStop = false;
        
        while (true && !shouldStop) {
          const { done, value } = await reader.read();
          if (done) {
            logger.debug('Stream reading completed');
            break;
          }

          const chunk = decoder.decode(value, { stream: true });
          chunkCount++;
          logger.debug(`Received chunk ${chunkCount}`, { chunkLength: chunk.length, chunk: chunk.substring(0, 100) + (chunk.length > 100 ? '...' : '') });
          
          const lines = chunk.split('\n');
          logger.debug(`Split into ${lines.length} lines`, { lines });

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6);
              logger.debug('Processing data line', { data, dataLength: data.length });
              
              if (isControlToken(data) || containsControlToken(data)) {
                logger.info('Received control token signal', { token: data });
                shouldStop = true;
                break;
              }
              
              // Only append if data is not empty and doesn't contain control tokens
              if (data && !containsControlToken(data)) {
                logger.debug('Appending data to message', { data });
                setMessages(prev => {
                  const newMessages = [...prev];
                  const lastMessage = newMessages[newMessages.length - 1];

                  // Create a new object to ensure immutability
                  const updatedLastMessage = {
                    ...lastMessage,
                    content: lastMessage.content + data,
                  };
                  
                  newMessages[newMessages.length - 1] = updatedLastMessage;
                  
                  return newMessages;
                });
              } else {
                logger.debug('Skipping empty data');
              }
            } else if (line.trim()) {
              logger.debug('Ignoring non-data line', { line });
            }
            // Ignore 'event: message' lines and empty lines
          }
        }
      }
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        logger.info('Fetch aborted by user');
        setMessages(prev => {
          const newMessages = [...prev];
          newMessages[newMessages.length - 1].content += "\n\n(Request stopped)";
          return newMessages;
        });
        return;
      }

      // Change #2: Display the specific error message
      const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred.';
      logger.error('Chat request failed', { error, errorMessage });
      setMessages(prev => {
        const newMessages = [...prev];
        newMessages[newMessages.length - 1].content = errorMessage;
        return newMessages;
      });

    } finally {
      logger.debug('Chat request completed, cleaning up');
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  };

  return (
    <div className="flex flex-col h-screen bg-gray-50 dark:bg-gray-900">
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="text-center text-gray-500 dark:text-gray-400 mt-8">
            <h1 className="text-2xl font-bold mb-2">Chat Assistant</h1>
            <p>Start a conversation by typing a message below.</p>
          </div>
        )}
        
        {messages.map((message, index) => (
          <div key={index} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-xs lg:max-w-md xl:max-w-lg px-4 py-2 rounded-lg ${message.role === 'user' ? 'bg-blue-500 text-white' : 'bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border border-gray-200 dark:border-gray-700'}`}>
              {message.role === 'assistant' ? (
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    p: (props: any) => (
                      <p className="whitespace-pre-wrap leading-relaxed" {...props} />
                    ),
                    a: (props: any) => (
                      <a className="text-blue-600 underline" target="_blank" rel="noreferrer noopener" {...props} />
                    ),
                    pre: (props: any) => (
                      <pre className="bg-gray-100 dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-md p-3 overflow-x-auto" {...props} />
                    ),
                    code: (props: any) => (
                      <code
                        className={`${props.className || ''} ${props.inline ? 'bg-gray-100 dark:bg-gray-900 px-1 py-0.5 rounded' : ''}`}
                        {...props}
                      >
                        {props.children}
                      </code>
                    ),
                    ul: (props: any) => (
                      <ul className="list-disc pl-5 space-y-1" {...props} />
                    ),
                    ol: (props: any) => (
                      <ol className="list-decimal pl-5 space-y-1" {...props} />
                    ),
                    li: (props: any) => <li className="leading-relaxed" {...props} />,
                    h1: (props: any) => <h1 className="text-xl font-bold mt-2 mb-1" {...props} />,
                    h2: (props: any) => <h2 className="text-lg font-semibold mt-2 mb-1" {...props} />,
                    h3: (props: any) => <h3 className="text-base font-semibold mt-2 mb-1" {...props} />,
                  }}
                >
                  {message.content}
                </ReactMarkdown>
              ) : (
                <p className="whitespace-pre-wrap">{message.content}</p>
              )}
            </div>
          </div>
        ))}
        
        <div ref={messagesEndRef} />
      </div>

      <div className="border-t border-gray-200 dark:border-gray-700 p-4 bg-white dark:bg-gray-800">
        {/* Usability Win: Add a button to stop generation */}
        {isLoading && (
          <div className="flex justify-center mb-2">
            <button
              onClick={handleStopGenerating}
              className="px-4 py-1 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 text-sm"
            >
              Stop Generating
            </button>
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex space-x-2">
          {/* Change #4: Use a textarea for better input */}
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSubmit(e as React.FormEvent);
              }
            }}
            placeholder="Type your message... (Shift+Enter for new line)"
            className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 resize-none"
            rows={1}
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Send
          </button>
        </form>
      </div>
    </div>
  );
}