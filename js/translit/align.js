import { levenshtein, isPurelyLatin } from './utils.js';

function matchCost(candidate, guide, latin) {
  const c = candidate.trim();
  const g = guide.trim();
  if (!c && g) return 50;
  const dist = levenshtein(c.toLowerCase(), g.toLowerCase());
  if (latin) return dist * 50 + Math.abs(candidate.length - guide.length) * 0.5;
  return dist + Math.abs(c.length - g.length) * 0.8 + (candidate.endsWith(' ') ? -0.5 : 0);
}

export function alignChunks(fullText, guides, syllableTexts) {
  const M = guides.length;
  const N = fullText.length;
  if (M === 0) return [];
  if (N === 0) return guides.map(() => '');

  const INF = Number.MAX_VALUE;
  const dp = Array.from({ length: M + 1 }, () => new Float64Array(N + 1).fill(INF));
  const path = Array.from({ length: M + 1 }, () => new Int32Array(N + 1).fill(-1));
  dp[0][0] = 0;

  for (let i = 1; i <= M; i++) {
    const guide = guides[i - 1];
    const latin = isPurelyLatin(syllableTexts[i - 1] || '');
    const minLen = latin ? Math.max(1, guide.length - 1) : 1;
    const maxLen = latin ? guide.length + 3 : Math.max(guide.length * 3 + 3, 15);

    for (let j = 1; j <= N; j++) {
      let best = INF;
      let bestPrev = -1;
      for (let len = minLen; len <= maxLen; len++) {
        const k = j - len;
        if (k < 0) break;
        if (dp[i - 1][k] === INF) continue;
        const candidate = fullText.substring(k, j);
        let cost = matchCost(candidate, guide, latin);
        if (!latin && j < N && /\s$/.test(syllableTexts[i - 1] || '') && !/\s$/.test(candidate)) cost += 4;
        const total = dp[i - 1][k] + cost;
        if (total < best) {
          best = total;
          bestPrev = k;
        }
      }
      dp[i][j] = best;
      path[i][j] = bestPrev;
    }
  }

  let end = N;
  if (dp[M][N] === INF) {
    let minCost = INF;
    for (let k = N; k >= 0; k--) {
      if (dp[M][k] < minCost) {
        minCost = dp[M][k];
        end = k;
      }
    }
  }

  const results = new Array(M).fill('');
  let cursor = end;
  for (let i = M; i > 0; i--) {
    const prev = path[i][cursor];
    if (prev === -1) continue;
    results[i - 1] = fullText.substring(prev, cursor);
    cursor = prev;
  }

  if (cursor > 0) results[0] = fullText.substring(0, cursor) + results[0];
  const used = results.join('').length;
  if (used < N) results[M - 1] += fullText.substring(used);
  return results;
}
