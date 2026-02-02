import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

// Create mock functions and state holder using vi.hoisted for proper hoisting
const { mockSendMessage, getMockState, setMockState } = vi.hoisted(() => {
  const mockSendMessage = vi.fn();
  let mockState = {
    messages: [] as any[],
    messagesLoading: false,
    sendingMessage: false,
    sendMessage: mockSendMessage,
    agentProcessing: false,
    currentRunId: null as string | null,
  };

  return {
    mockSendMessage,
    getMockState: () => mockState,
    setMockState: (newState: typeof mockState) => {
      mockState = newState;
    },
  };
});

// Default mock state factory
const createMockState = (overrides = {}) => ({
  messages: [] as any[],
  messagesLoading: false,
  sendingMessage: false,
  sendMessage: mockSendMessage,
  agentProcessing: false,
  currentRunId: null as string | null,
  ...overrides,
});

// Mock the store module
vi.mock('../../store', () => ({
  useStore: () => getMockState(),
}));

// Import Chat after the mock is set up
import { Chat } from '../Chat';

// Wrap Chat with router since it uses useNavigate
function renderChat() {
  return render(
    <MemoryRouter>
      <Chat />
    </MemoryRouter>
  );
}

describe('Chat', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setMockState(createMockState());
  });

  afterEach(() => {
    cleanup();
  });

  it('renders the input field', () => {
    renderChat();
    const input = screen.getByPlaceholderText(/send a message/i);
    expect(input).toBeInTheDocument();
  });

  it('renders the send button', () => {
    renderChat();
    const button = screen.getByRole('button', { name: /send/i });
    expect(button).toBeInTheDocument();
  });

  it('shows empty state when no messages', () => {
    renderChat();
    expect(screen.getByText(/no messages yet/i)).toBeInTheDocument();
  });

  it('shows loading state when messages are loading', () => {
    setMockState(createMockState({ messagesLoading: true }));
    renderChat();
    expect(screen.getByText(/loading messages/i)).toBeInTheDocument();
  });

  it('disables send button when input is empty', () => {
    renderChat();
    const button = screen.getByRole('button', { name: /send/i });
    expect(button).toBeDisabled();
  });

  it('enables send button when input has text', async () => {
    const user = userEvent.setup();
    renderChat();

    const input = screen.getByPlaceholderText(/send a message/i);
    await user.type(input, 'Hello');

    const button = screen.getByRole('button', { name: /send/i });
    expect(button).not.toBeDisabled();
  });

  it('calls sendMessage when form is submitted', async () => {
    const user = userEvent.setup();
    renderChat();

    const input = screen.getByPlaceholderText(/send a message/i);
    await user.type(input, 'Hello agent');

    const button = screen.getByRole('button', { name: /send/i });
    await user.click(button);

    expect(mockSendMessage).toHaveBeenCalledWith('Hello agent');
  });

  it('clears input after sending message', async () => {
    const user = userEvent.setup();
    renderChat();

    const input = screen.getByPlaceholderText(/send a message/i) as HTMLTextAreaElement;
    await user.type(input, 'Hello');
    await user.click(screen.getByRole('button', { name: /send/i }));

    expect(input.value).toBe('');
  });

  it('submits on Enter key (without shift)', async () => {
    const user = userEvent.setup();
    renderChat();

    const input = screen.getByPlaceholderText(/send a message/i);
    await user.type(input, 'Hello{Enter}');

    expect(mockSendMessage).toHaveBeenCalledWith('Hello');
  });

  it('does not submit on Shift+Enter', async () => {
    const user = userEvent.setup();
    renderChat();

    const input = screen.getByPlaceholderText(/send a message/i);
    await user.type(input, 'Hello{Shift>}{Enter}{/Shift}');

    expect(mockSendMessage).not.toHaveBeenCalled();
  });

  it('displays messages from conversation', () => {
    setMockState(
      createMockState({
        messages: [
          { id: '1', from: 'human', text: 'Hello', timestamp: new Date().toISOString(), channel: 'web' },
          { id: '2', from: 'agent', text: 'Hi there!', timestamp: new Date().toISOString(), channel: 'web' },
        ],
      })
    );

    renderChat();
    expect(screen.getByText('Hello')).toBeInTheDocument();
    expect(screen.getByText('Hi there!')).toBeInTheDocument();
  });

  it('shows typing indicator when agent is processing', () => {
    // Typing indicator only shows when there are messages (it's in the messages branch)
    setMockState(
      createMockState({
        messages: [{ id: '1', from: 'human', text: 'Hello', timestamp: new Date().toISOString(), channel: 'web' }],
        agentProcessing: true,
        currentRunId: 'run-123',
      })
    );

    renderChat();
    // The typing indicator shows animated dots - check for the View progress button
    expect(screen.getByText(/view progress/i)).toBeInTheDocument();
  });

  it('disables send button while message is being sent', () => {
    setMockState(createMockState({ sendingMessage: true }));

    renderChat();
    const button = screen.getByRole('button', { name: /sending/i });
    expect(button).toBeDisabled();
  });
});
