import React, { useEffect, useMemo, useState } from "react";
import {
  createTenantConfigClient,
  type ClearinghouseConfig,
  type TenantConfigClient,
} from "../../lib";

const MODES: Array<{ value: ClearinghouseConfig["mode"]; label: string }> = [
  { value: "claimmd_api", label: "Claim.MD API" },
  { value: "sftp", label: "SFTP" },
  { value: "filedrop", label: "File Drop" },
  { value: "manual", label: "Manual" },
];

type Props = {
  isOpen: boolean;
  onClose(): void;
  apiBase: string;
  tenantId: string;
  bearerToken?: string;
};

type Draft = ClearinghouseConfig & { isSaving?: boolean; error?: string | null; updatedAt?: string | null };

const defaultConfig: ClearinghouseConfig = {
  mode: "claimmd_api",
  host: "",
  account_key: "",
  credentials: {},
  envelope: {},
  metadata: {},
};

export const TenantSettingsDrawer: React.FC<Props> = ({ isOpen, onClose, apiBase, tenantId, bearerToken }) => {
  const client: TenantConfigClient = useMemo(
    () =>
      createTenantConfigClient({
        baseUrl: apiBase,
        tenantId,
        bearerToken,
      }),
    [apiBase, tenantId, bearerToken]
  );

  const [draft, setDraft] = useState<Draft>({ ...defaultConfig, isSaving: false, error: null, updatedAt: null });
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    let active = true;
    const fetchConfig = async () => {
      setLoading(true);
      try {
        const response = await client.getClearinghouse();
        if (!active) return;
        setDraft({
          ...defaultConfig,
          ...response.config,
          updatedAt: response.updated_at || null,
          isSaving: false,
          error: null,
        });
        setLoaded(true);
      } catch (err) {
        console.error("Failed to load clearinghouse config", err);
        if (active) {
          setDraft((prev) => ({ ...prev, error: (err as Error).message }));
        }
      } finally {
        if (active) setLoading(false);
      }
    };
    fetchConfig();
    return () => {
      active = false;
    };
  }, [isOpen, client]);

  const updateField = <K extends keyof ClearinghouseConfig>(key: K, value: ClearinghouseConfig[K]) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
  };

  const updateEnvelope = (key: keyof NonNullable<ClearinghouseConfig["envelope"]>, value: string) => {
    setDraft((prev) => ({
      ...prev,
      envelope: { ...(prev.envelope || {}), [key]: value || undefined },
    }));
  };

  const updateCredentials = (key: keyof NonNullable<ClearinghouseConfig["credentials"]>, value: string) => {
    setDraft((prev) => ({
      ...prev,
      credentials: {
        ...(prev.credentials || {}),
        [key]: key === "port" ? (value ? Number(value) || undefined : undefined) : value || undefined,
      },
    }));
  };

  const handleSave = async () => {
    setDraft((prev) => ({ ...prev, isSaving: true, error: null }));
    try {
      const payload: ClearinghouseConfig = {
        mode: draft.mode,
        host: draft.host || undefined,
        account_key: draft.account_key || undefined,
        credentials: draft.credentials,
        envelope: draft.envelope,
        metadata: draft.metadata,
      };
      const response = await client.updateClearinghouse(payload);
      setDraft({
        ...payload,
        credentials: response.config.credentials,
        envelope: response.config.envelope,
        metadata: response.config.metadata,
        isSaving: false,
        error: null,
        updatedAt: response.updated_at || null,
      });
      setLoaded(true);
    } catch (err) {
      console.error("Failed to save clearinghouse config", err);
      setDraft((prev) => ({ ...prev, isSaving: false, error: (err as Error).message }));
    }
  };

  if (!isOpen) return null;

  return (
    <div className="drawer">
      <div className="drawer-content">
        <h3>Clearinghouse Settings</h3>
        {loading && !loaded ? (
          <p>Loading…</p>
        ) : (
          <form
            className="settings-form"
            onSubmit={(e) => {
              e.preventDefault();
              void handleSave();
            }}
          >
            <label>
              Mode
              <select value={draft.mode} onChange={(e) => updateField("mode", e.target.value as ClearinghouseConfig["mode"]) }>
                {MODES.map((mode) => (
                  <option key={mode.value} value={mode.value}>
                    {mode.label}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Transport Host
              <input value={draft.host ?? ""} onChange={(e) => updateField("host", e.target.value || undefined)} placeholder="api.claimmd.com" />
            </label>

            <label>
              Account Key / Token
              <input value={draft.account_key ?? ""} onChange={(e) => updateField("account_key", e.target.value || undefined)} placeholder="Account key" />
            </label>

            <fieldset>
              <legend>Envelope Defaults (ISA/GS/ST)</legend>
              <label>
                Sender Qualifier
                <input value={draft.envelope?.sender_qualifier ?? ""} onChange={(e) => updateEnvelope("sender_qualifier", e.target.value)} />
              </label>
              <label>
                Sender ID
                <input value={draft.envelope?.sender_id ?? ""} onChange={(e) => updateEnvelope("sender_id", e.target.value)} />
              </label>
              <label>
                Receiver Qualifier
                <input value={draft.envelope?.receiver_qualifier ?? ""} onChange={(e) => updateEnvelope("receiver_qualifier", e.target.value)} />
              </label>
              <label>
                Receiver ID
                <input value={draft.envelope?.receiver_id ?? ""} onChange={(e) => updateEnvelope("receiver_id", e.target.value)} />
              </label>
              <label>
                Control Prefix
                <input value={draft.envelope?.control_prefix ?? ""} onChange={(e) => updateEnvelope("control_prefix", e.target.value)} placeholder="0001" />
              </label>
            </fieldset>

            {draft.mode === "claimmd_api" && (
              <p className="hint">
                Optionally provide Claim.MD acknowledgement SFTP credentials if 999/277/835 files should be pulled
                automatically.
              </p>
            )}

            {(draft.mode === "sftp" || draft.mode === "claimmd_api") && (
              <fieldset>
                <legend>{draft.mode === "sftp" ? "SFTP Credentials" : "Acknowledgement SFTP"}</legend>
                <label>
                  Host
                  <input value={draft.credentials?.host ?? ""} onChange={(e) => updateCredentials("host", e.target.value)} />
                </label>
                <label>
                  Port
                  <input
                    value={draft.credentials?.port !== undefined ? String(draft.credentials.port) : ""}
                    onChange={(e) => updateCredentials("port", e.target.value)}
                    inputMode="numeric"
                  />
                </label>
                <label>
                  Username
                  <input value={draft.credentials?.username ?? ""} onChange={(e) => updateCredentials("username", e.target.value)} />
                </label>
                <label>
                  Password
                  <input value={draft.credentials?.password ?? ""} onChange={(e) => updateCredentials("password", e.target.value)} type="password" />
                </label>
                <label>
                  Directory
                  <input value={draft.credentials?.directory ?? ""} onChange={(e) => updateCredentials("directory", e.target.value)} />
                </label>
              </fieldset>
            )}

            {draft.error && <p className="settings-error">{draft.error}</p>}
            {draft.updatedAt && <p className="settings-meta">Last updated {new Date(draft.updatedAt).toLocaleString()}</p>}

            <div className="drawer-actions">
              <button type="button" onClick={onClose} className="secondary">Close</button>
              <button type="submit" disabled={draft.isSaving}>
                {draft.isSaving ? "Saving…" : "Save"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
