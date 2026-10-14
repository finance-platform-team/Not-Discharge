import { memo } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faChevronRight, faPhone } from '@fortawesome/free-solid-svg-icons';
import type { CaseRow, TrackingRow } from '../types';
import { formatDate, formatDays, formatMoney, formatPct } from '../format';
import { BALANCE_THRESHOLD, DAYS_THRESHOLD, riskTone } from '../risk';
import { AlertTag, PaidTrack, RiskTag } from './Bits';
import { CaseStatusPicker } from './CaseStatusPicker';

interface Props {
  rows: CaseRow[];
  tracking: Record<string, TrackingRow>;
  trackingPending: boolean;
  onOpen: (id: string) => void;
  /** Case being saved from its status picker. */
  savingCase?: string;
  onCaseStatus: (caseId: string, value: string, previous?: string) => void;
  /** Whether the signed-in user may change the Case status of a case in this business unit. */
  canEditStatus: (buId: string | undefined) => boolean;
}

const Card = memo(function Card({
  row,
  tracking,
  trackingPending,
  onOpen,
  caseSaving,
  onCaseStatus,
  canEdit,
}: {
  row: CaseRow;
  tracking?: TrackingRow;
  trackingPending: boolean;
  onOpen: (id: string) => void;
  caseSaving: boolean;
  onCaseStatus: (caseId: string, value: string, previous?: string) => void;
  canEdit: boolean;
}) {
  const hot = row.balance !== undefined && row.balance > BALANCE_THRESHOLD;
  const late = row.daysNoPayment !== undefined && row.daysNoPayment >= DAYS_THRESHOLD;
  return (
    <article className={`nd-card ${riskTone(row.riskLabel) ?? ''}`}>
      <span className="nd-card__edge" />

      <div className="nd-c-head">
        <div className="nd-risk-block">
          <RiskTag label={row.riskLabel} />
          {row.flag && (
            <div className="nd-t-flag">{row.flag}</div>
          )}
        </div>
        <div className="nd-c-name">{row.name}</div>
        <div className="nd-c-meta nd-c-meta--first">
          <span className="nd-mono">{row.patientId ?? '—'}</span>
          {row.nationalId && (
            <>
              <span className="sep">·</span>National ID <span className="nd-mono">{row.nationalId}</span>
            </>
          )}
          {row.room && (
            <>
              <span className="sep">·</span>Room {row.room}
            </>
          )}
          {row.entity && (
            <>
              <span className="sep">·</span>
              <span className="nd-ent">{row.entity}</span>
            </>
          )}
        </div>
        <div className="nd-c-meta">
          {row.phone && (
            <a className="nd-tel" href={`tel:${row.phone.replace(/\s/g, '')}`}>
              <FontAwesomeIcon icon={faPhone} /> {row.phone}
            </a>
          )}
          {row.phone && row.payer && <span className="sep">·</span>}
          {row.payer && <b>{row.payer}</b>}
        </div>
      </div>

      <div className="nd-c-money">
        <div>
          <div className="nd-bal-lbl">Balance due</div>
          <div className={`nd-bal-val${hot ? ' hot' : ''}`}>{formatMoney(row.balance, row.currency)}</div>
        </div>
        <div>
          <div className="nd-pay-row">
            <span className="nd-pay-lbl">Paid</span>
            <span className="nd-pay-pct">{formatPct(row.paidPct)}</span>
          </div>
          <PaidTrack pct={row.paidPct} />
          <div className="nd-pay-sub nd-mono">
            {formatMoney(row.amountPaid, row.currency)} of {formatMoney(row.totalBill, row.currency)}
          </div>
        </div>
      </div>

      <div className="nd-c-stats">
        <div className="nd-stat">
          <div className="sl">Last payment</div>
          <div className="sv">{row.lastPaymentAmount !== undefined ? formatMoney(row.lastPaymentAmount, row.currency) : 'None'}</div>
          <div className="ss">
            {row.lastPaymentDate ? `since ${row.lastPaymentLabel ?? formatDate(row.lastPaymentDate)}` : 'never paid'}
            {row.daysNoPayment !== undefined && (
              <>
                {' · '}
                <span className={`d${late ? ' red' : ''}`}>{row.daysNoPayment}d</span>
              </>
            )}
          </div>
        </div>
        <div className="nd-stat">
          <div className="sl">Length of stay</div>
          <div className="sv">{row.lengthOfStay !== undefined ? `${row.lengthOfStay}d` : '—'}</div>
          <div className="ss">
            since {row.admissionLabel ?? formatDate(row.admissionDate)}
            {row.lossDay !== undefined && <> · Loss day {formatDays(row.lossDay)}</>}
          </div>
        </div>
      </div>

      <div className="nd-c-foot">
        <AlertTag label={row.caseAlert ?? 'Pending'} />
        <CaseStatusPicker row={row} saving={caseSaving} canEdit={canEdit} onChange={onCaseStatus} />
        <span className="nd-owner">{trackingPending ? '' : tracking?.owner ? <b>{tracking.owner}</b> : 'Unassigned'}</span>
        <button type="button" className="nd-btn-dec" onClick={() => onOpen(row.id)}>
          Decision <FontAwesomeIcon icon={faChevronRight} />
        </button>
      </div>
    </article>
  );
});

export const CaseCards = memo(function CaseCards({ rows, tracking, trackingPending, onOpen, savingCase, onCaseStatus, canEditStatus }: Props) {
  return (
    <div className="nd-cards">
      {rows.map((row) => (
        <Card
          key={row.id}
          row={row}
          tracking={tracking[row.id]}
          trackingPending={trackingPending}
          onOpen={onOpen}
          caseSaving={savingCase === row.id}
          onCaseStatus={onCaseStatus}
          canEdit={canEditStatus(row.buId)}
        />
      ))}
    </div>
  );
});

export function CaseCardsSkeleton({ count }: { count: number }) {
  return (
    <div className="nd-cards" aria-busy="true" aria-label="Loading cases">
      {Array.from({ length: count }, (_, i) => (
        <article key={i} className="nd-card nd-card--skel">
          <span className="nd-skel" style={{ width: '55%', height: 16 }} />
          <span className="nd-skel nd-skel--sub" style={{ width: '40%' }} />
          <span className="nd-skel" style={{ width: '35%', height: 24, marginTop: 20 }} />
          <span className="nd-skel nd-skel--sub" style={{ width: '70%' }} />
        </article>
      ))}
    </div>
  );
}
