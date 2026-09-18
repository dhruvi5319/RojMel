const n = (v: string | undefined) => (!v || v.trim() === '' ? 0 : Number(v))
const round = (x: number) => Math.round(x * 100) / 100

/** One line of a fuel invoice, as the paper prints it. */
export interface InvoiceLine {
  /** kept beside the money so one line of the form is one object */
  quantity_kl?: string
  basic?: string
  delivery_charge?: string
  vat_rate?: string
  cess_rate?: string
}

/**
 * The same arithmetic as purchase_invoice_line() in Postgres, for the owner to
 * read before he saves: the cess is charged on the value plus the delivery
 * charge PLUS the VAT, which is the part that is easy to get wrong by a couple
 * of thousand rupees on a full tanker.
 *
 * Both VAT and cess are typed per line, off the paper. Neither is assumed
 * anywhere: VAT differs by product on a single invoice and both move when the
 * state moves them.
 *
 * This is a reading glass. Postgres remains the authority — see migration 0030.
 */
export function invoiceLine(v: InvoiceLine | undefined) {
  const taxable = round(n(v?.basic) + n(v?.delivery_charge))
  const vat = round((taxable * n(v?.vat_rate)) / 100)
  const cess = round(((taxable + vat) * n(v?.cess_rate)) / 100)
  return { taxable, vat, cess, amount: round(taxable + vat + cess) }
}
