/**
 * Rupees in words, Indian system — thousand, lakh, crore.
 *
 * A bill going to a transport company is expected to carry the amount in
 * words; it is what makes a figure hard to alter after the fact.
 */
const ONES = [
  '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
  'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
  'Seventeen', 'Eighteen', 'Nineteen',
]
const TENS = [
  '', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty',
  'Ninety',
]

function under100(n: number): string {
  if (n < 20) return ONES[n]
  const t = TENS[Math.floor(n / 10)]
  const o = ONES[n % 10]
  return o ? `${t} ${o}` : t
}

function under1000(n: number): string {
  const h = Math.floor(n / 100)
  const rest = n % 100
  const parts = []
  if (h) parts.push(`${ONES[h]} Hundred`)
  if (rest) parts.push(under100(rest))
  return parts.join(' ')
}

/** 1234567 -> "Twelve Lakh Thirty Four Thousand Five Hundred Sixty Seven" */
function inWords(n: number): string {
  if (n === 0) return 'Zero'
  const crore = Math.floor(n / 10000000)
  const lakh = Math.floor((n % 10000000) / 100000)
  const thousand = Math.floor((n % 100000) / 1000)
  const rest = n % 1000

  const parts: string[] = []
  if (crore) parts.push(`${inWords(crore)} Crore`)
  if (lakh) parts.push(`${under1000(lakh)} Lakh`)
  if (thousand) parts.push(`${under1000(thousand)} Thousand`)
  if (rest) parts.push(under1000(rest))
  return parts.join(' ')
}

/** "₹26,760.50" -> "Twenty Six Thousand Seven Hundred Sixty Rupees and Fifty Paise Only" */
export function rupeesInWords(value: number | null | undefined): string {
  const amount = Math.abs(Number(value ?? 0))
  const rupees = Math.floor(amount)
  const paise = Math.round((amount - rupees) * 100)

  const parts = [`${inWords(rupees)} Rupees`]
  if (paise > 0) parts.push(`and ${under100(paise)} Paise`)
  return `${parts.join(' ')} Only`
}
