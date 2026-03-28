import React from 'react';
import { ApprovalData, ApprovalStatus } from '../types';

interface Props {
  data: ApprovalData;
  status: ApprovalStatus;
  onApprove: () => void;
  onReject: () => void;
}

const isNegative = (amount: string) => amount.trim().startsWith('-');

const ApprovalCard: React.FC<Props> = ({ data, status, onApprove, onReject }) => {
  return (
    <div className={`approval-card approval-card--${status}`}>
      {/* Header banner — colour changes by status */}
      <div className="approval-card__header">
        <span className="approval-card__header-icon">
          {status === 'pending'  && '⚠'}
          {status === 'approved' && '✓'}
          {status === 'rejected' && '✗'}
        </span>
        <span className="approval-card__header-title">
          {status === 'pending'  && 'Proposed Correction'}
          {status === 'approved' && 'Correction Approved'}
          {status === 'rejected' && 'Correction Rejected'}
        </span>
      </div>

      {/* Details — only shown while pending */}
      {status === 'pending' && (
        <>
          <div className="approval-card__body">
            <div className="approval-card__field">
              <div className="approval-card__field-label">Action</div>
              <div className="approval-card__field-value">{data.action}</div>
            </div>

            {data.accounts_affected && (
              <div className="approval-card__field">
                <div className="approval-card__field-label">Accounts Affected</div>
                <div className="approval-card__field-value">{data.accounts_affected}</div>
              </div>
            )}

            {data.amount && (
              <div className="approval-card__field">
                <div className="approval-card__field-label">Amount</div>
                <div
                  className={`approval-card__field-value approval-card__amount ${
                    isNegative(data.amount) ? 'approval-card__amount--negative' : 'approval-card__amount--positive'
                  }`}
                >
                  {data.amount}
                </div>
              </div>
            )}
          </div>

          <div className="approval-card__footer">
            <button className="approval-card__btn approval-card__btn--approve" onClick={onApprove}>
              ✓ Approve
            </button>
            <button className="approval-card__btn approval-card__btn--reject" onClick={onReject}>
              ✗ Reject
            </button>
          </div>
        </>
      )}
    </div>
  );
};

export default ApprovalCard;
