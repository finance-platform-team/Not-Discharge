import type { CSSProperties } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faFire, faHourglassHalf, faTriangleExclamation, faWallet, type IconDefinition } from '@fortawesome/free-solid-svg-icons';
import type { StatResult } from '../api';
import type { RiskLevel } from '../risk';
import type { StatKey } from '../types';
import { formatMoney } from '../format';

interface Props {
  stats?: Record<StatKey, StatResult>;
  /** Currency of the region (EGP / SAR): the region is defined by notdis_currency. */
  currency: string;
  activeRisks: RiskLevel[];
  pendingOn: boolean;
  onRisk: (level: RiskLevel) => void;
  onPending: () => void;
  onClear: () => void;
}

const LEVELS: RiskLevel[] = ['critical', 'high', 'medium', 'low'];

export function KpiTiles({ stats, currency, activeRisks, pendingOn, onRisk, onPending, onClear }: Props) {
  const s = (k: StatKey) => stats?.[k];
  const all = LEVELS.map(s);
  const ready = all.every((x) => x?.value !== undefined);
  const totalCount = ready ? all.reduce((n, x) => n + (x?.value ?? 0), 0) : undefined;
  const totalAmount = ready ? all.reduce((n, x) => n + (x?.amount ?? 0), 0) : undefined;
  const anyError = all.find((x) => x?.error)?.error;
  const only = (l: RiskLevel) => activeRisks.length === 1 && activeRisks[0] === l;

  const tile = (
    key: string,
    label: string,
    color: string,
    icon: IconDefinition,
    value: string | undefined,
    error: string | undefined,
    foot: string,
    on: boolean,
    onClick?: () => void,
  ) => (
    <button
      key={key}
      type="button"
      className={`nd-kpi${on ? ' on' : ''}`}
      style={{ '--kpi': color } as CSSProperties}
      onClick={onClick}
      disabled={!onClick}
      title={error}
    >
      <span className="nd-kpi__bar" style={{ background: color }} />
      <div className="nd-kpi__top">
        <div className="nd-kpi__lbl">{label}</div>
        <span className="nd-kpi__icon" aria-hidden="true">
          <FontAwesomeIcon icon={icon} />
        </span>
      </div>
      <div className="nd-kpi__val" style={{ color }}>
        {value !== undefined ? value : error ? '—' : <span className="nd-skel nd-skel--kpi" />}
      </div>
      <div className="nd-kpi__foot">{error ? 'Unavailable' : foot}</div>
    </button>
  );

  const atRisk = (x?: StatResult) => (x?.amount !== undefined ? `${formatMoney(x.amount, currency)} at risk` : '');

  return (
    <div className="nd-kpis">
      {tile('critical', 'Critical', 'var(--risk-critical)', faFire, s('critical')?.value?.toLocaleString('en-US'), s('critical')?.error, atRisk(s('critical')), only('critical'), () => onRisk('critical'))}
      {tile('high', 'High risk', 'var(--risk-high)', faTriangleExclamation, s('high')?.value?.toLocaleString('en-US'), s('high')?.error, atRisk(s('high')), only('high'), () => onRisk('high'))}
      {tile('pending', 'Pending action', 'var(--warning)', faHourglassHalf, s('pending')?.value?.toLocaleString('en-US'), s('pending')?.error, 'Waiting for someone to act', pendingOn, onPending)}
      {tile(
        'total',
        'Total outstanding',
        'var(--brand)',
        faWallet,
        totalAmount !== undefined ? formatMoney(totalAmount, currency) : undefined,
        anyError,
        totalCount !== undefined ? `${totalCount.toLocaleString('en-US')} active in-patients` : '',
        false,
        onClear,
      )}
    </div>
  );
}
