import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Layout } from '../Layout';

// Wrap Layout with router since it uses NavLink and Outlet
function renderLayout(initialRoute = '/chat') {
  return render(
    <MemoryRouter initialEntries={[initialRoute]}>
      <Layout />
    </MemoryRouter>
  );
}

describe('Layout', () => {
  it('renders the header with Singularity title', () => {
    renderLayout();
    expect(screen.getByText('Singularity')).toBeInTheDocument();
  });

  it('renders all navigation items', () => {
    renderLayout();
    expect(screen.getByText('Chat')).toBeInTheDocument();
    expect(screen.getByText('Jobs')).toBeInTheDocument();
    expect(screen.getByText('Files')).toBeInTheDocument();
    expect(screen.getByText('Outputs')).toBeInTheDocument();
    expect(screen.getByText('History')).toBeInTheDocument();
  });

  it('renders navigation links with correct paths', () => {
    renderLayout();

    const chatLink = screen.getByRole('link', { name: /chat/i });
    expect(chatLink).toHaveAttribute('href', '/chat');

    const jobsLink = screen.getByRole('link', { name: /jobs/i });
    expect(jobsLink).toHaveAttribute('href', '/jobs');

    const filesLink = screen.getByRole('link', { name: /files/i });
    expect(filesLink).toHaveAttribute('href', '/files');

    const outputsLink = screen.getByRole('link', { name: /outputs/i });
    expect(outputsLink).toHaveAttribute('href', '/outputs');

    const historyLink = screen.getByRole('link', { name: /history/i });
    expect(historyLink).toHaveAttribute('href', '/history');
  });

  it('renders navigation icons', () => {
    renderLayout();
    // Icons are rendered as emoji text
    expect(screen.getByText('💬')).toBeInTheDocument();
    expect(screen.getByText('💼')).toBeInTheDocument();
    expect(screen.getByText('📁')).toBeInTheDocument();
    expect(screen.getByText('📤')).toBeInTheDocument();
    expect(screen.getByText('📜')).toBeInTheDocument();
  });

  it('renders the Status component', () => {
    renderLayout();
    // Status component should be rendered in the header
    // It will show loading state initially
    const header = screen.getByRole('banner');
    expect(header).toBeInTheDocument();
  });

  it('renders the main content area', () => {
    renderLayout();
    const main = screen.getByRole('main');
    expect(main).toBeInTheDocument();
  });
});
