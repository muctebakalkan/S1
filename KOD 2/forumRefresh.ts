import { ForumComment, FORUM_PAGE_SIZE, listForumComments } from './community';

/** Keep just-sent, server-confirmed replies visible while older pages remain. */
export function mergeForumWindow(rows: ForumComment[], justSent: ForumComment[], hasMore: boolean): ForumComment[] {
  const visible = new Map(rows.map(row => [row.id, row]));
  if (hasMore) for (const row of justSent) if (!visible.has(row.id)) visible.set(row.id, row);
  return [...visible.values()].sort((a,b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
}

/** Reload the complete visible window so deletions cannot shift page offsets. */
export async function readForumCommentWindow(postId: string, lastPage: number): Promise<{ comments: ForumComment[]; page: number; hasMore: boolean }> {
  const comments = new Map<string, ForumComment>();
  const end = Math.max(0, Math.floor(lastPage));
  for (let page = 0; page <= end; page++) {
    const rows = await listForumComments(postId, page);
    for (const row of rows) comments.set(row.id, row);
    const hasMore = rows.length === FORUM_PAGE_SIZE;
    if (!hasMore || page === end) return { comments: [...comments.values()], page, hasMore };
  }
  return { comments: [], page: 0, hasMore: false };
}

/** One request at a time; callers decide whether the screen is foreground. */
export function startForumRefresh(refresh: () => Promise<void>, active: () => boolean, interval = 15000): () => void {
  let stopped = false, busy = false;
  const timer = setInterval(async () => {
    if (stopped || busy || !active()) return;
    busy = true;
    try { await refresh(); } catch { /* The screen keeps the last successful result. */ }
    finally { busy = false; }
  }, interval);
  return () => { stopped = true; clearInterval(timer); };
}
