import type { Application } from '../../shared/types/domain';

export function StatusPill({ application }: { application: Application }) {
  const label = application.offer_status === 'PENDING'
    ? '합류 제안'
    : application.application_status === 'APPROVED'
      ? '합류 완료'
      : application.application_status === 'REJECTED'
        ? '종료'
        : application.application_status === 'CANCELED'
          ? '취소'
          : '검토 중';
  return <span className={`status-pill ${application.application_status.toLowerCase()}`}>{label}</span>;
}
