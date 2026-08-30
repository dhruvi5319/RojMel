/**
 * Types mirroring supabase/migrations. Money and litres arrive from Postgres
 * `numeric` as JS numbers via PostgREST; they are rounded server-side, so the
 * client never does arithmetic that decides a rupee figure.
 */

export type UserRole = 'owner' | 'manager' | 'counter'
export type ShiftStatus = 'open' | 'submitted' | 'approved'
export type DayStatus = 'draft' | 'submitted' | 'approved'
export type PaymentMode = 'cash' | 'upi' | 'card' | 'cheque' | 'bank_transfer'
export type InvoiceStatus = 'draft' | 'issued' | 'partly_paid' | 'paid' | 'cancelled'
export type StaffPaymentType = 'salary' | 'advance' | 'bonus' | 'deduction'

export interface Station {
  id: string
  name: string
  legal_name: string | null
  address: string | null
  city: string | null
  state: string | null
  pincode: string | null
  gstin: string | null
  phone: string | null
  invoice_prefix: string
  created_at: string
}

export interface Profile {
  id: string
  station_id: string
  full_name: string
  phone: string | null
  role: UserRole
  is_active: boolean
  created_at: string
}

export interface Staff {
  id: string
  station_id: string
  name: string
  name_gu: string | null
  phone: string | null
  pin: string | null
  monthly_salary: number
  joined_on: string | null
  is_active: boolean
  created_at: string
}

export interface FuelType {
  id: string
  station_id: string
  name: string
  name_gu: string | null
  color: string
  sort_order: number
  is_active: boolean
}

export interface FuelPrice {
  id: string
  station_id: string
  fuel_type_id: string
  sale_rate: number
  effective_from: string
  created_by: string | null
  created_at: string
}

export interface Tank {
  id: string
  station_id: string
  fuel_type_id: string
  name: string
  capacity_litres: number
  opening_stock_litres: number
  opening_stock_date: string | null
  is_active: boolean
}

export interface Nozzle {
  id: string
  station_id: string
  tank_id: string
  fuel_type_id: string
  name: string
  sort_order: number
  is_active: boolean
}

export interface Shift {
  id: string
  station_id: string
  business_date: string
  name: string
  sort_order: number
  status: ShiftStatus
  opened_at: string
  closed_at: string | null
  created_by: string | null
  approved_by: string | null
  approved_at: string | null
  notes: string | null
}

export interface NozzleReading {
  id: string
  station_id: string
  shift_id: string
  nozzle_id: string
  staff_id: string | null
  opening_reading: number
  closing_reading: number
  test_litres: number
  sale_rate: number
  /** generated: closing - opening - test */
  litres: number
  /** generated: litres * sale_rate */
  amount: number
  created_at: string
}

export interface ShiftCollection {
  id: string
  station_id: string
  shift_id: string
  staff_id: string | null
  cash_amount: number
  upi_amount: number
  card_amount: number
  notes: string | null
  created_at: string
}

export interface Customer {
  id: string
  station_id: string
  name: string
  contact_person: string | null
  phone: string | null
  email: string | null
  address: string | null
  gstin: string | null
  credit_limit: number
  opening_balance: number
  opening_balance_date: string | null
  is_active: boolean
  notes: string | null
  created_at: string
}

export interface Vehicle {
  id: string
  station_id: string
  customer_id: string
  vehicle_number: string
  driver_name: string | null
  is_active: boolean
}

export interface Invoice {
  id: string
  station_id: string
  customer_id: string
  invoice_number: string
  period_from: string
  period_to: string
  issue_date: string
  due_date: string | null
  subtotal: number
  tax_rate: number
  tax_amount: number
  round_off: number
  total: number
  status: InvoiceStatus
  notes: string | null
  created_by: string | null
  created_at: string
}

export interface CreditSale {
  id: string
  station_id: string
  business_date: string
  shift_id: string | null
  customer_id: string
  vehicle_id: string | null
  vehicle_number: string | null
  fuel_type_id: string
  nozzle_id: string | null
  staff_id: string | null
  slip_number: string | null
  driver_name: string | null
  odometer: number | null
  litres: number
  sale_rate: number
  /** generated: litres * sale_rate */
  amount: number
  invoice_id: string | null
  created_by: string | null
  created_at: string
}

export interface Payment {
  id: string
  station_id: string
  customer_id: string
  invoice_id: string | null
  payment_date: string
  amount: number
  mode: PaymentMode
  reference: string | null
  notes: string | null
  recorded_by: string | null
  created_at: string
}

export interface FuelPurchase {
  id: string
  station_id: string
  tank_id: string
  fuel_type_id: string
  delivery_date: string
  tanker_number: string | null
  litres: number
  density: number | null
  received_by: string | null
  notes: string | null
  created_by: string | null
  created_at: string
}

/**
 * Owner-only by RLS. The manager's queries return null here.
 * NOTE: purchase_id is both the primary key and the foreign key, so PostgREST
 * treats this as one-to-one and embeds it as a single object — never an array.
 */
export interface FuelPurchaseCost {
  purchase_id: string
  station_id: string
  supplier: string | null
  invoice_number: string | null
  invoice_date: string | null
  rate_per_litre: number
  amount: number
  created_at: string
}

export interface TankDip {
  id: string
  station_id: string
  tank_id: string
  business_date: string
  dip_litres: number
  recorded_by: string | null
  notes: string | null
  created_at: string
}

export interface Expense {
  id: string
  station_id: string
  business_date: string
  category: string
  description: string | null
  amount: number
  mode: PaymentMode
  paid_to: string | null
  recorded_by: string | null
  created_at: string
}

export interface StaffPayment {
  id: string
  station_id: string
  staff_id: string
  payment_date: string
  type: StaffPaymentType
  amount: number
  period_month: string | null
  mode: PaymentMode
  notes: string | null
  recorded_by: string | null
  created_at: string
}

export interface BankDeposit {
  id: string
  station_id: string
  deposit_date: string
  bank_name: string
  account_last4: string | null
  amount: number
  slip_reference: string | null
  deposited_by: string | null
  notes: string | null
  recorded_by: string | null
  created_at: string
}

export interface DayClosing {
  id: string
  station_id: string
  business_date: string
  opening_cash: number
  counted_cash: number
  status: DayStatus
  submitted_by: string | null
  submitted_at: string | null
  approved_by: string | null
  approved_at: string | null
  notes: string | null
  owner_remarks: string | null
  created_at: string
}

/** view: v_customer_balances */
export interface CustomerBalance {
  customer_id: string
  station_id: string
  name: string
  phone: string | null
  credit_limit: number
  is_active: boolean
  balance: number
  lifetime_sales: number
  lifetime_paid: number
  unbilled_amount: number
  unbilled_slips: number
  last_sale_date: string | null
  last_payment_date: string | null
}

/** view: v_tank_stock */
export interface TankStock {
  tank_id: string
  station_id: string
  name: string
  fuel_type_id: string
  fuel_name: string
  capacity_litres: number
  book_stock_litres: number
  litres_received: number
  litres_sold: number
  last_dip_litres: number | null
  last_dip_date: string | null
  last_dip_variance: number | null
}

/** rpc: day_summary(p_date) */
export interface DaySummary {
  date: string
  litres_sold: number
  meter_sales: number
  credit_sales: number
  counter_sales: number
  collected_cash: number
  collected_upi: number
  collected_card: number
  collected_total: number
  /** positive = the fillers handed over less than the meters say they owed */
  collection_short: number
  customer_receipts: number
  receipts_cash: number
  expenses: number
  expenses_cash: number
  staff_paid: number
  staff_paid_cash: number
  deposited: number
  opening_cash: number
  counted_cash: number | null
  expected_cash: number
  status: DayStatus
  notes: string | null
  owner_remarks: string | null
}

/** rpc: margin_report(from, to) — owner only, throws for anyone else */
export interface MarginReport {
  from: string
  to: string
  litres_sold: number
  sales_value: number
  litres_bought: number
  purchase_cost: number
  avg_sale_rate: number | null
  avg_purchase_rate: number | null
  gross_margin_per_litre: number | null
  operating_expenses: number
}

/** view: v_nozzle_state — everything the shift-entry form needs per nozzle */
export interface NozzleState {
  nozzle_id: string
  station_id: string
  name: string
  sort_order: number
  tank_id: string
  tank_name: string
  fuel_type_id: string
  fuel_name: string
  fuel_name_gu: string | null
  fuel_color: string
  sale_rate: number | null
  last_closing: number
  last_reading_date: string | null
}

/** rpc: cash_position() — what should be in the cash box right now */
export interface CashPosition {
  collected: number
  received: number
  expenses: number
  staff: number
  deposited: number
  in_hand: number
}

/** rpc: sales_by_day(from, to) */
export interface SalesByDay {
  business_date: string
  litres_sold: number
  meter_sales: number
  credit_sales: number
  collected: number
  expenses: number
  deposited: number
}

/** rpc: sales_by_fuel(from, to) */
export interface SalesByFuel {
  fuel_type_id: string
  fuel_name: string
  litres_sold: number
  sales_value: number
  avg_rate: number | null
}
