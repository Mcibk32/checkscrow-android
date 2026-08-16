import React from 'react';
import { KYCStatus } from '../../types';
import { Badge } from '../ui/Badge';
import { CheckCircle2, Clock, AlertCircle, ShieldAlert } from 'lucide-react';

export interface KYCStatusBadgeProps {
  status: KYCStatus;
  tier?: number;
}

export const KYCStatusBadge: React.FC<KYCStatusBadgeProps> = ({ status, tier = 1 }) => {
  switch (status) {
    case 'verified':
      return (
        <Badge variant="success" size="md" icon={<CheckCircle2 className="w-3.5 h-3.5" />}>
          Verified Tier {tier}
        </Badge>
      );
    case 'pending':
      return (
        <Badge variant="warning" size="md" icon={<Clock className="w-3.5 h-3.5" />}>
          KYC Review Pending
        </Badge>
      );
    case 'rejected':
      return (
        <Badge variant="danger" size="md" icon={<AlertCircle className="w-3.5 h-3.5" />}>
          Verification Rejected
        </Badge>
      );
    default:
      return (
        <Badge variant="neutral" size="md" icon={<ShieldAlert className="w-3.5 h-3.5" />}>
          Tier 1 Unverified
        </Badge>
      );
  }
};
