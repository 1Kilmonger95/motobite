export type Chip = {
  id: string;
  name: string;
  description: string;
  drive_url: string;
  drive_file_id: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type TokenStatus = "pending" | "reserved" | "activated" | "expired" | "revoked";

export type TokenRow = {
  id: string;
  chip_id: string;
  status: TokenStatus;
  expires_at: string;
  reserved_until: string | null;
  consumed_at: string | null;
  created_at: string;
};

export type DeviceRow = {
  id: string;
  chip_id: string;
  device_label: string | null;
  source_type: "drive" | "local";
  activated_at: string;
  status: "active" | "revoked";
};
