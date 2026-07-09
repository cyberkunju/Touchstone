/**
 * "Protect this workspace" (P7.3 §2.1) — the optional at-rest encryption
 * toggle. THIN: all crypto in security/workspace-crypto.ts; all storage in
 * storage/workspace-db.ts. This component only collects the passphrase,
 * shows the NO-RECOVERY warning, and reports the unlocked key upward.
 */

import React, { useEffect, useState } from 'react';
import { Lock, Unlock } from 'lucide-react';
import { createKeyring, unlockKeyring } from '../security/workspace-crypto';
import { getKeyring, putKeyring } from '../storage/workspace-db';

interface WorkspaceProtectionProps {
  /** Fired with the unlocked master key (null = protection disabled). */
  onKeyChange: (key: CryptoKey | null) => void;
}

type State =
  | { phase: 'loading' }
  | { phase: 'unprotected' }
  | { phase: 'locked' }
  | { phase: 'unlocked' }
  | { phase: 'setting'; passphrase: string; confirm: string; busy: boolean }
  | { phase: 'unlocking'; passphrase: string; busy: boolean; wrong: boolean };

export default function WorkspaceProtection({ onKeyChange }: WorkspaceProtectionProps) {
  const [state, setState] = useState<State>({ phase: 'loading' });

  useEffect(() => {
    getKeyring()
      .then((k) => setState(k ? { phase: 'locked' } : { phase: 'unprotected' }))
      .catch(() => setState({ phase: 'unprotected' }));
  }, []);

  const enable = async (passphrase: string) => {
    const keyring = await createKeyring(passphrase);
    await putKeyring(keyring);
    const key = await unlockKeyring(passphrase, keyring);
    onKeyChange(key);
    setState({ phase: 'unlocked' });
  };

  const unlock = async (passphrase: string) => {
    const keyring = await getKeyring();
    if (!keyring) {
      setState({ phase: 'unprotected' });
      return;
    }
    const key = await unlockKeyring(passphrase, keyring);
    if (key === null) {
      setState({ phase: 'unlocking', passphrase: '', busy: false, wrong: true });
      return;
    }
    onKeyChange(key);
    setState({ phase: 'unlocked' });
  };

  if (state.phase === 'loading') return null;

  if (state.phase === 'unprotected') {
    return (
      <button
        onClick={() => setState({ phase: 'setting', passphrase: '', confirm: '', busy: false })}
        title="Encrypt workspace data at rest (AES-GCM-256)"
        style={btn()}
      >
        <Unlock size={13} /> Protect this workspace
      </button>
    );
  }

  if (state.phase === 'locked') {
    return (
      <button
        onClick={() => setState({ phase: 'unlocking', passphrase: '', busy: false, wrong: false })}
        style={btn('#d97706')}
      >
        <Lock size={13} /> Workspace locked — unlock
      </button>
    );
  }

  if (state.phase === 'unlocked') {
    return (
      <span style={{ ...btn('#16a34a'), cursor: 'default' }} title="Workspace encryption active">
        <Lock size={13} /> Protected
      </span>
    );
  }

  if (state.phase === 'setting') {
    const mismatch = state.confirm.length > 0 && state.passphrase !== state.confirm;
    const ok = state.passphrase.length >= 8 && state.passphrase === state.confirm;
    return (
      <div role="dialog" aria-label="Protect workspace" style={panel()}>
        <strong style={{ fontSize: '0.85rem' }}>Protect this workspace</strong>
        <p style={{ fontSize: '0.75rem', color: '#b45309', margin: '4px 0' }}>
          ⚠ There is NO recovery. A forgotten passphrase means this workspace's
          data is permanently unreadable. Exports remain plaintext.
        </p>
        <input
          type="password"
          placeholder="Passphrase (min 8 chars)"
          value={state.passphrase}
          onChange={(e) => setState({ ...state, passphrase: e.target.value })}
          style={input()}
        />
        <input
          type="password"
          placeholder="Confirm passphrase"
          value={state.confirm}
          onChange={(e) => setState({ ...state, confirm: e.target.value })}
          style={input()}
        />
        {mismatch && <span style={{ fontSize: '0.7rem', color: '#dc2626' }}>Passphrases differ</span>}
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            disabled={!ok || state.busy}
            onClick={async () => {
              setState({ ...state, busy: true });
              await enable(state.passphrase);
            }}
            style={btn('#16a34a')}
          >
            {state.busy ? 'Deriving key…' : 'Enable encryption'}
          </button>
          <button onClick={() => setState({ phase: 'unprotected' })} style={btn()}>
            Cancel
          </button>
        </div>
      </div>
    );
  }

  // unlocking
  return (
    <div role="dialog" aria-label="Unlock workspace" style={panel()}>
      <strong style={{ fontSize: '0.85rem' }}>Unlock workspace</strong>
      {state.wrong && <span style={{ fontSize: '0.7rem', color: '#dc2626' }}>Wrong passphrase</span>}
      <input
        type="password"
        placeholder="Passphrase"
        value={state.passphrase}
        autoFocus
        onChange={(e) => setState({ ...state, passphrase: e.target.value, wrong: false })}
        onKeyDown={async (e) => {
          if (e.key === 'Enter' && state.passphrase.length > 0 && !state.busy) {
            setState({ ...state, busy: true });
            await unlock(state.passphrase);
          }
        }}
        style={input()}
      />
      <button
        disabled={state.passphrase.length === 0 || state.busy}
        onClick={async () => {
          setState({ ...state, busy: true });
          await unlock(state.passphrase);
        }}
        style={btn('#16a34a')}
      >
        {state.busy ? 'Deriving key…' : 'Unlock'}
      </button>
    </div>
  );
}

function btn(color = 'var(--text-secondary)'): React.CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
    padding: '4px 10px',
    borderRadius: 3,
    border: `1px solid ${color}`,
    color,
    background: 'transparent',
    fontSize: '0.75rem',
    cursor: 'pointer',
  };
}

function panel(): React.CSSProperties {
  return {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    padding: 12,
    border: '1px solid var(--border-color)',
    borderRadius: 4,
    background: 'var(--bg-primary, #fff)',
    position: 'absolute',
    top: 48,
    right: 16,
    zIndex: 50,
    width: 280,
    boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
  };
}

function input(): React.CSSProperties {
  return { padding: '5px 8px', fontSize: '0.8rem', borderRadius: 3, border: '1px solid var(--border-color)' };
}
