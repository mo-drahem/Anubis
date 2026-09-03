// Mirrors com.seera.magpie.dao.mongo.ems.entity.ws.Permission from the magpie reference
// framework exactly (name/roleName/source triples) — keep this in sync if that enum changes,
// since EMS's internal services validate against these literal string values, not the
// TypeScript key names.
export type EmsPermission = {
  name: string;
  roleName: string;
  source: 'HUB' | 'WORKSPACE' | '';
};

export const Permissions = {
  EMS_ACCESS: { name: 'ems_access', roleName: '', source: 'HUB' },
  WORKSPACE_CREATOR: { name: 'ems_create_workspace', roleName: '', source: 'HUB' },
  DOWNLOAD_ACCESS: { name: 'ems_download_dashboard_logs', roleName: '', source: 'HUB' },
  SUPER_ADMIN: { name: 'ems_super_admin', roleName: '', source: 'HUB' },
  WRITE: { name: 'write', roleName: '', source: 'WORKSPACE' },
  LIVE: { name: 'live', roleName: '', source: 'WORKSPACE' },
  WORKSPACE_MANAGER: { name: 'workspace_manager', roleName: '', source: 'WORKSPACE' },
  VAULT: { name: 'vault', roleName: '', source: 'WORKSPACE' },
} as const satisfies Record<string, EmsPermission>;

export type PermissionKey = keyof typeof Permissions;
