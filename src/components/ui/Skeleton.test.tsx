import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Skeleton } from './Skeleton.tsx';

describe('Skeleton', () => {
  it('is hidden from assistive technology', () => {
    const { container } = render(<Skeleton />);

    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true');
  });

  it('accepts the sizing classes of the caller', () => {
    const { container } = render(<Skeleton className="h-4 w-24" />);

    expect(container.firstElementChild).toHaveClass('h-4', 'w-24', 'animate-pulse');
  });
});
