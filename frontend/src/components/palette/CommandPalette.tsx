'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon, type IconName } from '@/components/ui';
import { useSession } from '@/hooks/useSession';
import { searchTools } from '@/lib/search';
import { getCategory, getToolById, visibleTools } from '@/registry';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { setTheme } from '@/store/slices/preferences.slice';
import { setPaletteOpen, showToast } from '@/store/slices/ui.slice';

interface Item {
  key: string;
  group: string;
  label: string;
  sub?: string;
  icon: IconName;
  color?: string;
  run: () => void;
}

const isTyping = (el: Element | null) => {
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (el as HTMLElement).isContentEditable;
};

/** Ctrl/Cmd+K or "/" opens a fuzzy search over tools plus a few actions. */
export function CommandPalette() {
  const open = useAppSelector((s) => s.ui.paletteOpen);
  const recents = useAppSelector((s) => s.preferences.recents);
  const theme = useAppSelector((s) => s.preferences.theme);
  const dispatch = useAppDispatch();
  const router = useRouter();
  const { isAuthed } = useSession();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const opener = useRef<Element | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        dispatch(setPaletteOpen(true));
      } else if (e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey && !isTyping(document.activeElement)) {
        e.preventDefault();
        dispatch(setPaletteOpen(true));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dispatch]);

  useEffect(() => {
    if (open) {
      opener.current = document.activeElement;
      setQuery('');
      setActive(0);
      setTimeout(() => input.current?.focus(), 0);
    } else {
      (opener.current as HTMLElement | null)?.focus?.();
    }
  }, [open]);

  const close = () => dispatch(setPaletteOpen(false));

  const items = useMemo<Item[]>(() => {
    const go = (slug: string) => () => {
      close();
      router.push(`/tools/${slug}`);
    };
    const toolItem = (id: string, group: string): Item | null => {
      const t = getToolById(id);
      if (!t || t.status === 'hidden') return null;
      return {
        key: `${group}-${t.id}`,
        group,
        label: t.name,
        sub: t.status === 'soon' ? 'Coming soon' : t.description,
        icon: t.icon,
        color: getCategory(t.category).color,
        run: t.status === 'live' ? go(t.slug) : () => dispatch(showToast(`${t.name} is coming soon`)),
      };
    };
    const actions: Item[] = [
      { key: 'a-home', group: 'Actions', label: 'Go to home', icon: 'grid', run: () => { close(); router.push('/'); } },
      {
        key: 'a-theme',
        group: 'Actions',
        label: theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme',
        icon: theme === 'dark' ? 'sun' : 'moon',
        run: () => { dispatch(setTheme(theme === 'dark' ? 'light' : 'dark')); close(); },
      },
      isAuthed
        ? { key: 'a-account', group: 'Actions', label: 'Account & data', icon: 'user', run: () => { close(); router.push('/account'); } }
        : { key: 'a-login', group: 'Actions', label: 'Sign in with Google', icon: 'user', run: () => { close(); router.push('/login'); } },
    ];
    const q = query.trim();
    if (!q) {
      const recent = recents.map((id) => toolItem(id, 'Recent')).filter((i): i is Item => i !== null);
      return [...recent, ...actions];
    }
    const found = searchTools(visibleTools, q, 8).map((t) => toolItem(t.id, 'Tools')).filter((i): i is Item => i !== null);
    const matchedActions = actions.filter((a) => a.label.toLowerCase().includes(q.toLowerCase()));
    return [...found, ...matchedActions];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, recents, theme, isAuthed, router, dispatch]);

  if (!open) return null;

  const clamp = (n: number) => Math.max(0, Math.min(items.length - 1, n));

  return (
    <div className="palette-backdrop" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="palette" role="dialog" aria-modal="true" aria-label="Search tools">
        <input
          ref={input}
          value={query}
          placeholder="Search tools and actions…"
          role="combobox"
          aria-expanded="true"
          aria-controls="palette-list"
          aria-activedescendant={items[active] ? `pi-${items[active]?.key}` : undefined}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing) return;
            if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => clamp(a + 1)); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => clamp(a - 1)); }
            else if (e.key === 'Enter') { e.preventDefault(); items[active]?.run(); }
            else if (e.key === 'Escape') { e.preventDefault(); close(); }
          }}
        />
        <ul id="palette-list" role="listbox">
          {items.length === 0 && <li className="p-group">No tool matches “{query}”. Try a shorter word like “pdf” or “color”.</li>}
          {items.map((item, i) => (
            <li key={item.key} role="presentation">
              {(i === 0 || items[i - 1]?.group !== item.group) && <div className="p-group">{item.group}</div>}
              <button
                id={`pi-${item.key}`}
                type="button"
                role="option"
                aria-selected={i === active}
                className="p-item"
                onMouseEnter={() => setActive(i)}
                onClick={item.run}
              >
                <span className="p-ico" style={item.color ? { ['--c' as string]: item.color } : undefined}>
                  <Icon name={item.icon} />
                </span>
                <span className="grow">
                  <div style={{ fontWeight: 600 }}>{item.label}</div>
                  {item.sub && <div className="faint" style={{ fontSize: 12 }}>{item.sub}</div>}
                </span>
              </button>
            </li>
          ))}
        </ul>
        <div className="p-foot">
          <span>↑↓ to move</span>
          <span>Enter to open</span>
          <span>Esc to close</span>
        </div>
      </div>
    </div>
  );
}
