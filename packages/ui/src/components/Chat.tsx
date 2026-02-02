import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../store';
import { format } from 'date-fns';
import clsx from 'clsx';
import Markdown from 'react-markdown';

export function Chat() {
  const { messages, messagesLoading, sendingMessage, sendMessage, agentProcessing, currentRunId } = useStore();
  const navigate = useNavigate();
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages arrive or typing indicator appears
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, agentProcessing]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || sendingMessage) return;

    const text = input.trim();
    setInput('');
    await sendMessage(text);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Messages area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messagesLoading && messages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-slate-400">
            Loading messages...
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-400">
            <div className="text-4xl mb-4">💬</div>
            <p>No messages yet.</p>
            <p className="text-sm">Send a message to start chatting with the agent.</p>
          </div>
        ) : (
          <>
            {messages.map((message) => (
              <div
                key={message.id}
                className={clsx(
                  'flex',
                  message.from === 'human' ? 'justify-end' : 'justify-start'
                )}
              >
                <div
                  className={clsx(
                    'max-w-[70%] rounded-lg px-4 py-2',
                    message.from === 'human'
                      ? 'bg-primary-600 text-white'
                      : 'bg-slate-700 text-slate-100'
                  )}
                >
                  <div className="prose prose-invert prose-sm max-w-none prose-p:text-inherit prose-p:my-1 prose-headings:text-inherit prose-headings:mt-2 prose-headings:mb-1 prose-strong:text-inherit prose-code:text-primary-300 prose-code:bg-slate-800/50 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-sm prose-pre:bg-slate-800 prose-pre:my-2 prose-a:text-primary-400 prose-li:text-inherit prose-li:my-0 prose-ul:my-1 prose-ol:my-1">
                    <Markdown>{message.text}</Markdown>
                  </div>
                  <div
                    className={clsx(
                      'text-xs mt-1 flex items-center gap-2',
                      message.from === 'human' ? 'text-primary-200' : 'text-slate-400'
                    )}
                  >
                    <span>{format(new Date(message.timestamp), 'HH:mm')}</span>
                    {message.channel === 'telegram' && <span>via Telegram</span>}
                    {message.from === 'agent' && message.metadata?.runId && (
                      <button
                        onClick={() => navigate('/history')}
                        className="hover:underline text-primary-400"
                        title="View session details"
                      >
                        Session
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
            {/* Typing indicator when agent is processing */}
            {agentProcessing && (
              <div className="flex justify-start">
                <div className="bg-slate-700 text-slate-100 rounded-lg px-4 py-2 flex items-center gap-2">
                  <div className="flex gap-1">
                    <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                  {currentRunId && (
                    <button
                      onClick={() => navigate('/history')}
                      className="text-xs text-slate-400 hover:text-primary-400 hover:underline ml-2"
                    >
                      View progress
                    </button>
                  )}
                </div>
              </div>
            )}
          </>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <form onSubmit={handleSubmit} className="p-4 border-t border-slate-700">
        <div className="flex gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Send a message to the agent..."
            disabled={sendingMessage}
            className={clsx(
              'flex-1 bg-slate-800 border border-slate-600 rounded-lg px-4 py-2',
              'text-white placeholder-slate-400 resize-none',
              'focus:outline-none focus:border-primary-500',
              sendingMessage && 'opacity-50'
            )}
            rows={2}
          />
          <button
            type="submit"
            disabled={!input.trim() || sendingMessage}
            className={clsx(
              'px-6 py-2 rounded-lg font-medium transition-colors',
              input.trim() && !sendingMessage
                ? 'bg-primary-600 text-white hover:bg-primary-500'
                : 'bg-slate-700 text-slate-400 cursor-not-allowed'
            )}
          >
            {sendingMessage ? 'Sending...' : 'Send'}
          </button>
        </div>
        <p className="text-xs text-slate-500 mt-2">
          Messages are sent to the agent for immediate processing.
        </p>
      </form>
    </div>
  );
}
