import { MicrosoftDataverseService } from '../../generated/services/MicrosoftDataverseService';
import { Notdis_escalationconfigsnotdis_role as ROLE } from '../../generated/models/Notdis_escalationconfigsModel';
import { DATA_ORG_URL, ENTITY, LOGICAL } from '../notDischarged/dataSource';
import { GUID, listRecords, withTimeout } from '../notDischarged/api';
import { errorMessage, formatted, num, str } from '../notDischarged/format';

/** notdis_role choices, in their Dataverse order. */
export const ROLE_OPTIONS = Object.entries(ROLE).map(([value, label]) => ({ value: Number(value), label }));
export const roleLabel = (value?: number) => (value === undefined ? undefined : ROLE[value as keyof typeof ROLE]);

export interface ConfigRow {
  id: string;
  name: string;
  userId?: string;
  userName?: string;
  role?: number;
  level?: number;
  /** Empty = the row applies to every business unit. */
  buId?: string;
  buName?: string;
  createdOn?: string;
}

export interface BusinessUnitOption {
  value: string;
  label: string;
}

const LOOKUP_TABLE = '@Microsoft.Dynamics.CRM.lookuplogicalname';
const WRITE_TIMEOUT_MS = 90_000;

/**
 * Every active ND Escalation Config row, plus the table the Business Unit lookup points to (read
 * from the lookup's own annotation, so binding never has to guess).
 */
export async function fetchConfigs(): Promise<{ rows: ConfigRow[]; buTable?: string }> {
  const { rows } = await listRecords(
    ENTITY.escalationConfig,
    {
      select: 'notdis_escalationconfigid,notdis_name,_notdis_user_value,notdis_role,notdis_level,_notdis_businessunit_value,createdon',
      filter: 'statecode eq 0',
      orderBy: 'notdis_level asc,notdis_name asc',
      pageSize: 500,
      allAnnotations: true,
    },
    'Escalation config',
  );
  const buTable = rows.map((r) => r[`_notdis_businessunit_value${LOOKUP_TABLE}`]).find((t): t is string => typeof t === 'string');
  return {
    buTable,
    rows: rows.map((r) => ({
      id: String(r.notdis_escalationconfigid),
      name: str(r, 'notdis_name') ?? '',
      userId: str(r, '_notdis_user_value'),
      userName: formatted(r, '_notdis_user_value'),
      role: num(r, 'notdis_role'),
      level: num(r, 'notdis_level'),
      buId: str(r, '_notdis_businessunit_value'),
      buName: formatted(r, '_notdis_businessunit_value'),
      createdOn: str(r, 'createdon'),
    })),
  };
}

/** Entity set of the Business Unit lookup's table (Dataverse plural). */
export function buEntitySet(buTable?: string): string {
  if (!buTable || buTable === 'businessunit') return 'businessunits';
  return /(s|x|z|ch|sh)$/.test(buTable) ? `${buTable}es` : `${buTable}s`;
}

/**
 * Business units to choose from: the Dataverse business units when the lookup points there,
 * otherwise the units used by cases and by existing config rows.
 */
export async function fetchBusinessUnits(buTable: string | undefined, configs: ConfigRow[]): Promise<BusinessUnitOption[]> {
  const byId = new Map<string, string>();
  if (!buTable || buTable === 'businessunit') {
    const { rows } = await listRecords('businessunits', { select: 'businessunitid,name', filter: 'isdisabled eq false', orderBy: 'name asc', pageSize: 500 }, 'Business units');
    rows.forEach((r) => {
      const id = str(r, 'businessunitid');
      if (id) byId.set(id, str(r, 'name') ?? id);
    });
  } else {
    const fetchXml =
      `<fetch aggregate="true"><entity name="${LOGICAL.cases}">` +
      `<attribute name="notdis_bu" alias="bu" groupby="true"/>` +
      `<attribute name="notdis_notdischargedid" alias="n" aggregate="countcolumn"/>` +
      `</entity></fetch>`;
    const { rows } = await listRecords(ENTITY.cases, { fetchXml }, 'Business units');
    rows.forEach((r) => {
      if (typeof r.bu === 'string' && GUID.test(r.bu)) byId.set(r.bu, formatted(r, 'bu') ?? r.bu);
    });
  }
  configs.forEach((c) => c.buId && !byId.has(c.buId) && byId.set(c.buId, c.buName ?? c.buId));
  return [...byId].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label));
}

export interface ConfigChange {
  name?: string;
  userId?: string;
  role?: number;
  level?: number;
  /** null = all business units */
  buId?: string | null;
}

function toItem(c: ConfigChange, buTable?: string): Record<string, unknown> {
  const item: Record<string, unknown> = {};
  if (c.name !== undefined) item.notdis_name = c.name.trim();
  if (c.userId !== undefined && GUID.test(c.userId)) item['notdis_User@odata.bind'] = `/systemusers(${c.userId})`;
  if (c.role !== undefined) item.notdis_role = c.role;
  if (c.level !== undefined) item.notdis_level = c.level;
  if (c.buId !== undefined) item['notdis_BusinessUnit@odata.bind'] = c.buId && GUID.test(c.buId) ? `/${buEntitySet(buTable)}(${c.buId})` : null;
  return item;
}

export async function createConfig(c: ConfigChange, buTable?: string): Promise<void> {
  const res = await withTimeout(
    MicrosoftDataverseService.CreateRecordWithOrganization('return=representation', 'application/json', DATA_ORG_URL, ENTITY.escalationConfig, toItem(c, buTable)),
    'Creating the config row',
    WRITE_TIMEOUT_MS,
  );
  if (!res.success) throw new Error(readable(errorMessage(res.error, 'Could not create the row.')));
}

export async function updateConfig(id: string, c: ConfigChange, buTable?: string): Promise<void> {
  if (!GUID.test(id)) throw new Error('Invalid row id.');
  const res = await withTimeout(
    MicrosoftDataverseService.UpdateOnlyRecordWithOrganization('return=representation', 'application/json', '*', DATA_ORG_URL, ENTITY.escalationConfig, id, toItem(c, buTable)),
    'Saving the config row',
    WRITE_TIMEOUT_MS,
  );
  if (!res.success) throw new Error(readable(errorMessage(res.error, 'Could not save the row.')));
}

/** Dataverse errors come back as JSON text; keep just the message. */
function readable(text: string): string {
  try {
    return (JSON.parse(text) as { error?: { message?: string } }).error?.message ?? text;
  } catch {
    return text;
  }
}
