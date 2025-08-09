'use client';

import { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';

// Simple logger utility
const logger = {
  debug: (message: string, data?: unknown) => {
    if (typeof window !== 'undefined') {
      console.log(`[CHAT DEBUG] ${message}`, data || '');
    }
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
  },
};

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

// Control tokens that should not be displayed in the UI
const isControlToken = (data: string): boolean => {
  return data === '[DONE]';
};

export default function Chat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  const handleStopGenerating = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const controller = new AbortController();
    abortControllerRef.current = controller;

    const userInput = input;
    const userMessage: Message = { role: 'user', content: userInput };
    const assistantMessage: Message = { role: 'assistant', content: '' };
    
    setMessages(prev => [...prev, userMessage, assistantMessage]);
    setInput('');
    setIsLoading(true);
    setIsStreaming(true);

    try {
      logger.debug('Starting fetch request to /chat');
      const response = await fetch('http://localhost:8000/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userInput }),
        signal: controller.signal,
        cache: 'no-store',
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || `HTTP error! status: ${response.status}`);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (reader) {
        let buffer = '';
        logger.debug('Starting to read response stream');
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            logger.debug('Stream reading completed');
            break;
          }

          const chunk = decoder.decode(value, { stream: true });
          // Normalize line endings by removing carriage returns
          buffer += chunk.replace(/\r/g, '');
          logger.debug('Received chunk:', { chunk, chunkLength: chunk.length, bufferLength: buffer.length });
          
          const eventSeparator = '\n\n';
          let eventEndIndex;
          
          while ((eventEndIndex = buffer.indexOf(eventSeparator)) !== -1) {
            const eventText = buffer.substring(0, eventEndIndex);
            buffer = buffer.substring(eventEndIndex + eventSeparator.length);
            logger.debug('Processing event:', { eventText, eventLength: eventText.length });

            if (!eventText) continue;

            // Reconstruct multi-line data payload
            const data = eventText.split('\n')
              .filter(line => line.startsWith('data: '))
              .map(line => line.slice(6))
              .join('\n');

            logger.debug('Extracted data:', { data, dataLength: data.length, isControl: isControlToken(data) });

            if (isControlToken(data)) {
              logger.debug('Control token detected, ending stream');
              break; // End of stream
            }

            if (data) {
              logger.debug('Processing data chunk:', { data, dataLength: data.length });
              setMessages(prev => {
                const newMessages = [...prev];
                const lastMessage = newMessages[newMessages.length - 1];
                logger.debug('Current last message before update:', { lastMessage });
                const updatedLastMessage = {
                  ...lastMessage,
                  content: lastMessage.content + data,
                };
                newMessages[newMessages.length - 1] = updatedLastMessage;
                logger.debug('Updated last message:', { updatedLastMessage });
                return newMessages;
              });
            }
          }
        }
      }
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        logger.info('Fetch aborted by user');
        setMessages(prev => {
          const newMessages = [...prev];
          const lastMessage = newMessages[newMessages.length - 1];
          if (lastMessage && lastMessage.role === 'assistant') {
            lastMessage.content += "\n\n(Request stopped)";
          }
          return newMessages;
        });
        return;
      }

      const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred.';
      logger.error('Chat request failed', { error, errorMessage });
      setMessages(prev => {
        const newMessages = [...prev];
        const lastMessage = newMessages[newMessages.length - 1];
         if (lastMessage && lastMessage.role === 'assistant') {
            lastMessage.content = errorMessage;
         }
        return newMessages;
      });

    } finally {
      setIsLoading(false);
      setIsStreaming(false);
      abortControllerRef.current = null;
    }
  };

  return (
    <div className="flex flex-col h-screen bg-gray-50 dark:bg-gray-900 min-w-96">
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {messages.length === 0 && (
          <div className="text-center text-gray-500 dark:text-gray-400 mt-8">
            <h1 className="text-2xl font-bold mb-2">Chat Assistant</h1>
            <p>Start a conversation by typing a message below.</p>
          </div>
        )}
        
        {messages.map((message, index) => (
          <div key={index} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-sm lg:max-w-xl px-4 py-2 rounded-lg ${message.role === 'user' ? 'bg-blue-500 text-white' : 'bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border border-gray-200 dark:border-gray-700'}`}>
              {(isStreaming && message.role === 'assistant' && index === messages.length - 1) ? (
                <pre className="whitespace-pre-wrap leading-relaxed font-sans text-inherit">{message.content}</pre>
              ) : (
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  rehypePlugins={[rehypeRaw]}
                  components={{
                    p: (props) => <p className="whitespace-pre-wrap leading-relaxed" {...props} />,
                    a: (props) => <a className="text-blue-500 underline hover:text-blue-400" target="_blank" rel="noreferrer noopener" {...props} />,
                    pre: (props) => <pre className="bg-gray-100 dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-md p-3 my-2 overflow-x-auto" {...props} />,
                    code: ({ inline, className, children, ...props }) => {
                      return !inline ? (
                        <code className={`${className} rounded-md`} {...props}>{children}</code>
                      ) : (
                        <code className="bg-gray-100 dark:bg-gray-900 px-1 py-0.5 rounded text-sm" {...props}>{children}</code>
                      );
                    },
                    ul: (props) => <ul className="list-disc pl-6 my-2 space-y-1" {...props} />,
                    ol: (props) => <ol className="list-decimal pl-6 my-2 space-y-1" {...props} />,
                    li: (props) => <li className="leading-relaxed" {...props} />,
                    h1: (props) => <h1 className="text-xl font-bold mt-4 mb-2" {...props} />,
                    h2: (props) => <h2 className="text-lg font-semibold mt-4 mb-2" {...props} />,
                    h3: (props) => <h3 className="text-base font-semibold mt-4 mb-2" {...props} />,
                    table: (props) => <table className="min-w-full border-collapse border border-gray-300 dark:border-gray-600 my-4" {...props} />,
                    thead: (props) => <thead className="bg-gray-100 dark:bg-gray-700" {...props} />,
                    tr: (props) => <tr className="border-b border-gray-200 dark:border-gray-600" {...props} />,
                    th: (props) => <th className="border border-gray-300 dark:border-gray-600 px-3 py-2 text-left font-semibold" {...props} />,
                    td: (props) => <td className="border border-gray-300 dark:border-gray-600 px-3 py-2" {...props} />,
                  }}
                >
                  {message.content}
                </ReactMarkdown>
              )}
            </div>
          </div>
        ))}
        
        <div ref={messagesEndRef} />
      </div>

      <div className="border-t border-gray-200 dark:border-gray-700 p-4 bg-white dark:bg-gray-800">
        {isLoading && (
          <div className="flex justify-center mb-2">
            <button onClick={handleStopGenerating} className="px-4 py-1 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 text-sm">
              Stop Generating
            </button>
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex space-x-2">
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