/**
 * No header, no tabs, no date stepper — a page that exists to become paper or
 * a PDF. The app chrome would only get in the way, and on a phone it is the
 * difference between sending a customer a bill and sending them a screenshot.
 */
export default function PrintLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <div className="bg-white">{children}</div>
}
