/*
 * The jest-dom matchers (toBeInTheDocument, toHaveAttribute, toHaveClass, ...)
 * are registered at runtime by vitest.setup.ts. That file belongs to the Node
 * TypeScript program, so the tests under src/ would not see the augmented
 * matcher types. This reference brings the augmentation into the app program.
 */
import '@testing-library/jest-dom/vitest';
