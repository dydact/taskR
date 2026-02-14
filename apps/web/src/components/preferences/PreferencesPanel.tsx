import React, { useEffect, useState } from 'react';
import { useShell } from '../../context/ShellContext';
import { AISettingsToggle } from '../ai/AISettingsToggle';
import { AIPersonaSelector } from '../ai/AIPersonaSelector';
import { useAIFeatures } from '../../hooks/useAIFeatures';

export type ModelProfile = 'general' | 'reasoning';

export type Guardrails = {
  noPII: boolean;
  noExternalLinks: boolean;
};

export type Preferences = {
  modelProfile: ModelProfile;
  guardrails: Guardrails;
};

const STORAGE_KEY = 'taskr_prefs_v1';

export function loadPreferences(): Preferences {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as Preferences;
  } catch {}
  return { modelProfile: 'general', guardrails: { noPII: false, noExternalLinks: false } };
}

export function savePreferences(p: Preferences) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(p)); } catch {}
}

type Props = { isOpen: boolean; onClose(): void };

export const PreferencesPanel: React.FC<Props> = ({ isOpen, onClose }) => {
  const [prefs, setPrefs] = useState<Preferences>(loadPreferences());
  const { preferences, updatePreferences, setAiPersona } = useShell();
  const { enabled: aiEnabled, showAIPersonaSelector } = useAIFeatures();

  useEffect(() => { if (isOpen) setPrefs(loadPreferences()); }, [isOpen]);

  const apply = () => { savePreferences(prefs); onClose(); };

  const handleAIToggle = (enabled: boolean) => {
    updatePreferences({ aiEnhanced: enabled });
  };

  if (!isOpen) return null;
  return (
    <div className="drawer">
      <div className="drawer-content">
        <h3>Preferences</h3>
        <div className="field">
          <label>Model profile</label>
          <div>
            <label><input type="radio" name="modelProfile" checked={prefs.modelProfile === 'general'} onChange={() => setPrefs({ ...prefs, modelProfile: 'general' })} /> General</label>
            <label style={{ marginLeft: 16 }}><input type="radio" name="modelProfile" checked={prefs.modelProfile === 'reasoning'} onChange={() => setPrefs({ ...prefs, modelProfile: 'reasoning' })} /> Reasoning</label>
          </div>
        </div>
        <div className="field">
          <label>Guardrails</label>
          <div>
            <label><input type="checkbox" checked={prefs.guardrails.noPII} onChange={(e) => setPrefs({ ...prefs, guardrails: { ...prefs.guardrails, noPII: e.target.checked } })} /> No PII</label>
            <label style={{ marginLeft: 16 }}><input type="checkbox" checked={prefs.guardrails.noExternalLinks} onChange={(e) => setPrefs({ ...prefs, guardrails: { ...prefs.guardrails, noExternalLinks: e.target.checked } })} /> No external links</label>
          </div>
        </div>
        <div className="field ai-settings-section">
          <AISettingsToggle enabled={preferences.aiEnhanced} onChange={handleAIToggle} />
          {showAIPersonaSelector && (
            <div className="ai-persona-field">
              <label>AI Persona</label>
              <AIPersonaSelector value={preferences.aiPersona} onChange={setAiPersona} />
            </div>
          )}
        </div>
        <div className="actions">
          <button type="button" onClick={onClose}>Cancel</button>
          <button type="button" onClick={apply}>Save</button>
        </div>
      </div>
    </div>
  );
};

