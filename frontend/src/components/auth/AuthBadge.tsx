import type { ToolMeta } from '@/registry/types';
import { Icon } from '@/components/ui/icons';

/** Local (lock) or Synced (cloud). Text is always shown, never color alone. */
export function AuthBadge({ tool }: { tool: ToolMeta }) {
  if (tool.status === 'soon') return <span className="tag soon">Coming soon</span>;
  if (tool.tier === 'cloud') {
    return (
      <span className="tag cloud" title="Saves to your Google account after you sign in">
        <Icon name="cloud" />
        Synced
      </span>
    );
  }
  return (
    <span
      className="tag local"
      title={tool.sync === 'optional' ? 'Runs in your browser. You can optionally save presets to your account.' : 'Runs 100% in your browser. Files are not uploaded.'}
    >
      <Icon name="lock" />
      {tool.sync === 'optional' ? 'Local, optional sync' : 'Local'}
    </span>
  );
}
