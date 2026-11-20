import { formatHours } from '../format.ts'
import { AGE_TIER_LABEL, ageTier } from '../view/age.ts'
import Icon from './Icon.tsx'

interface AgeChipProps {
  elapsedMs: number
}

export default function AgeChip({ elapsedMs }: AgeChipProps) {
  const tier = ageTier(elapsedMs)
  return (
    <span className={`chip chip-${tier}`}>
      <Icon name={tier} />
      <span>{formatHours(elapsedMs)}</span>
      <span>{AGE_TIER_LABEL[tier]}</span>
    </span>
  )
}
