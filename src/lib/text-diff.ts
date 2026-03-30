export interface DiffBlock {
  type: "unchanged" | "added" | "removed";
  text: string;
}

/**
 * Paragraph-level diff using LCS algorithm.
 * Splits text by double newline, compares paragraphs.
 */
export function computeParagraphDiff(oldText: string, newText: string): DiffBlock[] {
  const oldParagraphs = splitParagraphs(oldText);
  const newParagraphs = splitParagraphs(newText);

  // Build LCS table
  const m = oldParagraphs.length;
  const n = newParagraphs.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (oldParagraphs[i - 1] === newParagraphs[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // Backtrack to get diff
  const result: DiffBlock[] = [];
  let i = m, j = n;

  const stack: DiffBlock[] = [];
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldParagraphs[i - 1] === newParagraphs[j - 1]) {
      stack.push({ type: "unchanged", text: oldParagraphs[i - 1] });
      i--; j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      stack.push({ type: "added", text: newParagraphs[j - 1] });
      j--;
    } else {
      stack.push({ type: "removed", text: oldParagraphs[i - 1] });
      i--;
    }
  }

  // Reverse since we built it backwards
  while (stack.length > 0) {
    result.push(stack.pop()!);
  }

  return result;
}

function splitParagraphs(text: string): string[] {
  // Strip HTML tags for comparison, split by block-level elements or double newlines
  const stripped = text
    .replace(/<\/(p|div|li|h[1-6]|tr|blockquote)>/gi, "\n\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");

  return stripped
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}
