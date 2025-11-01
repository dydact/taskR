export type ClearinghouseCredentials = {
  host?: string;
  port?: number;
  username?: string;
  password?: string;
  directory?: string;
};

export type ClearinghouseEnvelope = {
  senderQualifier?: string;
  senderId?: string;
  receiverQualifier?: string;
  receiverId?: string;
  controlPrefix?: string;
};

export type ClearinghouseMode = "claimmd_api" | "sftp" | "filedrop" | "manual";

export type ClearinghouseConfig = {
  mode: ClearinghouseMode;
  host?: string;
  account_key?: string;
  credentials?: ClearinghouseCredentials;
  envelope?: ClearinghouseEnvelope;
  metadata?: Record<string, unknown>;
};

export type ClearinghouseConfigResponse = {
  config: ClearinghouseConfig;
  updated_at?: string | null;
};
