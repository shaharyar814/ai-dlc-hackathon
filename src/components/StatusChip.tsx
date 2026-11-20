import Icon from './Icon.tsx'

interface StatusChipProps {
  status: 'open' | 'reviewed'
}

const STATUS_LABEL = { open: 'Open', reviewed: 'Reviewed' } as const

export default function StatusChip({ status }: StatusChipProps) {
  return (
    <span className={`chip chip-${status}`}>
      <Icon name={status} />
      <span>{STATUS_LABEL[status]}</span>
    </span>
  )
}
