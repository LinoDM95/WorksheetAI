import type { ReactNode } from 'react';
import katex from 'katex';

function renderMathHtml(tex: string, display: boolean): string {
  return katex.renderToString(tex, { throwOnError: false, displayMode: display, strict: false });
}

function isMathDelimiter(s: string, j: number): boolean {
  if (j >= s.length) return false;
  if (s.startsWith('$$', j)) return true;
  if (s[j] === '$') return true;
  if (s.startsWith('\\[', j)) return true;
  if (s.startsWith('\\(', j)) return true;
  return false;
}

function parseToNodes(input: string): ReactNode[] {
  const out: ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < input.length) {
    if (input.startsWith('\\[', i)) {
      const end = input.indexOf('\\]', i + 2);
      if (end === -1) {
        out.push(<span key={`t${key++}`}>{input.slice(i)}</span>);
        break;
      }
      const tex = input.slice(i + 2, end).trim();
      out.push(
        <span
          key={`m${key++}`}
          className="katex-display-wrap my-1 block w-full max-w-full overflow-x-auto"
          dangerouslySetInnerHTML={{ __html: renderMathHtml(tex, true) }}
        />,
      );
      i = end + 2;
      continue;
    }
    if (input.startsWith('$$', i)) {
      const end = input.indexOf('$$', i + 2);
      if (end === -1) {
        out.push(<span key={`t${key++}`}>{input.slice(i)}</span>);
        break;
      }
      const tex = input.slice(i + 2, end).trim();
      out.push(
        <span
          key={`m${key++}`}
          className="katex-display-wrap my-1 block w-full max-w-full overflow-x-auto"
          dangerouslySetInnerHTML={{ __html: renderMathHtml(tex, true) }}
        />,
      );
      i = end + 2;
      continue;
    }
    if (input.startsWith('\\(', i)) {
      const end = input.indexOf('\\)', i + 2);
      if (end === -1) {
        out.push(<span key={`t${key++}`}>{input.slice(i)}</span>);
        break;
      }
      const tex = input.slice(i + 2, end).trim();
      out.push(
        <span
          key={`m${key++}`}
          className="latex-math-inline"
          dangerouslySetInnerHTML={{ __html: renderMathHtml(tex, false) }}
        />,
      );
      i = end + 2;
      continue;
    }
    if (input[i] === '$') {
      const end = input.indexOf('$', i + 1);
      if (end === -1) {
        out.push(<span key={`t${key++}`}>{input.slice(i)}</span>);
        break;
      }
      const tex = input.slice(i + 1, end).trim();
      out.push(
        <span
          key={`m${key++}`}
          className="latex-math-inline"
          dangerouslySetInnerHTML={{ __html: renderMathHtml(tex, false) }}
        />,
      );
      i = end + 1;
      continue;
    }

    let j = i;
    while (j < input.length && !isMathDelimiter(input, j)) j += 1;
    if (j > i) {
      out.push(<span key={`t${key++}`}>{input.slice(i, j)}</span>);
      i = j;
    } else {
      out.push(<span key={`t${key++}`}>{input[i]}</span>);
      i += 1;
    }
  }
  return out;
}

/**
 * Rendert gemischten Text mit LaTeX-Inseln ($...$, \\(...\\), \\[...\\], $$...$$).
 * KaTeX erzeugt nur Math-HTML — kein beliebiges HTML aus Nutzerstrings.
 */
export function LatexText({
  text,
  className,
  as: Tag = 'span',
}: {
  text: string | number | null | undefined;
  className?: string;
  as?: 'span' | 'p' | 'div';
}) {
  const s = text == null ? '' : String(text);
  if (!s) return null;
  const nodes = parseToNodes(s);
  return <Tag className={className}>{nodes}</Tag>;
}
