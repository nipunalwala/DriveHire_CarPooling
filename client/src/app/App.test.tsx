import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { App } from './App';

describe('public shell', () => {
  it('renders the home page with accessible navigation', () => {
    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>
    );
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      /Make the journey\s*part of the adventure\./
    );
    expect(screen.getByRole('link', { name: 'Skip to content' })).toHaveAttribute('href', '#main');
  });
  it('routes the search widget to the selected journey with query parameters', async () => {
    const user = userEvent.setup();
    function Location() {
      const location = useLocation();
      return (
        <output>
          {location.pathname}
          {location.search}
        </output>
      );
    }
    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
        <Location />
      </MemoryRouter>
    );
    await user.click(screen.getAllByRole('tab', { name: 'Find a carpool' })[0]!);
    await user.type(screen.getByRole('textbox', { name: 'City' }), 'Mumbai');
    await user.click(screen.getByRole('button', { name: /Search rides/ }));
    expect(screen.getByText('/carpool?city=Mumbai')).toBeInTheDocument();
  });
});
