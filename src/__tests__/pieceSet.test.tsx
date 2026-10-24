import { describe, it, expect } from 'vite-plus/test';
import { render } from '@testing-library/react';
import Piece from '../components/Piece/Piece';

describe('Piece set renderers produce distinct output', () => {
  const PIECE_TYPES = [
    { color: 'w' as const, type: 'k' },
    { color: 'w' as const, type: 'q' },
    { color: 'b' as const, type: 'k' },
    { color: 'b' as const, type: 'p' },
  ];
  const PIECE_SETS = ['unicode', 'symbols', 'outlined', 'merida'] as const;

  PIECE_SETS.forEach((setA) => {
    PIECE_SETS.forEach((setB) => {
      if (setA === setB) return;

      it(`renders different DOM for pieceSet="${setA}" vs "${setB}"`, () => {
        PIECE_TYPES.forEach((piece) => {
          const { container: containerA } = render(
            <Piece piece={piece} pieceSet={setA} />
          );
          const { container: containerB } = render(
            <Piece piece={piece} pieceSet={setB} />
          );

          const htmlA = containerA.innerHTML;
          const htmlB = containerB.innerHTML;

          // Must produce different HTML
          expect(htmlA).not.toBe(htmlB);

          // Must produce different data-piece-set attributes
          expect(htmlA).toContain(`data-piece-set="${setA}"`);
          expect(htmlB).toContain(`data-piece-set="${setB}"`);

          // Must have inline style attribute
          expect(htmlA).toContain('style="');
          expect(htmlB).toContain('style="');

          // Must render a visible character (not empty)
          expect(htmlA).toMatch(/[♔-♟]/);
          expect(htmlB).toMatch(/[♔-♟]/);
        });
      });
    });
  });

  it('renders with data-piece-set attribute matching the prop', () => {
    const { container } = render(
      <Piece piece={{ color: 'w', type: 'q' }} pieceSet="symbols" />
    );
    const span = container.querySelector('span');
    expect(span).not.toBeNull();
    expect(span!.getAttribute('data-piece-set')).toBe('symbols');
    expect(span!.getAttribute('data-piece')).toBe('wq');
    expect(span!.className).toContain('piece-set-symbols');
  });

  it('renders unicode as default when no pieceSet provided', () => {
    const { container } = render(
      <Piece piece={{ color: 'w', type: 'k' }} />
    );
    const span = container.querySelector('span');
    expect(span!.getAttribute('data-piece-set')).toBe('unicode');
    expect(span!.className).toContain('piece-set-unicode');
  });

  it('renders Merida white pieces light and black pieces dark', () => {
    const white = render(<Piece piece={{ color: 'w', type: 'p' }} pieceSet="merida" />).container.querySelector('span')!;
    const black = render(<Piece piece={{ color: 'b', type: 'p' }} pieceSet="merida" />).container.querySelector('span')!;
    expect(white.style.color).toBe('rgb(247, 243, 232)');
    expect(black.style.color).toBe('rgb(32, 38, 49)');
    expect(white.className).toContain('piece-white');
    expect(black.className).toContain('piece-black');
  });

  it('renders different inline styles for each piece set', () => {
    const results = PIECE_SETS.map((set) => {
      const { container } = render(
        <Piece piece={{ color: 'w', type: 'q' }} pieceSet={set} />
      );
      const span = container.querySelector('span');
      return { set, style: span!.getAttribute('style') };
    });

    // All four styles should be different
    const styles = results.map((r) => r.style);
    styles.forEach((s, i) => {
      styles.forEach((t, j) => {
        if (i !== j) {
          expect(s).not.toBe(t);
        }
      });
    });
  });

  it('renders different className for each piece set', () => {
    const results = PIECE_SETS.map((set) => {
      const { container } = render(
        <Piece piece={{ color: 'b', type: 'r' }} pieceSet={set} />
      );
      const span = container.querySelector('span');
      return { set, className: span!.className };
    });

    const names = results.map((r) => r.className);
    names.forEach((n, i) => {
      names.forEach((m, j) => {
        if (i !== j) {
          expect(n).not.toBe(m);
        }
      });
    });
  });
});

