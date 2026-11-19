'use client';

import { useEffect, useState } from 'react';
import { Tabs } from '@/components/ui';
import { readJson, writeJson } from '@/lib/storage';
import Base64Tab from './Base64Tab';
import BcryptTab from './BcryptTab';
import HashTab from './HashTab';
import HmacTab from './HmacTab';
import UrlTab from './UrlTab';

const TABS = [
  { id: 'base64', label: 'Base64' },
  { id: 'url', label: 'URL' },
  { id: 'hash', label: 'Hash' },
  { id: 'hmac', label: 'HMAC' },
  { id: 'bcrypt', label: 'Bcrypt' },
] as const;
type TabId = (typeof TABS)[number]['id'];
const KEY = 'uu:base64-url-hash:tab';
const isTab = (v: unknown): v is TabId => TABS.some((t) => t.id === v);

/** Only the selected tab is saved. Inputs, secrets and passwords are never persisted. */
export default function Base64UrlHash() {
  const [tab, setTab] = useState<TabId>('base64');
  useEffect(() => setTab(readJson<TabId>(KEY, 'base64', isTab)), []);

  return (
    <div className="stack" style={{ gap: 16 }}>
      <Tabs
        label="Encoders and hashes"
        tabs={[...TABS]}
        value={tab}
        onChange={(t) => {
          setTab(t);
          writeJson(KEY, t);
        }}
      />
      <div role="tabpanel">
        {tab === 'base64' && <Base64Tab />}
        {tab === 'url' && <UrlTab />}
        {tab === 'hash' && <HashTab />}
        {tab === 'hmac' && <HmacTab />}
        {tab === 'bcrypt' && <BcryptTab />}
      </div>
    </div>
  );
}
